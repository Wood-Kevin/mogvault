# CONVENTIONS
_Last updated: 2026-06-19_
_Focus: quality_

## TypeScript Usage

**Strict mode:** `"strict": true` in `tsconfig.json`. `noEmit: true`, `isolatedModules: true`, `moduleResolution: "bundler"`.

**Type exports:** Response types are exported directly from route handler files so client components can import them without duplication.

```ts
// app/api/character/[realm]/[name]/route.ts
export interface ViewerCharacter { ... }
export interface CharacterRouteResponse { ... }

// app/api/search/items/route.ts
export interface SearchResultItem { ... }
export interface SearchResponse { ... }
```

**Discriminated unions:** Used for state machines and outfit entries.

```ts
// components/CharacterViewer.tsx
type Phase =
  | "loading-deps"
  | "ready"
  | "fetching"
  | "rendering"
  | "loaded"
  | "error";

export type OutfitEntry =
  | { kind: "item"; itemId: number; displayId: number; appearanceId: number | null; name: string; icon: string | null }
  | { kind: "hidden" };
```

**`as` casting:** Used conservatively when asserting fetched JSON shapes. Pattern: cast to an inline interface defined nearby.

```ts
const data = (await res.json()) as AppearanceResponse;
```

**`// eslint-disable-next-line @typescript-eslint/no-explicit-any`**: Used sparingly (once in `CharacterViewer.tsx`) to access the untyped `generateModels` export from `wow-model-viewer`.

**`satisfies` operator:** Used on `NextResponse.json()` calls in route handlers to verify the response matches the exported type.

```ts
return NextResponse.json({ instances, otherItemIds } satisfies FarmingListResponse);
```

**`server-only` guard:** `lib/blizzard.ts` and sensitive route files import `"server-only"` as a build-time guard. `lib/blizzard-core.ts` deliberately omits it so the ingestion script can import it in a plain Node context.

---

## Naming Conventions

**Files:**
- Route handlers: `route.ts` inside `app/api/[resource]/[...segments]/`
- React components: PascalCase `.tsx` files in `components/` (e.g., `CharacterViewer.tsx`, `ItemBrowser.tsx`)
- Lib modules: camelCase `.ts` files in `lib/` (e.g., `blizzard-core.ts`, `sourceIndex.ts`, `slots.ts`)
- Scripts: camelCase in `scripts/` (e.g., `build-source-index.ts`)

**Components:** PascalCase matching the file name exactly (`CharacterViewer`, `ItemBrowser`, `FarmingList`, `RealmCombobox`, `SiteHeader`, `SiteFooter`).

**Sub-components:** Defined as local functions within the same file, PascalCase. Not exported. Examples: `Overlay`, `LoadingRing`, `FeatureCard`, `SourceBadge`, `ItemCard` all live inside their parent component file.

**Inline SVG icons:** Named `XxxIcon`, defined as arrow function components in the file where they're used.

**Functions:** camelCase verbs (`getAccessToken`, `getGameData`, `toRenderSlot`, `loadSavedOutfit`, `persistOutfit`, `loadScript`).

**Constants (module-level):** SCREAMING_SNAKE_CASE for lookup tables and sets (`SLOT_DEFS`, `HIDEABLE_SLOTS`, `INVENTORY_TYPE_TO_VIEWER_SLOT`, `QUALITY_COLORS`, `CUSTOMIZATION_MAP`).

**Types / Interfaces:** PascalCase, prefixed where needed for clarity (`BlizzardNamespace`, `ViewerCharacter`, `CharacterRouteResponse`, `SlotDef`, `SourceEntry`, `SourceIndex`).

**Event handlers:** Named `handleXxx` (e.g., `handleSubmit`) for top-level event functions; inline arrows for simple prop callbacks.

**State setters:** Matched pairs — `const [phase, setPhase] = useState<Phase>(...)`.

---

## Component Patterns

**`"use client"` placement:** Only components that use hooks, browser APIs, or event handlers carry `"use client"`. Server components (`app/page.tsx`, `app/layout.tsx`) have no directive. The pattern for SSR-unsafe code:

1. `app/page.tsx` — Server Component, no directive.
2. `components/CharacterViewerClient.tsx` — thin `"use client"` wrapper holding the `dynamic()` call.
3. `components/CharacterViewer.tsx` — `"use client"`, contains all the actual hook logic.

**Dynamic import with `ssr: false`:** Lives exclusively in `CharacterViewerClient.tsx`. Next.js 15+ forbids `ssr: false` in Server Components, so it must be inside a `"use client"` file.

```ts
// components/CharacterViewerClient.tsx
"use client";
const CharacterViewer = dynamic(
  () => import("@/components/CharacterViewer"),
  { ssr: false, loading: () => <ViewerSkeleton /> }
);
```

**Props interfaces:** Defined at the top of each component file, named `XxxProps`.

```ts
export interface ItemBrowserProps {
  onApply:  (slot: number, data: ItemDisplayResponse) => void;
  onHide:   (slot: number) => void;
  onRevert: (slot: number) => void;
  outfit:   Record<number, OutfitEntry>;
  className?: string;
  ownedAppearanceIds?: Set<number> | null;
}
```

**Refs vs state:** `useRef` for values that must not trigger re-renders but need to survive across renders (`modelRef`, `baseItemsRef`, `generateModelsRef`, `stageRef`). `useState` for all values that affect render output.

**`useCallback` with explicit deps:** All non-trivial event handlers memoized with `useCallback` and fully-typed dep arrays.

**Async effects:** `useEffect` spawns a local async function (e.g., `bootstrap()`, `fetchItems()`) rather than marking the effect callback itself async.

```ts
useEffect(() => {
  let cancelled = false;
  async function bootstrap() { ... }
  bootstrap();
  return () => { cancelled = true; };
}, []);
```

**Cancellation pattern:** `let cancelled = false` in effects, checked before any `setState` call inside the async function.

---

## API Route Handler Patterns

**Error response shape:** All errors return `{ error: string, message?: string }` with an appropriate HTTP status. Error codes use snake_case string identifiers (`"not_found"`, `"private"`, `"upstream_error"`).

```ts
return NextResponse.json(
  { error: "not_found", message: `Character "${name}" not found on realm "${realm}"` },
  { status: 404 }
);
```

**HTTP status mapping:**
- 404 → character/resource not found
- 403 → private profile or unauthorized
- 400 → bad client input (missing/invalid params)
- 502 → upstream Blizzard API failure

**Input validation at the top:** `searchParams` parsed and validated before any async work. Invalid input returns 400 immediately.

**Typed response interfaces exported:** Every route exports its response type interface so client components import it directly (no type duplication).

**`satisfies` on final response:** `NextResponse.json(payload satisfies ResponseType)` used to catch shape mismatches at build time.

**Parallel fetches:** `Promise.all` for independent fetches. `mapConcurrent` helper (defined in `app/api/search/items/route.ts`) for bounded-concurrency fan-out.

**`server-only` import:** Routes handling secrets or reading `data/` files have `import "server-only"` as the first line.

**Blizzard API calls flow:** All Blizzard API calls go through `getGameData()` in `lib/blizzard.ts` (or `lib/blizzard-core.ts` for scripts). Never call `*.api.blizzard.com` from client-side code.

---

## Tailwind / CSS Patterns

**Tailwind version:** v4. No `tailwind.config.ts`. Configuration is CSS-only via `@theme inline` in `app/globals.css`.

**Theme token architecture:**
- `:root` CSS vars are the source of truth: `--bg`, `--surface`, `--accent`, `--accent-bright`, `--text`, `--text-muted`, `--border`.
- `@theme inline` maps them to Tailwind color utilities with semantic names: `bg-void`, `bg-surface`, `text-lavender`, `text-muted`, `border-edge`, `text-accent`, `text-accent-bright`.
- `--shadow-glow` is defined in `@theme inline` and used as `shadow-glow`.

**Use Tailwind utility names, not CSS var names directly in JSX:**
- Correct: `className="bg-void text-lavender border-edge"`
- Avoid: `style={{ background: "var(--bg)" }}` (used only for complex gradients that Tailwind can't express)

**Glow/hover pattern:**
```tsx
className="... hover:shadow-glow transition-all duration-300"
```

**Selected/active state:** Uses `ring-1 ring-accent` for keyboard-accessible focus rings and active state indicators.

**Disabled state:** `disabled:opacity-40 disabled:cursor-not-allowed`

**Responsive:** Desktop-first. No mobile breakpoints in the current codebase — v1 is explicitly desktop-first.

**Print styles:** `print:hidden` on interactive UI sections (viewer, item browser, outfit chips). `print:border-0 print:bg-transparent print:p-0` on the farming list container to clean it up for printing.

**Inline `style` prop:** Used only for values that cannot be expressed as Tailwind utilities — complex multi-stop `radial-gradient` backgrounds and dynamic `opacity` transitions.

**Geist Sans** is loaded via `next/font/google` in `app/layout.tsx` and mapped to `--font-sans` / `--font-geist-sans`.

---

## Import Organization

**Path alias:** `@/*` maps to the project root (defined in `tsconfig.json`). All cross-directory imports use `@/`.

**Order (observed pattern):**
1. `"server-only"` (if present) — always first
2. Framework imports: `next/server`, `react`
3. Internal lib imports: `@/lib/...`
4. Internal component imports: `@/components/...`
5. Type imports (`import type`) interleaved with their source group

**Named vs default exports:**
- Route handlers: named export `GET` (required by Next.js), plus named type exports.
- Components: `export default function ComponentName` for the primary export; named exports for types/props interfaces.
- Lib modules: named exports only (no default exports).

---

## ESLint Configuration

File: `eslint.config.mjs`

Uses `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`. ESLint v9 flat config format. Default Next.js ignores applied (`.next/`, `out/`, `build/`). No custom rules beyond the next config defaults.

**Known suppressions in source:**
- `// eslint-disable-next-line @typescript-eslint/no-explicit-any` — one occurrence in `CharacterViewer.tsx` for the untyped `wow-model-viewer` export.
- `// eslint-disable-next-line @next/next/no-img-element` — one occurrence in `CharacterViewer.tsx` for item icon `<img>` tags (CDN images, not local).

---

## Code Style Observations

**Section comments:** Files use `// ── Section Name ──────...` banner comments to divide logical sections within a file (types, constants, helpers, route handler). This makes long files scannable.

**Comment density:** High on non-obvious decisions. Most constants and type definitions have inline comments explaining why a particular value or mapping exists (especially in `lib/slots.ts`).

**Error handling in async:** `try/catch` with specific error returns in route handlers. Client-side async operations (fetches, model generation) set an `errorMsg` state and transition to `"error"` phase rather than throwing.

**Silence non-fatal errors:** `catch(() => { /* non-fatal */ })` used deliberately for fire-and-forget operations (e.g., collections fetch after character load).

**`??` over `||`:** Nullish coalescing used throughout for defaults.

**Template literals:** Preferred over string concatenation. URL construction uses `URL` + `searchParams.set()` rather than manual string building.

**`AbortSignal.timeout(10_000)`:** Applied to all Blizzard fetch calls as a 10-second timeout.

**No Prettier config detected.** No `.prettierrc`, `prettier.config.*`, or Prettier dep in `package.json`. Formatting appears manually consistent with 2-space indentation and aligned object/record literals.
