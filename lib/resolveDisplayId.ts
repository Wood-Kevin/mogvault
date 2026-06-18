import { getGameData } from "./blizzard";

// Resolves a single item ID to its viewer display ID.
// Chain: item → appearances[0].id → item-appearance → item_display_info_id
// Returns null if the item has no appearance (tabard blanks, non-visual items, API errors).
export async function resolveItemDisplayId(itemId: number): Promise<number | null> {
  const itemRes = await getGameData(`/data/wow/item/${itemId}`);
  if (!itemRes.ok) return null;
  const item = await itemRes.json() as { appearances?: Array<{ id: number }> };
  const appId = item.appearances?.[0]?.id;
  if (appId == null) return null;

  const appRes = await getGameData(`/data/wow/item-appearance/${appId}`);
  if (!appRes.ok) return null;
  const app = await appRes.json() as { item_display_info_id?: number };
  return app.item_display_info_id ?? null;
}
