# CONCERNS
_Last updated: 2026-06-19_
_Focus: concerns_

---

## Technical Debt

**Untyped wow-model-viewer module:**
- Issue: `wow-model-viewer` has no TypeScript types. `generateModels` is accessed via `(mod as any).generateModels` with an `// eslint-disable-next-line @typescript-eslint/no-explicit-any` suppression.
- Files: `components/CharacterViewer.tsx:179-180`
- Impact: Breakage from a package update would be a runtime failure with no compile-time warning. The `ViewerModel` interface (`ViewerModel.updateItemViewer`) is hand-written and could silently diverge.
- Fix approach: Write a local `declare module "wow-model-viewer"` ambient type stub.

**Hiding a slot passes `displayId=0` (workaround, not a proper API):**
- Issue: No `clearSlot` API is exposed by `wow-model-viewer`. Passing `0` triggers an internal path that fails to load item 0, leaving the slot visually empty.
- Files: `components/CharacterViewer.tsx:311`
- Impact: Relies on an undocumented failure mode. A future package version could handle item ID 0 differently (e.g., show a placeholder or throw).
- Fix approach: Monitor for a proper clear API in `wow-model-viewer` releases; swap when available.

**Outfit state keyed by viewer slot, not logical slot:**
- Issue: `CharacterViewer.tsx` `outfit` state is a `Record<number, OutfitEntry>` keyed on the logical viewer slot number. The two slot-numbering systems (logical 16/17 vs render 21/22 for weapons) are managed by `toRenderSlot()` at call sites.
- Files: `components/CharacterViewer.tsx:41`, `lib/slots.ts`
- Impact: Cognitive overhead; callers must remember to call `toRenderSlot()` before passing to `updateItemViewer`. A missed call produces silent visual corruption.

**`customizationResult` extras attached via `as unknown as Record<string, unknown>` cast:**
- Issue: Race-specific customization fields are appended to the character object via a type cast at assembly time.
- Files: `app/api/character/[realm]/[name]/route.ts:231`
- Impact: Type safety gap for the `extras` array — a mistyped key would be silently dropped rather than caught at compile time.

**No localStorage schema versioning:**
- Issue: Outfit and checked-items data are written to `localStorage` with keys `mogvault-outfit-{realm}/{name}` and `mogvault-checked-{realm}/{name}`. If the `OutfitEntry` shape changes (as it did from an earlier schema in this project), stale data is silently parsed as the new type.
- Files: `components/CharacterViewer.tsx:48-55`, `components/FarmingList.tsx:22-27`
- Impact: Corrupted state could produce viewer errors or wrong item names after a deploy that changes the stored shape. Currently no migration or version key.

**`eslint-disable react-hooks/exhaustive-deps` in multiple places:**
- Issue: Dependency arrays are intentionally under-specified in three places.
- Files: `components/RealmCombobox.tsx:35`, `components/ItemBrowser.tsx:166`, `components/FarmingList.tsx:316,333`
- Impact: Risk of stale-closure bugs if the suppressed dependencies change meaning; requires manual audit when refactoring.

**`build:index` is fully manual:**
- Issue: `npm run build:index` must be run manually after WoW patches add new raid/dungeon content. There is no CI hook, no staleness check, and no tooling to detect when the data is out of date.
- Files: `scripts/build-source-index.ts`, `package.json`
- Impact: After a content patch, farming list results silently miss new items until the index is regenerated and committed.

---

## Fragile Dependencies

**`wow-model-viewer` — single-maintainer, Wowhead CDN-coupled:**
- Risk: The package depends on `https://wow.zamimg.com/modelviewer/live/viewer/viewer.min.js` (loaded as a `<script>` tag at runtime) and jQuery 3.x injected into the page. Any of the following breaks the viewer: Wowhead CDN path change, Wowhead WAF rule change, jQuery global conflict, or a `wow-model-viewer` package release that changes the `generateModels` signature.
- Files: `components/CharacterViewer.tsx:14-16`, `components/CharacterViewerClient.tsx`
- Current isolation: All viewer contact is inside `CharacterViewer.tsx`; `CharacterViewerClient.tsx` wraps the dynamic import. Containment is good — a breakage requires only one file to repair.
- No automated breakage detection: the app silently enters the `error` phase with a generic message.

**Wowhead CDN proxy (`/api/modelviewer/[...path]`):**
- Risk: The proxy routes all model asset requests to `https://wow.zamimg.com/modelviewer/...`. Wowhead may change CDN paths between WoW patches (e.g., `live/` → a versioned prefix), which would produce 404s on all model/texture fetches and blank the viewer.
- Files: `app/api/modelviewer/[...path]/route.ts:4`
- Current mitigation: `CONTENT_PATH = "/api/modelviewer/live/"` is defined in one constant. A path change requires updating only that string.
- Additional risk: The proxy uses a hardcoded `User-Agent` string (`Chrome/137`) to avoid WAF bot-detection. This may stop working if Wowhead strengthens its bot detection.
- Files: `app/api/modelviewer/[...path]/route.ts:34-36`

**Blizzard API — shape and loot table changes per patch:**
- Risk: Blizzard API response shapes (field names, nested structures) have changed between expansions. The `CUSTOMIZATION_MAP` in `route.ts` maps Blizzard option name strings (e.g., `"Eyebrows"`, `"Eyebrow"`) to viewer properties — a name change in the API would silently produce a default (0) customization value.
- Files: `app/api/character/[realm]/[name]/route.ts:18-41`
- Loot table risk: `source-index.json` is a static snapshot. When Blizzard moves items between encounters or adds new raid tiers, the index is stale until manually rebuilt.
- No fallback or staleness indicator is shown to the user.

---

## Security & Secret Handling

**Secrets are correctly isolated:**
- `BLIZZARD_CLIENT_SECRET` is read only in `lib/blizzard-core.ts` (no `server-only` guard) and `lib/blizzard.ts` (with `import "server-only"`). Route handlers import `lib/blizzard.ts`. The CLAUDE.md spec confirms the secret is absent from all `.next/static` client chunks.
- The ingestion script (`scripts/build-source-index.ts`) imports `lib/blizzard-core.ts` directly to avoid the `server-only` runtime guard — this is intentional and documented.

**Input validation — adequate but minimal:**
- Character name and realm are `encodeURIComponent`-encoded before being included in Blizzard API URLs (`app/api/character/[realm]/[name]/route.ts:121`). This prevents injection into the URL path.
- Item ID parsed with `parseInt` and validated as a positive integer (`app/api/item/[id]/display/route.ts:21`).
- Search query truncated to 100 chars (`app/api/search/items/route.ts:70`).
- Farming list item count capped at 50 (`app/api/farming-list/route.ts:42`).
- Modelviewer proxy rejects `..` path traversal segments (`app/api/modelviewer/[...path]/route.ts:22-24`).
- Gap: Character name is not validated against WoW naming rules (letters only, 2-12 chars). An attacker can send arbitrarily long realm/name strings; `encodeURIComponent` handles injection but not DoS from long values. Low risk for a non-commercial project.

**No rate limiting on own API routes:**
- Any caller can hit `/api/search/items` or `/api/character/...` in a tight loop, exhausting the Blizzard API rate limit (100 req/sec, 36,000 req/hour) for all users.
- Files: all route handlers in `app/api/`
- Risk: Low for a low-traffic hobby project; would matter if the project grows.

---

## Performance Concerns

**Character load makes ~2× N Blizzard API calls (N = visible item slots):**
- Pattern: Step 4 and 5 of `GET /api/character/[realm]/[name]` fire two `Promise.all` waves, each making one call per visible item (typically 9-15 slots). Total: 1 (appearance) + N (item fetch) + N (appearance fetch) = 1 + 2N calls per character load.
- Files: `app/api/character/[realm]/[name]/route.ts:176-203`
- Impact: ~19-31 Blizzard API calls per character load. Each call has a 10 s timeout. On a cold Vercel instance with no token cache this adds token acquisition as well. Latency is typically acceptable (parallel) but pushes toward the 100 req/sec rate limit under concurrent users.
- No caching: `cache: "no-store"` is set on all Blizzard fetches, meaning every character load re-fetches all item/appearance data.

**Item search makes 24 × 2 parallel Blizzard calls per page:**
- Pattern: `GET /api/search/items` fetches icons and appearance IDs for all 24 results concurrently (12 concurrent each direction).
- Files: `app/api/search/items/route.ts:122-135`
- Impact: 48 Blizzard calls per search page load. High page-flip activity consumes rate limit rapidly.

**`source-index.json` is 4.7 MB loaded on first use:**
- Pattern: `lib/sourceIndex.ts` reads the file synchronously via `readFileSync` and caches it in a module-level variable. On a cold Vercel instance (new container), this is a 4.7 MB synchronous file read on the first request to `/api/search/items` or `/api/farming-list`.
- Files: `lib/sourceIndex.ts:16-21`
- Impact: First-request latency spike of ~50-150 ms for the file parse on cold start. Acceptable, but the 4.7 MB file also increases Vercel cold-start memory pressure.

**Modelviewer proxy is unbounded — all CDN asset types stream through:**
- Pattern: Model assets (`.m2`, `.skin`, `.anim`, WebP textures) are streamed through the Next.js route handler. Large binary assets (high-res textures) go through Vercel's serverless function layer.
- Files: `app/api/modelviewer/[...path]/route.ts`
- Impact: Serverless function invocation cost and egress bandwidth for every model asset. Cache headers are set to 1 year (`immutable`) to mitigate repeat fetches, but first loads for any character model will hit the function repeatedly.

---

## Scope Gaps (v1 Limitations)

**Sources not covered by the journal index:**
- World drops, vendor items, crafted items, quest rewards, PvP vendor items, and reputation items produce no entry in `source-index.json`. They are correctly tagged `Other source` in the farming list, but the tag gives no actionable detail (no vendor name, no crafting profession, no quest name).
- This is a documented v1 limitation (CLAUDE.md constraint 5).

**Cosmetic items (armor subclass 5) excluded from item search:**
- The armor class filter uses a single `item_subclass.id` query that matches the character's armor type. A second call to merge cosmetics (subclass 5) was omitted as too expensive. Cosmetics that bypass class armor restrictions are invisible in search results.
- Files: `app/api/search/items/route.ts:96-103`

**Weapon search is not filtered to class-valid subtypes within a type:**
- `CLASS_WEAPON_SLOT_TYPES` filters weapon *type pills* client-side (e.g., shows only 1H/2H/ranged pills valid for the class), but within a selected type all weapon subclasses appear (e.g., a Mage searching "1H" would see swords, axes, and maces even if the class can only equip daggers and wands).
- Files: `lib/slots.ts`, `components/ItemBrowser.tsx`
- Documented gap in CLAUDE.md Decision Log (Jun 18 2026).

**No character region selection in the UI:**
- `BLIZZARD_REGION` is a single server-side environment variable defaulting to `us`. EU/KR/TW/CN players cannot load their characters. The UI only shows realm and name inputs.
- Files: `components/CharacterViewer.tsx:153`, `lib/blizzard-core.ts:5`

**Tabard slot (19) has no real items in search results:**
- `SLOT_TO_INVENTORY_TYPES[19]` maps to `["TABARD"]`, which is technically correct but tabards are not transmog items — the slot shows items but selecting one has no visual effect on the model viewer.
- Files: `lib/slots.ts`

**No saved outfits, no sharing:**
- Outfit state is `localStorage`-only, tied to one browser. No export, share link, or cross-device persistence. Explicitly deferred to v2 (CLAUDE.md).

---

## Operational Concerns

**No tests of any kind:**
- There are zero test files in the project (`*.test.*` / `*.spec.*` — confirmed by filesystem search). No unit tests, no integration tests, no E2E tests. No test framework configured in `package.json`.
- Impact: Any refactor of `lib/slots.ts`, the display ID chain logic (`lib/resolveDisplayId.ts`), or the farming list grouping logic has no regression safety net.

**No error tracking or monitoring:**
- No Sentry, no Datadog, no structured logging. Errors surface only in Vercel function logs, which require manual inspection.
- Server errors are logged with `console.error` in one place (`app/api/appearance/[id]/route.ts:33`); all other route handlers return HTTP error responses without server-side logging.
- Impact: Silent failures (Blizzard API shape changes, CDN proxy 404s) will not be detected until a user reports them.

**Manual `build:index` required after every WoW content patch:**
- The ingestion script must be run manually, its output committed, and a new deploy triggered. There is no automated schedule, no CI integration, and no staleness indicator in the app.
- Files: `scripts/build-source-index.ts`, `package.json` (`build:index` script)
- Impact: After a raid tier launches, all items from that tier return `Other source` until the maintainer runs the script.

**`token-appearance-sets.json` is manually curated:**
- The tier-token join table (`data/token-appearance-sets.json`) mapping token item IDs to appearance set IDs was built by hand. New BC/classic tier sets added in future patches require manual additions to this file before the Phase 5 enrichment step has any effect.
- Files: `data/token-appearance-sets.json`, `scripts/build-source-index.ts:150-284`

**Blizzard OAuth token is in-process memory only:**
- The token cache (`lib/blizzard-core.ts:19`) is a module-level variable. On Vercel, each serverless function instance has its own cache. High-traffic scenarios with many concurrent instances will each fetch their own token. Blizzard's token endpoint is not rate-limited per se, but this creates unnecessary OAuth traffic and token proliferation.
- Files: `lib/blizzard-core.ts:19-65`

**`data/source-index.json` is committed to git at 4.7 MB:**
- The file is 229,595 lines and grows with each patch rebuild. Git history will accumulate large binary-like diffs over time. No `.gitattributes` treatment for the file.
- Impact: Repository clone size increases with each index rebuild commit; `git diff` on the file is noisy.

---

## Dependencies at Risk

**`wow-model-viewer` (npm `^1.5.3`):**
- This package depends on Wowhead's CDN infrastructure and Blizzard's model format, both of which change with WoW patches. The package has a single maintainer. A game update that changes the `.m2` model format could make the viewer non-functional until the package is updated. No pinned version beyond `^1` semver range.
- Impact: Total viewer outage until upstream fixes and app is redeployed.

**jQuery 3.7.1 (loaded from `code.jquery.com` CDN):**
- jQuery is injected as a `<script>` tag at runtime from `https://code.jquery.com/jquery-3.7.1.min.js`. If this CDN is unavailable or the URL changes, the viewer fails to initialise entirely.
- Files: `components/CharacterViewer.tsx:14`
- Impact: Viewer init fails; user sees "Failed to load script" error.

**`wow.zamimg.com` viewer script (loaded from Wowhead CDN):**
- The ZamModelViewer is loaded from `https://wow.zamimg.com/modelviewer/live/viewer/viewer.min.js` at runtime. This is not versioned or pinned. Wowhead can silently change the script's API surface at any time.
- Files: `components/CharacterViewer.tsx:15`
- Impact: If the script changes and breaks `generateModels`, the viewer silently fails with a generic error.

---

*Concerns audit: 2026-06-19*
