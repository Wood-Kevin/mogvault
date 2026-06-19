import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getGameData } from "@/lib/blizzard";

export interface CollectionsResponse {
  ownedAppearanceIds: number[];
}

// Blizzard shape: slots is an array of per-equip-slot entries.
// Each entry has a `slot.type` and an `appearances` array of { id: number }.
interface TransmogSlot {
  slot: { type: string; name: string };
  appearances: Array<{ id: number }>;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ realm: string; name: string }> }
) {
  const { realm, name } = await params;

  const res = await getGameData(
    `/profile/wow/character/${encodeURIComponent(realm)}/${encodeURIComponent(name)}/collections/transmogs`,
    { namespace: "profile" }
  );

  // 403 = private profile; 404 = not found — degrade gracefully in both cases.
  if (!res.ok) {
    return NextResponse.json({ ownedAppearanceIds: [] } satisfies CollectionsResponse);
  }

  const data = await res.json() as { slots?: TransmogSlot[] };

  const ids: number[] = [];
  for (const slot of data.slots ?? []) {
    for (const app of slot.appearances ?? []) {
      ids.push(app.id);
    }
  }

  return NextResponse.json({ ownedAppearanceIds: ids } satisfies CollectionsResponse);
}
