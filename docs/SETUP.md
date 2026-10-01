# Setup

## Prerequisites

Node >= 22, pnpm 10 (`corepack enable`), Java 17+ (Firestore emulator), Xcode / Android Studio for dev builds.

## Local development

1. `pnpm install`
2. `cp .env.example .env.local` (all providers default to `mock`; no keys needed)
3. `pnpm dev` – emulators (UI :4000, Functions :5001, Firestore :8080, Auth :9099, Storage :9199), web :3000, Expo dev server.
4. Mobile needs a development build (no Expo Go): `pnpm --filter @tuur/mobile ios` or `android`.

## Manual steps for production (needs accounts)

- **Firebase**: production project `tuur-prod` is selected in `.firebaserc` and on the **Blaze** plan. Registered apps: iOS `1:261809139951:ios:c9df9603f42afbb74d2b1a` (`com.tuurapp`), Android `1:261809139951:android:ff3ce13eef954bba4d2b1a` (`app.tuur.guide`), Web `1:261809139951:web:d949d1c4acf0cf644d2b1a`. Firestore and Storage are in `europe-west1`; Firestore rules/indexes and Storage rules are deployed. Anonymous and Email/Password Auth are enabled. Still enable Google and Apple sign-in, register App Check, then deploy Functions after setting their secrets.
- **Secrets**: `firebase functions:secrets:set GEMINI_API_KEY OPENAI_API_KEY ORS_API_KEY REVENUECAT_WEBHOOK_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET`. `OPENAI_API_KEY` may be the literal `unused` if OpenAI voices are not wanted (personas then use their Gemini fallback voice).
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
2. **Secrets**: `firebase functions:secrets:set STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET REDEMPTION_TOKEN_SECRET` (the last one is any random string of 32+ characters). Set `TUUR_PAYMENTS_PROVIDER=stripe` and `TUUR_WEB_BASE_URL` for production; locally the mock provider needs no keys (put a dummy `REDEMPTION_TOKEN_SECRET` into `functions/.secret.local` for the emulator).
3. **Web env**: `NEXT_PUBLIC_FIREBASE_*` (api key, auth domain, project id, app id), `NEXT_PUBLIC_USE_EMULATORS=true` for local development. Enable Email/Password sign-in in Firebase Auth.
4. **Firestore**: deploy `firestore.rules` and `firestore.indexes.json` (composite index for `partnerStats`).

## Admin setup (Phase 11)

1. Create the first admin: register the account (e.g. through the partner login page), then run `GCLOUD_PROJECT=<project> node scripts/set-admin.mjs you@example.com` with Application Default Credentials. Sign out and in again to refresh the token.
2. Set `MAPTILER_KEY` for the web app to serve `/map-style.json` (used by the admin map and, through `EXPO_PUBLIC_MAP_STYLE_URL`, by app offline packs). Restrict the key to your domains in the MapTiler console.
3. Local end-to-end check: start the Auth, Firestore and Functions emulators (after `pnpm --filter @tuur/functions build`; link `functions/deploy/node_modules` to `../node_modules` and put dummy secrets into `functions/deploy/.secret.local`), then `NEXT_PUBLIC_USE_EMULATORS=true pnpm --filter @tuur/web dev`.

## Storage signing (private audio)

Signed URLs are created by the Cloud Functions runtime service account. Grant it the token-creator role on itself once per project:
`gcloud iam service-accounts add-iam-policy-binding <sa>@<project>.iam.gserviceaccount.com --member=serviceAccount:<sa>@<project>.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator`.
Deploy `firestore.indexes.json` with `firebase deploy --only firestore:indexes` so the TTL policies (`expireAt`) and composite indexes are created.
