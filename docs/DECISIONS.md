# Decisions

## D69 - Free text tours, paid audio and fixed voice introductions

Owner clarification on 2026-10-08: online text tours, info cards and navigation are free and supported by advertising. Non-Premium users start new tours in text mode and can explicitly enable audio when they hold paid access. Text mode makes no tour TTS requests and consumes no paid audio minutes. Audio uses the D68 allowances: 90 active audio-tour minutes per credit, 450 per five-pack and 500 per UTC calendar month for either Premium term. These are active audio-tour minutes, not just seconds of speech output. Pauses and text mode do not consume them. Downloads still require their separate paid authorization and reserve duration before generation.

The free cards have a separate source-text path: beta data inspection found Wikipedia references on all 21 sampled places but no stored excerpts. `getPoiText` retrieves excerpts from the canonical Wikipedia references without an LLM, TTS, wallet or audio lease. It checks authentication and place/route visibility before cache reuse, limits each account to 240 requests per hour and caches successful results by place/language/version for seven days. Missing preferred-language text retries after five minutes; source failures after 30 seconds. The mobile client requests the current stop or an opened nearby card, shares concurrent requests and keeps an account/context-scoped five-minute memory cache. Existing curated facts and OpenStreetMap descriptions remain available when there is no Wikipedia text; a failed fetch offers retry and never fabricates a story. Source links, licenses and the notice that Wikipedia excerpts are shortened/formatted must remain reachable with the card, following [Wikimedia's reuse terms](https://foundation.wikimedia.org/wiki/Terms_of_Use?useformat=mobile#7._Licensing_of_Content) and [OpenStreetMap attribution](https://www.openstreetmap.org/copyright). Free source retrieval does not make route generation, teaser generation or other infrastructure cost-free.

Audio access is checked on the server for generated and cached recordings. Free/reward entitlements and watching an ad do not unlock new audio. Existing purchased permanent rights, older paid sessions, completed offline archives and legacy gifts originating from paid permanent credits remain compatible. Metered credits cannot be gifted. Live-group guests share audio financed by the host's valid paid access; group membership does not grant separate downloads or permanent ownership. Switching to text closes the active audio lease; restoring a text checkpoint must not acquire one.

Three fixed voice introductions appear below the purchase choices and play before the ad on each new free tour. German and English use the same fixed transcript per language with Mara/Sulafat, Jonas/Sadaltager and Linus/Achird. Six Gemini `gemini-3.8-flash-tts` MP3s were generated once and bundled under `apps/mobile/assets/voice-previews/` (17.00–21.48 seconds, 691,314 bytes total). Playback never calls TTS or consumes an allowance. The AI label remains visible, and files carry an `AI_GENERATED` ID3 marker. `scripts/generate-voice-previews.mjs` and its manifest preserve text, style, model, duration and SHA-256; `--verify` is offline and `--generate` does not regenerate existing verified clips.

The introduction is a short animated Tuu promotion with three scenes following actual audio progress. It uses brief headlines instead of a text-heavy free-tier explanation. **Audio freischalten / Unlock audio** is available immediately, opening `/paywall?intent=pricing` after dismissing the introduction and canceling that tour-start request. **Ohne Audioguide fortfahren / Continue without audio guide** unlocks after one clip finishes; replay or switching voices does not revoke that unlock. A playback failure also permits continuing. Finishing the clip never advances automatically; the user presses Continue to attempt the ad. Reduced motion suppresses decorative loops, and pausing stops progress. The same unchanged clips can be heard locally with `node scripts/preview-voices.mjs` at `http://127.0.0.1:57811/voices` (requires the local app preview export). Browser playback and button sequencing were verified; this is not an iPhone audio-session, native-sheet or StoreKit acceptance result. A shorter Tuu transcript is prepared in the generator, but regeneration hit provider HTTP 429; the existing recordings and manifest remain in use.

After the introduction, a start ad is attempted with an eight-second readiness limit and cancellation on leaving the flow. Unavailable or privacy-disallowed ads do not block the free text tour. Successful presentation completes only on the native `CLOSED` event. A presented ad retains its close listener and exclusive presentation after cancellation; its caller returns false only after closure, and newer ad/consent requests wait. This prevents a later free-tour fallback from starting beneath an older visible ad. The owner's request for an ad before each new free tour is separate from optional ads between stops: start ads are not frequency-capped by that policy, but their timestamps count toward the persisted rolling daily/gap limit for between-stop ads. Between-stop ads run only in text mode, in the foreground and never for Premium. UMP choices are checked before requesting/presenting; privacy changes discard cached ads. Development and explicitly marked TestFlight builds use Google demo units even when production IDs are configured.

Live AdMob account inspection on 2026-10-08 showed **account not approved**. The owner's email that morning cited account/program criteria without identifying a specific app defect; similar earlier emails do not establish a technical root cause. Existing app/unit IDs and successful SSV URL verification are not proof of advertising approval or revenue. No policy attestation or resubmission was performed. Google's [readiness statuses](https://support.google.com/admob/answer/10564477?hl=en) and [test-device guidance](https://developers.google.com/admob/ios/test-ads) distinguish approval from integration/testing; TestFlight alone does not make an iPhone a Google test device.

This product change is local source work. It has **not been deployed** to Functions, legal hosting, OTA or a new native binary. Build `0.1.0 (9)` predates it; a matching backend/legal release and a new TestFlight build/upload are needed to test this behavior. Existing Build 9 review/invitation records remain historical evidence for that binary, not this implementation.

## D68 - Active tour minutes, shared group recordings and subscription emphasis

Owner approval on 2026-10-07: one credit includes at most **90 active tour minutes**; either subscription includes **500 minutes per UTC calendar month**, without rollover. Five credits remain 450 minutes, giving the subscription 50 extra minutes. Prices stay at EUR 1.99 / 7.99 / 9.99 / 59.99 for one credit, five credits, monthly and annual subscriptions. This replaces the 24-hour window and ten-start limit for new metered access. Existing permanent entitlements and complete offline archives remain compatible.

The server accounts for elapsed active time through one lease per account (90 seconds, refreshed every 30 seconds). Pausing stops consumption; a disconnected or crashed client can consume at most the outstanding lease. Ordered, idempotent requests prevent retries from double charging. Recovery preserves the original billing context when a planned tour continues in Explore, and a recoverable startup failure pauses its lease. Subscription account transfers retain consumed time.

Offline preparation reserves the canonical tour duration once per persistent download identity, before generation. A failed replacement preserves the previous complete archive. Recordings bind to the reserved script and narration profile; transitions must follow adjacent itinerary stops. Insufficient remaining minutes block preparation. Local playback of a complete archive does not consume further time. Continuing from an archive into Explore checks online access and obtains a new lease; failed authorization leaves the archive playable. Group invitation is available in online tours, with an explicit explanation during archive playback. Further credits are never spent automatically.

A group shares the host's script, language, voice and exact recordings. Only the host generates audio; existing and in-flight host recordings are reused. Members do not receive private variants or group download rights. Membership, route stops, group expiry and the host's access are checked server-side. A paused host causes waiting; ending the group pauses guests. Only the host's time is consumed. Recording references expire with the group and are removed during host account deletion.

The monthly subscription button has a decorative gold capsule border with a 6.5-second linear shimmer. Reduced motion, background state, an unfocused screen or a disabled button leave a static border. Demo purchases remain simulated and use the same time rules when the demo paywall is enabled.

The annual price is unchanged by this implementation. Its contribution margin is narrow at full monthly usage under the current cost assumptions; see the current-policy note in `UNIT_ECONOMICS.md`. Validate actual provider spend before treating these estimates as profit.

## D67 - Optional photos on the shareable activity recap

The completed-activity map and details share one scroll view: scrolling down moves the map entirely out of view, and scrolling back restores it. A compact native header keeps Close accessible, and Share remains fixed above the bottom safe area. Map panning is disabled only for this embedded recap map so vertical swipes reach the page; stop taps and zoom remain available. The map keeps its fixed rendering size while scrolling, avoiding per-frame map layout changes.

Owner clarification on 2026-10-05: the Strava-style share card should include a collage of pictures taken during the activity, if the listener permits. Photo access starts only from **Add activity photos**, even when the operating system has already granted access. Match photo creation timestamps to the saved activity's inclusive start/end interval; never substitute the current time for an unfinished record. A bounded query supplies up to four chronological photos, with individual removal and a route-only option in the visible preview.

The selection lives only in the recap screen. It is not saved in history, sent to the backend or added to the user's library. The operating system may retrieve iCloud originals when resolving a photo. Only the composed PNG leaves through the listener's explicit system-share action. Limited access is respected, access is checked again on return to the app and before sharing, and opt-out cancels pending discovery. Missing images and native read failures do not block sharing without photos. Image display readiness and selection checks guard the capture against incomplete or removed photos.

Use the SDK-matched `expo-media-library` API and photo-only native configuration; no camera, media-location, video/audio or library-write access is added. The browser keeps text sharing. A native rebuild and device verification are needed for photo permissions and PNG sharing; this implementation does not publish an update or lift the TestFlight hold.

## D66 - Browse pricing in the unlocked demo

Owner feedback on 2026-10-05: Crossroads failed to load and pricing was invisible in Expo Go. The first Crossroads choices are computed before a guide session exists, without a partial runtime object. Live sessions still supply their history, access and narrative context.

Profile and Settings expose **Preise & Abos / Prices & subscriptions**. This overview stays open without an unlock target, including when preview playback is unlocked or a subscription is active. Contextual tour/session paywalls still dismiss after access is granted; paid download requirements stay intact. Demo purchases grant simulated credits/subscriptions and explicitly state that no payment occurs. Existing prices are unchanged.

## D64 – A persistent tour brief, authored speech and live Gemini curation

The guide retains one editorial brief (central question, character, opening and closing) for the whole session, including rerouting and cold-start recovery. Each stop receives that brief plus its chapter and neighboring itinerary names. Research material is separate from the recording script: Gemini develops spoken paragraphs from verified sources, then fact checking runs, and only the accepted spoken paragraphs reach TTS. Unchanged source documents are rejected and rewritten once. Narration cache keys include the editorial context, so another tour cannot reuse a mismatched chapter. New offline downloads retain the same brief; older downloads remain compatible.

On-the-go curation in roam and crossroads sends up to twelve locally feasible POI IDs, interests and the central question to `selectNearby`. The backend loads and authorizes real places, restricts them to one neighboring tile area, asks Gemini to order the candidates, and validates every returned ID. No exact device position is sent. Calls are throttled on device and server and use the existing reserved AI budgets. The app waits at most 2.5 seconds, retains delayed rankings for the next choice and uses local selection during failures. This is source-backed Gemini selection, not unbounded Google Search grounding; the existing grounding and beta-snapshot restrictions remain in force.

Ingestion now also includes named streets, neighborhoods and small details. Street positions use actual way vertices, not bounding-box centers. These places have short dwell times and restrained scores; they can connect longer itineraries or provide a short local walk when highlights are unavailable. Roam can insert a public, unseen small detail on a long approach while retaining the chosen destination. Sparse OSM-only places receive an authored observation rather than fabricated etymology or history. Coverage still requires mapped public places and working configured providers; no landmarks are invented to make an empty area appear covered.

Category hues are shared by stops, maps, onboarding and settings, always paired with text/icons. City badges use a horizontal carousel. Swiping a history row reveals deletion, with an accessible button and confirmation; deleting removes the local route record and updates statistics/badges while retaining downloads and a running tour. A persisted deletion marker prevents ongoing/recovered sessions from recreating that record. The new gesture-handler dependency requires a compatible native build.

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

## D32 – One legal source, visible gaps

The legal texts live in `packages/shared` and are rendered by app and web. Operator data comes from the environment; a missing value prints `⟦operator data missing⟧` in the text and fails `scripts/check-release.mjs`, so an incomplete imprint can never be shipped by accident. The texts describe the real data flows (grid-cell-only location upload, Gemini without personal data, ORS for planned routes, MapTiler IP exposure) and must be lawyer-reviewed before launch.

## D33 – Deletion and export are server functions

Account deletion and export run in Cloud Functions with the admin SDK (the client cannot reach most of the data by design). Deletion is idempotent and ordered so a retry after a partial failure completes it; the Auth record is removed last. Anonymous aggregates (usage cost, redemption log without user ids) are kept. Store subscriptions cannot be cancelled by us; the dialog says so.

## D34 – Narration audio is private, served by signed URL

Object names in `narrations/` are guessable, so Storage rules deny all client reads. `getNarration`/`getTransition` run the entitlement check first and return a 6 h signed URL (`audioUrl`); the app maps `audioPath` to that URL (also for offline downloads, which fetch right after the request). Production signing needs the functions service account to hold `roles/iam.serviceAccountTokenCreator` on itself (SETUP.md). Objects carry `aiGenerated` metadata and an ID3 tag marking synthetic audio.

## D35 – Cost guards cover every model call

Language codes are an allowlist (`NARRATION_LANGS`); new-language tour texts are gated like any generation (rate limit, budget, kill switch); ingest checks the kill switch and budget before LLM classification and a global daily tile-claim cap stops tile farming; client-supplied `context` no longer reaches shared (cached) generation; narrations are only pulled after three distinct reporters.

## D36 – Webhook and token integrity

RevenueCat events are ordered by their own `event_timestamp_ms`, sandbox events are ignored in production and ledger entries are keyed by store transaction (a replayed purchase/refund is a no-op). Stripe events are marked handled only after their work succeeded and are ordered by the event's `created`. Redemption tokens and reward nonces are issued inside transactions so parallel requests cannot exceed the limits. Firestore TTL policies are part of `firestore.indexes.json` (`expireAt` fields), and a daily retention sweep enforces the periods named in the privacy policy.

## D37 – Withdrawal waiver is collected, not just displayed

The paywall requires an explicit checkbox before any purchase button is active; `recordPurchaseConsent` stores who/what/when/which text version under `users/{uid}/consents` before the store sheet opens, and the record is part of the data export. The terms contain the model withdrawal notice.

## D38 – Production Firebase project

Context: the configured `tuur-dev` project did not exist in the authenticated Google account. Decision: create and select `tuur-prod` in that account, and register iOS (`com.tuurapp`), Android (`app.tuur.guide`) and web clients. The owner approved Blaze; Blaze is active, and Firestore plus Storage are provisioned in `europe-west1`. Alternatives: retain an emulator-only project id or use a project in another account.

## D39 – First TestFlight scope and spend ceiling

Context: the owner wants real POIs and spoken AI narration for the first TestFlight, but only Gemini access is currently available (in a different Firebase project). The requested ceiling is EUR 3/day. Decision: enforce a hard maximum of USD 3/day on AI-generation budgets (conservative currency approximation); this does not cap Firebase infrastructure, maps, routing, or other provider charges, so Google Cloud billing alerts and separate provider limits are still required. Do not enable live providers until project-specific keys and production-safe data/map endpoints are ready. Do not build a product website; provide only a legal/privacy URL if required for external TestFlight or store submission. Alternatives: mock-only smoke test, higher spend ceiling, or a marketing site.

## D40 – Home centres the individual modes; ready-made tours leave the home screen

Context: the owner considers ready-made tours of little value, because tuur's core promise is a tour built for the user (feedback 2026-09-30). Decision: the home screen shows a full-screen map, the brand bar (wordmark, menu to settings/privacy/legal) and the three individual modes (planned route, crossroads, roam) as a swipeable card carousel. Auto tours are no longer listed and the home/mode screens no longer trigger `generateAutoTours` (`useArea(..., { tours: false })`), which also saves generation cost. The auto-tour backend, tour detail screen and invite links stay intact (deep links, offline downloads, possible later reuse). Alternatives: keep a secondary "ready-made tours" list below the carousel; remove auto tours from the backend entirely.

## D41 – Expo Go UI preview

Context: the owner wants to iterate on the UI in Expo Go, which lacks our native modules. Decision: `pnpm --filter @tuur/mobile go` sets `EXPO_PUBLIC_EXPO_GO=1`; Metro then resolves app files to an `.expogo` or `.web` sibling and stubs native-only packages; the map uses `react-native-maps` (bundled in Expo Go, excluded from native autolinking so dev/production builds keep MapLibre). `EXPO_PUBLIC_PAYWALL=off` unlocks all tours/modes client-side and in the demo backend for previews only; real builds never set it and the server enforces entitlements regardless. Map pins are smaller (26 px, current stop 34 px) so dense routes stay readable.

## D42 – Navigation, explore map and roam-first start

Context: owner feedback 2026-09-30. Decisions: (1) The map never follows the user on its own; a locate button (all map variants) recenters. (2) While walking, the tour path is split per stop (`navigationView` in shared): walked part grey, the leg from the user to the next stop prominent, the rest lighter. Production paths already follow streets (ORS); the Expo Go preview fetches street geometry from the public FOSSGIS OSRM server only for demo fixture coordinates (`EXPO_PUBLIC_PREVIEW_ROUTING=osm`, never in builds). (3) Pins carry a category glyph (interest) and a small number badge. (4) Profile-style swipeable stop cards (photo, Wikipedia extract with attribution, fact-checked key facts) pop up for the next stop. (5) The travel mode the pacing engine assumes is shown as a small fixed-size chip. (6) The transcript marks the spoken word, estimated from paragraph timings by word length plus punctuation pauses (`wordAt`), switchable in the settings. (7) Roam is the first mode: one question ("just go" to the best nearby spot via `rankRoamStarts`, or pick a start), the chosen first stop is pinned until reached. (8) Tapping the home map or swiping the panel down shows places other users explored (`poiStats`), sized by explorers on a log scale, flame when "hot" (decaying heat, half-life 7 days). Alternatives: auto-follow with a toggle; heatmap instead of markers.

## D43 – Partner pricing per traction and in-app application

Context: owner wants places to apply for collaboration and pay for preferred inclusion. Decision: pay per traction - per verified visit and per redeemed offer, category factor, free trial visits, partner-chosen monthly cap, no base fee (`partner/traction.ts`, evaluation in `docs/PARTNER_PRICING.md`). The app has a three-step business onboarding reached only via a low-key row at the end of the settings; applications go to `partnerApplications` (callable `submitPartnerApplication`, rate-limited, part of export/deletion) for admin review, the portal handles the rest. The existing Stripe subscription tiers stay as a possible hybrid for chains. Open: metered Stripe billing, partner terms update.

## D44 – Explorer counts, tour history and city badges

Explorer counts are anonymous: `recordVisit` (on arrival at a stop, not on narration prefetch) increments `poiStats/{poiId}`; a sha256 marker of user + POI + day in `explorerMarkers` (TTL 2 days) prevents double counting without linking days; spots show from 3 explorers (k-anonymity). The tour list and badges are computed on the device only (`state/history.ts`, cleared with account deletion). City badges: 128 curated destinations (`badges/cities.ts`, generated by a subagent, review before release), tiers bronze/silver/gold at 1/3/7 tours with at least 2 visited stops within the city radius (`earnedBadges`). Alternatives: server-side history (more robust across devices, more personal data).

## D45 – Human-sounding guide voices (voice cast, multi-provider TTS)

Context: owner wants voices that sound like a person, like the ChatGPT voice call (2026-09-30). Checked the official docs the same day: OpenAI `gpt-4o-mini-tts` with 13 voices, `marin` and `cedar` recommended for best quality, steerable via `instructions`, German supported, usage policy requires telling listeners the voice is AI-generated; Gemini `gemini-3.8-flash-tts` / `-flash-lite-tts` (GA) with 30 voices and natural-language style direction. Decision: a small cast of guide personas (`narration/voices.ts`): Mara = OpenAI marin, Jonas = OpenAI cedar, Lina = Gemini Achird, each with a style direction ("local guide talking to one person, not an announcer") and a fallback voice on the other provider. `RoutedTtsProvider` addresses voices as `provider:name`; missing keys fall back automatically. Text is generated and fact-checked once per narration key; other voices only render audio (`narrations/{key}/voices/{persona}`), so switching voices costs TTS only and stays inside the daily budget (over budget: the stored voice is served). Costs are logged per provider (`ttsPerMCharsUsdByProvider`, OpenAI estimate 17 USD per million characters, about 1.5 ct per minute; to verify against the current price list). Listeners choose the voice in the settings; the AI label now says "text and voice". Gemini style is passed as a natural-language prefix (works across SDK versions); the newer `speech_metadata.style` annotation can replace it later. ElevenLabs v3 is a candidate in the sampling script only (usually the most expressive, but priced higher and not wired as a provider). Alternatives: one global voice; ElevenLabs as default; voice cloning of a real guide (needs consent and contracts).

## D46 – Mascot Tuu

Context: the owner wants a recurring guide character to raise engagement (2026-09-30) and supplied ten 3D renders of "Tuu", a heart-pin figure with a backpack (`assets/mascot`, 1254 px, transparent background). Spec 2.1 allows only the brand assets; Tuu is an explicit owner-supplied addition and does not replace the wordmark, the mark or the SpinningMark. Decision: the originals are to be named like the app assets (`tuu_01_idle_front.png` … `tuu_10_sit_relaxed.png`, owner request; the rename of the export names `…-1.png` … `…-10.png` is still pending because the automated rename was not permitted in this session, and the script accepts both schemes). `pnpm mascot` (`scripts/build-mascot-assets.mjs`) only reads them and writes 512 px palette PNGs to `apps/mobile/assets/mascot` (faint edge specks below alpha 32 removed, one shared crop so Tuu keeps its scale across poses; about 485 KB in total). `Mascot` (typed poses: idle, walk, wave, point, listen, think, map, present, celebrate, relax) pops in and bobs gently with the native driver, is static under "reduce motion" and hidden from screen readers unless given a label; `MascotTip` pairs Tuu with a one-line speech bubble. Placement, sparing on purpose so the maps stay clean: onboarding welcome (wave, replaces the decorative spinning mark), permissions (point), safety (listen); home greeting (idle, or point/map/think for no location/low content/failed); roam start sheet (walk, point while picking); plan form (map, think while the area loads) and preview (map, think while composing); fork (think while the area loads, point at "Wohin jetzt?"); player paused (relax) and finished (celebrate, with a way home); profile header (idle), badges (celebrate, or present with the empty hint); business intro (present) and sent (celebrate); downloads empty (relax); error boundary (think). Loading indicators remain the SpinningMark; Tuu only accompanies them. Copy speaks as Tuu sparingly in the du-form (i18n de/en). Alternatives: a vector/Lottie character (smaller, animatable, but not supplied); Tuu on map screens or as a map marker (rejected: clutter, conflicts with the heart-pin stop markers); a stop-reached celebration (left out for now to keep walking calm).

## D47 – Live group tours by link

Context: owner wants to share a running tour with up to two friends who hear the same tour on their own phones without paying; only online; abuse-proof; max three people; more seats for a small fee; premium hosts get two more (2026-10-01). Decision: `groups/{id}` with a tour snapshot, members, capacity (3, +2 premium host, + bought seats, cap 8), 12 h TTL. The invite link carries `groupId.secret` (256 bit); only its sha256 is stored, compared in constant time. Join, seat and leave run as transactional callables (`createTourGroup`, `joinTourGroup`, `addTourGroupSeat`, `leaveTourGroup`), join attempts are rate-limited, clients can only read their own group. Guests get content solely through `hasGroupAccess` (member of a live group, only stops of that tour, never downloads), checked on every narration, so access ends with the group and offline use is impossible. Seats are a consumable store product `tuur_group_seat` (about 0.49 EUR; RevenueCat webhook credits `seatBalance`). Guest content is mostly cache hits of the host's narrations, so cost is negligible. Limitation: standard and planned tours only (roam/crossroads build their route live; shared live routing would be a separate step). Web landing `/join/[token]`, AASA and Android app links include `/join`.

## D48 – Ending a tour, summary and sharing

The player's down-chevron minimises (the tour keeps running; home offers "continue"); "Tour beenden" (confirm) or the finished state ends it and opens `/summary/[id]`: walked line, distance, duration, moving pace, stops, newly earned badge, and a share card rendered as a line drawing (no map tiles, no address) captured with react-native-view-shot and shared via the system sheet. The walked GPS track is thinned (15 m steps, jumps dropped) and stored only on the device (`state/history.ts`). Returning home dismisses to the existing home screen instead of stacking a new one (fixes the missing logo after leaving a tour).

## D49 – UX round from the audit

Implemented from the UX audit (2026-10-01): haptics vocabulary (`src/motion.ts`), spring press feedback (`PressableScale`), native push/back-swipe transitions with modals for paywall/redeem/join, sheet and home panel physics (velocity, rubber band, drag anywhere on the panel, carousel fades instead of unmounting), compact fully tappable mode cards, white map buttons, 44 pt touch targets for pins and spots, roam pins select instead of starting a paid session, full-contrast primary card while loading, official Sign in with Apple button, locale-correct durations/distances, compass arrow only with a real heading and animated along the shortest turn, "Du bist da" on arrival, de-duplicated player header, shorter copy and one name for the planning mode ("Deine Route"). Second pass: onboarding in three steps (welcome with language and terms, interests, location with the safety line; account optional in settings), mini player on home, transcript follows the spoken paragraph (pauses 5 s after own scrolling), explore spots cluster by zoom (`clusterByGrid`, tap zooms in), live route preview while planning (no separate calculate step; destination by map pin). Still open: swipe-to-delete downloads (needs react-native-gesture-handler).

## D50 – Apple HIG redesign of the app (supersedes "light only" and parts of D40/D41/D49)

Context: the owner asked to redesign the app from the ground up along Apple's Human Interface Guidelines (2026-10-01; reviewed with the apple-design skill: principles, accessibility, platform conventions, craft, interaction, writing). This overrides spec 2.2 "light theme only" and spec 12 "no dark mode in v1". Decisions: (1) **Tokens**: `@tuur/ui` gets a semantic palette (`palette.light/dark`: background, grouped, elevated, label levels, separator, fill, accent, accentText, accentTint, status) and iOS text styles (`textStyles`); contrast of every role pair is unit-tested (AA, 3:1 for glyphs). The mobile theme resolves roles with `DynamicColorIOS`, so dark mode follows the system live (`userInterfaceStyle: automatic`, dark splash, dark map style); legacy `colors.*` names alias the roles. (2) **Type**: system font (SF Pro) for everything, Plus Jakarta Sans ExtraBold only for large titles and the player distance (branding.md: custom font for headlines, system for body); Dynamic Type up to 2.3x, sheets grow with the font scale. (3) **Navigation**: three native tabs (Entdecken, Offline, Profil; `NativeTabs`, floating Liquid Glass on iOS 26), each with its own stack and large-title headers; Settings pushes inside Profil; pushed task flows use native headers or floating glass buttons over maps; paywall/redeem are modal sheets with a close button. (4) **Material**: Liquid Glass (`Glass`, `expo-glass-effect`) only on floating controls over the map (locate, back, close, travel-mode chip) with an opaque fallback for Reduce Transparency and older iOS; content (cards, rows, sheets) is opaque; no solid bars behind floating actions. (5) **Color budget**: brand red only for the primary action, the selected tab, the now-playing tile, progress and map pins; labels, icons and rows are monochrome; tinted (accentTint) buttons for secondary emphasis. (6) **Components**: SF Symbols everywhere (`Icon` maps the former Feather/MCI names; vector fallback off iOS), inset grouped lists with checkmark pickers instead of chip walls in settings, capsule buttons (filled/tinted/gray/plain, 44-50 pt), system switch colors, system Sign in with Apple button in light/dark, share card always rendered with the light palette. (7) **Home**: the three mode cards became one primary "start roaming" button plus two list rows in a nonmodal sheet with a peek detent (explore map) and a medium detent; Tuu stays as the sheet's greeting (D46). Alternatives: keep the carousel (rejected: custom, competes with the map), a custom tab bar (rejected: loses system behavior), hard-coded dark values per component (rejected: `DynamicColorIOS` keeps one source). Open: not verified on a device or simulator (no macOS here; typecheck, lint, 28 tests, iOS and web bundle export pass); Android keeps the light palette; the tab-bar bottom accessory for the mini player (iOS 26) is not wired.

## D51 – Show, do not tell: home, onboarding, business and Tuu

Context: owner feedback 2026-10-02: home not inviting and cluttered, onboarding and business pages weak, people should see images and ideas immediately, barriers minimal, Tuu barely used. Decisions: (1) **Home** leads with a carousel of place cards (photo or category art, "Anhören" badge, minutes, Commons credit; tap = walk there and hear the story) under one heading, then one primary roam button and a quiet "Weitere Wege" list; without a location it shows example places (demo region) and an inline location button, never an empty screen. (2) **Onboarding**: three illustrated pages (walk and audio, tap a place, choose how), Skip goes straight into the app, one consent footnote with inline links, interests optional, a single "Weiter" before the system location prompt. (3) **Business**: one page with a mock partner card, how it works, fair pricing and a short application; the floating button is "Jetzt bewerben" (scrolls to the form) and becomes "Bewerbung senden" once the form is in view. (4) **Tuu** speaks through `TuuSays` speech bubbles: one-time tips (dismissable, at most one per app session, switchable in settings) and state bubbles (play, summary, empty states); no bubble above purchase decisions. (5) Process: a design critic subagent scored each round (round 1: 7.5, 8.0, 8.5; round 2: 7.5, 8.0, 8.5), stopping at >= 8.5. Open: real photo cards, Liquid Glass, tab bar overlap and Dynamic Type are unverified on a device; demo POIs have no photos, so the category-icon fallback shows in previews.

## D52 - iOS Dynamic Island tour activity

Context: the owner wants navigation and tour information outside the full-screen iOS app (2026-10-03). Decision: an Expo SDK 57 `expo-widgets` Live Activity, with `@expo/ui` SwiftUI layouts for the Dynamic Island and Lock Screen, follows the existing guide session across screens and background location/audio updates. It shows the current stop, explicitly labelled straight-line distance, audio/pause/choice status, and progress in German or English; tapping opens `tuur://play`. Native updates are serialized and coalesced, user dismissal is respected, ended/replaced tours are removed, and a 60-second native stale date hides old distance even when JavaScript is suspended. Coordinates and narration text never enter the widget payload. Expo Go, older binaries without the extension, Android, and web skip the integration. The widget extension and app group require a new signed iOS build; no push server or additional permission prompt is used. Alternatives: custom ActivityKit bridge (unnecessary with this SDK); fabricated turn instructions (routing currently supplies no maneuver data). Device checks and native-build notes: [DYNAMIC_ISLAND.md](DYNAMIC_ISLAND.md).

## D53 - Gemini voice, photographed places and flexible exploration

Context: owner feedback on 2026-10-03 asks for a connected Gemini backend, capable speech, place photos, animated navigation, reachable sheets and flexible tour modes. Decisions: (1) Gemini text generation stays server-side; the browser and Expo Go can use the Firebase JS adapter when explicitly configured. Expo Go live mode targets the local emulators; native production retains App Check. The preferred voice model is now `gemini-3.8-flash-tts`, superseding D16's Flash-Lite default. Gemini 3.8 speech uses structured style controls with explicit 24 kHz mono PCM before MP3 encoding, not spoken instruction prefixes. Real audio playback replaces silent timing simulation in configured live previews. Missing credentials are an explicit setup prerequisite; no keys are bundled into the app. See [SETUP.md](SETUP.md#gemini-narration-and-high-quality-speech).

(2) Wikipedia ingest requests free page images and resolves Commons license/author metadata. Demo landmarks use verified photos of those exact places; generic synthetic places retain category artwork. Place, stop and tour cards retain source and license links and show a fallback when an image fails.

(3) Explore is the displayed name of free roam. Your route curates an itinerary and permits adding/removing places; explicit picks are protected during both local planning and the server's budget check. Picks that cannot fit require more time or fewer places. A solo planned walk can switch to Explore with the same runtime, current story, local history and GPS trail. Crossroads remains a separate mode. Explored by others opens ready-made tours, ranked by actual aggregate activity at their stops when available; no invented popularity counts are shown.

(4) Navigation distinguishes the actual walked trail, next leg and remaining route. Native map cameras ease with position updates, stop following during map interaction and resume on Locate; reduced motion is respected. Sheets expand from content swipes, use a near-full-height stop, skip duplicate heights on small screens, and compensate scrolling for hidden viewport/tab-bar space. End tour and Report an error sit in the player header. The repeated top AI label and exploring-ahead sentence are removed; Tuu pose 07 peeks over the panel.

Validation: 218 shared tests and 105 mobile tests pass, plus the focused TTS provider tests. Mobile, shared and Functions TypeScript checks, scoped lint, the Functions build and the web bundle export pass. All 29 photo URLs return images with attribution metadata. Live Gemini generation still requires a server key and confirmed reachable/configured Functions. Browser screenshot verification hit tooling timeouts; native-device motion and gesture quality still require device QA.

## D54 – Home follows the running activity

Context: owner feedback 2026-10-03: starting another activity makes no sense while one is running. The start carousel, "Start roaming" and "More ways" from D51 belong only to the idle home screen. An active session, including a paused session, gets its own home view: planned and standard tours show route progress and upcoming stops, crossroads shows its current choices, and roam shows the closest available places within 1.5 km of the guide's live location. Visited, skipped, narrated and already selected destinations are excluded. Picking a roam destination retargets the same session, preserving its GPS, pause state and history; an active or queued story must finish before a new destination can be selected. Nearby POIs load by tile rather than restarting on each GPS fix. Ending the activity restores the start screen.

## D55 – Nearby discovery balances significance and distance

Context: owner feedback 2026-10-04: a major landmark a kilometre away should remain visible alongside a small fountain around the corner, with richer cards and no duplicate destinations. This updates D54's distance-only ordering. Idle and active home now share a ranking that combines travel effort, raw source-based significance and interests; one major landmark is retained among the first three suggestions when available. Prominence uses raw scores and Wikipedia/Wikidata coverage, never a paid boost or an area-relative score alone. Aliases are grouped by canonical and source identities, with conservative nearby-name matching, before exclusions and the display limit; active/visited aliases stay excluded too. Home loads two tile rings so the wider suggestions can be found.

The destination carousel centers and enlarges its focused card while neighbours remain visible, with accessible previous/next controls and a position indicator. Reanimated handles scroll-linked transforms on the UI thread, reduced motion removes scale/lift, and live ranking changes preserve the focused place. Cards show prominence, category, straight-line distance, approximate walking/visit time, and a short attributed Wikipedia extract when available. Missing descriptions are not invented.

Area subscriptions remain active after initial loading; completed neighbouring tiles refresh even when nearby minor places are already cached. Updated snapshots reach the ranking even if the number of places stays the same, and older responses cannot overwrite a completed refresh.

Validation: 59 focused tests, mobile/shared TypeScript checks, scoped lint and the web export pass. The centered layout and next-card navigation were checked in the browser at 390 px width. Native gesture feel remains unverified; existing development binaries need rebuilding to include the SDK-matched Reanimated and Worklets dependencies.

## D56 - Quiet map markers, visible curation and saved itineraries

Context: owner feedback on 2026-10-04 asks for map points that match the app, downloads for curated and ready-made tours, and an animated curation process. Stops now use compact numbered capsules with a category icon, a red current stop and a check beside completed stop numbers. Explored places, clusters and the location puck share the same semantic colors, rounded shapes and generous touch areas across native, Expo Go and web.

Curation shows Tuu with his map and a connected stage indicator driven by actual work: finding places, composing the route, then reviewing it. No timed percentage or invented intermediate completion is shown. The editable preview is explicitly approximate; the completed route opens for review with the returned street path, travel time, stops and any budget adjustment. Start and Download are separate actions. Inputs cannot change during composition, repeated taps do not submit duplicate requests, and leaving the screen prevents late navigation.

Only fixed itineraries can be downloaded. The server authorizes the exact ready-made or privately curated route without claiming a tour start; the app saves that receipt with the route and stories. A completed download remains playable until removed, even after a curated route's 24-hour online session expires. Explore and Crossroads still require online access. Downloads open in their saved narration language. Interrupted downloads resume, and the UI distinguishes saved stories from unavailable offline map tiles. The browser demo uses an in-memory library; native downloads persist on the device. The new `prepareTourDownload` callable must be deployed with the app's backend changes.

Validation: the mobile suite and focused offline/access tests pass, as do mobile/shared/Functions typechecks, scoped lint, the Functions build and the web export. A 390 px browser check verified curation progress, route review, separate Start/Download controls, completed download status and reopening the saved route. Offline tests cover replay after the online session expires with a dead network backend. Native-device animation and airplane-mode checks remain to be performed; nothing was deployed.

## D57 - Explore in the header and photos at the top of the player

Owner feedback on 2026-10-04: the idle home sheet's Explore action replaces "Stories near you" and "Tap a place and listen" in the fixed header. Its existing entry flow stays the same, and the duplicate action below the place carousel is removed.

In the player, stop photos are the first scrollable content when the sheet is pulled up. Play/Pause stays visible beside the title in a compact header with distance and progress. Previous/next, End tour and Report an error follow the photos, superseding D53's placement of secondary actions in the header. The collapsed height is reduced to match; photo attribution and transcript behavior remain unchanged.

Validation: mobile TypeScript, scoped ESLint, formatting and whitespace checks pass. A 390 px local browser preview verified the Explore entry, photo placement, sheet expansion/collapse and Pause/Play. The preview also showed an existing nested-button warning outside these layout changes. Native-device gestures and large system text still need device QA.

## D58 - Reset the map when returning to it

Owner feedback on 2026-10-04: the locate control sits above Tuu with clearance on the idle home, active home and player maps. It shares the sheet's animated translation so the clearance stays constant during dragging and settling, rather than jumping between snap heights. The control is a sibling of the sheet so native touch targets stay inside their parent bounds; selected place cards receive extra clearance. Locate restores the user/navigation center, north-up orientation, flat pitch and the fixed walking zoom; Expo Go's Apple Maps also restores its camera altitude because that provider does not use the zoom field.

Collapsing a map sheet to its lowest detent invokes the same reset once, together with the measured bottom inset. Initial mounting, ordinary height changes and GPS updates do not issue another reset. Following resumes during navigation, and subsequent map gestures can suspend it again. The start-place picker also uses the measured sheet height so its locate button stays clear. The schematic web preview exposes the same locate action and centered viewport, without simulating native rotation gestures.

Validation: mobile TypeScript, scoped ESLint and formatting pass; the four existing navigation-camera tests passed with the reset implementation. A 390 px browser preview verified a single locate control, clearance from Tuu at the medium and collapsed detents, and recentering when collapsing via the handle. Browser mouse dragging selected text rather than exercising a native touch gesture; touch dragging and native orientation/zoom resets still need device QA.

## D59 - Home cards without arrows or a position indicator

Owner feedback on 2026-10-04: remove the previous/next arrows, dots and card counter beneath the home carousel, including the active Explore home. This updates D55's visible controls. Horizontal swiping, snapping, reduced motion and preserving the selected place during live updates remain unchanged.

## D60 - Recoverable tours and isolated TestFlight readiness

Owner request on 2026-10-04: implement the actionable functionality/UX/UI and release audit findings. Explore and Crossroads receive explicit permission, loading, retry and empty states. Planned tours keep navigating after the final story until the actual route destination; that navigation-only endpoint is excluded from story counts. Images retain attribution, onboarding exposes full accessible content, and small-screen/keyboard layouts are corrected.

Recovery is opt-in and paused: a validated local checkpoint expires after 24 hours, is bound to the authenticated UID, and reuses the original history record and billing claim. GPS/audio never restart simply because the app launches. Permission, group status and access are rechecked; asynchronous account changes and explicit end/discard invalidate pending recovery. Downloads retain access receipts and are isolated by UID, including cancellation/cleanup of active writes during account changes. A same-UID social link keeps the library; existing social identities sign in without an implicit account merge.

TestFlight uses a separate Firebase beta project so sandbox purchases cannot create production entitlements. EAS's `testflight` profile uses the `preview` environment and an enforced iOS preflight. Server flags must explicitly identify the beta project, and production never accepts mock providers. Refunds use RevenueCat's actual cancellation event semantics. Account export/deletion now covers groups and local offline data; consent changes invalidate stale ads.

Estimated provider spending is reserved atomically before paid calls and reconciled idempotently. This is not a promise about the final provider invoice; conservative estimates, pending reservations and separate billing alerts are necessary. Unbounded Search grounding is refused. See `RELEASE.md` for the remaining account, service, domain and physical-device requirements. No native binary or backend was deployed as part of these code changes.

Validation: 459 workspace unit tests and six release-check tests pass on Node 22. The emulator suite and the focused billing rerun verify all 125 integration cases. TypeScript, ESLint, formatting, Functions bundling and native iOS JavaScript export pass. Browser checks cover small-screen layouts and the corrected entry flows; on-device sign-in, audio/GPS, purchases and accessibility remain to be verified.

## D61 - Compact place cards, required accounts and transport-friendly tours

Owner clarification on 2026-10-05: tapping a place card flips it to the important written information; tapping again or choosing “Show photo” returns to its image. Home, nearby-suggestion and Crossroads cards start or change navigation only through the dedicated bottom-right navigation button, which remains separate from the flip and photo-credit controls. During narration a disabled navigation action does not prevent reading the card. Tour-stop photo cards use the same flip interaction for source text or narrated key facts. Reduced Motion uses a fade.

Owner feedback on 2026-10-05 supersedes optional accounts in D49 and vehicle pausing in the earlier guide behavior. Settings is available at the top right of idle and active home. Place/tour cards put their text over the image; play actions use an icon with an accessible name. A light-grey information button in the top-right image corner opens author, source and license links, including downloaded images and active-tour cards. Selecting a map spot opens its card in the existing sheet; it does not start a tour or open a separate “take me there” popup. Locate now uses zoom 15.5 instead of 16.5 (half magnification); Apple Maps altitude is doubled to 1,200 m.

The mobile entry flow requires Apple, Google or email sign-in followed by a Firebase-linked mobile phone credential. Authentication hydration precedes routing, protected deep links resume after setup, and legal pages remain public. A typed number or local onboarding flag cannot grant access. Existing anonymous accounts may be linked to preserve their UID; the client never creates a new guest. This verifies the number once and is not SMS MFA on every launch. Demo authentication is explicitly simulated and uses SMS code `000000`. Production provider configuration and device verification remain release prerequisites; backend rules and partner/admin authorization are not migrated by this client change.

Car/public transport share GPS-based vehicle detection because speed alone cannot distinguish a car from a bus or train. Narration continues with short stories and speed-aware timing; Explore searches farther ahead. Short, plausible GPS segments can detect passing a stop, while jumps and long location gaps do not invent visits. Route generation still supports walking/cycling, not driving directions or public-transport schedules; the activity explains this when vehicle travel is detected. The safety copy keeps screen interaction out of driving; reference: [StVO § 23](https://www.gesetze-im-internet.de/stvo_2013/__23.html).

The missing short-tour badges had two causes: an undocumented two-stop minimum and visits saved only when departing. Bronze now requires a tour with one actually reached and heard stop inside a badge city, including a still-running tour; silver remains three tours, gold seven. Reached stops persist as soon as audio has played. Failed/loading audio, skipped stops and navigation-only destinations do not qualify. Existing one-stop records qualify automatically, and saved checkpoints can recover reached/heard stops on resume. Ended zero-stop records cannot safely reconstruct missing visits. Long tracks stay bounded without stopping the recording; distance and moving time survive point thinning.

## D62 - Service setup budget, OSM and explicit release hold

Budget update later on 2026-10-05: the owner authorized EUR 100 for services. The owner confirmed a total budget for the initial tests, not a monthly commitment; ongoing costs can be reconsidered after successful TestFlight testing. This supersedes the original free-only restriction below; it does not lift the TestFlight hold. Prefer existing free allowances and provision only needed paid resources. Budget alerts do not impose a hard cloud billing cap.

The owner subsequently declined booking the proposed Overspan subscription for now. Keep the optional adapter inactive, close the unpurchased checkout and prefer a verified free POI source. Do not use the earlier budget authorization to override this provider decision.

Owner instructions on 2026-10-05 authorize technical service setup and creation of an isolated Firebase beta project, but explicitly defer TestFlight until a later request. The initial free-only budget was superseded by the total EUR 100 authorization above. `tuur-beta-noehxpo` separates sandbox billing from production. Gemini uses a dedicated API-restricted key in the owner's existing non-billed Gemini project; small text/audio smoke tests passed without a paid fallback. The beta has a EUR 10 total infrastructure alert budget with EUR 5/8/10 notifications and five real Secret Manager versions. These are billable infrastructure resources; the alert budget is not an automatic cutoff. Any short provider subscription must fit the total allocation and have renewal explicitly disabled for this first test period.

The owner selected OSM after considering Apple Maps. Preserve the difference between open map data, hosted tile service terms, routing and offline downloads: an online map source is not implicit permission to bulk-download its tiles. Do not silently remove the offline entitlement checks or pretend a missing tile source has downloaded successfully.

The owner confirmed the purchase-transfer policy: one owner per store transaction, transfer only demonstrably unconsumed credits/group seats, preserve consumption/refund history, and remove transferred server access from the former owner. Historical balances without a provable transaction ledger must fail closed. Already consumed permanent tour rights are distinct from unused balances; existing offline downloads cannot be remotely erased while their device is disconnected.

The operator is Noah Linus Kothlow in Germany; support and privacy mail is bitsapp.admin@gmail.com. No business registration or tax identifier was supplied, and tax information is explicitly deferred. Country alone is not a full address: legal-page publication still requires the street/house number, postcode/city and the remaining operator/domain information. No TestFlight build or upload is part of this setup task.

## D63 - Play downloads in tuur; require paid access for new downloads

Owner feedback on 2026-10-05 explicitly prioritizes opening saved tours in tuur's own player and restricts downloading to Premium or purchased access. Downloads therefore lead with **In tuur öffnen**; GPX export is secondary. A download-specific route parameter loads only the owned local snapshot in its saved narration language. Opening verifies stored audio and exposes incomplete downloads for repair instead of starting a broken offline session.

Download authorization is separate from online playback: active Premium, an exact tour entitlement bought with paid credit, or the existing paid 24-hour place session for a private planned itinerary permits saving. Free, rewarded-ad, invitation and group access do not. The server verifies both preparation and content download requests; the UI and demo share the same policy, including with the preview playback paywall disabled. A download-specific paywall offers an explicit paid-credit upgrade and never spends reward credits for it; transactional existing-purchase checks prevent duplicate charges.

This changes the right to start/resume downloads, not D56's saved-tour retention: completed downloads remain playable until removed after the online session or subscription ends. Existing offline receipts are not retroactively invalidated. Full offline map tiles still need an authorized source; this change does not purchase a tile provider or turn route geometry into a downloaded basemap. Live rollout requires the matching backend and app changes; device acceptance and the TestFlight hold remain in force.

## D64 - Deploy the Firebase beta with a bounded real OSM snapshot

The owner requested implementation of the Firebase backend on 2026-10-05. Deploy only to the isolated `tuur-beta-noehxpo` project. An explicit consumer-function allowlist prevents accidental deployment of ingestion queues, schedules, administrative endpoints or unconfigured partner billing. Core and AI runtimes use separate service accounts; AI keys are bound only to the functions that need them. Beta functions scale to zero, with one maximum instance and concurrency one. The TestFlight hold remains in force.

Because the owner declined a hosted POI subscription, the first live backend test area is a curated real OSM snapshot for Berlin-Mitte: 21 places across six tiles, with original OSM identifiers and provenance. Only existing locked ready/low_content tiles pass ensureArea; requests elsewhere do not enqueue ingestion. This does not grant offline tile-download rights or provide worldwide discovery.

The beta AI admission budget is USD 1 globally and USD 0.50 per area per day, within the existing EUR 100 total first-test authorization and EUR 10 infrastructure alert. Gemini 3.8 Flash was unavailable during live testing (HTTP 503), so the beta narration model uses the verified available Gemini 3.5 Flash Lite in the existing non-billed account. Speech remains Gemini 3.8 Flash TTS. Conservative budget reservations are retained even for uncertain failed provider calls.

Backend verification uses temporary Auth/App Check debug fixtures and seeded paid entitlements. It verifies server enforcement, not a StoreKit transaction, genuine native attestation or real-device playback. All temporary test identities and grants must be removed; reusable real routes and generated audio may remain in beta.

## D65 - A continuous personal tour and separate pause destinations

The tour keeps one editorial brief from its start, including its central question, opening and closing. Individual chapters adapt to the current place and adjacent stops; source material remains separate from the spoken script sent to TTS. Source-backed street, neighbourhood and wayside observations can fill longer gaps without inventing local history. Gemini selects from supplied, verified candidates on the go; this does not itself scrape new places or remove D64's bounded beta coverage.

Category colors, icons and labels are shared across stops and interest choices in onboarding/settings. City badges scroll horizontally and saved tour-history rows support swipe deletion with an accessible alternative.

Owner clarification on 2026-10-05: spoken text and audio belong to a personal tour, not to a reusable place recording. Every independent online start and new offline download receives a personal script instance. Retries, recovery and playing that saved download retain their instance. Backend caches for chapters and transitions are scoped to the authenticated account and instance, including voice variants. Existing global recordings are not used for fresh personalized requests; generic pre-generation at automatic tour creation is removed. Reusable, rights-permitted facts/POIs remain separate from these recordings. This supersedes earlier global narration-cache assumptions; it does not create a new web-source cache or authorize storing grounded/Places content. Account export/deletion includes personal recordings.

Home and the active player have an actions button immediately above the location-centering control. It opens upward with **Pause finden** and, during an active tour, **Tour pausieren / fortsetzen**. The first pause picker filters explicit existing POI tags into coffee/bakery, food and rest, within 1.5 km straight-line distance, sorted by distance without a partner-score boost. It excludes hidden, private and explicitly disused places. It shows loading, retry and empty states without claiming live opening hours or availability.

Selecting **Weg in Google Maps öffnen** pauses the current tour and opens external walking directions to that destination. It does not rewrite the itinerary, narrate the break destination or count it as a completed story stop. A failed handoff restores the prior paused state. Returning users resume explicitly from the map menu. This is a Maps URL handoff, not a Google Places integration or internal detour-routing feature. No new partner tracking or business outreach is included. [Google's Maps URL documentation](https://developers.google.com/maps/documentation/urls/get-started) describes the directions handoff.

These changes are local source changes; deploying the matching app/backend and native-device verification remain separate. D62's TestFlight hold remains in effect.

Owner clarification on 2026-10-05: Just Roam keeps nearby next-stop suggestions on both active maps after arriving at the initial destination. Suggestions are optional; ignoring them continues automatic discovery and narration. A map tap previews a suggestion, and selecting a new destination waits until the current story is no longer playing or queued. Places with confirmed narration progress are retained as tour points even when the listener only passes nearby. Their personal written stories are saved locally for read-back during the walk, after finishing and after session recovery. Past map pins and finished-tour list rows open a reading sheet without changing playback or the route. Older history entries without saved stories may load existing source-backed place information; opening them does not generate a new narration.

## D67 - Authorized TestFlight beta and real path navigation

Later owner instruction on the same day changes the release order: push the current source to Git and publish Expo Go for review first. **TestFlight build/upload is on hold again until the owner gives a new explicit Go.** Existing preparation remains valid; the earlier authorization in this decision does not override this latest hold.

On 2026-10-05 the owner explicitly requested implementation of what is needed to put the current app into TestFlight and authorized using the Edge extension to retrieve Apple setup data. This supersedes the TestFlight hold in D62, D64 and D65. Scope is the isolated beta and its native build/upload; it does not include a public App Store release or additional tester invitations. The total first-test service budget and daily admission caps remain unchanged.

Active walking/cycling navigation now uses a protected point-to-point ORS endpoint and shared validated geometry. Explore, Crossroads, tours and Live Activity use path distance and the next path segment; sustained deviation triggers bounded rerouting. Failed routing cannot silently become a mock straight line in the live provider. GPS/destination requests are transient and are not persisted as a position history or route cache. Existing bounded account/tile abuse counters remain. Saved ORS tour geometry can be reused offline; this is not a downloaded basemap or car/transit routing.

Native Firebase identity, EAS environment and signing must all agree on the beta project, com.tuurapp and Apple Team 4GXK973R2W. The beta permits German phone verification with a 20-request daily send quota; real-device verification remains necessary. A separate legal-document origin avoids redirecting invitation and group links to a static legal-only host. The operator must identify which address may be public before the site is published.

The live smoke test verifies real Gemini audio, a stable personal recording identity/cache replay, ORS paths and server authorization using temporary test fixtures that are deleted afterwards. It does not substitute for native App Attest, StoreKit, background playback or an outdoor GPS acceptance test. See RELEASE.md for the latest verified build/upload state.

## D68 - OSM stays the catalogue; Apple Maps is a live-only fallback

The owner considered Apple Maps instead of OSM for its higher request allowance. Decision: OSM (plus Wikidata/Wikipedia) remains the only source for the persistent catalogue, scoring, tours, narration and offline packs, because the Apple Maps terms (Attachment 6) restrict derived databases and permanent storage and require display on an Apple map, and Apple returns only name, coordinate and category (no Wikipedia/Wikidata link or heritage tags for scoring or sourced narration). The real constraint was our own beta guard, not OSM: `OVERPASS_DAILY_LIMIT` was raised from 50 to 1500 per UTC day (the public instances' fair use is roughly 10,000 queries/day; each tile is fetched once and cached).

Apple MapKit is used for two transient, iPhone-only purposes: the break finder (cafe, food, park, toilets) and a discovery fallback that appears on Home only when OSM has nothing to show (empty or failed) for the listener's real position. The fallback searches museums and culture (`museum`, `culture`, `sights` categories: museum, theater, library, aquarium, zoo), renders them on an Apple map with directions in Apple Maps, and never stores them, sends them to Firebase or AI, adds them to a tour, or opens them as a story. Apple places are never merged with OSM places. Android and web keep the OSM flow. Follow-ups: pre-seed popular cities, then Geofabrik extracts or a self-hosted Overpass if usage grows.

## D69 - Beta discovery covers Berlin ABC through a geofence, not a snapshot

The six-tile snapshot (max 64 tiles) cannot cover a city. The isolated beta now runs live OSM ingestion, limited by `TUUR_BETA_REGION_BBOX=52.28,12.90,52.78,13.92`: a rectangle around Berlin (tariff zones A and B) and the C fringe (Potsdam, Oranienburg, Bernau, Königs Wusterhausen, Ludwigsfelde, Falkensee). It is a superset of the VBB ABC area, not its exact outline. `ensureArea` and `getWalkingRoute` reject tiles whose centre lies outside (`beta_area_unavailable`) and fail closed on an invalid rectangle or a non-beta project. Neighbour rings at the edge may still reach slightly beyond it. Existing locked Berlin-Mitte records stay valid. Limits: 1500 Overpass attempts and 1500 tile claims per UTC day, one query in flight. Endpoint: private.coffee (verified once, no availability promise); a self-hosted Overpass or Geofabrik import is the planned replacement if usage grows.

## D70 - Warm popular districts ahead of time; Overpass failover across public instances

A cold neighbourhood needs up to 25 tiles, so the first listener in a district would wait. `scripts/prefill-beta-areas.mjs` claims and queues tiles for a preset area (`berlin-inner`: the S-Bahn ring, 270 tiles, nearest to Alexanderplatz first) through the deployed `ingestArea` queue, with the same claim rules as `ensureArea`. It plans only without `--run`, caps a run at 200 tiles and refuses to exceed the daily tile allowance. A real run showed about 26 s and about 100 places per tile.

The first live tiles exposed that a single community Overpass instance is unreliable: private.coffee and kumi.systems both returned HTTP 500 at the web-server level while overpass.openstreetmap.fr answered. `OVERPASS_ENDPOINT` therefore accepts a comma-separated list and `HttpPoiSources.fetchOsm` hands over to the next entry after a failure (a local quota rejection stops immediately). The beta uses overpass.openstreetmap.fr first, private.coffee second. Their usage terms promise no availability, so a self-hosted Overpass or Geofabrik import remains the planned replacement.
