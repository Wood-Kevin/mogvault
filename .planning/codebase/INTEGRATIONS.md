# INTEGRATIONS
_Last updated: 2026-06-19_
_Focus: tech_

## External APIs

### Blizzard Battle.net — OAuth 2.0

- **Flow:** Client Credentials (server-side only)
- **Token endpoint:** `POST https://oauth.battle.net/token`
- **Auth method:** HTTP Basic (`CLIENT_ID:CLIENT_SECRET` base64-encoded)
- **Token lifetime:** 24 hours; cached in module-level `tokenCache` variable in `lib/blizzard-core.ts`
- **Cache strategy:** Refreshes 5 min before expiry; invalidates + retries once on 401
- **Secret guard:** `lib/blizzard.ts` imports `server-only` to cause build failure if accidentally imported in client code
- **Implementation:** `lib/blizzard-core.ts`, `lib/blizzard.ts`

### Blizzard Battle.net — Game Data API

- **Base URL:** `https://{region}.api.blizzard.com` (region from `BLIZZARD_REGION` env var, default `us`)
- **Namespace:** `static-{region}` for item/appearance/journal data
- **Endpoints used:**
  - `GET /data/wow/item/{id}` — item metadata + appearance IDs
  - `GET /data/wow/item-appearance/{id}` — appearance → `item_display_info_id`
  - `GET /data/wow/media/item/{id}` — item icon URL
  - `GET /data/wow/journal-expansion/index` — list of expansions (key `tiers`)
  - `GET /data/wow/journal-instance/{id}` — instance → encounter list
  - `GET /data/wow/journal-encounter/{id}` — encounter loot table
  - `GET /data/wow/search/item` — item search with filters (`item_class.id`, `item_subclass.id`, `inventory_type.type`, etc.)
  - `GET /data/wow/realm/index` — realm list with slugs (namespace: `dynamic-{region}`)
- **Rate limits:** 100 req/sec, 36,000 req/hour
- **Concurrency:** ingestion script uses 10-concurrent semaphore; route handlers use `mapConcurrent` with 12 concurrent
- **All calls proxied** through Next.js Route Handlers — browser never contacts `*.api.blizzard.com` directly

### Blizzard Battle.net — Profile API

- **Namespace:** `profile-{region}`
- **Endpoints used:**
  - `GET /profile/wow/character/{realm}/{name}/appearance` — transmog-aware equipment + race/gender/customizations
  - `GET /profile/wow/character/{realm}/{name}/collections/appearances` — collected appearances
- **Implementation:** `app/api/character/[realm]/[name]/route.ts`, `app/api/character/[realm]/[name]/collections/route.ts`

---

## CDN / Script Dependencies (Runtime)

### jQuery 3.7.1

- **URL:** `https://code.jquery.com/jquery-3.7.1.min.js`
- **Loaded as:** `<script>` tag injected into the DOM by `components/CharacterViewer.tsx`
- **Required by:** `wow-model-viewer` (ZamModelViewer depends on global jQuery)
- **Loading order:** jQuery must be present before `viewer.min.js` is injected

### Wowhead ZamModelViewer

- **URL:** `https://wow.zamimg.com/modelviewer/live/viewer/viewer.min.js`
- **Loaded as:** `<script>` tag injected into the DOM by `components/CharacterViewer.tsx` after jQuery loads
- **Required by:** `wow-model-viewer` npm package
- **CORS issue:** `wow.zamimg.com` returns 403 for cross-origin `fetch()`. All CDN asset fetches are proxied server-to-server through `/api/modelviewer/[...path]`

### wow-model-viewer npm package

- **Package:** `wow-model-viewer: ^1.5.3`
- **Used in:** `components/CharacterViewer.tsx`
- **Loading strategy:** Dynamic import with `ssr: false` (client-only; wrapped in `components/CharacterViewerClient.tsx` to satisfy Next.js 15+ restriction on `ssr: false` in Server Components)
- **Key APIs used:**
  - `generateModels(config)` — renders character model, returns model instance
  - `model.updateItemViewer(slot, displayId)` — swaps individual item slots without full reload
- **Content path:** `CONTENT_PATH = "/api/modelviewer/live/"` — all asset fetches routed through the proxy

---

## Internal API Routes (Server Proxies)

All route handlers live under `app/api/`:

| Route | Purpose |
|---|---|
| `app/api/character/[realm]/[name]/route.ts` | Fetches character appearance + assembles viewer object |
| `app/api/character/[realm]/[name]/collections/route.ts` | Fetches collected appearances |
| `app/api/appearance/[id]/route.ts` | Appearance data proxy |
| `app/api/item/[id]/display/route.ts` | Resolves item → displayId chain |
| `app/api/search/items/route.ts` | Item search with slot/armor class filters |
| `app/api/farming-list/route.ts` | Builds farming list from outfit + source index |
| `app/api/realms/route.ts` | Realm list with module-level cache |
| `app/api/modelviewer/[...path]/route.ts` | CORS proxy for `wow.zamimg.com` CDN assets; sets `Cache-Control: 24h` |

---

## Vercel

- **Hosting:** Vercel Pro
- **Analytics:** `@vercel/analytics: ^2.0.1`; `<Analytics />` component in `app/layout.tsx`
- **Function config:** Default serverless; `outputFileTracingIncludes` in `next.config.ts` ensures `data/source-index.json` is bundled with every route
- **Function timeout:** Vercel Pro provides up to 300s (ample for proxy + model viewer asset fetches)

---

## Static Data Files

| File | Size | Purpose |
|---|---|---|
| `data/source-index.json` | ~4.4 MB | Maps `itemId → { instance, encounter, type }` for farming list. Generated by `scripts/build-source-index.ts`. Committed to repo. |
| `data/token-appearance-sets.json` | — | Maps tier token item IDs → appearance-set IDs for BC tier piece resolution |

---

## Environment Variables

**Required (server-side only):**
- `BLIZZARD_CLIENT_ID` — Battle.net OAuth client ID
- `BLIZZARD_CLIENT_SECRET` — Battle.net OAuth client secret (**never exposed to client**)
- `BLIZZARD_REGION` — API region (default: `us`)

**Configuration:**
- Defined in `.env.local` for local development (not committed)
- `.env.example` documents the required keys without values
- Must be set in Vercel project settings for production deployment
- The `build:index` script loads them via `--env-file=.env.local`

---

## Fonts

- **Geist Sans** — loaded via `next/font/google` in `app/layout.tsx`; self-hosted by Next.js (no external font CDN request at runtime)

---

*Integration audit: 2026-06-19*
