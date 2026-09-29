# Progress

_Last updated: Phase 3 complete. Phases 4-12 pending._

Goal from the product owner (chat, after Phase 0): work through **all** phases, deliver a production-ready app,
and only hand it over after review by critics for **frontend, backend, legal and design**, each scoring **>= 4/5**
(see "Critic gate" below). Do not present the app as finished before that gate is passed.

## How to run the checks

- `pnpm lint && pnpm typecheck && pnpm test` – unit tests (shared logic, ui tokens)
- `pnpm test:integration` – Firestore emulator: dedup, ingest, narration pipeline, tours, security rules (needs Java)
- `pnpm build` – bundles functions to `functions/deploy`

## Phase 0 – Foundation & branding: DONE

Monorepo, tooling, CI, Firebase config, tokens, brand assets (auto-traced from provided images, see D4), spinning-mark loader.

## Phase 1 – Areas & POI engine: DONE

- Geohash tiles (own implementation, neighbors, bounds), `ensureArea` with transactional claim (`decideClaim`), 20-parallel-callers test = 1 job per tile, enqueue failure releases the claim.
- Ingest: OSM (Overpass), Wikidata (SPARQL bbox), Wikipedia (local language + DE + EN, generator=geosearch), Commons images (free licenses only, attribution mandatory), merge (id / Wikipedia title / name+distance / stem / co-location), rule classifier + lite-LLM fallback, raw + relative score, `low_content` threshold, places via geocoding provider.
- Fixtures: Berlin (metropolis), Rothenburg (small town), Uckermark village (rural, low_content), Kyoto (non-German). Moderation state (hidden, weight, admin facts, partner link) survives re-ingest.
- Security rules for areas/places/pois/config/users/entitlements/tours with rules-emulator tests.

## Phase 2 – Narration pipeline: DONE

- `getNarration` (cache key = poi+lang+tier+interest+promptVersion), single-flight lock with post-lock re-check, per-user/per-area rate limits, daily + area budgets, kill switch, `usageLogs` + daily aggregates (no user ids).
- Gemini provider (`@google/genai`, JSON schema output, optional Search grounding kept per user, never shared: D16), mock provider (no keys needed), TTS provider (Gemini + mock), pure-JS MP3 encoder, per-paragraph timings.
- Fact checking in three layers (D18); reported narrations are blocked and regenerated; transitions (`getTransition`) cached.
- Model names come from `config/ai` with defaults in `packages/shared` (D16 – **re-verify before launch**).

## Phase 3 – Auto tours & routing: DONE

- `RoutingProvider` (OpenRouteService, mock, Firestore-cached, approx fallback), orienteering heuristic (greedy insertion + 2-opt, deterministic, partner share/detour caps), validation (min stops, max leg, duplicates, accessibility, budget, partner share), templates (highlights 60, grand 120, theme tours), `generateAutoTours` with lock, versions, free tour, texts per language, model order suggestions re-checked.
- Tests: heuristic properties, fixtures produce valid tours, integration tests for generation/locks/edited tours/fallbacks.

## Phase 4 – App core: DONE

- Expo Router app (dev build only): onboarding, home (area exploring with spinning mark, auto tours), tour detail, player with map/sheet/transcript, settings, legal placeholders. Guide runtime executes the pure engine (`packages/shared/src/guide`). Web build is a demo-backend preview.
- Verified by typecheck, lint, unit + simulated-GPS end-to-end tests, Android/web bundle export, Playwright screenshots of the web preview. **Not verified on a real device or simulator.**

## Phases 5-7 – Planned route, pacing, crossroads, roam: DONE

- Plan screen (`planCustomRoute` + server re-check `composePlannedRoute`/`fitToBudget`), pacing (speed/vehicle aware), crossroads (`ForkController`, two teasers per waypoint) and roam (`RoamController`, corridor ahead). Open routes are the default (D20).

## Phase 8 – Offline: DONE

- `DownloadManager` (resumable, storage check), `OfflineLibrary`, offline-first backend wrapper, MapLibre offline packs. Tested with a fully dead network backend.

## Phase 9 – Monetization: DONE (needs store accounts to verify)

- Server: entitlements (`users/{uid}/entitlements`, function-written only), credits (permanent tour or 24 h session), subscription via RevenueCat webhook, invites (max 2 per bought tour, hashed single-use tokens), rewarded-ad SSV with nonce + daily limit. Access is decided server-side before any generation (production wiring covered by emulator tests).
- Client: `access` context on every narration/transition/teaser/download request, `locked` handling, paywall (credit, subscription disclosure, rewarded ad, restore, terms/privacy links), tour and mode gating, share flow, `invite/[token]` deep link, interstitial policy hook (only between stops, consent first, never for subscribers), demo billing/ads for web + tests.
- Web: invite landing page, `apple-app-site-association` and `assetlinks.json` templates (placeholders for team id / signing fingerprint).
- **Not verified:** real RevenueCat purchases, AdMob ads/UMP, SSV callbacks, deep links on devices.

## Phases 10-12: NOT STARTED

Next: Phase 10 (partner portal, offers, QR redemption), Phase 11 (admin), Phase 12 (GDPR, release).
Reminders:

- Render `grounding.searchEntryPointHtml` next to grounded text if grounding is ever enabled (done in the player); AI notice and Commons attribution are shown.
- Firestore rules for partners/offers etc. are added with their phase.

## Critic gate (must pass before handing over)

Four independent reviews (frontend, backend, legal, design), each >= 4/5, findings fixed, re-reviewed until all pass. Status: not started.

## Known issues / notes

- Brand SVGs are auto-traced (D4). No simulator/device run possible in the build sandbox: mobile is verified by typecheck + bundle export only until Phase 4 tests are added.
- External docs (ai.google.dev) were not reachable from the sandbox; model choice rests on search snippets (D16).
