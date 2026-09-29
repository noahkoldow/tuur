# Progress

_Last updated: Phase 0 complete._

## Phase 0 – Foundation & branding: DONE

Done:

- Monorepo (pnpm + Turbo), TS strict, ESLint, Prettier, Vitest, CI (`.github/workflows/ci.yml`: format, lint, typecheck, test).
- Firebase structure + emulator config (deny-all rules baseline), `health` callable verified in emulator.
- `packages/ui` tokens (+ WCAG contrast tests, brand mark geometry), `packages/shared` constants + `config/ai` schema/defaults.
- Brand assets generated from provided images (`assets/brand`, `pnpm brand`); icons/splash wired in `apps/mobile/app.config.ts`; web favicons + SVG wordmark.
- **Loader**: `SpinningMark` on mobile (Animated, native driver, reduced-motion aware) and web (CSS) – mark rotates around its own vertical axis.
- Next.js build and Expo Android bundle export verified.

Known issues / TODO:

- Brand SVGs are auto-traced (see D4); swap in original vectors if available.
- `pnpm dev` not run end-to-end in the sandbox (emulators, web build and Expo export verified separately). No Expo dev build/simulator run yet.
- Rules only deny-all; add per-collection rules + rules-emulator tests with each phase (entitlements must stay client-read-only).
- i18n on web not set up yet (Phase 12); mobile has minimal de/en resources.

## Phases 1–12: NOT STARTED

Next: Phase 1 (geohash tiles, `ensureArea` with transactional dedup, ingest OSM/Wikidata/Wikipedia, merge, classification, relative scoring, geocoding, fixtures). See D6 for functions/shared bundling.
