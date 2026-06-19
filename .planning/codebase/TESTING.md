# TESTING
_Last updated: 2026-06-19_
_Focus: quality_

## Summary

**There are no tests in this codebase.** No test files, no test runner, no testing framework, and no coverage configuration exist outside of `node_modules`.

---

## Testing Infrastructure

| Tool | Present |
|------|---------|
| Jest | No |
| Vitest | No |
| Playwright | No |
| Cypress | No |
| Testing Library | No |
| Any test runner | No |

No `jest.config.*`, `vitest.config.*`, or `playwright.config.*` exists in the project root.

No `test`, `test:watch`, or `test:coverage` scripts in `package.json`.

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "build:index": "node --env-file=.env.local --import tsx scripts/build-source-index.ts"
}
```

No `@testing-library/*`, `jest`, `vitest`, `playwright`, or `cypress` in `devDependencies`.

---

## Test Files Found

None. The only `*.test.*` files in the repository are inside `node_modules` (from the `wow-model-viewer` and third-party packages), not project source.

---

## Coverage of Key Functionality

Nothing is covered by automated tests. All verification has been manual (noted throughout `CLAUDE.md`).

---

## What Is Not Tested (Gaps)

Every part of the application is untested. High-priority gaps by risk:

**API Route Handlers (`app/api/`):**
- `app/api/character/[realm]/[name]/route.ts` — Character data assembly, display ID chain, customization mapping. This is the most complex server logic and has several quirky transformations (viewer slot remapping, race-specific extras). Not tested.
- `app/api/search/items/route.ts` — Item search, armor subclass filter, concurrent icon/appearance fetching. Not tested.
- `app/api/farming-list/route.ts` — Source index lookup, instance/encounter grouping, deduplication logic. Not tested.
- `app/api/item/[id]/display/route.ts` — Single-item display ID resolution. Not tested.
- `app/api/character/[realm]/[name]/collections/route.ts` — Owned appearance IDs. Not tested.
- `app/api/realms/route.ts` — Realm list fetch and caching. Not tested.

**Library Modules (`lib/`):**
- `lib/slots.ts` — `toRenderSlot()`, `SLOT_TO_INVENTORY_TYPES`, `INVENTORY_TYPE_TO_VIEWER_SLOT` mappings. These mappings are load-bearing for correct 3D model rendering. Not tested.
- `lib/sourceIndex.ts` — `getSourceIndex()` singleton loader. Not tested.
- `lib/blizzard-core.ts` — Token cache, retry-on-401 logic, request construction. Not tested.
- `lib/resolveDisplayId.ts` — Not tested.

**Scripts (`scripts/`):**
- `scripts/build-source-index.ts` — Journal crawl, tier-token join logic. Verified manually; not covered by automated tests.

**Components (`components/`):**
- All client components are untested: `CharacterViewer.tsx`, `ItemBrowser.tsx`, `FarmingList.tsx`, `RealmCombobox.tsx`.
- localStorage outfit persistence (`loadSavedOutfit`, `persistOutfit`) is untested.
- Phase state machine transitions in `CharacterViewer` are untested.

---

## How to Run Tests

No test command exists. To add tests, a framework must first be installed.

**Recommended starting point for this stack (Next.js 16 / React 19):**

```bash
# Jest + Testing Library (for unit/integration)
npm install --save-dev jest @types/jest jest-environment-jsdom \
  @testing-library/react @testing-library/jest-dom ts-jest

# Or Vitest (lighter, faster, native ESM)
npm install --save-dev vitest @vitejs/plugin-react \
  @testing-library/react @testing-library/jest-dom
```

**Highest-value first targets:**
1. `lib/slots.ts` — pure functions and lookup tables, zero dependencies, easy to unit test.
2. `app/api/farming-list/route.ts` — pure grouping logic, can be tested by mocking `getSourceIndex()`.
3. `app/api/character/[realm]/[name]/route.ts` — complex transformation logic; mock `getGameData` to test the assembly logic in isolation.
