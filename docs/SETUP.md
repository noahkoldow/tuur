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
