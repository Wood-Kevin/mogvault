import "server-only";
import { NextResponse } from "next/server";
import { getGameData } from "@/lib/blizzard";

export interface RealmEntry {
  name: string;
  slug: string;
}

// Realm list is stable between patches — cache for the session lifetime.
let _cache: RealmEntry[] | null = null;

export async function GET() {
  if (!_cache) {
    const res = await getGameData("/data/wow/realm/index", { namespace: "dynamic" });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch realm list" }, { status: 502 });
    }
    const data = await res.json() as {
      realms: Array<{ name: string; slug: string }>;
    };
    _cache = data.realms
      .map(r => ({ name: r.name, slug: r.slug }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return NextResponse.json(_cache, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
