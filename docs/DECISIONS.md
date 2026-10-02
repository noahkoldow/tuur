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
