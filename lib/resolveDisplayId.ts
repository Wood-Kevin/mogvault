import { getGameData } from "./blizzard";

export interface ItemAppearance {
  displayId:    number; // wow-model-viewer item_display_info_id
  appearanceId: number; // Blizzard item-appearance ID (item.appearances[0].id)
}

// Resolves a single item ID to its viewer display ID and Blizzard appearance ID.
// Chain: item → appearances[0].id → item-appearance → item_display_info_id
// Returns null if the item has no appearance (non-visual items, API errors).
export async function resolveItemAppearance(itemId: number): Promise<ItemAppearance | null> {
  const itemRes = await getGameData(`/data/wow/item/${itemId}`);
  if (!itemRes.ok) return null;
  const item = await itemRes.json() as { appearances?: Array<{ id: number }> };
  const appearanceId = item.appearances?.[0]?.id;
  if (appearanceId == null) return null;

  const appRes = await getGameData(`/data/wow/item-appearance/${appearanceId}`);
  if (!appRes.ok) return null;
  const app = await appRes.json() as { item_display_info_id?: number };
  const displayId = app.item_display_info_id;
  if (displayId == null) return null;

  return { displayId, appearanceId };
}
