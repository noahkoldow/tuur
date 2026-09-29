# Setup

## Prerequisites

Node >= 22, pnpm 10 (`corepack enable`), Java 17+ (Firestore emulator), Xcode / Android Studio for dev builds.

## Local development

1. `pnpm install`
2. `cp .env.example .env.local` (all providers default to `mock`; no keys needed)
3. `pnpm dev` – emulators (UI :4000, Functions :5001, Firestore :8080, Auth :9099, Storage :9199), web :3000, Expo dev server.
4. Mobile needs a development build (no Expo Go): `pnpm --filter @tuur/mobile ios` or `android`.

## Manual steps for production (needs accounts)

- **Firebase**: create a project, **upgrade to the Blaze plan** (Functions, Cloud Tasks, external network calls), enable Auth (Anonymous, Apple, Google, Email), Firestore, Storage, App Check; set the id in `.firebaserc`.
- **Secrets**: `firebase functions:secrets:set GEMINI_API_KEY ORS_API_KEY REVENUECAT_WEBHOOK_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET`.
- **Map tiles**: MapTiler key + custom light tuur style. **RevenueCat**, **AdMob** (+UMP), **Stripe**: create accounts/products later phases.
- **Brand assets**: `pnpm brand` needs `sharp` and `potrace` (`npm i --no-save sharp potrace`).

## Monetization setup (Phase 9)

1. **RevenueCat**: create a project with the iOS and Android apps; products `tuur_credit_1`, `tuur_credit_5` (consumables) and `tuur_sub_monthly`, `tuur_sub_yearly` (auto-renewing, one subscription group). Set the public SDK keys as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`. Add a webhook to the `revenueCatWebhook` function URL with an `Authorization: Bearer <secret>` header; store the secret as Firebase secret `REVENUECAT_WEBHOOK_SECRET`. Product mapping can be overridden in Firestore `config/billing`.
2. **AdMob**: create app IDs and a rewarded + interstitial unit; set `ADMOB_*_APP_ID` (build time) and `EXPO_PUBLIC_ADMOB_*_UNIT`. Enable server-side verification on the rewarded unit and point it to the `admobSsv` function. Configure the UMP consent message in AdMob (EU/UK). Without env values Google test ads are used.
3. **Invite links**: replace `REPLACE_TEAMID` in `apps/web/public/.well-known/apple-app-site-association` and the SHA-256 fingerprint in `assetlinks.json`; set `FUNCTIONS_BASE_URL` (and store URLs) for the web app.
4. Firebase Functions need the Blaze plan for secrets and outbound network.
