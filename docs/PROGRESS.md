# Progress

## Preview deployment and readiness audit (2026-10-03)

- Expo Go follow-up: no development server was running, so the old project entry was unreachable. Replaced the Windows-incompatible `go` shell command with `scripts/start-expo-go.mjs`; it starts the existing demo mode with a tunnel by default and supports `--lan`. Tunnel attempts failed (`remote gone away`, then timeout); a local-network preview was started successfully and its iOS manifest verified (SDK 57, account `noehxpo`). Restart instructions and iPhone account requirements are in [TESTING_IOS.md](TESTING_IOS.md#expo-go-vorschau-starten-aktualisiert-2026-10-03). A local development preview requires this computer to remain running.
- Published the current mobile web UI to [EAS Hosting preview](https://tuur--preview.expo.app), immutable deployment [otibffikg5](https://tuur--otibffikg5.expo.app), in the existing `@noehxpo/tuur` project. This is a demo preview with unlocked UI flows, schematic maps and browser speech; no native OTA update or store submission was made.
- Remote EAS state supersedes the older signing blocker below: iOS production builds 6 and 7 finished on 2026-09-30. Latest build 7: `a6a3d65c-292b-47f3-8c21-f7a24e84a502`. TestFlight submission and device acceptance remain unverified. OTA is not configured in the current app or listed builds.
- Remote preview/production EAS environments list only the iOS Firebase secret file. Firebase Cloud Functions and Secret Manager APIs return disabled-API errors in `tuur-prod`; backend release prerequisites remain incomplete.
- All workspace lints and 264 unit tests across mobile/shared/UI/Functions pass; mobile/Functions/shared/UI typechecks, the Functions bundle and Expo web export pass. The separate Next.js portal build/typecheck remains unverified because local dependencies are incomplete. Java is unavailable for local integration tests; no native device run was performed.
- **Production is blocked.** The source audit found offline tour-start, existing social-account sign-in, consumable refund, web App Check, mock-provider defaults, concurrent AI budget, ad-consent refresh and group data-deletion issues. Priorities, source references, verification limits and the preview redeploy command are in [RELEASE.md](RELEASE.md#readiness-audit--2026-10-03). Earlier phase-completion and review-score statements below describe historical work and are not current release approval.

## Release execution (2026-09-30)

- Created Firebase project `tuur-prod` in the authenticated Google account and registered iOS (`com.tuurapp`), Android (`app.tuur.guide`) and web clients; `.firebaserc` and `.env.example` now target it.
- Blaze is active. Firestore and the Storage bucket are provisioned in `europe-west1`; Firestore rules/indexes and Storage rules are deployed. Firebase Auth has Anonymous and Email/Password enabled.
- Still pending in Firebase: Google/Apple sign-in configuration, Android/web App Check registration, Cloud Functions deployment, and provider secrets/parameters. iOS App Attest registration is complete; Firestore/Storage App Check enforcement remains off pending verification. Cloud Functions enforce App Check in production once deployed.
- Local Android `apps/mobile/google-services.json` and iOS `apps/mobile/GoogleService-Info.plist` match their registered clients and are ignored by Git. The iOS plist is configured in EAS as a secret file variable for development, preview, and production.
- Owner wants real POIs and spoken AI audio, with a requested total live-service ceiling of EUR 3/day. The shared AI config now defaults to and rejects budgets above USD 3/day; this cap covers AI generation only, not Firebase, maps, routing, or other provider charges. Gemini access exists in another Firebase project but is not provisioned in `tuur-prod`; no routing, map-tile or production-safe Overpass/Nominatim services are available yet.
- Apple identifiers received: Team ID `4GXK973R2W`, App Store Connect Apple ID `6817677603`, SKU `42ac54`, bundle ID `com.tuurapp`. EAS submit config and AASA now use these identifiers. Firebase iOS client `1:261809139951:ios:c9df9603f42afbb74d2b1a` and local plist target this bundle; Firebase Android remains `app.tuur.guide`. The earlier `app.tuur.guide` Firebase iOS registration is unused and has been left intact.
- Owner does not want a product website. No product site will be created; Apple release metadata may still require a public privacy URL, which can be a legal-only page. TestFlight is not upload-ready yet: provider credentials, operator data, Apple signing credentials, Play Integrity registration, and device verification remain. See `docs/TESTING_IOS.md` and `docs/RELEASE.md`.
- EAS project `@noehxpo/tuur` (`2d786517-671d-464c-aafe-8893f358531e`) is linked in `app.config.ts`; `eas project:info` confirms it.
- Mobile startup initializes App Check: App Attest on supported iOS, Play Integrity on Android, debug provider in development. App Attest is registered for iOS `com.tuurapp`. Android Play Integrity awaits the signing SHA-256 fingerprint and the owner's agreement to Google Play Integrity terms.
- Standard focused installs completed. Mobile and Functions typechecks pass; shared tests pass (168 tests). EAS project info confirms the linked project. The iOS EAS production build reached signing preflight, then stopped because no validated Apple distribution certificate/provisioning profile is configured. Owner must run `cd apps/mobile; eas build --platform ios --profile production` interactively and complete Apple authentication/2FA in their terminal; never send credentials in chat.

- UI iteration (2026-09-30, owner feedback): Expo Go preview mode (`pnpm --filter @tuur/mobile go`, tunnel, demo backend, paywall off, react-native-maps map, D41); home redesigned around the swipeable individual modes, auto tours removed from home (D40); settings as grouped lists (privacy, account, legal, sources & licences, version); onboarding shows terms/privacy links and fixed icons; smaller map pins; demo `claimTourStart` honours `enforceAccess`.
- Iteration 2 (2026-09-30, owner feedback): navigation leg + locate button, category pins, stop cards, travel-mode chip, word-highlighted transcript (setting), no system spinners (SpinningMark only), roam-first start with "just go" (D42); explore map of anonymous explorer counts with hot spots (`recordVisit`, `poiStats`, rules + TTL, D44); profile with local tour history and 128 city badges (subagent-generated data, review before release); business onboarding + pay-per-traction pricing (`submitPartnerApplication`, `docs/PARTNER_PRICING.md`, D43); privacy text updated (LEGAL_VERSION 2026-09-30). New integration tests `functions/test/stats.itest.ts`, `application.itest.ts` are written but not run here (no Java for the emulator).
- Voices (2026-09-30, D45): multi-provider TTS (OpenAI `gpt-4o-mini-tts` marin/cedar + Gemini fallback), guide personas Mara/Jonas/Lina selectable in settings, per-voice audio variants without re-generating text, provider-aware cost logging, `pnpm voices:samples` casting script (needs keys; none available in this environment, so no samples were rendered). New secret `OPENAI_API_KEY` (or `unused`) must exist before deploying functions.
- Mascot Tuu (2026-09-30, D46): owner-supplied guide character in 10 poses (`pnpm mascot` builds 512 px app copies, ~485 KB total), `Mascot`/`MascotTip` components (pop-in, gentle bob, reduce-motion aware, decorative for screen readers), placed in onboarding, home greeting, roam/plan/fork, player paused/finished, profile, business, downloads and the error boundary; loaders stay the SpinningMark. Also fixed an endless re-render on the downloads screen (`OfflineLibrary.list()` now returns a stable snapshot).
- 2026-10-01: finance analysis `docs/UNIT_ECONOMICS.md` (subagent; Gemini prices in `DEFAULT_AI_CONFIG.pricing` corrected), UX audit implemented in part (D49), live group tours (D47, integration tests written, not run: no Java here), tour end + summary + share card (D48). Found: root `.gitignore` entry `lib` had excluded `apps/web/src/lib`, whose modules (firebase, i18n, copy, invite, operator, auth, adminData, partnerData, nearby ...) are missing from the repo and the disk; the web app cannot build until they are rewritten. The ignore rule is narrowed to `functions/lib/`.
- 2026-10-01 Apple HIG redesign (D50): semantic light/dark palette + text styles in `@tuur/ui` (contrast tested), `sys` theme with `DynamicColorIOS`, `Icon` (SF Symbols), `Glass`, new Button/List/Sheet/Screen kit, native tabs (Entdecken, Offline, Profil) with per-tab stacks and large titles, all screens migrated (home, roam, plan, fork, player, tour, summary, paywall, redeem, business, legal, onboarding, profile, settings, downloads), dark map style. New dependencies `expo-symbols`, `expo-glass-effect` need a new dev build. Verified: typecheck, lint, 28 mobile + 20 ui tests, iOS and web bundle export. **Not verified on a device**: tab bar and glass rendering, dark mode, Dynamic Type at the largest sizes, VoiceOver.
- Known issue (resolved by the free-grant fix, test passes again): `apps/mobile/src/billing/billing.test.ts` ("serves the free tour…") fails against the uncommitted free-tour grant rule in `packages/shared/src/billing/entitlements.ts` (free tours now require a `source: 'free'` grant); the demo backend/test need to grant it.

_Last updated: 2026-09-30; implementation Phases 0-12 are recorded complete, external release verification remains pending._

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

## Phase 10 – B2B partner program: DONE (needs Stripe/real accounts to verify)

- Shared: partner/offer schemas, pure rules (`partnerBoostPoints` capped, `decideCreateToken` with proximity/limits, `decideRedeemToken`), Stripe subscription mapping and per-country currency pricing.
- Functions: profile + POI link/proposal (admin approval; content changes send the profile back to review), capped boost + `Partner` label applied to the POI only while the plan is live (daily sweep retires lapsed plans), offers, HMAC-signed single-use QR tokens (10 min, proximity check, position never stored), `redeemToken`, anonymized redemption log and aggregated statistics, Stripe checkout/portal/webhook (idempotent, mock provider), partner narrations announced as "Partnervorstellung" and flagged `sponsored`.
- Web: `/partner` portal (login, dashboard, profile with address search + nearby POI link, offers, plan/billing, statistics, PWA scanner with BarcodeDetector/jsQR + manual entry), de/en.
- App: partner label on cards/player, offers on partner stops, QR screen in tuur design with countdown and confirmation.
- Tests: 20 partner integration tests (lifecycle, cap, lapse, review reset, terms, tokens: expiry/single use/limits/proximity/forgery, stats anonymity, sponsored narration) + rules tests + shared unit tests.
- **Not verified:** real Stripe checkout/webhooks, camera scanning on a phone, QR readability on real devices.

## Phase 11 – Admin: DONE

- Web `/admin` (custom claim `admin`, re-checked in every callable; bootstrap with `node scripts/set-admin.mjs <email>`): dashboard (cost today/7 days by kind, budget, kill switch, area status counts, open reports, pending partners, audit log), world map of tiles by status with cost, retry ingest, lock/unlock; tours (lock, pin, edit texts -> `edited`), POIs by tile (hide, weight, extra facts -> narrations regenerate), narration list + regenerate, feedback queue, partner approval/suspension with boost/price configuration (hard cap 30), AI config (models, prompt version, grounding, kill switch, budgets, rate limits, prices).
- Reads are direct Firestore queries under admin-only rules; writes are audited callables (`adminAudit`).
- `/map-style.json` serves the tuur map style for offline packs and the admin map.
- Verified end to end on the Firebase emulators (Auth + Firestore + Functions) with Playwright: admin login and all pages, partner approval, Stripe mock checkout + webhook, offer creation, QR token creation (proximity), scanner redemption and single-use rejection. 11 admin integration tests + rules tests.
- **Not verified:** map with real tiles (provider unreachable in the sandbox), real admin accounts.

## Phase 12 – Polish and release: DONE (release itself needs real accounts)

- Legal: imprint, privacy policy, terms, partner terms in de/en in `packages/shared/src/legal` (one source for app and web), operator data from env with visible markers when missing; website landing page; `/legal/[doc]`.
- GDPR: `deleteAccount` (user data, invites, QR tokens, nonces, rate-limit counters, partner profile/offers/stats, POI unlink, Stripe cancel, feedback anonymized, auth record) and `exportMyData`; in-app buttons (settings) and partner portal page; tests on the emulators.
- Consent: crash reports (Crashlytics) off by default with native auto-collection disabled and an in-app switch; ad choices via UMP privacy options; withdrawal-of-right notice at the paywall; AI labeling everywhere (badge in tour and player, settings note).
- Accessibility pass on the app (roles, labels, live regions, reduce motion, 44 pt targets, contrast tests); web forms with labels, focus outlines, `aria-current`.
- Release tooling: `apps/mobile/eas.json`, `scripts/check-release.mjs` (fails on missing operator data, keys, test ids), `docs/RELEASE.md` (legal, Firebase, payments, listings, background-location justification, on-device tests, operations).

## Critic gate (must pass before handing over)

Four independent reviews (frontend, backend, legal, design), each >= 4/5, findings fixed, re-reviewed until all pass.

- Round 1: frontend 3, backend 2, legal 3, design 3. Blockers: paid audio readable straight from Storage, tour list query rejected by the rules, unenforced consent for the withdrawal waiver, false "exact position never leaves the device" claim. All findings were addressed in round 2 (private signed audio URLs, rules-conformant query with rules tests, consent checkbox with server-side record, corrected texts and retention, GPS/audio teardown, error paths, paywall/home/player redesign, cost guards, webhook ordering).
- Round 2: **frontend 4, backend 4, legal 4, design 4** — no blockers and no unresolved majors. Remaining minors (nonce-based CSP, sockpuppet-resistant report blocking, consent-evidence retention wording, durable-medium purchase receipt, partner-terms lawyer review, hook tests) are listed in the critic reports and docs/RELEASE.md.

## Known issues / notes

- Brand SVGs are auto-traced (D4). No simulator/device run possible in the build sandbox: mobile is verified by typecheck + bundle export only until Phase 4 tests are added.
- External docs (ai.google.dev) were not reachable from the sandbox; model choice rests on search snippets (D16).
