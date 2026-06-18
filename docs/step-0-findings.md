# Step 0 Findings — External Dependency Verification

**Date:** 2026-06-18  
**Status:** Complete — see blocker flags at bottom before starting Step 1.

---

## 1. `wow-model-viewer` npm package

### Version & Maintenance
- **Latest version:** 1.5.3 (published November 10, 2025)
- **Maintenance:** Actively maintained. 90 stars, 43 forks, 83 commits.
- **Open issues:** 2 — neither is related to Next.js, SSR, React, or CORS integration.
- **Recent release activity:** Four releases in 2025, all focused on animation fixes and multi-version (Retail/WotLK/Classic) compatibility. No breaking API changes in recent releases.

### Exported Functions (confirmed)

```typescript
// Primary rendering call
generateModels(aspect: string, selector: string, character: Character, version?: string): ModelInstance

// Takes Blizzard character equipment API response, resolves display IDs (transmog-aware)
findItemsInEquipments(equipments: object): [[slot, displayId], ...]

// On the model instance returned by generateModels:
model.updateItemViewer(slot: number, displayId: number, enchant?: number): void
model.setNewAppearance(appearance: Partial<Character>): void
model.getListAnimations(): string[]
model.setAnimation(name: string): void
model.setAnimPaused(paused: boolean): void
model.setDistance(distance: number): void
model.setFullscreen(fullscreen: boolean): void
model.setZenith(radians: number): void
model.setAzimuth(radians: number): void
model.destroy(): void   // call this on unmount to prevent memory leaks
```

### Character Object Shape (confirmed)

```typescript
interface Character {
  race: number;          // 1–45 (playable race IDs)
  gender: number;        // 0 = female, 1 = male
  skin: number;
  face: number;
  hairStyle: number;
  hairColor: number;
  facialStyle: number;
  items: [number, number][];        // [[slot, displayId], ...]
  noCharCustomization?: boolean;    // required for some older/Classic items
  // Vulpera (race 35) only:
  furColor?: number; ears?: number; snout?: number;
  // Dracthyr (race 45) only:
  primaryColor?: number; secondaryColor?: number; secondaryColorStrength?: number;
  bodySize?: number; horns?: number; hornColor?: number;
}
```

### Slot → Body Part Mapping (confirmed rendered slots)

| Slot | Body Part |
|------|-----------|
| 1 | Head |
| 3 | Shoulders |
| 4 | Body (shirt) |
| 5 | Chest |
| 6 | Waist |
| 7 | Legs |
| 8 | Feet |
| 9 | Wrists |
| 10 | Hands |
| 15 | Back (cloak) |
| 16 | Main Hand |
| 17 | Off Hand |
| 18 | Ranged |
| 19 | Tabard |
| 20 | Chest (Robe) |
| 21 | Main Hand (new slot) |
| 22 | Off Hand (new slot) |

### Loading Requirements (confirmed)

The viewer **cannot be server-rendered**. It requires:

1. **jQuery 3.x** loaded as a `<script>` tag before the viewer:
   ```html
   <script src="https://code.jquery.com/jquery-3.5.1.min.js"></script>
   ```

2. **ZamModelViewer (`viewer.min.js`)** from Wowhead's CDN:
   ```html
   <!-- Retail: -->
   <script src="https://wow.zamimg.com/modelviewer/live/viewer/viewer.min.js"></script>
   <!-- Classic: -->
   <script src="https://wow.zamimg.com/modelviewer/classic/viewer/viewer.min.js"></script>
   ```

3. **`window.CONTENT_PATH`** set to the CDN path before the viewer initializes:
   ```javascript
   window.CONTENT_PATH = "https://wow.zamimg.com/modelviewer/live/"
   ```

4. Dynamic import with `ssr: false` in Next.js:
   ```typescript
   const ModelViewer = dynamic(() => import('./ModelViewerInner'), { ssr: false })
   ```

### ⚠️ CORS Flag — Potential Blocker

The README ships a Docker-based CORS bypass proxy for local development and references `localhost:3000/modelviewer/...` throughout examples. This strongly implies the viewer's **model asset fetches** (geometry, textures, BLP files) go out via XHR/fetch to `wow.zamimg.com`, not just via `<script>` tags.

**Script tag loads** (jQuery, viewer.min.js) are not subject to CORS.  
**XHR/fetch requests** from the browser to `wow.zamimg.com` for model data files *are* subject to CORS.

Whether `wow.zamimg.com` sends permissive `Access-Control-Allow-Origin` headers on asset requests is **unconfirmed**. This is the single highest-risk unknown. If they don't, model assets will fail to load in the browser with CORS errors.

**Mitigation paths (in order of preference):**
1. Test at Step 4: load the viewer in a plain HTML page in the browser and check the network tab for CORS errors on asset requests. If `wow.zamimg.com` returns `Access-Control-Allow-Origin: *` on asset requests, no action needed.
2. If CORS blocks: proxy model asset requests through a Next.js route handler (`/api/proxy?url=...`) and point `window.CONTENT_PATH` at it. Adds complexity but keeps it contained.
3. If Wowhead's CDN is unreliable for programmatic use: evaluate self-hosting the `viewer.min.js` (check license) or the Docker bypass approach in a Vercel Edge Function. Not recommended for v1.

### Known Issues to Track

| Issue | Severity | Impact |
|-------|----------|--------|
| **Shield rendering bug (#56):** Off-hand shields render in incorrect position. Root cause is slot mapping `[22, displayId]`. Open since May 2024, no fix. | Low | Visual artifact on shields/off-hand items only — does not crash the viewer. |
| **`getListAnimations()` minified var drift:** Method uses minified variable names that can go stale on library updates. | Low | Only affects animation listing UI, not core item preview. |
| **No explicit SSR/Next.js documentation:** No README guidance for App Router or React 18+ integration. | Medium | Manageable via `dynamic({ ssr: false })` — standard pattern — but requires care with the script loading order. |

---

## 2. Blizzard Battle.net API

### OAuth — Client Credentials Flow (confirmed)

```
POST https://oauth.battle.net/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded
Body: grant_type=client_credentials
```

Response:
```json
{
  "access_token": "...",
  "token_type": "bearer",
  "expires_in": 86400,
  "sub": "..."
}
```

- Token lifetime: **24 hours** (`expires_in: 86400`). Cache server-side until ~5 minutes before expiry.
- The secret never leaves the server. The browser only calls your own Route Handlers, which attach the cached token to outbound Blizzard requests.

### Namespaces

| Type | Format | Use |
|------|--------|-----|
| Game data (static) | `static-{region}` e.g. `static-us` | Items, journal, appearances — versioned per patch |
| Profile | `profile-{region}` e.g. `profile-us` | Character data — requires user OAuth scope for some fields |
| Dynamic | `dynamic-{region}` | Live data (AH, etc.) — not needed for MogVault |

API base: `https://{region}.api.blizzard.com` (e.g. `https://us.api.blizzard.com`)

Pass namespace as a query param: `?namespace=static-us&locale=en_US&access_token=...`  
Or as a header: `Battlenet-Namespace: static-us`

### Journal Endpoints (namespace: `static-{region}`)

Confirmed endpoint chain for the ingestion script:

```
GET /data/wow/journal-expansion/index          → list of all expansions (id, name)
GET /data/wow/journal-expansion/{id}           → expansion details + instances[] with hrefs
GET /data/wow/journal-instance/index           → flat list of all instances
GET /data/wow/journal-instance/{id}            → instance + encounters[] with hrefs + type (raid/dungeon)
GET /data/wow/journal-encounter/{id}           → encounter details + items[] (loot table)
GET /data/wow/journal-encounter/{id}/search    → paginated encounter search (alternative traversal)
```

**The encounter response includes its loot items.** The ingestion script traversal path in the spec is correct:  
`expansion index → instances → encounters → items[]` → invert to `itemId → { instance, encounter, type }`.

**Scale note:** There are hundreds of instances across all expansions. With 36,000 req/hour and 100 req/second limits, a full journal walk is fine — budget ~1,000–3,000 requests for a complete multi-expansion traversal. Add a small delay (`50–100ms`) between calls and handle `429` with exponential backoff.

### Item Appearance Endpoints (namespace: `static-{region}`)

```
GET /data/wow/item-appearance/{appearanceId}         → appearance details + items[] that grant it
GET /data/wow/search/item-appearance                 → search appearances
GET /data/wow/item-appearance/slot/{slotType}        → all appearances for a slot
GET /data/wow/item-appearance/set/{appearanceSetId}  → set details
```

**The appearance → source item chain is confirmed:** `item-appearance/{id}` returns the items that grant that appearance. This is how you go from "user selected appearance X" to "the item(s) they need to farm."

**Known gap — modifier IDs:** The item appearance endpoint does **not** expose `item_appearance_modifier_id`, which is the field that distinguishes normal/heroic/mythic/LFR variants of the same visual. For v1 this is acceptable — the farming list can show "drops from [Boss] in [Instance]" without specifying the exact difficulty tier. The `noCharCustomization` path handles edge cases.

### Profile Endpoints (namespace: `profile-{region}`)

```
GET /profile/wow/character/{realmSlug}/{characterName}/appearance
    → race, gender, and all customization values (skin, face, hairStyle, hairColor, facialStyle)
    → maps directly to the wow-model-viewer character object

GET /profile/wow/character/{realmSlug}/{characterName}/equipment
    → equipped items per slot with item data
    → each slot entry has: item.id, item.name, slot.type, and transmog fields
    → the transmog sub-object (when present) holds the display item used for appearance

GET /profile/wow/character/{realmSlug}/{characterName}/collections/transmogs
    → account-wide collected transmog appearances
    → useful for v2 "show only items you've unlocked" but not needed for v1
```

**⚠️ Transmog display ID gap — needs live verification:** The character equipment endpoint response's transmog sub-object should contain the `display.id` (which is the `displayId` the viewer uses). The `findItemsInEquipments()` function is designed to consume the character equipment response and extract the correct display IDs, including transmog overrides. The **exact field names** (`transmog.item.display.id` vs. `transmog_item.id` vs. something else) need to be confirmed against a live response, because the Blizzard API forum discussions note field naming inconsistencies. **Verify this at Step 4 before writing the translation layer.** Use `findItemsInEquipments()` as the primary translation rather than hand-rolling it, since the library author handles these field-name quirks.

### Rate Limits (confirmed)

| Limit | Value |
|-------|-------|
| Requests per second | 100 |
| Requests per hour | 36,000 |
| Response headers | `x-plan-qps-allotted: 100`, `x-plan-quota-allotted: 36000` |

MogVault's live request volume is minimal (a few requests per character load + item search). The ingestion script is the only high-volume use case, and it runs once manually. Both are well within limits.

---

## Drift from the Spec — Summary

| Item | Spec Said | Reality |
|------|-----------|---------|
| `updateItemViewer` as top-level export | "Call `updateItemViewer(slot, displayId)`" | It's a **method on the model instance** returned by `generateModels`, not a standalone import. Store the model instance in a ref. |
| Character `items` format | `[[slot, displayId], …]` | **Confirmed correct.** |
| Viewer loads from Wowhead CDN | Implied | **Confirmed** — `wow.zamimg.com`. CORS on XHR asset requests is unverified (see flag above). |
| Shield in slot 17 | Implied off-hand = slot 17 | **Bug exists** — shields map to slot 22 in the library's code and render with incorrect positioning. Minor visual artifact only. |
| Journal endpoint loot items | "encounter response includes loot items" | **Confirmed correct.** |
| OAuth token endpoint | "client-credentials flow" | **Confirmed** — `POST https://oauth.battle.net/token`. Token lasts 24h. |
| `findItemsInEquipments` translates transmog | Spec implies this | **Confirmed** — this is exactly what the function does. Use it rather than writing your own translation. Field name quirks in the Blizzard equipment response are handled inside the library. Still needs live-API verification at Step 4. |
| Item appearance modifier IDs | Not mentioned | **Gap** — the appearance API doesn't expose modifier IDs (heroic/mythic variant distinction). Acceptable for v1; note it honestly in the farming list. |

---

## Open Questions (resolve at the named step)

| Step | Question |
|------|----------|
| **Step 4** | Do asset requests from `wow.zamimg.com` include `Access-Control-Allow-Origin: *`? Check browser network tab when first loading a character model. If blocked, set up a `/api/proxy` route handler before proceeding. |
| **Step 4** | What are the exact field names in the character equipment response transmog sub-object? Use a known character (e.g. a test character with active transmog) and log the raw response. Confirm `findItemsInEquipments` handles it before writing the translation layer. |
| **Step 3** | Does the journal-encounter response use a consistent `items` array field name across expansions, or does it differ between raid and dungeon encounter responses? Verify with at least one raid encounter and one dungeon encounter during ingestion. |

---

## Conclusion

**Ready for Step 1** with two tracked risks:

1. **CORS on model asset requests** — no action now, verify at Step 4 before committing to the viewer component approach. If `wow.zamimg.com` sends permissive headers, no proxy needed.
2. **Transmog display ID field names** — use `findItemsInEquipments()` from the library rather than hand-rolling the Blizzard response translation; verify it works with a live response at Step 4.

Neither is a pre-build blocker. Proceed to Step 1 (project setup).
