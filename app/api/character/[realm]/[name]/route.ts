import { NextRequest, NextResponse } from "next/server";
import { getGameData } from "@/lib/blizzard";
import { isRegion } from "@/lib/regions";

// ── Viewer slot constants (from wow-model-viewer character_modeling.js) ───────
// internal_slot_id (from Blizzard appearance API) + 1 = viewer slot number.
// These viewer slot numbers are never rendered — skip their display ID lookups.
const NOT_DISPLAYED_VIEWER_SLOTS = new Set([
  2,  // NECK
  11, // FINGER_1
  12, // FINGER_2
  13, // TRINKET_1
  14, // TRINKET_2
]);

// ── Customization option name → viewer character property ─────────────────────
// Mirrors characterPart() in wow-model-viewer/character_modeling.js.
// Blizzard gives option names; viewer expects numeric values by property name.
const CUSTOMIZATION_MAP: Record<string, string> = {
  "Skin Color":              "skin",
  "Face":                    "face",
  "Hair Style":              "hairStyle",
  "Hair Color":              "hairColor",
  "Facial Hair":             "facialStyle",
  "Mustache":                "facialStyle",
  "Beard":                   "facialStyle",
  "Sideburns":               "facialStyle",
  "Face Shape":              "facialStyle",
  "Eyebrow":                 "facialStyle",
  "Eyebrows":               "facialStyle",
  // Vulpera
  "Ears":                    "ears",
  "Fur Color":               "furColor",
  "Snout":                   "snout",
  // Dracthyr
  "Primary Color":           "primaryColor",
  "Secondary Color":         "secondaryColor",
  "Secondary Color Strength":"secondaryColorStrength",
  "Horn Color":              "hornColor",
  "Horns":                   "horns",
  "Body Size":               "bodySize",
};

// ── Blizzard API response shapes ──────────────────────────────────────────────

interface AppearanceItem {
  id: number;
  slot: { type: string; name: string };
  internal_slot_id: number;
}

interface Customization {
  option: { name: string; id: number };
  choice: { id: number; display_order: number; name?: string };
}

interface AppearanceResponse {
  playable_race: { id: number; name: string };
  playable_class: { name: string };
  active_spec: { name: string };
  gender: { type: string };
  items: AppearanceItem[];
  customizations: Customization[];
  character: { name: string; realm: { name: string } };
}

interface ItemResponse {
  appearances?: Array<{ id: number }>;
}

interface ItemAppearanceResponse {
  item_display_info_id?: number;
}

// ── Exported type for UI consumption ─────────────────────────────────────────

export interface ViewerCharacter {
  race: number;
  gender: number;
  skin: number;
  face: number;
  hairStyle: number;
  hairColor: number;
  facialStyle: number;
  items: [number, number][];
  // Race-specific extras (Vulpera / Dracthyr)
  furColor?: number;
  ears?: number;
  snout?: number;
  primaryColor?: number;
  secondaryColor?: number;
  secondaryColorStrength?: number;
  bodySize?: number;
  horns?: number;
  hornColor?: number;
}

export interface CharacterRouteResponse {
  character: ViewerCharacter;
  meta: {
    name: string;
    realmName: string;
    raceName: string;
    className: string;
    specName: string;
    itemCount: number;
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ realm: string; name: string }> }
) {
  const { realm, name } = await params;

  // ── 0. Validate region query param ────────────────────────────────────────
  const regionParam = (req.nextUrl.searchParams.get("region") ?? "us").toLowerCase();
  if (!isRegion(regionParam)) {
    return NextResponse.json(
      { error: "invalid_region", message: `"${regionParam}" is not a supported region. Use us, eu, kr, or tw.` },
      { status: 400 }
    );
  }
  const region = regionParam;

  // ── 1. Fetch appearance endpoint (transmog-aware item IDs + customizations)
  let appRes: Response;
  try {
    appRes = await getGameData(
      `/profile/wow/character/${encodeURIComponent(realm)}/${encodeURIComponent(name)}/appearance`,
      { namespace: "profile", region }
    );
  } catch {
    return NextResponse.json(
      { error: "upstream_error", message: "Failed to reach Blizzard API" },
      { status: 502 }
    );
  }

  if (appRes.status === 404) {
    return NextResponse.json(
      { error: "not_found", message: `Character "${name}" not found on realm "${realm}"` },
      { status: 404 }
    );
  }
  if (appRes.status === 403 || appRes.status === 401) {
    return NextResponse.json(
      { error: "private", message: "Character profile is private or not accessible" },
      { status: 403 }
    );
  }
  if (!appRes.ok) {
    return NextResponse.json(
      { error: "upstream_error", message: `Blizzard returned ${appRes.status}` },
      { status: appRes.status }
    );
  }

  const appearance = (await appRes.json()) as AppearanceResponse;

  // ── 2. Build customization object from display_order values ───────────────
  const customizationResult: Record<string, number> = {
    skin: 0,
    face: 0,
    hairStyle: 0,
    hairColor: 0,
    facialStyle: 0,
  };

  for (const c of appearance.customizations ?? []) {
    const viewerProp = CUSTOMIZATION_MAP[c.option.name];
    if (viewerProp) {
      // display_order is the 0-based index the viewer uses to pick the choice
      customizationResult[viewerProp] = c.choice.display_order;
    }
  }

  // ── 3. Determine visible items from appearance (already transmog-aware) ────
  const visibleItems = (appearance.items ?? []).filter((item) => {
    const viewerSlot = item.internal_slot_id + 1;
    return !NOT_DISPLAYED_VIEWER_SLOTS.has(viewerSlot);
  });

  // ── 4. Fetch item endpoints in parallel to get appearance IDs ─────────────
  const itemAppearanceIds = await Promise.all(
    visibleItems.map(async (slot) => {
      try {
        const res = await getGameData(`/data/wow/item/${slot.id}`);
        if (!res.ok) return null;
        const data = (await res.json()) as ItemResponse;
        const appId = data.appearances?.[0]?.id;
        return appId ?? null;
      } catch {
        return null;
      }
    })
  );

  // ── 5. Fetch item-appearance endpoints in parallel to get display IDs ──────
  const displayIds = await Promise.all(
    itemAppearanceIds.map(async (appId) => {
      if (appId == null) return null;
      try {
        const res = await getGameData(`/data/wow/item-appearance/${appId}`);
        if (!res.ok) return null;
        const data = (await res.json()) as ItemAppearanceResponse;
        return data.item_display_info_id ?? null;
      } catch {
        return null;
      }
    })
  );

  // ── 6. Assemble items array [[viewerSlot, displayId], ...] ────────────────
  const items: [number, number][] = [];
  for (let i = 0; i < visibleItems.length; i++) {
    const displayId = displayIds[i];
    if (displayId == null) continue;
    const viewerSlot = visibleItems[i].internal_slot_id + 1;
    items.push([viewerSlot, displayId]);
  }

  // ── 7. Assemble final character object ────────────────────────────────────
  const character: ViewerCharacter = {
    race: appearance.playable_race.id,
    gender: appearance.gender.type === "FEMALE" ? 0 : 1,
    skin: customizationResult.skin,
    face: customizationResult.face,
    hairStyle: customizationResult.hairStyle,
    hairColor: customizationResult.hairColor,
    facialStyle: customizationResult.facialStyle,
    items,
  };

  // Attach race-specific extras if present
  const extras = ["furColor", "ears", "snout", "primaryColor", "secondaryColor",
                  "secondaryColorStrength", "bodySize", "horns", "hornColor"] as const;
  for (const prop of extras) {
    if (customizationResult[prop] != null) {
      (character as unknown as Record<string, unknown>)[prop] = customizationResult[prop];
    }
  }

  const response: CharacterRouteResponse = {
    character,
    meta: {
      name: appearance.character.name,
      realmName: appearance.character.realm.name,
      raceName: appearance.playable_race.name,
      className: appearance.playable_class.name,
      specName: appearance.active_spec.name,
      itemCount: items.length,
    },
  };

  return NextResponse.json(response);
}
