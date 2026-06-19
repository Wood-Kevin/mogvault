# STACK
_Last updated: 2026-06-19_
_Focus: tech_

## Languages

**Primary:**
- TypeScript 5.x (`typescript: ^5`) — all source files (`.ts`, `.tsx`)
- Target: ES2017 (`tsconfig.json` `compilerOptions.target`)
- Strict mode enabled (`"strict": true`)

**Secondary:**
- CSS — global styles in `app/globals.css`; Tailwind v4 utilities

## Runtime

**Environment:**
- Node.js 24.16.0 (runtime confirmed)

**Package Manager:**
- npm (inferred from `package.json`; no lockfile check performed but `package-lock.json` expected)

## Frameworks

**Core:**
- Next.js 16.2.9 (`"next": "16.2.9"`) — App Router, TypeScript
  - Config: `next.config.ts`
  - `outputFileTracingIncludes` configured to bundle `./data/**/*` for all routes (needed for `data/source-index.json` at runtime)

**React:**
- React 19.2.4 (`"react": "19.2.4"`, `"react-dom": "19.2.4"`)
- JSX transform: `react-jsx` (`tsconfig.json`)

## Styling

**Framework:**
- Tailwind CSS 4.x (`"tailwindcss": "^4"`)
- PostCSS integration via `@tailwindcss/postcss` (`^4`)
- **No `tailwind.config.ts`** — Tailwind v4 uses CSS-based config
- Theme tokens defined as `:root` CSS variables in `app/globals.css`
- Mapped into Tailwind utilities via `@theme inline` directive
- Custom utility names: `bg-void`, `bg-surface`, `text-lavender`, `text-muted`, `border-edge`, `shadow-glow`, `text-accent`, `text-accent-bright`

**Fonts:**
- Geist Sans from `next/font/google` — loaded in `app/layout.tsx` with weights 400/500/600/700

## Module Resolution

- `moduleResolution: "bundler"` (Next.js/Vite-style)
- Path alias `@/*` maps to project root (`./`)
- `resolveJsonModule: true` — used to import `data/source-index.json`

## Key Dependencies

**Production:**
- `next: 16.2.9` — framework
- `react: 19.2.4` — UI runtime
- `react-dom: 19.2.4` — DOM renderer
- `wow-model-viewer: ^1.5.3` — 3D character model viewer (client-only)
- `server-only: ^0.0.1` — build-time guard preventing client imports of `lib/blizzard.ts`
- `@vercel/analytics: ^2.0.1` — Vercel Web Analytics

**Dev / Build:**
- `typescript: ^5` — compiler
- `tailwindcss: ^4` — CSS framework
- `@tailwindcss/postcss: ^4` — PostCSS integration
- `eslint: ^9` — linter
- `eslint-config-next: 16.2.9` — Next.js ESLint rules
- `tsx: ^4.22.4` — TypeScript execution for scripts (used by `build:index` npm script)
- `@types/node: ^20`, `@types/react: ^19`, `@types/react-dom: ^19` — type definitions

## Build Tooling

**App build:**
- `next build` — standard Next.js build (Turbopack/Webpack under the hood)
- `next dev` — development server
- `next start` — production server

**Data ingestion:**
- `npm run build:index` → `node --env-file=.env.local --import tsx scripts/build-source-index.ts`
- Uses Node's native `--env-file` flag + `tsx` for TypeScript execution
- Generates `data/source-index.json` (static asset, committed to repo)

## TypeScript Configuration

- `strict: true`
- `noEmit: true` (type-checking only; Next.js emits)
- `incremental: true`
- `isolatedModules: true`
- Next.js TypeScript plugin enabled

---

*Stack analysis: 2026-06-19*
