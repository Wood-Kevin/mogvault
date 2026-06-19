import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { getGameData } from "@/lib/blizzard";
import {
  SLOT_TO_INVENTORY_TYPES,
  INVENTORY_TYPE_TO_VIEWER_SLOT,
  ARMOR_FILTERABLE_SLOTS,
  CLASS_TO_ARMOR_SUBCLASS,
} from "@/lib/slots";

// ── Source index ──────────────────────────────────────────────────────────────

type SourceEntry = {
  instanceId: number;
  instanceName: string;
  encounterId: number;
  encounterName: string;
  type: "raid" | "dungeon";
};
type SourceIndex = Record<string, { sources: SourceEntry[] }>;

let _sourceIndex: SourceIndex | null = null;
function getSourceIndex(): SourceIndex {
  if (!_sourceIndex) {
    _sourceIndex = JSON.parse(
      readFileSync(join(process.cwd(), "data", "source-index.json"), "utf-8")
    ) as SourceIndex;
  }
  return _sourceIndex;
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function mapConcurrent<T, U>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── Response types ────────────────────────────────────────────────────────────

export interface SearchResultItem {
  id:           number;
  name:         string;
  quality:      string;
  icon:         string | null;
  appearanceId: number | null;
  inventoryType: string;
  viewerSlot:   number;
  source: {
    type: "raid" | "dungeon" | "other";
    instanceName?: string;
    encounterName?: string;
  };
}

export interface SearchResponse {
  items: SearchResultItem[];
  pageCount: number;
  page: number;
}

// ── Blizzard search response shape ────────────────────────────────────────────

interface BlizzardSearchItem {
  id: number;
  name: { en_US: string };
  quality: { type: string };
  inventory_type: { type: string };
}

// ── Route handler ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 24;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const slot      = parseInt(searchParams.get("slot") ?? "", 10);
  const q         = searchParams.get("q")?.trim() ?? "";
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const typeParam = searchParams.get("type") ?? "";
  const className = searchParams.get("className")?.trim() ?? "";

  if (isNaN(slot)) {
    return NextResponse.json({ error: "slot is required" }, { status: 400 });
  }

  const validTypes = SLOT_TO_INVENTORY_TYPES[slot];
  if (!validTypes?.length) {
    return NextResponse.json({ error: `No inventory types mapped for slot ${slot}` }, { status: 400 });
  }

  const inventoryType =
    typeParam && validTypes.includes(typeParam) ? typeParam : validTypes[0];

  const apiParams: Record<string, string> = {
    "inventory_type.type": inventoryType,
    "_pageSize": String(PAGE_SIZE),
    "_page":     String(page),
  };
  if (q) apiParams["name.en_US"] = q;

  // Armor class filter: only for armor slots when a class is known.
  // Cosmetic items (subclass 5) bypass class restrictions but are a minor
  // known gap — a second API call to merge cosmetics isn't worth the cost.
  if (className && ARMOR_FILTERABLE_SLOTS.has(slot)) {
    const armorSubclass = CLASS_TO_ARMOR_SUBCLASS[className];
    if (armorSubclass !== undefined) {
      apiParams["item_class.id"]    = "4"; // Armor
      apiParams["item_subclass.id"] = String(armorSubclass);
    }
  }

  const searchRes = await getGameData("/data/wow/search/item", { searchParams: apiParams });
  if (!searchRes.ok) {
    return NextResponse.json(
      { error: `Blizzard search API error: ${searchRes.status}` },
      { status: 502 }
    );
  }

  const searchData = await searchRes.json() as {
    pageCount: number;
    results?: Array<{ data: BlizzardSearchItem }>;
  };

  const items: BlizzardSearchItem[] = searchData.results?.map(r => r.data) ?? [];
  const sourceIndex = getSourceIndex();

  // Fetch icons and appearance IDs in parallel (12 concurrent each)
  const [icons, appearanceIds] = await Promise.all([
    mapConcurrent(items, 12, async (item) => {
      const res = await getGameData(`/data/wow/media/item/${item.id}`);
      if (!res.ok) return null;
      const media = await res.json() as { assets?: Array<{ key: string; value: string }> };
      return media.assets?.find(a => a.key === "icon")?.value ?? null;
    }),
    mapConcurrent(items, 12, async (item) => {
      const res = await getGameData(`/data/wow/item/${item.id}`);
      if (!res.ok) return null;
      const data = await res.json() as { appearances?: Array<{ id: number }> };
      return data.appearances?.[0]?.id ?? null;
    }),
  ]);

  const enriched: SearchResultItem[] = items.map((item, idx) => {
    const entry  = sourceIndex[String(item.id)];
    const src    = entry?.sources?.[0];
    const invType = item.inventory_type.type;

    return {
      id:            item.id,
      name:          item.name.en_US,
      quality:       item.quality.type,
      icon:          icons[idx],
      appearanceId:  appearanceIds[idx],
      inventoryType: invType,
      viewerSlot:    INVENTORY_TYPE_TO_VIEWER_SLOT[invType] ?? slot,
      source: src
        ? { type: src.type, instanceName: src.instanceName, encounterName: src.encounterName }
        : { type: "other" },
    };
  });

  return NextResponse.json({
    items:     enriched,
    pageCount: searchData.pageCount ?? 1,
    page,
  } satisfies SearchResponse);
}
