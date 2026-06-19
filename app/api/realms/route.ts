import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getGameData } from "@/lib/blizzard";
import { isRegion, type Region } from "@/lib/regions";

export interface RealmEntry {
  name: string;
  slug: string;
}

// Realm lists are stable between patches — cache per region for the session lifetime.
const _cache = new Map<Region, RealmEntry[]>();

export async function GET(req: NextRequest) {
  const regionParam = (req.nextUrl.searchParams.get("region") ?? "us").toLowerCase();
  if (!isRegion(regionParam)) {
    return NextResponse.json(
      { error: "invalid_region", message: `"${regionParam}" is not a supported region. Use us, eu, kr, or tw.` },
      { status: 400 }
    );
  }
  const region = regionParam;

  if (!_cache.has(region)) {
    const res = await getGameData("/data/wow/realm/index", { namespace: "dynamic", region });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch realm list" }, { status: 502 });
    }
    const data = await res.json() as {
      realms: Array<{ name: string; slug: string }>;
    };
    _cache.set(region, data.realms
      .map(r => ({ name: r.name, slug: r.slug }))
      .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  return NextResponse.json(_cache.get(region)!, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
