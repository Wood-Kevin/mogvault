import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSourceIndex } from "@/lib/sourceIndex";

// ── Response types ────────────────────────────────────────────────────────────

export interface FarmingEncounter {
  encounterId: number;
  encounterName: string;
  itemIds: number[];
}

export interface FarmingInstance {
  instanceId: number;
  instanceName: string;
  type: "raid" | "dungeon";
  encounters: FarmingEncounter[];
  totalPieces: number; // unique items from this instance (not encounter-multiplied)
}

export interface FarmingListResponse {
  instances: FarmingInstance[]; // sorted by totalPieces desc
  otherItemIds: number[];        // items with no journal source
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("items") ?? "";
  const itemIds = raw
    .split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0);

  if (itemIds.length === 0) {
    return NextResponse.json(
      { instances: [], otherItemIds: [] } satisfies FarmingListResponse
    );
  }

  if (itemIds.length > 50) {
    return NextResponse.json({ error: "Too many items (max 50)" }, { status: 400 });
  }

  const index = getSourceIndex();

  const instanceMap     = new Map<number, FarmingInstance>();
  const instanceItemSet = new Map<number, Set<number>>(); // unique-item count per instance
  const otherItemIds: number[] = [];

  for (const itemId of itemIds) {
    const entry = index[String(itemId)];
    if (!entry?.sources?.length) {
      otherItemIds.push(itemId);
      continue;
    }

    for (const src of entry.sources) {
      if (!instanceMap.has(src.instanceId)) {
        instanceMap.set(src.instanceId, {
          instanceId:   src.instanceId,
          instanceName: src.instanceName,
          type:         src.type,
          encounters:   [],
          totalPieces:  0,
        });
        instanceItemSet.set(src.instanceId, new Set());
      }

      const inst    = instanceMap.get(src.instanceId)!;
      const itemSet = instanceItemSet.get(src.instanceId)!;

      let enc = inst.encounters.find(e => e.encounterId === src.encounterId);
      if (!enc) {
        enc = { encounterId: src.encounterId, encounterName: src.encounterName, itemIds: [] };
        inst.encounters.push(enc);
      }

      if (!enc.itemIds.includes(itemId)) {
        enc.itemIds.push(itemId);
      }

      if (!itemSet.has(itemId)) {
        itemSet.add(itemId);
        inst.totalPieces++;
      }
    }
  }

  const instances = Array.from(instanceMap.values()).sort(
    (a, b) => b.totalPieces - a.totalPieces
  );

  return NextResponse.json({ instances, otherItemIds } satisfies FarmingListResponse);
}
