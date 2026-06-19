# STRUCTURE
_Last updated: 2026-06-19_
_Focus: arch_

## Directory Layout

```
mogvault/
├── app/                        # Next.js App Router root
│   ├── api/                    # Route Handlers (server-only, no SSR)
│   │   ├── appearance/
│   │   │   └── [id]/route.ts   # GET /api/appearance/{id} — Blizzard item-appearance passthrough
│   │   ├── character/
│   │   │   └── [realm]/
│   │   │       └── [name]/
│   │   │           ├── route.ts            # GET /api/character/{realm}/{name}
│   │   │           └── collections/
│   │   │               └── route.ts        # GET /api/character/{realm}/{name}/collections
│   │   ├── farming-list/
│   │   │   └── route.ts        # GET /api/farming-list?items={ids}
│   │   ├── item/
│   │   │   └── [id]/
│   │   │       └── display/
│   │   │           └── route.ts  # GET /api/item/{id}/display
│   │   ├── modelviewer/
│   │   │   └── [...path]/
│   │   │       └── route.ts    # GET /api/modelviewer/* — CDN CORS proxy
│   │   ├── realms/
│   │   │   └── route.ts        # GET /api/realms — realm list with module-level cache
│   │   └── search/
│   │       └── items/
│   │           └── route.ts    # GET /api/search/items?slot=&q=&page=&type=&className=
│   ├── favicon.ico
│   ├── globals.css             # Tailwind v4 @theme inline, CSS custom properties (void palette)
│   ├── layout.tsx              # Root layout: Geist font, Vercel Analytics, bg-void body
│   └── page.tsx                # Single page: SiteHeader + CharacterViewerClient + SiteFooter
│
├── components/                 # React components (all "use client" except SiteHeader/SiteFooter)
│   ├── CharacterViewer.tsx     # Main app component: viewer lifecycle, outfit state, slot tabs
│   ├── CharacterViewerClient.tsx # Thin wrapper holding ssr:false dynamic import
│   ├── FarmingList.tsx         # Farming checklist UI, copy-to-clipboard, print output
│   ├── ItemBrowser.tsx         # Slot tabs, item search, item cards, type filter pills
│   ├── RealmCombobox.tsx       # Realm typeahead backed by /api/realms
│   ├── SiteFooter.tsx          # Site footer
│   └── SiteHeader.tsx          # Sticky header with logo glow
│
├── lib/                        # Shared library modules
│   ├── blizzard.ts             # Re-exports blizzard-core + `import "server-only"` guard
│   ├── blizzard-core.ts        # OAuth token cache, getAccessToken(), getGameData()
│   ├── resolveDisplayId.ts     # item ID → { displayId, appearanceId } (2-round fetch chain)
│   ├── slots.ts                # Slot defs, inventory type maps, class weapon types, toRenderSlot()
│   └── sourceIndex.ts          # Lazy-loads data/source-index.json with module-level cache
│
├── data/                       # Static data files (committed, built by scripts)
│   ├── source-index.json       # itemId → [{ instanceId, instanceName, encounterId, ... }]
│   └── token-appearance-sets.json  # BC tier token → appearance-set mapping (ingestion use only)
│
├── scripts/
│   └── build-source-index.ts  # One-off ingestion: crawls Blizzard Journal → emits source-index.json
│
├── docs/
│   └── step-0-findings.md     # Pre-build API research notes
│
├── public/                    # Static assets served by Next.js
│   └── *.svg                  # Default Next.js placeholder SVGs (not used by app)
│
├── .env.example               # Required env var names (no values)
├── .env.local                 # Actual secrets — never committed
├── next.config.ts             # outputFileTracingIncludes: data/**/* (Vercel tracing fix)
├── tsconfig.json              # TypeScript config; path alias `@/*` → `./`
├── eslint.config.mjs          # ESLint flat config
├── postcss.config.mjs         # PostCSS for Tailwind v4
├── package.json               # Dependencies + scripts
└── CLAUDE.md                  # Project spec and Decision Log
```

## Route Handler Inventory

| Route | Method | Purpose | Auth Required |
|-------|--------|---------|---------------|
| `/api/character/[realm]/[name]` | GET | Assembles `ViewerCharacter` from Blizzard profile + appearance chain | Client secret (server-side) |
| `/api/character/[realm]/[name]/collections` | GET | Returns `ownedAppearanceIds[]` from character transmog collection | Client secret |
| `/api/appearance/[id]` | GET | Proxies `GET /data/wow/item-appearance/{id}` from Blizzard | Client secret |
| `/api/item/[id]/display` | GET | Returns `ItemDisplayResponse`: displayId, appearanceId, icon, viewerSlot | Client secret |
| `/api/search/items` | GET | Searches items by slot/query; enriches with icon, appearanceId, source tag | Client secret |
| `/api/farming-list` | GET | Looks up `?items={ids}` in source-index.json; returns grouped instances | None (static data) |
| `/api/realms` | GET | Returns sorted realm list `[{name, slug}]`; module-level cache | Client secret |
| `/api/modelviewer/[...path]` | GET | CORS proxy for `wow.zamimg.com/modelviewer/*` CDN assets | None |

## Component Hierarchy

```
app/layout.tsx              (Server Component — root layout)
└── app/page.tsx            (Server Component)
    ├── SiteHeader.tsx      (Server Component — sticky header, logo)
    ├── CharacterViewerClient.tsx  ("use client" — holds ssr:false dynamic import)
    │   └── CharacterViewer.tsx    ("use client" — dynamically imported, ssr:false)
    │       ├── RealmCombobox.tsx   ("use client" — realm typeahead)
    │       ├── ItemBrowser.tsx     ("use client" — slot tabs, search, item cards)
    │       └── FarmingList.tsx     ("use client" — checklist, print/copy output)
    └── SiteFooter.tsx      (Server Component — footer)
```

## Library Modules

**`lib/blizzard-core.ts`**
- Exports: `getAccessToken()`, `getGameData(path, options)`, `BlizzardNamespace` type
- Module-level `tokenCache` for OAuth token reuse across warm invocations
- Retry logic on 401: invalidates cache, fetches fresh token, retries once
- Region defaults to `us`; configurable via `BLIZZARD_REGION` env var
- All requests include `Battlenet-Namespace: {namespace}-{region}` header
- Import directly from scripts; route handlers should use `lib/blizzard.ts` instead

**`lib/blizzard.ts`**
- One line: `import "server-only"` + `export * from "./blizzard-core"`
- Build-time guard: any accidental client import of this file fails the Next.js build
- Route handlers import from here, not from `blizzard-core.ts`

**`lib/resolveDisplayId.ts`**
- Exports: `resolveItemAppearance(itemId): Promise<ItemAppearance | null>`
- Two-round Blizzard API chain: `GET /data/wow/item/{id}` → `appearances[0].id` → `GET /data/wow/item-appearance/{id}` → `item_display_info_id`
- Returns `null` for non-visual items or API errors
- Used by `/api/item/[id]/display/route.ts`

**`lib/slots.ts`**
- Exports: `SLOT_DEFS`, `VISIBLE_SLOTS`, `HIDEABLE_SLOTS`, `SLOT_TO_INVENTORY_TYPES`, `INVENTORY_TYPE_TO_VIEWER_SLOT`, `INVENTORY_TYPE_LABELS`, `ARMOR_FILTERABLE_SLOTS`, `CLASS_TO_ARMOR_SUBCLASS`, `CLASS_WEAPON_SLOT_TYPES`, `LOGICAL_TO_RENDER_SLOT`, `toRenderSlot()`
- No imports — pure constant maps; safe to import from both client and server
- `toRenderSlot(logicalSlot)` remaps slot 16→21, 17→22 for the wow-model-viewer API

**`lib/sourceIndex.ts`**
- Exports: `getSourceIndex(): SourceIndex`, `SourceEntry`, `SourceIndex` types
- Lazy-loads `data/source-index.json` via `fs.readFileSync` on first call
- Module-level `_sourceIndex` cache — file is only read once per serverless instance
- Has `import "server-only"` guard

## Data Files

**`data/source-index.json`**
- Shape: `{ "itemId": { sources: [{ instanceId, instanceName, encounterId, encounterName, type: "raid"|"dungeon" }] } }`
- 17,777 unique item IDs; 4.4 MB
- Re-generate: `npm run build:index` (runs `scripts/build-source-index.ts`)
- Consumed by: `/api/search/items/route.ts` (source badge), `/api/farming-list/route.ts` (grouped list)

**`data/token-appearance-sets.json`**
- Shape: token item IDs → appearance-set IDs
- Used exclusively during index build to resolve BC tier tokens to their actual set pieces
- Not read at runtime by the app

## Scripts

**`scripts/build-source-index.ts`**
- Authenticates with Blizzard using `lib/blizzard-core.ts` (no `server-only` guard)
- Walks journal: `journal-expansion` index (key: `tiers`) → `journal-instance` → `journal-encounter`
- Semaphore-limited to 10 concurrent requests during crawl
- Phase 5: resolves BC tier tokens via `data/token-appearance-sets.json` join table
- Emits `data/source-index.json`
- Run command: `npm run build:index`

## Configuration Files

**`next.config.ts`**
- `outputFileTracingIncludes: { "/**": ["./data/**/*"] }` — forces Vercel to include `data/` in all route bundles (required because `readFileSync` calls aren't auto-detected by output file tracing)

**`app/globals.css`**
- Tailwind v4 CSS-based config (`@import "tailwindcss"`)
- `:root` CSS custom properties: `--bg`, `--surface`, `--accent`, `--accent-bright`, `--glow`, `--text`, `--text-muted`, `--border`
- `@theme inline` block maps CSS vars to Tailwind utility classes: `bg-void`, `bg-surface`, `text-lavender`, `text-muted`, `border-edge`, `text-accent`, `text-accent-bright`

**`tsconfig.json`**
- Path alias: `@/*` → `./` (project root)
- Target: ES2017+, strict mode

**`.env.local`** (never committed)
- `BLIZZARD_CLIENT_ID` — Battle.net app client ID
- `BLIZZARD_CLIENT_SECRET` — Battle.net app client secret (server-only)
- `BLIZZARD_REGION` — default `us`

## Naming Conventions

**Files:**
- Route handlers: `route.ts` (Next.js convention)
- Components: PascalCase, e.g., `CharacterViewer.tsx`, `ItemBrowser.tsx`
- Library modules: camelCase, e.g., `blizzard-core.ts`, `resolveDisplayId.ts`, `slots.ts`
- Data files: kebab-case, e.g., `source-index.json`, `token-appearance-sets.json`

**Exports:**
- Route handlers export typed response interfaces alongside the route function: e.g., `CharacterRouteResponse`, `SearchResponse`, `FarmingListResponse`
- This pattern lets client components `import type` the response shape directly from the route file

## Where to Add New Code

**New Blizzard API call (server-side):**
- Add to an existing route handler or create a new one under `app/api/`
- Import `getGameData` from `@/lib/blizzard` (not `blizzard-core`)
- Export a typed response interface from the route file for client consumption

**New client component:**
- Add to `components/` with `"use client"` directive
- Import slot/type utilities from `@/lib/slots`
- Import response types with `import type` from the relevant route file

**New slot or inventory type mapping:**
- Add to `lib/slots.ts` — `SLOT_DEFS`, `SLOT_TO_INVENTORY_TYPES`, `INVENTORY_TYPE_TO_VIEWER_SLOT`

**Updating item source data after a patch:**
- Run `npm run build:index` to regenerate `data/source-index.json`
- Commit the updated JSON file

**New page:**
- Create `app/{route}/page.tsx` (Server Component by default)
- Keep viewer-related code in `components/`; use `CharacterViewerClient` pattern if `ssr: false` is needed

---

*Structure analysis: 2026-06-19*
