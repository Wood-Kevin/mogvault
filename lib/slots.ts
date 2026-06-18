// Slot definitions shared by server routes and client components.
// "Viewer slot" = internal_slot_id + 1 from the Blizzard character appearance endpoint.
// This is the position-based character slot (1-19), NOT the Blizzard inventory_type numeric value
// (which uses a different numbering for back/weapons).
//
// Blizzard inventory_type.type real names (verified against live API):
//   WEAPON          one-hand (swords, axes, maces, daggers, fist weapons)
//   TWOHWEAPON      two-hand (swords, axes, maces, staves, polearms)
//   WEAPONMAINHAND  main-hand-only (warglaives, etc.)
//   WEAPONOFFHAND   off-hand-only weapons
//   RANGED          bows, guns, crossbows (all share one type)
//   RANGEDRIGHT     wands
//   CLOAK           back-slot items (NOT "BACK" — search API uses CLOAK)
//   BODY            shirt-slot items (NOT "SHIRT" — search API uses BODY)
// Note: BOW, GUN, CROSSBOW, WAND, ONE_HAND, TWO_HAND, MAIN_HAND, OFF_HAND,
//       BACK, SHIRT, RANGED_RIGHT do NOT exist in the search API.

export interface SlotDef {
  viewerSlot: number;
  label: string;
  displayed: boolean; // false = neck/rings/trinkets that the viewer never renders
}

export const SLOT_DEFS: SlotDef[] = [
  { viewerSlot:  1, label: "Head",      displayed: true  },
  { viewerSlot:  2, label: "Neck",      displayed: false },
  { viewerSlot:  3, label: "Shoulders", displayed: true  },
  { viewerSlot:  4, label: "Shirt",     displayed: true  },
  { viewerSlot:  5, label: "Chest",     displayed: true  },
  { viewerSlot:  6, label: "Waist",     displayed: true  },
  { viewerSlot:  7, label: "Legs",      displayed: true  },
  { viewerSlot:  8, label: "Feet",      displayed: true  },
  { viewerSlot:  9, label: "Wrist",     displayed: true  },
  { viewerSlot: 10, label: "Hands",     displayed: true  },
  { viewerSlot: 11, label: "Finger 1",  displayed: false },
  { viewerSlot: 12, label: "Finger 2",  displayed: false },
  { viewerSlot: 13, label: "Trinket 1", displayed: false },
  { viewerSlot: 14, label: "Trinket 2", displayed: false },
  { viewerSlot: 15, label: "Back",      displayed: true  },
  { viewerSlot: 16, label: "Main Hand", displayed: true  },
  { viewerSlot: 17, label: "Off-Hand",  displayed: true  },
  { viewerSlot: 18, label: "Ranged",    displayed: true  },
  { viewerSlot: 19, label: "Tabard",    displayed: true  },
];

export const VISIBLE_SLOTS = SLOT_DEFS.filter(s => s.displayed);

// Slots where the player can choose to show nothing (mirrors WoW transmog rules).
// Legs (7) and the three weapon slots (16, 17, 18) cannot be hidden.
export const HIDEABLE_SLOTS = new Set([1, 3, 4, 5, 6, 8, 9, 10, 15, 19]);

// Viewer slot → inventory type(s) to query via Blizzard search API.
// Multi-type entries are shown as a secondary type filter in the ItemBrowser;
// the first entry is the default.
// For weapon slots (16-18), this is the unfiltered baseline — CLASS_WEAPON_SLOT_TYPES
// overrides per class once a character is loaded.
export const SLOT_TO_INVENTORY_TYPES: Record<number, string[]> = {
  1:  ["HEAD"],
  3:  ["SHOULDER"],
  4:  ["BODY"],              // "SHIRT" is not a valid search API type — use BODY
  5:  ["CHEST", "ROBE"],
  6:  ["WAIST"],
  7:  ["LEGS"],
  8:  ["FEET"],
  9:  ["WRIST"],
  10: ["HANDS"],
  15: ["CLOAK"],             // "BACK" is not a valid search API type — use CLOAK
  16: ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND"],
  17: ["SHIELD", "HOLDABLE", "WEAPONOFFHAND"],
  18: ["RANGED", "RANGEDRIGHT", "THROWN"],
  19: ["TABARD"],
};

// Human-readable labels for inventory types in the type filter UI.
export const INVENTORY_TYPE_LABELS: Record<string, string> = {
  HEAD:           "Head",
  SHOULDER:       "Shoulder",
  BODY:           "Shirt",
  CHEST:          "Chest",
  ROBE:           "Robe",
  WAIST:          "Waist",
  LEGS:           "Legs",
  FEET:           "Feet",
  WRIST:          "Wrist",
  HANDS:          "Hands",
  CLOAK:          "Cloak",
  WEAPON:         "One-Hand",
  TWOHWEAPON:     "Two-Hand",
  WEAPONMAINHAND: "Main Hand Only",
  WEAPONOFFHAND:  "Off-Hand Weapon",
  SHIELD:         "Shield",
  HOLDABLE:       "Held Off-Hand",
  RANGED:         "Ranged",
  RANGEDRIGHT:    "Wand",
  THROWN:         "Thrown",
  TABARD:         "Tabard",
};

// ── Class-based filtering ──────────────────────────────────────────────────────

// Armor slots that are filtered by the character's armor class.
// Back (15), Shirt (4), Tabard (19) are all-class — NOT filtered.
export const ARMOR_FILTERABLE_SLOTS = new Set([1, 3, 5, 6, 7, 8, 9, 10]);

// Class name → Blizzard armor item_subclass.id for the item search API.
// (Cosmetic armor, subclass 5, bypasses class restrictions but we note it as a minor gap.)
export const CLASS_TO_ARMOR_SUBCLASS: Record<string, number> = {
  // Cloth wearers
  Mage:      1, Priest:  1, Warlock:       1,
  // Leather wearers
  Rogue:     2, Druid:   2, "Demon Hunter": 2, Monk: 2,
  // Mail wearers
  Hunter:    3, Shaman:  3, Evoker:         3,
  // Plate wearers
  Warrior:   4, Paladin: 4, "Death Knight": 4,
};

// Per-class overrides for weapon slot valid inventory types.
// Slots 16 (Main Hand), 17 (Off-Hand), 18 (Ranged).
// Empty array [] means the slot is not usable by this class at all.
// Only includes classes that differ from the default SLOT_TO_INVENTORY_TYPES.
export const CLASS_WEAPON_SLOT_TYPES: Record<string, Partial<Record<number, string[]>>> = {
  Warrior: {
    // Warriors: all 1H/2H melee, no shields, no holdables, ranged for transmog
    17: ["WEAPONOFFHAND"],
    18: ["RANGED", "THROWN"],
  },
  Paladin: {
    // Paladins: axes/maces/swords/polearms + shield
    16: ["WEAPON", "TWOHWEAPON"],
    17: ["SHIELD"],
    18: [],
  },
  Hunter: {
    // Hunters: melee 1H/2H in main hand, ranged primary
    17: [],                          // no off-hand slot
    18: ["RANGED"],                  // bows/guns/crossbows only (no wands)
  },
  Rogue: {
    // Rogues: 1H only, dual wield, no shields/2H
    16: ["WEAPON", "WEAPONMAINHAND"],
    17: ["WEAPONOFFHAND"],
    18: ["THROWN"],
  },
  Priest: {
    // Priests: dagger/1H mace/1H sword/staff, off-hand held item, wand
    16: ["WEAPON", "TWOHWEAPON"],
    17: ["HOLDABLE"],
    18: ["RANGEDRIGHT"],
  },
  "Death Knight": {
    // DKs: 1H/2H axes/maces/swords/polearms, dual wield capable
    16: ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND"],
    17: ["WEAPONOFFHAND"],
    18: [],
  },
  Shaman: {
    // Shamans: 1H/2H axes/maces/daggers/fists/staves, shield or off-hand weapon
    16: ["WEAPON", "TWOHWEAPON"],
    17: ["SHIELD", "WEAPONOFFHAND"],
    18: [],
  },
  Mage: {
    // Mages: dagger/1H sword/staff, off-hand held item, wand
    16: ["WEAPON", "TWOHWEAPON"],
    17: ["HOLDABLE"],
    18: ["RANGEDRIGHT"],
  },
  Warlock: {
    // Warlocks: dagger/1H sword/staff, off-hand held item, wand
    16: ["WEAPON", "TWOHWEAPON"],
    17: ["HOLDABLE"],
    18: ["RANGEDRIGHT"],
  },
  Monk: {
    // Monks: 1H/2H axes/maces/swords/polearms/staves/fists, dual wield capable
    16: ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND"],
    17: ["WEAPONOFFHAND"],
    18: [],
  },
  Druid: {
    // Druids: fist/dagger/mace/polearm/staff/2H mace, held off-hand
    16: ["WEAPON", "TWOHWEAPON"],
    17: ["HOLDABLE"],
    18: [],
  },
  "Demon Hunter": {
    // DHs: warglaives/1H swords/axes/fists only — no 2H, no shields, no ranged
    16: ["WEAPON", "WEAPONMAINHAND"],
    17: ["WEAPONOFFHAND"],
    18: [],
  },
  Evoker: {
    // Evokers: daggers/axes/fists/maces/swords/staves, off-hand weapon or held
    16: ["WEAPON", "TWOHWEAPON"],
    17: ["WEAPONOFFHAND", "HOLDABLE"],
    18: [],
  },
};

// Logical slot → wow-model-viewer render slot.
// Armor slots 1-15 and tabard (19) are identity in both systems.
// Weapon slots diverge: Blizzard uses internal_slot_id+1 (16/17/18) but the viewer
// and WH.Wow.Item constants use 21 (main-hand) and 22 (off-hand).
// This mapping is applied at every updateItemViewer call and on the items array
// passed to generateModels. Outfit state and UI always use logical slots.
export const LOGICAL_TO_RENDER_SLOT: Record<number, number> = {
  16: 21, // main-hand  (WH.Wow.Item.INVENTORY_TYPE_MAIN_HAND)
  17: 22, // off-hand   (WH.Wow.Item.INVENTORY_TYPE_OFF_HAND)
  // ranged (18) stays as 18 — it is listed as a valid slot in the README table
};

export function toRenderSlot(logicalSlot: number): number {
  return LOGICAL_TO_RENDER_SLOT[logicalSlot] ?? logicalSlot;
}

// Blizzard inventory_type.type → viewer slot (position 1-19).
// Viewer slot ≠ WH.Wow.Item constants for BACK and weapons — these values are correct.
export const INVENTORY_TYPE_TO_VIEWER_SLOT: Record<string, number> = {
  HEAD:           1,
  NECK:           2,
  SHOULDER:       3,
  SHIRT:          4,  // legacy; search API uses BODY
  BODY:           4,  // shirt-slot items (search API name)
  CHEST:          5,
  ROBE:           5,
  WAIST:          6,
  LEGS:           7,
  FEET:           8,
  WRIST:          9,
  HANDS:          10,
  FINGER:         11,
  TRINKET:        13,
  BACK:           15, // legacy; search API uses CLOAK
  CLOAK:          15, // back-slot items (search API name)
  WEAPON:         16, // one-hand weapons
  TWOHWEAPON:     16, // two-hand weapons
  WEAPONMAINHAND: 16, // main-hand-only weapons
  WEAPONOFFHAND:  17, // off-hand-only weapons
  SHIELD:         17,
  HOLDABLE:       17, // held-in-offhand items
  RANGED:         18, // bows, guns, crossbows
  RANGEDRIGHT:    18, // wands
  THROWN:         18,
  TABARD:         19,
};
