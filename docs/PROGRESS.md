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

## Phases 4-12: NOT STARTED

Next: Phase 4 (Expo app core: navigation, onboarding, map with heart-pin markers, location, audio player, standard tour E2E).
Must-do reminders for later phases:

- Phase 9: wire `authorize` hook in `getNarration` (entitlements: free tour / credits / subscription / invites) — currently every signed-in user may generate/read any narration.
- Phase 4: render `grounding.searchEntryPointHtml` next to grounded text if grounding is ever enabled; show AI-generated notice and Commons attribution.
- Firestore rules for users/sessions/downloads/invites/partners/offers/etc. are added with their phase; `rateLimits`, `narrationLocks`, `usageLogs` etc. are server-only (default deny).

## Critic gate (must pass before handing over)

Four independent reviews (frontend, backend, legal, design), each >= 4/5, findings fixed, re-reviewed until all pass. Status: not started.

## Known issues / notes

- Brand SVGs are auto-traced (D4). No simulator/device run possible in the build sandbox: mobile is verified by typecheck + bundle export only until Phase 4 tests are added.
- External docs (ai.google.dev) were not reachable from the sandbox; model choice rests on search snippets (D16).
