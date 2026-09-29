# Release checklist

Automated gate first, then the manual items below. Nothing in this list can be verified from CI or the build sandbox: it needs real accounts, real devices and the store consoles.

```bash
node scripts/check-release.mjs   # fails while operator data, keys or test ids are missing
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @tuur/functions test:integration   # needs Java for the Firebase emulators
```

## 1. Operator and legal (blocking)

- [ ] Fill `OPERATOR_*` (web) and `EXPO_PUBLIC_OPERATOR_*` (app): name, address, email, representative, privacy contact, supervisory authority, optional register/VAT/phone. Open `/legal/imprint`, `/legal/privacy`, `/legal/terms`, `/legal/partner-terms` in both languages and confirm **no** `⟦operator data missing⟧` marker is left.
- [ ] Have a lawyer review the texts in `packages/shared/src/legal/` (imprint, privacy, terms incl. withdrawal wording for digital content, partner terms) for the operator's country and business form. They are drafts written from the actual data flows, not legal advice.
- [ ] Conclude data processing agreements (Art. 28) with Google (Firebase/Gemini/AdMob), RevenueCat, MapTiler, Stripe, HeiGIT if ORS is used commercially; check the ORS, MapTiler, Overpass and Nominatim usage terms for a commercial production load (use own/paid endpoints; the public Nominatim/Overpass instances are not for production traffic).
- [ ] Verify the Gemini model names in `config/ai` against the official documentation and deprecation list (they were chosen from search snippets, see D16), verify the terms for Search grounding before ever enabling it, and re-check pricing in `config/ai.pricing`.
- [ ] Record the consent/records of processing (Art. 30) and decide on a DPIA (location data, AI).

## 2. Firebase project

- [ ] Blaze plan; region `europe-west1`; deploy `firestore.rules`, `firestore.indexes.json`, `storage.rules`, functions.
- [ ] Enable Auth providers: Anonymous, Email/Password, Apple, Google. Register App Check (Play Integrity, App Attest/DeviceCheck) and turn enforcement on for Firestore, Storage and functions.
- [ ] Secrets: `GEMINI_API_KEY`, `ORS_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REDEMPTION_TOKEN_SECRET`. Params: `TUUR_*_PROVIDER` set to the live providers (`gemini`, `openrouteservice`, `live`, `nominatim`, `stripe`), `TUUR_WEB_BASE_URL`.
- [ ] Firestore TTL policies so counters and nonces disappear as the privacy policy says: `rateLimits.expireAt`, `rewardNonces.expiresAt`, `redemptionTokens.expiresAt` (redemption tokens are also deleted with the account), `narrationLocks.at` is small and can be cleaned by a scheduled job.
- [ ] Storage lifecycle: none needed for `narrations/`; consider a bucket CORS/CDN for audio.
- [ ] Budget alerts in Google Cloud Billing in addition to `config/ai` budgets and the kill switch.
- [ ] Create the first admin with `scripts/set-admin.mjs`; sign in to `/admin`, open Costs and AI to confirm the config document exists.

## 3. Payments and ads

- [ ] RevenueCat: products `tuur_credit_1`, `tuur_credit_5`, `tuur_sub_monthly`, `tuur_sub_yearly` in both stores and mapped in RevenueCat; webhook to `revenueCatWebhook` with the bearer secret; sandbox test of purchase, restore, renewal, cancellation, refund (credit removal) on iOS and Android.
- [ ] Apple: subscription group, localized subscription display name and description, price, review screenshot of the paywall; the paywall shows title, period, price, auto-renewal terms and links to terms/privacy.
- [ ] AdMob: real app ids and unit ids, SSV enabled with the `admobSsv` URL, UMP consent message published for EEA/UK; test with real test devices, then remove test ids (the release check enforces it). App Tracking Transparency text is set in `app.config.ts`.
- [ ] Stripe: prices per currency in `config/partners`, customer portal enabled, tax collection, webhook endpoint and the four events listed in SETUP.md, test with the Stripe CLI in test mode, then live mode.

## 4. Store listings

- [ ] Icons/splash/screenshots from `assets/brand` (heart-pin mark on white, red `#ED0516`); wordmark files for the listing.
- [ ] iOS privacy nutrition labels: Location (precise position stays on the device and is used for app functionality; only the map grid cell id is sent to the server, plus one-time positions for route planning and QR redemption), Identifiers (user id, device id for ads), Purchases, Diagnostics (only with consent), Usage/Advertising data (AdMob). Android Data safety form accordingly; declare that data can be deleted in the app and via the account deletion URL (`<web>/partner/account` is for partners; provide the in-app path and a public deletion-request page/email for users).
- [ ] **Background location justification** (both stores): location is used only while a tour is running so the audio guide can narrate with the screen off; a foreground notification (Android) shows while active; permission is requested in context with a rationale screen; provide a demo video for Google Play review.
- [ ] Age rating / audience: not for children under 16 (privacy policy), no user-generated content shown to other users.
- [ ] Support URL and privacy policy URL (`<web>/legal/privacy`), terms URL (`<web>/legal/terms`), marketing URL.
- [ ] Universal links / app links: replace `REPLACE_TEAMID` in `apple-app-site-association` and the SHA-256 fingerprint in `assetlinks.json`, verify `https://<web>/.well-known/...`, test an invite link with the app installed and not installed.

## 5. On-device verification (not possible in CI)

- [ ] Android + iOS dev build: run a full standard tour outdoors (foreground and background/screen off), including interruptions (call, other audio), airplane mode with a downloaded tour, low battery mode.
- [ ] Planned route, crossroads, roam on foot and on a bike; vehicle pause when traveling by train/car; simulator off.
- [ ] Purchase, restore, invite link redeem, rewarded ad (SSV credit arrives), interstitial only between stops.
- [ ] Partner offer redeem end to end on two phones (QR readability in sunlight, scanner in the partner PWA on a phone camera).
- [ ] Accessibility: VoiceOver/TalkBack through onboarding, home, tour detail, player, paywall; Dynamic Type / font scale 200 %; reduce motion; contrast in bright sun.
- [ ] Performance: map with the planned tour, memory during a two-hour walk, battery drain, offline pack size.
- [ ] Push a `preview` build (`eas build -p all --profile preview`) to testers before `production`.

## 6. Operations

- [ ] Monitoring: Crashlytics (opt-in) dashboard, Cloud Functions error alerts, budget alerts, uptime check on `health`.
- [ ] Runbook: kill switch (admin dashboard), locking an area, blocking a narration, suspending a partner, RevenueCat/Stripe webhook replay.
- [ ] Data requests: in-app export/deletion cover users; a partner uses `/partner/account`. Subscriptions bought through the stores must be cancelled by the user in the store (stated in the deletion dialog).
