# Decisions

## D1 – Package manager / tooling versions

Context: spec requires pnpm + Turborepo. Decision: pnpm 10, Turbo 2, TypeScript ~5.9 (TS 7 native compiler is too new for typescript-eslint/Expo tooling), Vitest 3, ESLint 9 flat config. Alternatives: TS 7, Jest.

## D2 – Expo SDK 57 with expo-router, dev build only

Context: latest stable SDK at project start. `newArchEnabled` and top-level `splash` no longer exist in the config type; splash is configured through the `expo-splash-screen` plugin (red mark on white).

## D3 – Fonts

Plus Jakarta Sans (bold/extra-bold headings, medium/regular body) via `@expo-google-fonts/plus-jakarta-sans` + `expo-font` on mobile and `next/font/google` on web.

## D4 – Brand assets derived from provided images

Context: `assets/brand` did not exist; only three raster images (mark, wordmark, app tile) were provided. Decision: keep them in `assets/brand/source`, auto-trace with potrace into SVGs and derive all PNGs/favicons via `pnpm brand`. iOS icon is a full-bleed red square (iOS masks corners itself). Alternative: hand-drawn SVG. Replace with designer vectors when available.

## D5 – Loader animation

Request: use the icon as loading logo, rotating around its own axis. Decision: `SpinningMark` (mobile + web) rotates the heart-pin around its vertical Y axis (coin-style, 1.4 s, perspective) instead of a 2D rotation, which would flip the pin upside down. Disabled under reduced-motion settings. Geometry comes from `packages/ui/src/mark.generated.ts` (single source).

## D6 – Functions vs. ESM shared package

`packages/shared` ships TS source (ESM) while functions compile to CommonJS. Not yet an issue (no import in Phase 0). From Phase 1, bundle functions with esbuild (or compile shared to dual output). Revisit then.

## D7 – Default AI model names

`DEFAULT_AI_CONFIG` uses alias placeholders (`gemini-flash-latest`, `gemini-flash-lite-latest`); the TTS default is a placeholder. To be verified against official Gemini docs in Phase 2 and recorded here.

## D8 – Emulator project id

`.firebaserc` default is `tuur-dev`; local emulator runs work with any id (e.g. `demo-tuur`).

## D9 – Timestamps in shared schemas

Shared Zod schemas use epoch milliseconds (numbers), not Firestore Timestamps, so pure logic and clients share types. Adapters convert where needed.

## D10 – Privacy-preserving area API

`ensureArea` accepts only a geohash tile (client computes it); POIs are read client-side by tile query under security rules. The server never receives exact positions (spec 10).

## D11 – Tile precision follows the geohash length

`ingestArea(geohash)` uses `geohash.length` as the tile precision for POI `tile` fields, so precision stays configurable (default 6). Integration tests use precision 3 so each region fixture sits in one tile.

## D12 – Functions bundling

Functions are bundled with esbuild into `functions/deploy` (workspace packages inlined, only real npm deps external); `firebase.json` points its source there. Avoids `workspace:` protocol in Cloud Build.

## D13 – Merge heuristics

Same place = shared Wikidata id, same Wikipedia title, or within 120 m with similar names; additionally cross-source candidates sharing a name stem (>= 6 chars) or co-located within 25 m (non-commercial) are merged because Wikidata labels are often English while OSM names are local.

## D14 – Geocoding

Nominatim public instance is the default live provider (1 request per tile). Its usage policy forbids bulk/heavy use: production must set `NOMINATIM_URL` to a self-hosted or commercial endpoint (tracked in docs/SETUP.md, legal review item).

## D15 – Provider modes

`TUUR_POI_PROVIDER=live|mock` (default mock), `TUUR_GEOCODING_PROVIDER=nominatim|mock`. Mock POI provider generates deterministic synthetic POIs for any coordinate so the emulator works offline.
