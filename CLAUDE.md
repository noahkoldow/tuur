# tuur – AI audio city guide

**Read `docs/PRODUCT_SPEC.md` (binding spec) and `docs/PROGRESS.md` (state, TODOs) at the start of every session.** Log design choices in `docs/DECISIONS.md`; manual setup lives in `docs/SETUP.md`.

## Stack

pnpm workspaces + Turborepo. `apps/mobile` (Expo SDK 57, Expo Router, dev build – no Expo Go), `apps/web` (Next.js App Router), `functions` (Firebase Functions 2nd gen), `packages/shared` (Zod schemas, constants, pure logic), `packages/ui` (design tokens + brand mark), `assets/brand`.

## Commands

- `pnpm install` – install (Node >= 22)
- `pnpm dev` – Firebase emulators + web (:3000) + Expo dev server + functions watch (needs Java for Firestore emulator)
- `pnpm emulators` – emulators only; `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm format` – run through Turbo
- `pnpm brand` – regenerate brand assets from `assets/brand/source`
- `pnpm deploy:functions`, `pnpm deploy:rules` – deploy (Blaze plan required, see SETUP)

## Conventions

- TypeScript strict, ESLint + Prettier, Conventional Commits, small logical commits.
- Code/comments in English; UI strings via i18n (de/en).
- Every external service sits behind a provider interface with a mock provider; no secrets in code (`.env.example`, `defineSecret`).
- No hard-coded Gemini model names: read `config/ai` with defaults in `packages/shared`.
- Core logic (routing, pacing, scoring, tours, tokens, entitlements) lives as pure functions in `packages/shared` with unit tests.
- Design: white surfaces, sparing `brand.red`; use tokens from `@tuur/ui`. Loader = `SpinningMark` (mark rotating around its vertical axis).
- Phases must satisfy typecheck + lint + tests before the next starts.
