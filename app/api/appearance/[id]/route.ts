import { NextRequest, NextResponse } from "next/server";
import { getGameData } from "@/lib/blizzard";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const res = await getGameData(`/data/wow/item-appearance/${numId}`);

    if (res.status === 404) {
      return NextResponse.json(
        { error: "Appearance not found" },
        { status: 404 }
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/appearance]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
