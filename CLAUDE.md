# MogVault — Build Prompt for Claude Code

You are an expert full-stack engineer building **MogVault** from scratch. Work through this spec step by step. After each step, summarize what you built, record any decisions in the Decision Log at the bottom of this file, and pause for review before moving on. Do not skip ahead. Do not re-litigate decisions already marked as decided.

---

## Product in one line

A clean, ad-free WoW transmog outfit builder that loads the user's *actual* character model, lets them build a transmog set, and generates a focused farming checklist showing where each piece drops and how to get it.

**Why it exists:** Wowhead's dressing room is buried under ads and treats the farming list as an afterthought. MogVault makes the farming checklist a first-class feature with a clean void/shadow aesthetic.

**This is a non-commercial hobby project.** No ads, no payments, no monetization.

---

## Hard constraints — read these first, they are load-bearing

1. **Never put the Blizzard OAuth client secret in client-side code.** The Battle.net OAuth client-credentials flow requires a secret that must stay server-side. All Blizzard calls that use the secret go through **Next.js Route Handlers** (server). The browser talks only to your own routes, never to `*.api.blizzard.com` directly (also avoids CORS).

2. **Drop-source data comes from the Blizzard Journal endpoints, not from a generic "where does this drop" call** (no such generic endpoint exists). The journal (in-game Adventure Guide) data gives raid/dungeon boss loot tables. Pre-index this into static JSON at build time. **Do not scrape Wowhead** — it violates their ToS and is fragile.

3. **`wow-model-viewer` is client-only and quirky.** It depends on global jQuery 3.x + Wowhead's `viewer.min.js` (ZamModelViewer) loaded as `<script>` tags, and it manipulates the DOM directly. It cannot be server-rendered. Load it via dynamic import with `ssr: false`, and only after the global scripts are present. Treat it as a fragile, single-maintainer dependency leaning on Wowhead's CDN — isolate it behind one component so it's easy to swap or repair later.

4. **No backend service, no database, no auth in v1** — but "no backend" in the original handoff was imprecise. You *do* use Next.js Route Handlers (serverless functions) as a thin proxy/secret-holder. That's it. No Supabase, no Postgres.

5. **Scope the farming list honestly.** The journal covers raid/dungeon boss drops well. It does *not* cover world drops, vendor, crafted, quest, or PvP-vendor items. For any selected item whose source isn't in the journal index, show an honest `Other source` tag (vendor / world / crafted / quest — best available) rather than inventing a precise drop location.

---

## Tech stack (decided — do not change without flagging)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | TypeScript |
| Styling | Tailwind CSS | Void theme configured in `tailwind.config` |
| 3D viewer | `wow-model-viewer` npm package | Client-only, isolated component (see constraint 3) |
| Item / appearance data | Blizzard Battle.net Game Data API | Via server route handlers |
| Drop-source data | Blizzard **Journal** endpoints | Pre-indexed to static JSON (see Data Architecture) |
| Character data | Blizzard **Profile** API | Appearance + equipment, translated for the viewer |
| Secret handling / CORS | Next.js Route Handlers | OAuth client-credentials flow, secret server-side only |
| State | React local state + `localStorage` | No backend persistence in v1 |
| Auth / DB | None | Saved outfits deferred to v2 |
| Hosting | Vercel **Pro** | 300s function timeout, ample headroom; non-commercial use |

---

## Design system — void / shadow aesthetic

Dark, atmospheric, immersive. The 3D viewer should read like a lit stage against a dark surround.

**Palette (CSS variables):**
- `--bg`: `#0d0010` (deep near-black, purple undertone); alt `#110018`
- `--surface`: `#1a0a2e` cards/panels; alt `#1e0f35`
- `--accent`: `#8b5cf6` void purple; `--accent-bright`: `#a78bfa`
- `--glow`: soft ethereal purple glow on hover/selected
- `--text`: `#e2d9f3` (off-white lavender)
- `--text-muted`: `#9d8caa`
- `--border`: `#2d1f45` (subtle purple-tinted)

**Typography:** Headers bold with slight letter-spacing and presence; body clean and highly legible. Avoid anything that reads as generic dark mode.

**UI feel:** Glow on hover and selected states. Subtle shadow/particle accents where appropriate — restrained, not overdone. Cards have faint purple-tinted borders. Desktop-first.

---

## Data architecture (the part that needs care)

The user selects an **appearance**, but the app needs a **source**. The chain is:

```
appearance (user picks)
   → source item(s)        [Blizzard appearance API: appearance → items that grant it]
   → encounter / instance  [inverted Journal index: item → where it drops]
   → display in farming list (grouped by source)
```

The Journal API is organized `instance → encounter → loot items`. You need the **inverse** (`item → source`). Build it once at build time:

1. Write a one-off ingestion script (`scripts/build-source-index.ts`) that:
   - Authenticates with the Blizzard API (client-credentials, server-side).
   - Walks the journal: `journal-expansion` index → `journal-instance` → `journal-encounter`, collecting each encounter's loot items.
   - Confirm exact endpoint paths, the `static-{region}` namespace, and response shapes against the **live** Battle.net developer portal — do not trust hardcoded assumptions; these change between expansions.
   - Emits `data/source-index.json` mapping `itemId → { instance, encounter, type: "raid" | "dungeon" }`.
2. Ship `source-index.json` as a static asset. The running app reads from it — no live journal calls per outfit.
3. For the farming list, look up each selected item's source in the index. Miss → `Other source` tag.

Keep the ingestion script separate from the app runtime. Re-run it manually when a patch adds content.

---

## Feature scope — v1

**In:**
- Character loader: name + realm input → load that character's model
- 3D viewer with real-time item preview (swap pieces without full reload via `updateItemViewer`)
- Item search/browse by slot (head, shoulders, chest, …)
- Outfit builder: one item per slot
- Farming list generator: each item, its source, grouped by source type
- Clean printable/copyable farming list output

**Out (defer to v2):**
- Saved outfits (needs auth + DB)
- Outfit sharing via URL
- Favorites / wishlist
- Mobile optimization (desktop-first for v1)
- Multiple outfit slots

---

## Build plan

Work one step at a time. Each step lists acceptance criteria — meet them, summarize, log decisions, then pause.

### Step 0 — Verify external realities before coding ✅
See `docs/step-0-findings.md` for full findings.

Key confirmed facts:
- `wow-model-viewer` 1.5.3 (Nov 2025), actively maintained.
- `updateItemViewer` is a **method on the model instance** returned by `generateModels`, not a top-level export.
- Viewer requires jQuery 3.x + `wow.zamimg.com/modelviewer/live/viewer/viewer.min.js` as `<script>` tags.
- CORS on model asset XHR requests is **unverified** — check browser network tab at Step 4.
- Blizzard OAuth: `POST https://oauth.battle.net/token`, token lasts 24h.
- Journal chain confirmed: `journal-expansion/index → journal-instance → journal-encounter` (with loot in encounter response).
- Rate limits: 100 req/sec, 36,000 req/hour.
- Transmog display ID field names in character equipment response need live-API verification at Step 4.

### Step 1 — Project setup ✅
- Initialize Next.js (App Router, TypeScript) + Tailwind.
- Configure the void palette as Tailwind theme tokens / CSS variables.
- Create `.env.local` structure: `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `BLIZZARD_REGION` (default `us`). Document that the secret is server-only and never imported into a client component.
- Add a `.env.example` (no real values).
- **Acceptance:** app builds and runs; void theme tokens applied to a placeholder layout; env structure documented in the README.

### Step 2 — Blizzard auth + data proxy (server-side) ✅
- Route handler that performs the OAuth client-credentials flow and caches the token until expiry (server memory is fine for v1).
- Route handlers proxying: item data, item media/icon, and appearance data.
- Never expose the secret or raw token to the client.
- **Acceptance:** a client component can fetch item + appearance data through your routes; secret never reaches the bundle (verify it's not in client output).

### Step 3 — Source index ingestion ✅
- Implement `scripts/build-source-index.ts` per the Data Architecture section.
- Generate and commit `data/source-index.json`.
- **Acceptance:** index exists, maps a sample of known raid/dungeon items to the correct instance/encounter; non-journal items are simply absent (handled as `Other source` later).

### Step 4a — Character data assembly ✅
`GET /api/character/[realm]/[name]` returns a typed viewer character object.
- Fetches `/profile/wow/character/{realm}/{name}/appearance` (profile ns) — transmog-aware item IDs + race/gender/customizations.
- Display ID chain: `appearance.items[].id` → `/data/wow/item/{id}` → `appearances[0].id` → `/data/wow/item-appearance/{id}` → `item_display_info_id`. Two parallel rounds (item fetch → appearance fetch).
- Customization: `display_order` from each Blizzard choice maps directly to the 0-based index the viewer's `characterPart()` expects. Night Elf DH (Demonkaz/Zul'jin): skin=26 face=5 hairStyle=18 hairColor=11 facialStyle=0 ears=4 horns=6.
- Items: `[[viewerSlot, displayId], ...]` where viewerSlot = `internal_slot_id + 1`; NOT_DISPLAYED slots [2,11,12,13,14] skipped. 9 items assembled for test character.
- Verified: `modified_appearance_id` field in equipment response is NOT the item-appearance endpoint ID — use the item→appearance chain only.
- Error handling: 404 (character/realm not found), 403 (private profile), 502 (upstream failure).

### Step 4b — Character model viewer ✅
- Input: character name + realm (+ region).
- Isolate the viewer in one client-only component: dynamic import `ssr: false`, ensure jQuery + Wowhead `viewer.min.js` are loaded first, render into a container div.
- Pass the character object from `/api/character/[realm]/[name]` directly to `generateModels`.
- Handle loading and error states cleanly: character not found, realm typo, private profile, viewer script failed to load.
- CORS confirmed: `wow.zamimg.com` returns 403 for cross-origin `fetch()` (non-Wowhead origin). Proxy route at `/api/modelviewer/[...path]` handles all CDN asset fetches server-to-server; `CONTENT_PATH = "/api/modelviewer/live/"`.
- Race extras (`horns`, `ears`) on Night Elf DH are correct — Night Elf Female charactercustomization JSON confirms both are valid options (DH class features). No guard needed.
- Model instance stored in `modelRef` and exposed via `onModelReady` prop for Step 5.
- **Acceptance:** demonkaz on zuljin renders as real 3D model with transmog; loading/error states work; model ref held for Step 5.

### Step 5 — Item browser + live preview
- Browse/search items by slot; item card shows name, source tag (from the index), and icon.
- Selecting an item updates the model live via `model.updateItemViewer(slot, displayId)` — no full reload.
- Track the current outfit (one item per slot) in React state; mirror to `localStorage` so a refresh doesn't lose work.
- **Acceptance:** selecting items per slot updates the model in real time and persists across refresh.

### Step 6 — Farming list generator
- From the current outfit, build a list: each item, its source from the index, grouped by source type (raid / dungeon / `Other source`).
- Where helpful, note instance + encounter. For `Other source`, say so honestly.
- Clean printable + copyable output (print stylesheet; copy-to-clipboard).
- **Acceptance:** a built outfit produces a grouped, readable, printable farming list with honest source labeling.

### Step 7 — Polish + deploy
- Void theme fully applied; glow on interactive/selected states; restrained shadow accents.
- All error states on-theme.
- Deploy to Vercel (Pro). Confirm env vars set in Vercel project settings; confirm route handlers run as serverless functions.
- **Acceptance:** deployed URL works end to end; no secret in client bundle; build is clean.

---

## How to work

- **Increment + checkpoint:** one step at a time, summarize, pause. Don't batch the whole build.
- **Verify, don't assume:** API endpoint shapes and the viewer's surface change between WoW patches and package versions. Check live sources at Step 0 and whenever something doesn't match.
- **Secret discipline:** if you ever find yourself importing `BLIZZARD_CLIENT_SECRET` into anything that ships to the browser, stop and route it through a server handler instead.
- **Isolate the fragile dep:** all `wow-model-viewer` contact lives in one component. If it breaks on a future patch, only that file should need touching.
- **Document as you go:** append every non-obvious choice to the Decision Log below.

---

## Decision Log

| Date | Decision | Reasoning |
|---|---|---|
| Jun 17 2026 | Named MogVault | Short, memorable, domain-friendly; "vault" implies collection/storage, fits transmog. |
| Jun 17 2026 | No DB/auth in v1 | Avoids project-limit and build time; saved outfits deferred to v2. |
| Jun 17 2026 | Real character model over generic | Personal, core differentiator, increases engagement. |
| Jun 17 2026 | Void/purple aesthetic | Fits transmog community; differentiates from Wowhead's utilitarian UI. |
| Jun 17 2026 | Hold domain until community validation | Spend after interest is confirmed. |
| Jun 17 2026 | Drop data via Blizzard Journal endpoints, pre-indexed to static JSON | No generic "item source" endpoint exists; journal covers raid/dungeon loot officially and ToS-cleanly. Inverted to item→source at build time. |
| Jun 17 2026 | v1 farming list scoped to journal-covered sources; others tagged "Other source" | Journal omits world/vendor/crafted/quest/PvP; honest labeling beats faked precision and avoids a per-patch data-maintenance treadmill. |
| Jun 17 2026 | Next.js Route Handlers as a thin server proxy (not "no backend") | OAuth client secret must stay server-side; also resolves CORS. Still no DB/auth/Supabase. |
| Jun 17 2026 | Vercel Pro | Non-commercial project (Hobby would also satisfy the non-commercial rule); Pro gives a 300s function timeout and more headroom for the proxy. |
| Jun 17 2026 | `wow-model-viewer` isolated, client-only, treated as fragile | Single-maintainer package depending on Wowhead's CDN + global jQuery/ZamModelViewer; isolate so it's swappable/repairable. |

| Jun 18 2026 | Next.js 16.2.9 + Tailwind v4 | Latest stable scaffolds at Next 16 / Tailwind v4. Tailwind v4 uses CSS-based config (`@theme` in globals.css) — no `tailwind.config.ts`. Tokens defined as `:root` CSS vars and mapped to Tailwind utilities via `@theme inline`. |
| Jun 18 2026 | `@theme inline` for palette mapping | References `:root` CSS vars inline rather than creating new Tailwind-namespaced vars. Keeps `--bg`, `--surface`, etc. as the source of truth while exposing clean Tailwind classes (`bg-void`, `bg-surface`, `text-lavender`, `text-muted`, `border-edge`, `shadow-glow`). |
| Jun 18 2026 | Tailwind utility names for theme tokens | Used semantically distinct names to avoid awkward doubles (`text-text`): `void`/`surface` for backgrounds; `lavender` for primary text; `muted` for secondary text; `edge` for borders; `accent`/`accent-bright` for purple accent. CSS vars retain original names (`--text`, `--border`, etc.). |
| Jun 18 2026 | create-next-app generates CLAUDE.md with `@AGENTS.md` | The scaffold's `--agents-md` default creates a one-liner CLAUDE.md. Restored full project spec. `AGENTS.md` kept alongside for Next.js-specific coding guidance. |
| Jun 18 2026 | `server-only` import at top of lib/blizzard.ts | Build-time guard — any accidental client import of blizzard.ts fails the build. Verified: blizzard.ts, getAccessToken, and oauth.battle.net are absent from all `.next/static` client chunks; present only in `.next/server` chunks. |
| Jun 18 2026 | Module-level token cache in blizzard.ts | Reuses the Blizzard OAuth token across requests within a warm serverless instance. Refreshes 5 min before expiry. On 401, invalidates cache and retries once to handle mid-flight expiry without error propagation. |
| Jun 18 2026 | Extracted lib/blizzard-core.ts (no server-only); lib/blizzard.ts re-exports + guard | `server-only` throws in plain Node.js (no bundler context), so the ingestion script can't import lib/blizzard.ts. Core logic lives in blizzard-core.ts; the server-only guard stays in blizzard.ts for route-handler imports. Route handlers unchanged. |
| Jun 18 2026 | Journal tiers array key confirmed as `tiers` (not `expansions`) | Live API probe showed top-level key is `tiers`, not `expansions` as some docs imply. 13 expansions: MoP through TWW. |
| Jun 18 2026 | Full index: 13 expansions, 232 instances, 1211 encounters, 17,777 unique items | Complete journal crawl with 10-concurrent semaphore, zero errors. File is 4.4 MB. Re-run `npm run build:index` after patches. |

| Jun 18 2026 | Display ID chain: item → appearance → item_display_info_id | `modified_appearance_id` in the equipment endpoint returns 404 from item-appearance. Real chain: `appearance.items[].id` → `/data/wow/item/{id}.appearances[0].id` → `/data/wow/item-appearance/{id}.item_display_info_id`. Two parallel round trips. |
| Jun 18 2026 | Customization uses `display_order` as viewer index | Blizzard returns `customizations[].choice.display_order` (0-based). The wow-model-viewer `getCharacterOptions` uses `part.Choices[character[prop]]` to look up by index — `display_order` is exactly that index. No ZamAPI lookup needed. |
| Jun 18 2026 | "Eyebrows" (plural) → facialStyle; "Eyebrow" (singular) in characterPart() | Blizzard API sends plural; wow-model-viewer source uses singular. Both aliases added to CUSTOMIZATION_MAP. |

| Jun 18 2026 | CORS proxy required for wow.zamimg.com | CDN returns 403 for cross-origin fetch() from non-Wowhead origins but 200 without Origin header. Proxy at `/api/modelviewer/[...path]` makes server-to-server requests; browser sees same-origin. `CONTENT_PATH` points at proxy. Cache-Control set to 24h on proxy responses to avoid re-fetching. |
| Jun 18 2026 | Race extras (horns/ears) on Night Elf DH are correct, no guard needed | Night Elf Female's `charactercustomization/7.json` explicitly includes "Horns" and "Ears" as valid options (DH class features added by Blizzard). Data from Blizzard API is race/class-aware; viewer's `getCharacterOptions` silently skips any option not in the JSON anyway. |
| Jun 18 2026 | `ssr: false` dynamic import lives in CharacterViewerClient.tsx | Next.js 15+ forbids `ssr: false` in Server Components. Thin `CharacterViewerClient.tsx` ("use client") wraps the dynamic import; `page.tsx` remains a Server Component. |

| Jun 18 2026 | Weapon viewer render slots are 21 (main-hand) and 22 (off-hand), not 16/17 | Confirmed from wow-model-viewer/setup.js (WH.Wow.Item.INVENTORY_TYPE_MAIN_HAND=21, OFF_HAND=22) and README examples. Armor slots 1-15, 19 are identity between Blizzard internal_slot_id+1 and viewer. Passing 16/17 caused `meta/armor/16,17/` CDN fetch to 404 → weapon invisible. Fix: `toRenderSlot()` in lib/slots.ts remaps 16→21, 17→22 at the viewer boundary only. Outfit state/UI/localStorage stay on logical slots (16/17/18). |
| Jun 18 2026 | Outfit state keyed by viewer slot, persisted to localStorage as mogvault-outfit-{realm}/{name} | Switching characters shouldn't mix outfits; realm/name key isolates them. Outfit is reapplied via updateItemViewer after model loads. |
| Jun 18 2026 | Blizzard WEAPON type (generic, used on some items) added to slot map → viewer slot 16 | Discovered from Ara-Kara sword item 221150. Standard weapon types (ONE_HAND, TWO_HAND, MAIN_HAND) already covered; WEAPON is a fallback type Blizzard uses for older/special items. |

| Jun 18 2026 | Blizzard inventory_type names for weapons are WEAPON/TWOHWEAPON/WEAPONMAINHAND/WEAPONOFFHAND | ONE_HAND/TWO_HAND/MAIN_HAND/OFF_HAND/BOW/GUN/CROSSBOW/WAND don't exist in the search API. Real types: WEAPON (1H), TWOHWEAPON (2H), WEAPONMAINHAND (main-only), WEAPONOFFHAND (off-only), RANGED (bows/guns/crossbows share one type), RANGEDRIGHT (wands), THROWN. Verified against live search API. Updated INVENTORY_TYPE_TO_VIEWER_SLOT and SLOT_TO_INVENTORY_TYPES to use these. |
| Jun 18 2026 | ItemBrowser fetches displayId on card click, not pre-fetched for all page results | Pre-fetching displayIds for 24 items per page would require 48 extra Blizzard API calls (item→appearance→display chain). Instead, the displayId is resolved lazily when the user actually clicks a card (single call to /api/item/{id}/display). Icon is fetched server-side per page alongside search results via mapConcurrent (12 concurrent). |
| Jun 18 2026 | Item browser "browsed slot" overrides item's viewerSlot from the API | When user browses slot 17 and clicks an item, it goes to slot 17 even if item.viewerSlot says 16. ItemBrowser passes its own selectedSlot to onApply; CharacterViewer uses that for updateItemViewer. Ensures predictable behavior regardless of inventory type mapping edge cases. |

| Jun 18 2026 | Realm typeahead backed by `/api/realms` (dynamic namespace, 344 US realms) | Realm index (`/data/wow/realm/index`, `dynamic-{region}`) returns `{name, slug}` pairs. Module-level cache avoids re-fetching per session. `RealmCombobox` filters client-side by substring on display name; `onMouseDown` prevents blur firing before click; slug passed to character API. |
| Jun 18 2026 | "Other source" completely omitted from item cards (not just de-emphasized) | ~80%+ of search results lack journal data. Showing "Other source" on every card drowned out the useful raid/dungeon badges. Per spec: absence of a badge is self-explanatory. Only raid/dungeon items get the colored instance-name + type line. |

| Jun 18 2026 | OutfitEntry changed to discriminated union {kind:"item"|"hidden"} | Three slot states: "item" (override), "hidden" (bare model), absent (base character). Absent is not stored — only overrides and hidden states persist in localStorage. Old `viewerSlot` field removed from entries (redundant: it's the Record key). |
| Jun 18 2026 | baseItems stored in a ref (not state) | `baseItemsRef.current` maps viewer slot → character's original displayId. Used by `revertSlot`. Ref avoids stale-closure issues in callbacks and doesn't trigger extra renders when character loads. |
| Jun 18 2026 | Hiding passes displayId=0 to updateItemViewer | No dedicated clearSlot API exposed by wow-model-viewer. Passing 0 triggers the internal clearSlots path, then fails to load item 0 (not found), leaving the slot visually empty. Acceptable for v1. |
| Jun 18 2026 | HIDEABLE_SLOTS mirrors WoW transmog rules exactly | Legs (7) and weapon slots (16, 17, 18) cannot be hidden. All other armor slots (1,3,4,5,6,8,9,10,15,19) are hideable. |

| Jun 18 2026 | CLOAK and BODY are the correct inventory type strings for Back and Shirt slots in the search API | `BACK` and `SHIRT` return 0 results in the Blizzard item search API. Live probe confirmed: cloaks have `inventory_type.type=CLOAK` and shirts have `BODY`. Fixed in SLOT_TO_INVENTORY_TYPES; BACK/SHIRT kept as legacy keys in INVENTORY_TYPE_TO_VIEWER_SLOT for character-API compatibility. |
| Jun 18 2026 | Armor class filter uses item_class.id=4 + item_subclass.id for armor slots; cosmetics (subclass 5) are a known gap | Blizzard search API supports `item_class.id` and `item_subclass.id` filters (numeric IDs). Cloth=1, Leather=2, Mail=3, Plate=4. Single API call per search; making a second call to include cosmetics (subclass 5) was deemed too expensive for a minor edge case — cosmetics are a documented gap. Armor filter only applied to ARMOR_FILTERABLE_SLOTS (1,3,5,6,7,8,9,10); Back/Shirt/Tabard unfiltered. |
| Jun 18 2026 | Weapon slot filtering is client-side type-pill filtering via CLASS_WEAPON_SLOT_TYPES, not server-side subclass filtering | Blizzard API cannot OR multiple item_subclass.id values — one call per subclass required. For classes like DH with 4 valid weapon subclasses, 4 separate calls + merge would be needed per page. Instead: CLASS_WEAPON_SLOT_TYPES in lib/slots.ts maps class→slot→valid inventory types; ItemBrowser filters type pills client-side. Within-type subclass filtering (e.g., showing only DH-valid 1H weapons, not all 1H weapons) is a noted follow-up. |

*(Append new entries below as the build proceeds.)*
