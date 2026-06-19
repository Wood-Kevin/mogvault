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
import { readFile, writeFile } from "fs/promises";
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

interface AppearanceSetDetail {
  id: number;
  set_name: string;
  appearances: Array<{ id: number }>;
}

interface AppearanceDetail {
  id: number;
  slot?: { type: string; name: string };
  items?: Array<{ id: number; name: string }>;
}

// ── Slot word → Blizzard appearance slot type(s) ─────────────────────────────
// Cloth chests show as ROBE; all other armor chests show as CHEST.
// Both are included so the filter catches all armor types from one token.

const SLOT_WORD_MAP: Record<string, string[]> = {
  helm: ["HEAD"], helmet: ["HEAD"], crown: ["HEAD"], hood: ["HEAD"],
  cap: ["HEAD"], headpiece: ["HEAD"], visage: ["HEAD"],
  pauldrons: ["SHOULDER"], spaulders: ["SHOULDER"], mantle: ["SHOULDER"],
  shoulderpads: ["SHOULDER"], shoulders: ["SHOULDER"], epaulets: ["SHOULDER"],
  chestguard: ["CHEST", "ROBE"], breastplate: ["CHEST", "ROBE"],
  tunic: ["CHEST", "ROBE"], vest: ["CHEST", "ROBE"], hauberk: ["CHEST", "ROBE"],
  robe: ["CHEST", "ROBE"], robes: ["CHEST", "ROBE"], vestment: ["CHEST", "ROBE"],
  raiment: ["CHEST", "ROBE"],
  gloves: ["HAND"], gauntlets: ["HAND"], handguards: ["HAND"],
  grips: ["HAND"], fists: ["HAND"],
  leggings: ["LEGS"], legplates: ["LEGS"], greaves: ["LEGS"],
  pants: ["LEGS"], breeches: ["LEGS"], trousers: ["LEGS"],
  belt: ["WAIST"], girdle: ["WAIST"], cord: ["WAIST"],
  cinch: ["WAIST"], waistband: ["WAIST"], sash: ["WAIST"],
  boots: ["FEET"], sabatons: ["FEET"], treads: ["FEET"],
  stompers: ["FEET"], slippers: ["FEET"], sandals: ["FEET"],
  bracers: ["WRIST"], bindings: ["WRIST"], cuffs: ["WRIST"], wristguards: ["WRIST"],
};

function slotFromItemName(name: string): string[] | null {
  const firstWord = name.split(/\s+/)[0].toLowerCase();
  return SLOT_WORD_MAP[firstWord] ?? null;
}

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

// ── Phase 5: tier-token enrichment ───────────────────────────────────────────
// Loads data/token-appearance-sets.json and adds tier-piece item IDs to the
// index with the same sources as their exchange tokens (boss drops).

async function phase5TokenEnrichment(
  index: SourceIndex,
  sem: Semaphore,
): Promise<{ newItems: number; enriched: number; skipped: number; warnings: string[] }> {
  const warnings: string[] = [];

  const joinTablePath = join(process.cwd(), "data", "token-appearance-sets.json");
  const raw = JSON.parse(await readFile(joinTablePath, "utf-8")) as Record<string, unknown>;

  // Strip the comment key; keep only numeric-keyed entries
  const joinTable: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (/^\d+$/.test(k) && Array.isArray(v)) joinTable[k] = v as number[];
  }

  const tokenIds = Object.keys(joinTable);
  console.log(`    ${tokenIds.length} tokens in join table`);

  // ── Step A: fetch all unique appearance-sets (cached) ────────────────────
  const allSetIds = new Set<number>();
  for (const sets of Object.values(joinTable)) for (const s of sets) allSetIds.add(s);

  const setCache = new Map<number, AppearanceSetDetail>();
  console.log(`    Fetching ${allSetIds.size} unique appearance-sets…`);
  await Promise.all(
    [...allSetIds].map((setId) =>
      sem.run(async () => {
        try {
          const data = await fetchJSON<AppearanceSetDetail>(
            `/data/wow/item-appearance/set/${setId}`
          );
          setCache.set(setId, data);
        } catch (err) {
          warnings.push(`Set ${setId}: ${err}`);
        }
      })
    )
  );

  // ── Step B: fetch all unique appearances (cached) ────────────────────────
  const allAppIds = new Set<number>();
  for (const setData of setCache.values())
    for (const app of setData.appearances ?? []) allAppIds.add(app.id);

  const appCache = new Map<number, AppearanceDetail>();
  console.log(`    Fetching ${allAppIds.size} unique appearances…`);
  await Promise.all(
    [...allAppIds].map((appId) =>
      sem.run(async () => {
        try {
          const data = await fetchJSON<AppearanceDetail>(
            `/data/wow/item-appearance/${appId}`
          );
          appCache.set(appId, data);
        } catch (err) {
          warnings.push(`Appearance ${appId}: ${err}`);
        }
      })
    )
  );

  // ── Step C: fetch token names (cached) ───────────────────────────────────
  const tokenNameCache = new Map<string, string>();
  console.log(`    Fetching ${tokenIds.length} token names…`);
  await Promise.all(
    tokenIds.map((tokenId) =>
      sem.run(async () => {
        try {
          const data = await fetchJSON<{ name: string }>(`/data/wow/item/${tokenId}`);
          tokenNameCache.set(tokenId, data.name);
        } catch (err) {
          warnings.push(`Token ${tokenId} name: ${err}`);
        }
      })
    )
  );

  // ── Step D: enrich index ──────────────────────────────────────────────────
  let newItems = 0;
  let enriched = 0;
  let skipped = 0;

  for (const tokenId of tokenIds) {
    const tokenSources = index[tokenId]?.sources;
    if (!tokenSources || tokenSources.length === 0) {
      warnings.push(`Token ${tokenId} not in source index — skipping`);
      skipped++;
      continue;
    }

    const tokenName = tokenNameCache.get(tokenId);
    if (!tokenName) { skipped++; continue; }

    const slotTypes = slotFromItemName(tokenName);
    if (!slotTypes) {
      warnings.push(`No slot parsed from "${tokenName}" (${tokenId})`);
      skipped++;
      continue;
    }

    for (const setId of joinTable[tokenId]) {
      const setData = setCache.get(setId);
      if (!setData) continue;

      for (const appRef of setData.appearances ?? []) {
        const app = appCache.get(appRef.id);
        if (!app) continue;

        // Only process appearances whose slot matches this token's slot
        if (!slotTypes.includes(app.slot?.type ?? "")) continue;

        for (const item of app.items ?? []) {
          const itemIdStr = String(item.id);
          if (!index[itemIdStr]) {
            index[itemIdStr] = { sources: [] };
            newItems++;
          }
          for (const src of tokenSources) {
            if (!index[itemIdStr].sources.some((s) => s.encounterId === src.encounterId)) {
              index[itemIdStr].sources.push(src);
            }
          }
        }
      }
    }

    enriched++;
  }

  return { newItems, enriched, skipped, warnings };
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

  const itemsBeforePhase5 = Object.keys(index).length;

  // ── Phase 5: tier-token enrichment ───────────────────────────────────────
  console.log("\n  → Phase 5: tier-token enrichment…");
  const phase5 = await phase5TokenEnrichment(index, sem);
  if (phase5.warnings.length > 0) {
    for (const w of phase5.warnings) console.warn(`    ✗ ${w}`);
  }

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
  console.log(`  Phase 4 items (journal)  : ${itemsBeforePhase5.toLocaleString()}`);
  console.log(`  Phase 5 tier-piece items : +${phase5.newItems.toLocaleString()} new  (${phase5.enriched} tokens enriched, ${phase5.skipped} skipped)`);
  console.log(`  Unique items indexed      : ${uniqueItems.toLocaleString()}`);
  console.log(`  Total item-source entries : ${totalMappings.toLocaleString()}`);
  console.log(`  Output     : ${outputPath} (${sizeKb} KB)`);
  console.log("═══════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
