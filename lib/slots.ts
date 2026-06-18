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
// Note: BOW, GUN, CROSSBOW, WAND, ONE_HAND, TWO_HAND, MAIN_HAND, OFF_HAND,
//       RANGED_RIGHT do NOT exist in the search API.

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
export const SLOT_TO_INVENTORY_TYPES: Record<number, string[]> = {
  1:  ["HEAD"],
  3:  ["SHOULDER"],
  4:  ["SHIRT"],
  5:  ["CHEST", "ROBE"],
  6:  ["WAIST"],
  7:  ["LEGS"],
  8:  ["FEET"],
  9:  ["WRIST"],
  10: ["HANDS"],
  15: ["BACK"],
  16: ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND"],
  17: ["SHIELD", "HOLDABLE", "WEAPONOFFHAND"],
  18: ["RANGED", "RANGEDRIGHT", "THROWN"],
  19: ["TABARD"],
};

// Human-readable labels for inventory types in the type filter UI.
export const INVENTORY_TYPE_LABELS: Record<string, string> = {
  HEAD:           "Head",
  SHOULDER:       "Shoulder",
  SHIRT:          "Shirt",
  CHEST:          "Chest",
  ROBE:           "Robe",
  WAIST:          "Waist",
  LEGS:           "Legs",
  FEET:           "Feet",
  WRIST:          "Wrist",
  HANDS:          "Hands",
  BACK:           "Cloak",
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

// Blizzard inventory_type.type → viewer slot (position 1-19).
// Viewer slot ≠ WH.Wow.Item constants for BACK and weapons — these values are correct.
export const INVENTORY_TYPE_TO_VIEWER_SLOT: Record<string, number> = {
  HEAD:           1,
  NECK:           2,
  SHOULDER:       3,
  SHIRT:          4,
  CHEST:          5,
  ROBE:           5,
  WAIST:          6,
  LEGS:           7,
  FEET:           8,
  WRIST:          9,
  HANDS:          10,
  FINGER:         11,
  TRINKET:        13,
  BACK:           15,
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
