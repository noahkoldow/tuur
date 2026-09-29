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

## D16 – Gemini model choice and grounding terms (verified 2026-09-29)

Primary docs (ai.google.dev) were not reachable from the build sandbox (egress proxy); the choice rests on Google's own search snippets of those pages. Defaults in `packages/shared` (`DEFAULT_AI_CONFIG`, overridable in Firestore `config/ai`): text `gemini-3.8-flash` (released 2026-09-02), lite `gemini-3.5-flash-lite`, TTS `gemini-3.8-flash-lite-tts` (cost-efficient, no shutdown date announced; `gemini-3.8-flash-tts` is the higher-fidelity alternative). Gemini 2.5 models are restricted to existing users since 2026-09-18 and `gemini-3.1-flash-tts-preview` is legacy. **Must be re-verified against the live Models/Deprecations pages before launch** (checklist item in docs/RELEASE.md).
Grounding with Google Search: default off. Per Google's terms as summarized in the docs, grounded output may be shown only to the end user who submitted the prompt, Search Suggestions (`searchEntryPoint`) must be shown with it, and caching/reuse of grounded results is restricted. Decision: grounded narrations are generated and stored per user (`users/{uid}/groundedNarrations`, audio under `narrations-grounded/{uid}/`, 30-day expiry) and never enter the shared cache; the UI must render `grounding.searchEntryPointHtml` beside the text (Phase 4). Legal review must confirm before enabling in production.
Alternative: cache grounded content globally (rejected: conflicts with the terms).

## D17 – Audio format and encoding

Gemini TTS returns 24 kHz 16-bit mono PCM. Each paragraph is synthesized separately (exact per-paragraph timings, clean stops at paragraph boundaries), joined with 450 ms pauses and encoded to MP3 (48 kbps) with the pure-JS `@breezystack/lamejs` (no native ffmpeg dependency in Cloud Functions). A 3-minute narration is ~1 MB. Clients resolve download URLs through the Storage SDK (rules: signed-in read); blocked narrations are deleted from storage.

## D18 – Fact checking

Three layers before anything is stored: (1) prompt rules, (2) deterministic guards (every number of 3+ digits must occur in the sources, no list/markup/parentheses/URLs), (3) lite-model verdict per `keyFact`; missing verdicts count as unsupported. One regeneration attempt with the rejected claims fed back; then the text is discarded. After 3 failures per key in 24 h the key is answered without further model cost. POIs with too little source material get a shorter tier or no narration (`effectiveTier`).

## D19 – Cost protection

Cache hits are always free and unthrottled. Generation is gated by per-user and per-area hourly rate limits, a global and per-area daily budget from `usageDaily`/`usageDailyAreas` aggregates, a kill switch in `config/ai`, and single-flight locks (`narrationLocks`) with a post-lock cache re-check. `usageLogs` contain no user identifiers (privacy).

## D20 – Tours are open paths, not loops

Tour durations count walking plus visit time from the first stop to the last (no forced return). The optimizer still runs on a depot model: the start POI (densest cluster of high scores, never a long-visit museum) is forced as first stop; the end node has zero cost. `roundTrip: true` is supported for loops.

## D21 – Tour paths as encoded polyline

Firestore forbids nested arrays, so `tours.path` is an encoded polyline string (precision 5, <= 400 points). Clients decode with `decodePolyline` from `@tuur/shared`.

## D22 – Tour text and order suggestions

The model receives only names, categories and walking times (spoken names without bracketed disambiguation, sanitized against prompt injection) and is forbidden to add facts; story content comes from fact-checked stop narrations. Invalid or markup-laden output falls back to deterministic fact-free texts. A suggested order is accepted only if it is a permutation, all legs are <= 15 min, total time stays within budget and walking time is <= 115% + 1 min of the optimizer's route.

## D23 – Routing fallback

Routing calls go through a Firestore cache (30 days). If the upstream service fails the tour is planned with offline estimates and flagged `routingSource: approx`; approx tours count as stale and are re-planned on the next request.

## D24 – Offline-first wrapper, downloads use the network backend

Downloaded tours are served from `OfflineLibrary` before the network is touched; the download manager talks to the base backend directly and sends `download: true` plus the access context, so paid tours can only be downloaded after unlocking.

## D25 – Entitlements are server truth

The client never derives access from a purchase result. RevenueCat/AdMob/spend/invite only trigger server writes; the app listens to `users/{uid}/entitlements` and `credits/wallet`. The paywall closes itself when access appears. Reward credits (ads) only unlock standard tours, never 24 h sessions.

## D26 – Dynamic modes are 24 h sessions per place

Planned route, crossroads and roam cost one credit per place for 24 hours (server derives the place from the POI's area, not from client input). Standard tours are permanent per tour. Subscribers get everything without ads.

## D27 – Ads only after consent, only between stops

UMP consent runs before any ad request; interstitials follow the pure `decideInterstitial` policy (between waypoints, nothing playing, foreground, daily and gap caps). Default AdMob IDs are Google's test IDs so dev builds cannot serve real ads.

## D28 – Partner boost is derived state, never trusted input

`partnerId`/`partnerBoost` on a POI are written only by `syncPartnerPoi` and only while the partner is approved with an active, unexpired paid plan. The boost is always clamped to `boostCap` (default 15 points) in `scoreWithPartner`, so admin-configured values cannot exceed it; routing additionally limits partner share and detour per tour. Ingest keeps the boost when a tile is refreshed and never deletes `partner_*` POIs.

## D29 – Partner content is reviewed before it is spoken

Changing name, description, category or POI link of an approved partner sets it back to `pending` (label and boost vanish until re-approval). The narration adds the fixed announcement "Eine Vorstellung unseres Partners." in code, not via the model; partner text is only a labeled source ("business speaking about itself") and narrations of partner POIs carry `sponsored` (UI label "Anzeige · Partner"). The cache key includes the partner content revision.

## D30 – QR redemption is signed, single-use and anonymous

Token = `tuur1.<jti>.<exp>.<HMAC>` (secret in Firebase secrets), bound to partner and offer; single use, ownership and expiry are enforced by the token document in a transaction. The listener's position is used for the proximity check only. The redemption log and statistics contain partner/offer/day but no user id; per-user impression/visit counts are deduplicated through hashed rate-limit keys that expire. Partner callables do not enforce App Check (web has no attestation) and rely on auth (non-anonymous), rate limits and server-side checks instead.

## D31 – Admin: claim-gated callables, direct reads, audit trail

Admin identity is the Firebase custom claim `admin` (set only with `scripts/set-admin.mjs`). The claim is checked in Firestore rules for reads and again inside every callable for writes; each write appends an entry to `adminAudit` (actor, action, target). Config writes are validated (AI config merged and re-parsed, partner boost capped at 30 points, Stripe price ids format-checked) so a typo cannot disable generation or lift the boost cap. Editing POI facts sends the POI's narrations back for regeneration; edited tours are never overwritten by tour regeneration.
