import { NextRequest, NextResponse } from "next/server";

// CONTENT_PATH is "/api/modelviewer/live/" so path params start with "live/..."
const CDN_BASE = "https://wow.zamimg.com/modelviewer";

// Proxy route for wow.zamimg.com model viewer assets.
//
// WHY: wow.zamimg.com returns 403 for cross-origin fetch() calls from any
// origin other than wowhead.com. The viewer's findRaceGenderOptions() and
// the ZamModelViewer itself make fetch/XHR calls to CONTENT_PATH — if that
// points at the CDN directly the browser gets CORS-blocked. By routing
// through this handler (same origin from the browser's perspective) the
// server fetches from the CDN server-to-server where CORS doesn't apply.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const assetPath = path.join("/");
  const upstream = `${CDN_BASE}/${assetPath}`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: {
        // Appear as a browser to the CDN (avoids WAF bot-detection blocks)
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
      // Don't cache errors
      cache: "no-store",
    });
  } catch {
    return new NextResponse("Upstream fetch failed", { status: 502 });
  }

  if (!res.ok) {
    return new NextResponse(`CDN returned ${res.status}`, { status: res.status });
  }

  // Pass the raw body through with the original content-type.
  // Model assets are a mix of JSON, binary .m2/.skin/.anim files, WebP textures.
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Allow browsers to cache CDN assets aggressively — they don't change
      // between requests and we want to avoid redundant proxy calls.
      // Vercel's edge respects s-maxage; without it the infra forces max-age=0.
      // CDN-Cache-Control is the Vercel-native override for edge caching.
      // max-age covers browsers that see the response directly.
      "Cache-Control":     "public, s-maxage=31536000, max-age=31536000, immutable",
      "CDN-Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
