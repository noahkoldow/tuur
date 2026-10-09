# Setup

## Prerequisites

Node >= 22, pnpm 10 (`corepack enable`), Java 17+ (Firestore emulator), Xcode / Android Studio for dev builds.

## Local development

1. `pnpm install`
2. Configure client values in `apps/mobile/.env.local` / `apps/web/.env.local`; Functions parameters belong in `functions/deploy/.env.local`, because Firebase serves the bundled `deploy` directory. All server providers default to `mock`.
3. `pnpm dev` – emulators (UI :4000, Functions :5001, Firestore :8080, Auth :9099, Storage :9199), web :3000, Expo dev server.
4. For the complete native integration, use a development build: `pnpm --filter @tuur/mobile ios` or `android`. For an Expo Go UI preview, use `pnpm --filter @tuur/mobile go`; for Gemini through local emulators, follow the next section.

## Gemini narration and high-quality speech

**Account requirement (2026-10-05):** the mobile app now requires Apple/Google/email sign-in and a linked, SMS-verified mobile number before entering any activity. The fixture demo simulates these steps with code `000000` and sends no SMS. For live Firebase, enable Phone alongside the primary providers and configure native app verification or the web SMS reCAPTCHA; see [RELEASE.md](RELEASE.md#home-sign-in-and-tour-feedback--2026-10-05-local-changes). Expo Go with the Firebase JS SDK cannot complete native phone verification, so the earlier `go --live` route below is no longer an end-to-end entry path for a new account. Use a native development build or the live web app; Firebase Auth emulator verification codes remain usable there.

Verified against Google's [models](https://ai.google.dev/gemini-api/docs/models), [speech API](https://ai.google.dev/gemini-api/docs/speech-generation), and [pricing](https://ai.google.dev/gemini-api/docs/pricing) on 2026-10-03. The default is `gemini-3.8-flash` for narration and `gemini-3.8-flash-tts` for speech, with `gemini-3.5-flash-lite` for classification and fact checks. Voice personas include Gemini fallbacks, so an OpenAI key is optional. Speech uses structured delivery instructions and explicitly requests 24 kHz mono PCM before encoding MP3; legacy 2.5/3.1 TTS overrides remain supported.

1. Build Functions with `pnpm --filter @tuur/functions build`. In ignored `functions/deploy/.env.local`, set:

   ```dotenv
   TUUR_LLM_PROVIDER=gemini
   TUUR_TTS_PROVIDER=gemini
   TUUR_POI_PROVIDER=live
   TUUR_GEOCODING_PROVIDER=nominatim
   ```

   Put the **server-only** key in ignored `functions/deploy/.secret.local` as `GEMINI_API_KEY=...`. Add `OPENAI_API_KEY=unused` if using only Gemini. Other bound secrets may need local dummy values to start their unrelated emulated functions. Never put a Gemini/OpenAI key in an `EXPO_PUBLIC_*` variable. The Nominatim public endpoint is for light local testing; production needs a suitable configured `NOMINATIM_URL`.

2. In `apps/mobile/.env.local`, set `EXPO_PUBLIC_BACKEND=firebase`, `EXPO_PUBLIC_USE_EMULATORS=true`, `EXPO_PUBLIC_FUNCTIONS_REGION=europe-west1`, and the Firebase client configuration from the Firebase console (`EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`). For an isolated `demo-tuur` emulator project a placeholder Firebase API key and matching `demo-tuur` project/bucket are sufficient. `EXPO_PUBLIC_EMULATOR_HOST` must be the computer's LAN IP on a phone, not `localhost`. The backend rewrites local Storage audio URLs to this address.

3. Start the emulators on that same project. Firebase emulator hosts must bind to an interface reachable by the phone for Auth (:9099), Firestore (:8080), Functions (:5001), and Storage (:9199); keep them on a trusted local network. Then run `pnpm --filter @tuur/mobile go --live --lan`. `--live` preserves `.env.local`, uses the Firebase JS SDK, and plays the generated MP3 with `expo-audio`. Area ingestion runs directly inside the emulator because Cloud Tasks has no local emulator. The regular `go` command remains a fixture preview and uses device speech.

4. Sign in and use a free tour, or give the test user a subscription in the **emulator's** Firestore UI at `users/{uid}/entitlements/local-test`: `{ type: "subscription", active: true, productId: "local-test", expiresAt: null, updatedAt: <current epoch milliseconds> }`. Access checks remain enforced by the server. A UI-only `EXPO_PUBLIC_PAYWALL=off` does not grant backend access.

5. For a live **web** app, set `EXPO_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` to the Firebase-registered reCAPTCHA v3 site key and authorize the site's domain in Firebase Auth. Run `pnpm --filter @tuur/mobile exec expo start --web` to honor live configuration; the `web` script explicitly launches a demo preview. Expo Go uses the emulator only; production App Check and background/lock-screen playback use a native development or release build.

For production, store keys through Firebase Secret Manager and configure the provider parameters in the Functions deployment source. Deploying Functions, enabling APIs, or paid provider calls are separate operational steps. Existing `config/ai` documents override defaults; update `models.tts` there to choose the new high-quality model. Calls reserve their estimated budget transactionally before contacting paid providers and settle it idempotently. USD 3/day limits estimated admissions, not the provider invoice. Character-based TTS budget accounting is a conservative estimate (50 USD/million characters); actual Gemini billing uses audio tokens, so verify usage and update prices before 2027. Pending budget reservations must not be released by TTL. Search grounding remains disabled until its charges can be bounded.

For TestFlight, follow the isolated beta configuration in [RELEASE.md](RELEASE.md#isolated-testflight-configuration): separate Firebase project, EAS `testflight` profile / `preview` environment, matching native Firebase file and explicit server sandbox flags. Production mock providers and preview paywall bypasses are rejected.

On 2026-10-03 the authenticated Firebase CLI confirmed the existing `tuur-prod` web app and restored its public SDK configuration to ignored `apps/mobile/.env.local`. Demo remains the default until live backend readiness is confirmed. No local Gemini key was available; the Functions inventory request failed, so deployed Functions and provider configuration remain unverified. Unit tests verify request shapes, PCM handling, emulator URL rewriting and playback behavior; an authenticated live generation/listening test still needs the server secret and reachable/configured Functions above.

## Manual steps for production (needs accounts)

- **Firebase**: production project `tuur-prod` is selected in `.firebaserc` and on the **Blaze** plan. Registered apps: iOS `1:261809139951:ios:c9df9603f42afbb74d2b1a` (`com.tuurapp`), Android `1:261809139951:android:ff3ce13eef954bba4d2b1a` (`app.tuur.guide`), Web `1:261809139951:web:d949d1c4acf0cf644d2b1a`. Firestore and Storage are in `europe-west1`; Firestore rules/indexes and Storage rules are deployed. Anonymous and Email/Password Auth are enabled. Still enable Google and Apple sign-in, register App Check, then deploy Functions after setting their secrets.
- **Secrets**: run `firebase functions:secrets:set <NAME>` separately for `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ORS_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`. `OPENAI_API_KEY` may be the literal `unused` if OpenAI voices are not wanted (personas then use their Gemini fallback voice).
- **Optional hosted OSM POIs**: the [Overspan adapter](https://overspan.dev/docs/) is prepared but not activated. It requires a separately approved subscription and real key: set `TUUR_POI_PROVIDER=live`, `OVERPASS_ENDPOINT=https://api.overspan.dev/api/interpreter`, and the server-only Firebase secret `OVERPASS_API_KEY`. Bind that secret only to the functions that execute POI ingestion, including any inline emulator path. Never place it in `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` or the endpoint URL. The server gate rejects this endpoint without a usable key. Live Overpass requests reserve a shared limit of 50 attempts per UTC day and one request at a time; quota responses defer ingestion without inline retries or provider fallback. A live smoke test remains required after activation.
- **Voices (D45)**: set parameter `TUUR_TTS_PROVIDER=live` to use every TTS provider with a key (`gemini` = Gemini only, `mock` = silence). Pick the cast by ear first: `OPENAI_API_KEY=… GEMINI_API_KEY=… pnpm voices:samples`, then open `voice-samples/index.html`. The cast, default voice, TTS models and prices live in Firestore `config/ai` (`voiceCast`, `defaultVoiceId`, `ttsModels`, `pricing.ttsPerMCharsUsdByProvider`).
- **Map tiles**: MapTiler key + custom light tuur style. **RevenueCat**, **AdMob** (+UMP), **Stripe**: create accounts/products later phases.
- **Brand assets**: `pnpm brand` needs `sharp` and `potrace` (`npm i --no-save sharp potrace`).
- **Mascot Tuu**: `pnpm mascot` regenerates `apps/mobile/assets/mascot/tuu_*.png` (512 px) from the originals in `assets/mascot` (`tuu_01_idle_front.png` … `tuu_10_sit_relaxed.png`; the original export names ending in `-1.png` … `-10.png` also work); needs `sharp` like `pnpm brand`.

## Monetization setup (Phase 9)

1. **RevenueCat**: create a project with the iOS and Android apps; products `tuur_credit_1`, `tuur_credit_5` (consumables) and `tuur_sub_monthly`, `tuur_sub_yearly` (auto-renewing, one subscription group). Set the public SDK keys as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`. Add a webhook to the `revenueCatWebhook` function URL with an `Authorization: Bearer <secret>` header; store the secret as Firebase secret `REVENUECAT_WEBHOOK_SECRET`. Product mapping can be overridden in Firestore `config/billing`.
2. **AdMob**: create app IDs and a rewarded + interstitial unit; set `ADMOB_*_APP_ID` (build time) and `EXPO_PUBLIC_ADMOB_*_UNIT`. Enable server-side verification on the rewarded unit and point it to the `admobSsv` function. Configure the UMP consent message in AdMob (EU/UK). Without env values Google test ads are used.
3. **Invite links**: the AASA file is configured for Apple Team ID `4GXK973R2W` and bundle ID `com.tuurapp`. Set the Android SHA-256 fingerprint in `assetlinks.json`; configure `FUNCTIONS_BASE_URL` (and store URLs) for the web app if invite landing pages are used.
4. Firebase Functions need the Blaze plan for secrets and outbound network.

## Partner program setup (Phase 10)

1. **Stripe**: create products/prices for `visibility` and `offers` per currency (EUR default, CHF/GBP/USD optional). Store the price ids in Firestore `config/partners` as `pricing: { prices: { visibility: { EUR: 'price_…' }, offers: { EUR: 'price_…' } }, currencyByCountry: { CH: 'CHF' }, defaultCurrency: 'EUR' }` (the admin UI edits this in Phase 11). Enable the customer portal and tax collection. Webhook endpoint = `stripeWebhook` function URL with events `checkout.session.completed`, `customer.subscription.created|updated|deleted`.
2. **Secrets**: set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `REDEMPTION_TOKEN_SECRET` individually using `firebase functions:secrets:set <NAME>` (the last one is any random string of 32+ characters). Set `TUUR_PAYMENTS_PROVIDER=stripe` and `TUUR_WEB_BASE_URL` for production; locally the mock provider needs no keys (put a dummy `REDEMPTION_TOKEN_SECRET` into `functions/deploy/.secret.local` for the emulator).
3. **Web env**: `NEXT_PUBLIC_FIREBASE_*` (api key, auth domain, project id, app id), `NEXT_PUBLIC_USE_EMULATORS=true` for local development. Enable Email/Password sign-in in Firebase Auth.
4. **Firestore**: deploy `firestore.rules` and `firestore.indexes.json` (composite index for `partnerStats`).

## Admin setup (Phase 11)

1. Create the first admin: register the account (e.g. through the partner login page), then run `GCLOUD_PROJECT=<project> node scripts/set-admin.mjs you@example.com` with Application Default Credentials. Sign out and in again to refresh the token.
2. Set `MAPTILER_KEY` for the web app to serve `/map-style.json` (used by the admin map and, through `EXPO_PUBLIC_MAP_STYLE_URL`, by app offline packs). Restrict the key to your domains in the MapTiler console.
3. Local end-to-end check: start the Auth, Firestore and Functions emulators (after `pnpm --filter @tuur/functions build`; link `functions/deploy/node_modules` to `../node_modules` and put dummy secrets into `functions/deploy/.secret.local`), then `NEXT_PUBLIC_USE_EMULATORS=true pnpm --filter @tuur/web dev`.

## Storage signing (private audio)

Native offline downloads support ready-made and curated fixed itineraries. Deploy the `prepareTourDownload` callable together with the narration/transition functions: it verifies current access without recording a tour start, and the app stores its receipt with the itinerary, audio and text. Completed downloads remain available until deleted, including after a curated route's 24-hour online session expires. Explore and Crossroads remain online modes. Live Expo Go can save audio and text; offline map packs need the development build. The web preview still simulates downloads in memory; it does not persist an offline library across page reloads.

Signed URLs are created by the Cloud Functions runtime service account. Grant it the token-creator role on itself once per project:
`gcloud iam service-accounts add-iam-policy-binding <sa>@<project>.iam.gserviceaccount.com --member=serviceAccount:<sa>@<project>.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator`.
Deploy `firestore.indexes.json` with `firebase deploy --only firestore:indexes` so the TTL policies (`expireAt`) and composite indexes are created.

## Beta: places missing in a district (2026-10-09)

Symptom: Home says nearby places could not be loaded. Cause seen in `tuur-beta-noehxpo`: tiles in `areas/{geohash}` stuck on `status: failed, error: rate_limited` (Hakenfelde `u337h*`, 37 tiles). The ingest worker called the Pelias geocoder (limit 1000/day, used up by prefill) only to name the city and failed the whole tile when it was rate limited. The worker now falls back to the place of an ingested neighbor tile (`resolvePlace` in `functions/src/area/ingest.ts`).

Run once, in this order (needs the Firebase CLI login):

1. `pnpm --filter @tuur/functions build`
2. `node scripts/deploy-beta-backend.mjs --include-ingestion --functions=ingestArea --apply`
3. `node scripts/reset-failed-areas.mjs` (plan), then `node scripts/reset-failed-areas.mjs --run` to make the failed tiles claimable again. The next app request or `node scripts/prefill-beta-areas.mjs --preset=hakenfelde,spandau --snapshot --run` ingests them.

Only about 1,100 of the ~9,000 imported tiles with places are ingested so far; keep the prefill running (it is resumable) to avoid cold-tile waits. Stale `ingesting` claims clear automatically after 2 hours. The device build must use the beta project (`EXPO_PUBLIC_FIREBASE_PROJECT_ID=tuur-beta-noehxpo` in the EAS `preview` environment, already set); `tuur-prod` has no Cloud Functions.
