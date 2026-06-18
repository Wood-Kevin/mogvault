/**
 * Build data/source-index.json from the Blizzard Journal API.
 *
 * Run: npm run build:index
 *   or: npm run build:index -- --limit 2   (last 2 expansions, faster for testing)
 *
 * Requires BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET, BLIZZARD_REGION in .env.local.
 * The npm script loads .env.local via node --env-file before running this file.
 */

import { getGameData } from "../lib/blizzard-core";
import { writeFile } from "fs/promises";
import { join } from "path";

// ── Types — confirmed from live API probes ────────────────────────────────────

interface TierRef {
  id: number;
  name: string;
}

interface ExpansionDetail {
  name: string;
  dungeons: TierRef[];
  raids: TierRef[];
}

interface EncounterRef {
  id: number;
  name: string;
}

interface InstanceDetail {
  name: string;
  encounters: EncounterRef[];
}

interface EncounterDetail {
  name: string;
  items: Array<{
    item: { id: number; name: string };
  }>;
}

interface Source {
  instanceId: number;
  instanceName: string;
  encounterId: number;
  encounterName: string;
  type: "raid" | "dungeon";
}

type SourceIndex = Record<string, { sources: Source[] }>;

// ── Semaphore — limits concurrent in-flight requests ─────────────────────────

class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.limit) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  private release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await getGameData(path);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}

function parseLimit(): number | undefined {
  const idx = process.argv.indexOf("--limit");
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const limit = parseLimit();
  const sem = new Semaphore(10);

  console.log("[MogVault] Building source index…");

  // ── Phase 1: expansion tiers ──────────────────────────────────────────────
  const { tiers } = await fetchJSON<{ tiers: TierRef[] }>(
    "/data/wow/journal-expansion/index"
  );

  const selected = limit ? tiers.slice(-limit) : tiers;
  console.log(
    `  → ${tiers.length} expansions found, processing ${selected.length}` +
      (limit ? ` (--limit ${limit})` : " (all)")
  );
  console.log(`     ${selected.map((t) => t.name).join(", ")}`);

  // ── Phase 2: collect instance refs ───────────────────────────────────────
  console.log("\n  → Fetching expansion details…");

  type InstanceRef = TierRef & { type: "raid" | "dungeon" };
  const instanceRefs: InstanceRef[] = [];

  for (const tier of selected) {
    const exp = await fetchJSON<ExpansionDetail>(
      `/data/wow/journal-expansion/${tier.id}`
    );
    for (const d of exp.dungeons ?? [])
      instanceRefs.push({ ...d, type: "dungeon" });
    for (const r of exp.raids ?? []) instanceRefs.push({ ...r, type: "raid" });
  }

  const raidCount = instanceRefs.filter((i) => i.type === "raid").length;
  const dungeonCount = instanceRefs.filter((i) => i.type === "dungeon").length;
  console.log(
    `  → ${instanceRefs.length} instances (${raidCount} raids, ${dungeonCount} dungeons)`
  );

  // ── Phase 3: collect encounter refs (concurrent) ──────────────────────────
  console.log("\n  → Fetching instance encounter lists…");

  type EncounterTask = {
    encId: number;
    encName: string;
    instId: number;
    instName: string;
    type: "raid" | "dungeon";
  };
  const encounterTasks: EncounterTask[] = [];

  await Promise.all(
    instanceRefs.map((inst) =>
      sem.run(async () => {
        try {
          const data = await fetchJSON<InstanceDetail>(
            `/data/wow/journal-instance/${inst.id}`
          );
          for (const enc of data.encounters ?? []) {
            encounterTasks.push({
              encId: enc.id,
              encName: enc.name,
              instId: inst.id,
              instName: inst.name,
              type: inst.type,
            });
          }
        } catch (err) {
          console.warn(`    ✗ Instance ${inst.id} (${inst.name}): ${err}`);
        }
      })
    )
  );

  console.log(`  → ${encounterTasks.length} encounters to process`);

  // ── Phase 4: fetch encounter loot and build index (concurrent) ────────────
  console.log(
    `\n  → Fetching encounter loot (${encounterTasks.length} encounters, 10 concurrent)…`
  );

  const index: SourceIndex = {};
  let processed = 0;
  let errors = 0;
  let totalMappings = 0;

  await Promise.all(
    encounterTasks.map((task) =>
      sem.run(async () => {
        try {
          const data = await fetchJSON<EncounterDetail>(
            `/data/wow/journal-encounter/${task.encId}`
          );

          for (const loot of data.items ?? []) {
            const itemId = String(loot.item.id);
            if (!index[itemId]) index[itemId] = { sources: [] };

            const alreadyListed = index[itemId].sources.some(
              (s) => s.encounterId === task.encId
            );
            if (!alreadyListed) {
              index[itemId].sources.push({
                instanceId: task.instId,
                instanceName: task.instName,
                encounterId: task.encId,
                encounterName: task.encName,
                type: task.type,
              });
              totalMappings++;
            }
          }
        } catch (err) {
          errors++;
          console.warn(`    ✗ Encounter ${task.encId} (${task.encName}): ${err}`);
        }

        processed++;
        if (processed % 50 === 0 || processed === encounterTasks.length) {
          process.stdout.write(
            `    [${processed}/${encounterTasks.length}]\r`
          );
        }
      })
    )
  );

  console.log(); // newline after progress line

  // ── Write output ──────────────────────────────────────────────────────────
  const outputPath = join(process.cwd(), "data", "source-index.json");
  const json = JSON.stringify(index, null, 2);
  await writeFile(outputPath, json);

  const sizeKb = (Buffer.byteLength(json) / 1024).toFixed(1);
  const uniqueItems = Object.keys(index).length;

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════");
  console.log(" Source index built");
  console.log("═══════════════════════════════════════");
  console.log(`  Expansions : ${selected.length} of ${tiers.length}`);
  console.log(
    `  Instances  : ${instanceRefs.length} (${raidCount} raids, ${dungeonCount} dungeons)`
  );
  console.log(`  Encounters : ${encounterTasks.length}${errors ? ` (${errors} errors)` : ""}`);
  console.log(`  Unique items indexed      : ${uniqueItems.toLocaleString()}`);
  console.log(`  Total item-source entries : ${totalMappings.toLocaleString()}`);
  console.log(`  Output     : ${outputPath} (${sizeKb} KB)`);
  console.log("═══════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
