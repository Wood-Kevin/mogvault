# ARCHITECTURE
_Last updated: 2026-06-19_
_Focus: arch_

## System Overview

```text
┌──────────────────────────────────────────────────────────────┐
│                     Browser (Client)                         │
│  CharacterViewer.tsx  ItemBrowser.tsx  FarmingList.tsx       │
│  React state + localStorage   |   wow-model-viewer (WebGL)   │
└──────────────────┬───────────────────────────────────────────┘
                   │  fetch() — same-origin only
┌──────────────────▼───────────────────────────────────────────┐
│              Next.js Route Handlers (Server)                  │
│  /api/character/[realm]/[name]   /api/search/items            │
│  /api/item/[id]/display          /api/farming-list            │
│  /api/realms                     /api/appearance/[id]         │
│  /api/character/[realm]/[name]/collections                    │
│  /api/modelviewer/[...path]  (CORS proxy)                     │
└───────────┬──────────────────────────┬───────────────────────┘
            │  lib/blizzard-core.ts    │  lib/sourceIndex.ts
            │  OAuth + fetch           │  readFileSync
            ▼                          ▼
┌───────────────────────┐   ┌──────────────────────────────────┐
│  Blizzard Battle.net  │   │  data/source-index.json          │
│  *.api.blizzard.com   │   │  data/token-appearance-sets.json │
│  oauth.battle.net     │   │  (static files, built by script) │
└───────────────────────┘   └──────────────────────────────────┘
            │ (CDN proxy path only)
            ▼
┌───────────────────────────────────────────────────────────────┐
│  wow.zamimg.com CDN                                           │
│  /modelviewer/live/* (3D assets: .m2, .skin, textures, JSON) │
└───────────────────────────────────────────────────────────────┘
```

## Server / Client Boundary

**Server-only code** (runs exclusively in Route Handlers / Node.js):
- `lib/blizzard.ts` — imports `server-only`; all OAuth and Blizzard API calls
- `lib/blizzard-core.ts` — OAuth client-credentials flow, token cache, `getGameData()`
- `lib/sourceIndex.ts` — imports `server-only`; reads `data/source-index.json` via `fs.readFileSync`
- `lib/resolveDisplayId.ts` — imports `lib/blizzard.ts`; item → appearance → display ID chain
- All `app/api/**/route.ts` files

**Client-only code** (runs in the browser, `"use client"` directive):
- `components/CharacterViewer.tsx` — main app state, viewer lifecycle, outfit management
- `components/CharacterViewerClient.tsx` — thin wrapper holding `ssr: false` dynamic import
- `components/ItemBrowser.tsx`, `components/FarmingList.tsx`, `components/RealmCombobox.tsx`

**Shared** (imported by both sides without side effects):
- `lib/slots.ts` — pure constant maps: slot defs, inventory type mappings, class weapon types

## Authentication and Secret Handling

**OAuth client-credentials flow** in `lib/blizzard-core.ts`:
1. `POST https://oauth.battle.net/token` with `Basic {base64(CLIENT_ID:CLIENT_SECRET)}`
2. Token cached in module-level variable `tokenCache` (warm serverless instance reuse)
3. Token refreshed 5 minutes before expiry; on 401 the cache is invalidated and one retry is made
4. `BLIZZARD_CLIENT_SECRET` is consumed only in `lib/blizzard-core.ts` on the server; the variable is never referenced in any client bundle

**Build-time guard:**
- `lib/blizzard.ts` has `import "server-only"` at line 1 — accidental client import fails the Next.js build
- `lib/blizzard-core.ts` omits the guard so `scripts/build-source-index.ts` (plain Node.js, no bundler) can import it directly

## CORS Proxy Pattern

`wow-model-viewer` makes XHR/fetch calls to `CONTENT_PATH` for 3D model assets. Direct calls to `wow.zamimg.com` are CORS-blocked (CDN returns 403 for non-Wowhead origins).

**Solution:** `app/api/modelviewer/[...path]/route.ts` proxies all asset requests:
- Browser sets `window.CONTENT_PATH = "/api/modelviewer/live/"` before calling `generateModels`
- All asset fetches become same-origin from the browser's perspective
- Route handler fetches `https://wow.zamimg.com/modelviewer/{path}` server-to-server (no CORS)
- Spoof `User-Agent` to avoid WAF bot-detection blocks
- Path traversal protection: rejects segments containing `..`, `.`, or `%2e`
- Response cached with `Cache-Control: public, s-maxage=31536000, immutable` (CDN-Cache-Control for Vercel edge)
- 8-second `AbortSignal.timeout` on upstream fetch

## wow-model-viewer Isolation

The `wow-model-viewer` package is isolated to prevent coupling:

1. **`CharacterViewerClient.tsx`** — the only file containing `dynamic(..., { ssr: false })`. Next.js 15+ forbids `ssr: false` in Server Components; this thin wrapper allows `app/page.tsx` to remain a Server Component.

2. **`CharacterViewer.tsx`** — all viewer lifecycle lives here:
   - Loads jQuery 3.7.1 and `wow.zamimg.com/modelviewer/live/viewer/viewer.min.js` via `<script>` injection before importing the npm package
   - Sets `window.CONTENT_PATH` to the proxy path
   - Dynamic-imports `wow-model-viewer` and stores `generateModels` in a ref
   - Stores the model instance in `modelRef` for subsequent `updateItemViewer` calls
   - Phase state machine: `loading-deps → ready → fetching → rendering → loaded | error`

## Character Data Assembly

`GET /api/character/[realm]/[name]` performs a two-round parallel fetch:

**Round 1:** `GET /profile/wow/character/{realm}/{name}/appearance` (profile namespace)
- Returns transmog-aware item IDs, race/gender, and customizations with `display_order`
- `display_order` maps directly to viewer's 0-based character option index

**Round 2:** For each visible item (filtered by `NOT_DISPLAYED_VIEWER_SLOTS`):
- `GET /data/wow/item/{id}` → `appearances[0].id` (appearance ID)
- `GET /data/wow/item-appearance/{id}` → `item_display_info_id` (display ID for the viewer)

Both round-2 requests run in parallel via `Promise.all`. The result is a `ViewerCharacter` object passed directly to `generateModels`.

**Weapon slot remapping:** Logical slots 16/17 (Blizzard `internal_slot_id+1`) map to render slots 21/22 (WH.Wow.Item constants). `toRenderSlot()` in `lib/slots.ts` applies this at every `updateItemViewer` call and on the initial `items` array.

## Static Data Strategy

**`data/source-index.json`** (4.4 MB, committed):
- Maps `itemId → { sources: [{ instanceId, instanceName, encounterId, encounterName, type }] }`
- Built by `scripts/build-source-index.ts` which crawls: journal-expansion → journal-instance → journal-encounter
- Covers 13 expansions, 232 instances, 1,211 encounters, 17,777 unique items
- Tier tokens from BC resolved via `data/token-appearance-sets.json` join table
- Re-run `npm run build:index` after patches

**`data/token-appearance-sets.json`** (committed):
- Maps BC tier token item IDs → appearance-set IDs for tier-piece resolution
- Used exclusively by `scripts/build-source-index.ts` Phase 5

**Runtime access:** `lib/sourceIndex.ts` reads the file via `fs.readFileSync` with a module-level cache (`_sourceIndex`). The file must be present at runtime — `next.config.ts` forces Vercel output file tracing to include `./data/**/*` for all routes.

## State Management

**No backend persistence in v1.** All state is React local state or `localStorage`.

**Outfit state** in `CharacterViewer.tsx`:
- `outfit: Record<viewerSlot, OutfitEntry>` — discriminated union `{ kind: "item" | "hidden" }`
- Persisted to `localStorage` under key `mogvault-outfit-{realm}/{charName}`
- Loaded on character load; re-applied to the model via `updateItemViewer` on each slot
- `baseItemsRef` (ref, not state) holds the character's original display IDs for slot revert

**Checked items** in `FarmingList.tsx`:
- `checked: Set<itemId>` persisted under `mogvault-checked-{realm}/{charName}`

**Realm list** in `/api/realms`:
- Module-level `_cache` in the route handler holds the 344-realm list for the serverless instance lifetime

**Owned appearance IDs:**
- Fetched non-fatally from `/api/character/{realm}/{name}/collections` after model loads
- Stored in React state as `Set<number>` for "owned" badge display in ItemBrowser

## Key Architectural Constraints

- **BLIZZARD_CLIENT_SECRET must never reach client bundles.** Enforced by `import "server-only"` in `lib/blizzard.ts`. Verify with: `.next/static` chunks must not contain the secret or `oauth.battle.net`.
- **wow-model-viewer requires jQuery 3.x and ZamModelViewer globals** to be present before the npm package is imported. Script load order: jQuery → viewer.min.js → dynamic import.
- **Blizzard rate limits:** 100 req/sec, 36,000 req/hour. The item search route uses `mapConcurrent` with a 12-concurrency limit for icon and appearance ID fetches.
- **No DB, no auth, no Supabase.** Saved outfits are deferred to v2; only `localStorage` is used.
- **Weapon slot 18 (Ranged)** stays as slot 18 in the viewer — only slots 16 and 17 remap to 21/22.

## Error Handling Strategy

Route handlers return typed JSON error responses:
- `404` — character/item not found
- `403` — private character profile
- `502` — upstream Blizzard API failure
- `504` — upstream timeout (modelviewer proxy)
- `400` — invalid input parameters

Client (`CharacterViewer.tsx`) maps HTTP status codes to user-facing messages displayed as an `error` phase overlay. Collections fetch failure is non-fatal (silently degrades to no owned-indicator).

## Data Flow: Full Request Path

**Load character:**
1. User submits realm + name → `CharacterViewer.handleSubmit`
2. `fetch("/api/character/{realm}/{name}")` → Route Handler
3. Handler calls `getGameData("/profile/wow/character/.../appearance", { namespace: "profile" })`
4. Handler makes parallel item + appearance calls via `Promise.all`
5. Returns `CharacterRouteResponse` with `ViewerCharacter` + `meta`
6. Client calls `generateModels(aspect, "#mv-character-container", viewerCharacter)`
7. Saved outfit from `localStorage` is re-applied via `model.updateItemViewer`

**Apply transmog item:**
1. User clicks item card in `ItemBrowser`
2. `fetch("/api/item/{id}/display")` → Route Handler
3. Handler calls `resolveItemAppearance(itemId)` (2-round fetch chain)
4. Returns `ItemDisplayResponse` with `displayId`
5. Client calls `model.updateItemViewer(toRenderSlot(slot), displayId)`
6. `outfit` state updated; persisted to `localStorage`

**Generate farming list:**
1. `FarmingList` component extracts `itemId`s from `outfit` entries with `kind: "item"`
2. `fetch("/api/farming-list?items={ids}")` → Route Handler
3. Handler looks up each ID in `getSourceIndex()` (in-memory cache of `source-index.json`)
4. Returns `FarmingListResponse` grouped by instance, with `otherItemIds` for misses

---

*Architecture analysis: 2026-06-19*
