import { NextRequest, NextResponse } from "next/server";
import { getGameData } from "@/lib/blizzard";
import { resolveItemAppearance } from "@/lib/resolveDisplayId";
import { INVENTORY_TYPE_TO_VIEWER_SLOT } from "@/lib/slots";

export interface ItemDisplayResponse {
  itemId:       number;
  displayId:    number;
  appearanceId: number;
  name:         string;
  icon:         string | null;
  inventoryType: string;
  viewerSlot:   number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (isNaN(itemId)) {
    return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
  }

  const [itemRes, iconRes, appearance] = await Promise.all([
    getGameData(`/data/wow/item/${itemId}`),
    getGameData(`/data/wow/media/item/${itemId}`),
    resolveItemAppearance(itemId),
  ]);

  if (itemRes.status === 404) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  if (!itemRes.ok) {
    return NextResponse.json(
      { error: `Upstream error: ${itemRes.status}` },
      { status: 502 }
    );
  }
  if (appearance == null) {
    return NextResponse.json(
      { error: "Item has no appearance (non-visual or appearance data unavailable)" },
      { status: 404 }
    );
  }

  const item = await itemRes.json() as {
    name: string;
    inventory_type: { type: string; name: string };
  };

  let icon: string | null = null;
  if (iconRes.ok) {
    const media = await iconRes.json() as { assets?: Array<{ key: string; value: string }> };
    icon = media.assets?.find(a => a.key === "icon")?.value ?? null;
  }

  const inventoryType = item.inventory_type.type;
  const viewerSlot = INVENTORY_TYPE_TO_VIEWER_SLOT[inventoryType] ?? 0;

  const body: ItemDisplayResponse = {
    itemId,
    displayId:    appearance.displayId,
    appearanceId: appearance.appearanceId,
    name: item.name,
    icon,
    inventoryType,
    viewerSlot,
  };

  return NextResponse.json(body);
}
