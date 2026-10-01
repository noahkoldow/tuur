# tuur auf iOS testen: Expo Go, Dev Client und TestFlight

Stand: 2026-09-30. Diese Anleitung ist für dich als Projektinhaber geschrieben, ohne iOS-Vorwissen. Alles, was aus dem Repo belegt ist, steht als Fakt da. Alles, was ich nicht prüfen konnte (Apple-/Expo-Oberflächen, Flags), ist mit **[unverifiziert]** markiert. Bei jedem `eas`-Befehl gilt: Flags ändern sich oft, `eas <befehl> --help` zeigt den aktuellen Stand.

## 0. Die wichtigste Antwort zuerst: Expo Go geht nicht

**tuur läuft nicht in Expo Go.** Das ist im Code belegt, kein Zufall:

- `apps/mobile/index.ts` lädt auf nativen Plattformen sofort `react-native-track-player` und `expo-task-manager` (Hintergrund-Standort, Lockscreen-Player). Expo Go enthält diese Module nicht, die App bricht schon beim Start ab.
- `apps/mobile/src/backend/create.ts` importiert `firebaseBackend.ts` statisch, und das importiert `@react-native-firebase/*`. Diese Pakete brauchen nativen Code, den nur ein eigener Build mitbringt.
- Weitere native Module: `@maplibre/maplibre-react-native`, `react-native-google-mobile-ads`, `react-native-purchases`, `@react-native-google-signin/google-signin`, `expo-apple-authentication`, `expo-dev-client`.
- Der Demo-Modus `EXPO_PUBLIC_BACKEND=demo` ändert daran nichts: Er wählt nur das Backend zur Laufzeit, aber Metro bündelt die nativen Importe trotzdem mit. Nur auf **Web** gibt es Ersatz-Dateien (`create.web.ts`, `TuurMap.web.tsx`, `createEngine.web.ts` usw.), die die nativen Module umgehen.
- Die Projektdoku sagt dasselbe (`docs/SETUP.md`: "Mobile needs a development build (no Expo Go)").

**Ausnahme: UI-Vorschau in Expo Go.** `pnpm --filter @tuur/mobile go` startet Metro im Tunnel-Modus mit `EXPO_PUBLIC_EXPO_GO=1` und `EXPO_PUBLIC_PAYWALL=off`. Dann ersetzt `metro.config.js` die nativen Pakete durch leere Module und nimmt für App-Dateien die `.expogo`- oder `.web`-Varianten (Karte über `react-native-maps`, Demo-Backend, simulierter Ton). Alle Touren und Modi sind freigeschaltet. Das ist nur zum Anschauen und Verbessern der Oberfläche gedacht, nicht zum Testen der App.

**Realistische Alternativen, vom leichtesten zum aufwendigsten:**

| Weg                                       | Was du siehst                                                                                  | Konten nötig                                                                      | Mac nötig                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| A. Web-Vorschau im Browser (Demo-Backend) | Oberfläche, Flows, Demo-Daten. Keine echte Karte, kein Hintergrund-GPS, kein echter Ton-Player | keine                                                                             | nein                        |
| B. Dev Client (EAS `development`-Build)   | Die echte native App, der Ersatz für Expo Go                                                   | Expo-Konto. Für das Simulator-Build kein Apple-Konto, für ein echtes iPhone schon | Simulator: ja. iPhone: nein |
| C. TestFlight                             | Die App wie ein Endnutzer, installiert aus TestFlight                                          | Expo + Apple Developer (99 USD/Jahr)                                              | nein (nur ein iPhone)       |

## 1. Frage vorab: Hast du einen Mac?

- [ ] **Ja, Mac mit Xcode (aus dem App Store, ca. 10+ GB):** Du kannst auch im iOS-Simulator testen (Weg B-Simulator) und lokal bauen (`pnpm --filter @tuur/mobile ios`).
- [ ] **Nein, kein Mac:** Kein Problem. EAS baut in der Cloud auf Apples Hardware. Du brauchst dann ein **echtes iPhone** und einen Apple-Developer-Account (Weg B-Gerät oder C). Den Simulator kannst du nicht nutzen. Weg A (Browser) funktioniert auf jedem Rechner.
- [ ] Ich habe ein iPhone (iOS 16.4 oder neuer, so steht es als `deploymentTarget` in `app.config.ts`): ja / nein

---

## Pfad 1: "Schnell sehen, ohne Konten" (Web-Demo lokal)

Ziel: In 5 Minuten die Oberfläche im Browser sehen. Kein Firebase, kein Apple, kein Expo-Konto.

**Voraussetzungen:** Node >= 22, pnpm 10 (`corepack enable`).

1. Repo-Abhängigkeiten installieren (im Repo-Wurzelverzeichnis):

   ```bash
   pnpm install
   ```

2. Web-Vorschau starten (das Skript setzt `EXPO_PUBLIC_BACKEND=demo` selbst):

   ```bash
   pnpm --filter @tuur/mobile web
   ```

   Gleichwertig, falls du direkt arbeiten willst:

   ```bash
   cd apps/mobile
   EXPO_PUBLIC_BACKEND=demo npx expo start --web
   ```

   Der Browser öffnet sich (meist http://localhost:8081).

3. Alternative ohne Dev-Server, als statischer Export. **Diesen Befehl habe ich im Repo ausgeführt, er lief erfolgreich durch** (Ausgabe: `index.html`, ein JS-Bundle von 2,4 MB, Assets):

   ```bash
   cd apps/mobile
   EXPO_PUBLIC_BACKEND=demo npx expo export --platform web --output-dir /tmp/tuur-web
   npx serve -s /tmp/tuur-web
   ```

   `serve` habe ich nicht ausgeführt **[unverifiziert]**. Jeder statische Server mit Fallback auf `index.html` geht (die Web-Ausgabe ist eine Single-Page-App).

   `expo start --web` selbst habe ich nicht gestartet, weil es ein dauerhaft laufender Prozess ist. Nur der Export wurde geprüft.

**Was die Web-Vorschau nicht kann:** echte Karte (Platzhalter `TuurMap.web.tsx`), Hintergrund-GPS, Lockscreen-Player, echte Käufe/Werbung, Apple-/Google-Login. Sie läuft immer auf dem Demo-Backend mit Testdaten im Speicher. Das ist eine Vorschau, kein Test der iOS-App.

- [ ] Pfad 1 erledigt: Ich habe die Oberfläche im Browser gesehen.

---

## Pfad 2: "Echter iOS-Test" (EAS-Build, dann TestFlight)

### 2.0 Überblick: Simulator, Gerät, TestFlight

|                         | Simulator                                                  | Echtes Gerät (intern)                                                                        | TestFlight                                                               |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Mac nötig               | ja, mit Xcode                                              | nein                                                                                         | nein                                                                     |
| Apple Developer Account | nein                                                       | ja (99 USD/Jahr)                                                                             | ja                                                                       |
| EAS-Profil              | `development` (hat `ios.simulator: true`)                  | neues Profil, siehe 2.5                                                                      | `production` (oder ein Demo-Profil, siehe 2.5)                           |
| Installation            | `.app`-Archiv in den Simulator ziehen bzw. `eas build:run` | Link/QR von Expo, Gerät vorher registriert (`eas device:create`)                             | TestFlight-App auf dem iPhone                                            |
| Gut für                 | schneller Start-Test, UI                                   | Hintergrund-GPS, Audio, echte Sensoren                                                       | Test wie beim Endnutzer, Tester einladen                                 |
| Hinweis                 | Kein Hintergrund-GPS im Sinn eines echten Spaziergangs     | Entwicklermodus am iPhone nötig (Einstellungen > Datenschutz & Sicherheit > Entwicklermodus) | Builds laufen nach 90 Tagen ab **[unverifiziert, Apple ändert Fristen]** |

Alle `eas`-Befehle laufen im Ordner `apps/mobile` (dort liegt `eas.json`).

### 2.1 Empfohlene Reihenfolge

1. **Demo-Backend-Build zuerst.** Keine Firebase-Abhängigkeit im Laufzeitverhalten, schneller Nachweis, dass die native App startet.
2. Danach **Firebase-Emulator** (nur Simulator oder Gerät im selben WLAN) oder **Live-Firebase mit Mock-Providern**.
3. Danach **TestFlight** mit echtem Firebase-Projekt.
4. Zuletzt die echten Provider (Gemini, ORS, RevenueCat, AdMob) schalten, siehe Tabelle in Abschnitt 3.

### 2.2 Einmalige Vorbereitung (Expo)

- [ ] Expo-Konto anlegen auf https://expo.dev (kostenlos).
- [ ] EAS CLI bereitstellen und anmelden:

  ```bash
  npm install -g eas-cli      # oder: npx eas-cli@latest <befehl>
  eas login
  eas whoami
  ```

- [ ] Projekt mit Expo verknüpfen (im Ordner `apps/mobile`):

  ```bash
  cd apps/mobile
  eas init
  ```

  Hinweis: `app.config.ts` ist dynamisch und enthält noch keine `extra.eas.projectId` und kein `owner`. Die CLI fragt nach oder verlangt, dass du die `projectId` von Hand in `app.config.ts` einträgst. Das habe ich nicht ausprobiert **[unverifiziert]**. Sag mir die Ausgabe (ohne Geheimnisse), dann trage ich es ein.

- [ ] `eas build:configure` ist bei diesem Repo nicht nötig, `eas.json` existiert schon. Er schadet aber nicht. Er kann nach iOS/Android-Konfiguration fragen.

### 2.3 Wichtig: Die GoogleService-Info.plist wird immer gebraucht

**Geprüft im Quellcode des Plugins** (`@react-native-firebase/app`, `plugin/build/ios/googleServicesPlist.js`):

- `app.config.ts` setzt `ios.googleServicesFile` nur, wenn die Umgebungsvariable `GOOGLE_SERVICES_INFO_PLIST` gesetzt ist.
- Fehlt sie, **bricht der iOS-Prebuild hart ab** mit der Meldung "Path to GoogleService-Info.plist is not defined". Das gilt auch für das Demo-Backend, weil das Plugin `@react-native-firebase/app` in `app.config.ts` immer aktiv ist und beim Start nativ `FirebaseApp.configure()` aufruft.
- Die Web-Vorschau (Pfad 1) braucht keine Datei.

**Für diesen Build:** Das Firebase-Projekt `tuur-prod` ist auf Blaze. Die iOS-App `com.tuurapp` ist dort registriert; die zugehörige `GoogleService-Info.plist` liegt lokal unter `apps/mobile/GoogleService-Info.plist` und ist von Git ausgeschlossen.

**Platzhalter-Datei statt echter Datei:** Technisch reicht dem Plugin jede existierende Datei. Ob die App mit erfundenen Werten beim Start stabil bleibt (Firebase prüft das Format von `GOOGLE_APP_ID`), habe ich nicht getestet **[unverifiziert]**. Nimm deshalb die echte Datei.

**Datei als EAS-Datei-Variable hinterlegen** (aktuelle Syntax; das frühere `eas secret:create` ist veraltet **[unverifiziert, prüfe `eas env:create --help`]**):

```bash
cd apps/mobile
eas env:create --name GOOGLE_SERVICES_INFO_PLIST --type file \
  --value ./GoogleService-Info.plist \
  --environment development --environment preview --environment production \
  --visibility secret
```

- `--type file`: EAS legt die Datei beim Build an und setzt die Variable auf den **Pfad** dieser Datei. Genau das erwartet `app.config.ts` (`googleServicesFile: process.env.GOOGLE_SERVICES_INFO_PLIST`).
- Nach dem Hochladen die lokale Datei nicht committen (nicht in Git, nicht in den Chat).
- Liste ansehen: `eas env:list`.

**Wie EAS die Variablen einem Build zuordnet:** `eas.json` kann je Profil ein Feld `"environment": "development" | "preview" | "production"` enthalten. Ob das Feld fehlend einen sinnvollen Standard hat, weiß ich nicht sicher **[unverifiziert]**. Setze es in neuen Profilen ausdrücklich (siehe 2.5). Variablen, die in `eas.json` unter `env` stehen, und gleichnamige EAS-Variablen nicht doppelt pflegen (welche gewinnt, habe ich nicht geprüft).

Zusätzlich braucht der Build `GOOGLE_IOS_URL_SCHEME`. Ohne die Variable nimmt `app.config.ts` den Platzhalter `com.googleusercontent.apps.REPLACE_ME`: Der Build läuft, aber Google-Login auf iOS geht dann nicht.

### 2.4 Schritt für Schritt: Demo-Backend-Build für den Simulator (Mac)

Dieser Weg braucht **kein** Apple-Developer-Konto.

1. Plist und EAS-Variable wie in 2.3 (nur für `development`).
2. Simulator-Build in der Cloud erzeugen. Das bestehende Profil `development` hat `developmentClient: true` und `ios.simulator: true`:

   ```bash
   cd apps/mobile
   eas build --platform ios --profile development
   ```

3. Nach dem Build in den Simulator installieren und öffnen:

   ```bash
   eas build:run --platform ios --latest
   ```

4. Metro-Server mit Demo-Backend starten und die App damit verbinden:

   ```bash
   cd apps/mobile
   EXPO_PUBLIC_BACKEND=demo npx expo start --dev-client
   ```

   **Wichtiger Hintergrund:** `EXPO_PUBLIC_*`-Werte werden von Metro beim Bündeln des JavaScript eingebaut. Bei einem Dev Client kommt das JS vom Metro-Server auf deinem Rechner. Das Demo-Backend schaltest du also beim **Metro-Start** ein (wie oben), nicht im `eas.json` des Builds. Deshalb braucht der Simulator-Build **kein** eigenes Demo-Profil.

5. Kein Mac? Dann gibt es diesen Weg nicht, nimm Abschnitt 2.5.

- [ ] Die App startet im Simulator und zeigt Demo-Inhalte.

### 2.5 Dev Client oder TestFlight ohne Firebase-Backend (Demo-Profile)

Die Datei `apps/mobile/eas.json` habe ich **nicht geändert**. Mein Vorschlag, um ohne Konten für ein Backend ein echtes iPhone-Build zu bekommen. Die beiden Profile werden unter `build` ergänzt:

```json
{
  "build": {
    "development-device": {
      "extends": "development",
      "environment": "development",
      "ios": { "simulator": false }
    },
    "testflight-demo": {
      "extends": "base",
      "environment": "production",
      "distribution": "store",
      "autoIncrement": true,
      "env": {
        "EXPO_PUBLIC_BACKEND": "demo",
        "EXPO_PUBLIC_USE_EMULATORS": "false"
      }
    }
  }
}
```

Erläuterung:

- `development-device`: Dev Client für ein **registriertes iPhone** (internal distribution kommt von `development`). Metro-Start wie in 2.4 Schritt 4. Das iPhone und dein Rechner müssen im selben WLAN sein. Für Netze, in denen das nicht geht, gibt es `--tunnel` **[unverifiziert]**.
- `testflight-demo`: Ein eigenständiges Build (kein Dev Client) mit fest eingebautem Demo-Backend, geeignet für TestFlight. Das Build braucht keinen Metro-Server, weil das JS eingebettet ist.
- Der Release-Check `scripts/check-release.mjs` lehnt `EXPO_PUBLIC_BACKEND=demo` absichtlich ab. Das ist richtig: Dieses Profil ist **nur für interne Tests**, nie für den App Store.
- Das Profil `production` hat `channel: "production"`, `mobile/package.json` enthält aber kein `expo-updates`. OTA-Updates gibt es daher aktuell nicht, `channel` hat vermutlich keine Wirkung **[unverifiziert]**.
- Auch beim Demo-Build muss die `GoogleService-Info.plist` als EAS-Datei-Variable vorhanden sein (2.3).

Befehle:

```bash
cd apps/mobile

# Gerät registrieren (öffnet einen Link/QR, den du am iPhone öffnest; installiert ein Profil)
eas device:create

# Dev Client fürs Gerät
eas build --platform ios --profile development-device

# Demo-Build für TestFlight
eas build --platform ios --profile testflight-demo
```

### 2.6 Schritt für Schritt: TestFlight

#### Konten, Kosten, Reihenfolge

1. [x] Apple Developer Program aktiv.
2. [x] Team ID: `4GXK973R2W`.
3. [x] App-Store-Connect-App vorhanden: Bundle-ID `com.tuurapp`, SKU `42ac54`.
4. [x] Numerische Apple-ID `6817677603` ist in `apps/mobile/eas.json` unter `submit.production.ios.ascAppId` eingetragen.
5. [ ] **Zertifikate und Provisioning Profile übernimmt EAS.** Beim ersten `eas build --platform ios --profile production` fragt die CLI nach deinem Apple-Login (Apple-ID, Passwort, 2FA-Code) und erzeugt Distribution-Zertifikat und Profil. Du musst nichts in Xcode anlegen. Status prüfen mit `eas credentials`.
6. [ ] **Capabilities:** `app.config.ts` setzt `usesAppleSignIn: true` (Sign in with Apple) und `associatedDomains: ['applinks:tuur.app']`. EAS gleicht diese Capabilities beim Build mit der App-ID ab **[unverifiziert, bei Fehlern siehe Abschnitt 5]**. Push-Benachrichtigungen werden nicht gebraucht.
7. [ ] Erstes Build erzeugen und hochladen. Zwei Varianten:

   ```bash
   cd apps/mobile
   eas build --platform ios --profile production
   eas submit --platform ios --profile production --latest
   ```

   oder in einem Schritt:

   ```bash
   eas build --platform ios --profile production --auto-submit
   ```

   `autoIncrement: true` im Profil `production` erhöht die Build-Nummer automatisch (`appVersionSource: remote`). `eas submit` fragt beim ersten Mal nach Apple-Zugang, optional legt er einen App-Store-Connect-API-Key an.

8. [ ] In App Store Connect > TestFlight warten, bis das Build "Verarbeitung abgeschlossen" zeigt (meist 5 bis 30 Minuten, danach kann eine Export-Compliance-Frage erscheinen, siehe unten).
9. [ ] Tester einladen:
   - **Interne Tester** (bis zu 100, müssen Nutzer in deinem App-Store-Connect-Team sein, z. B. du selbst): Kein Beta-Review, sofort verfügbar. Für den ersten Test reicht das. Dazu unter Benutzer und Zugriff eine Person mit Rolle (z. B. "App-Verwaltung") anlegen.
   - **Externe Tester** (bis zu 10.000, per E-Mail oder öffentlichem Link): Das **erste Build jeder Version geht durch die Beta-App-Prüfung** (Dauer meist ~1 Tag **[unverifiziert]**). Du brauchst dafür: Beta-App-Beschreibung, Kontakt-E-Mail, Datenschutz-URL (`<web>/legal/privacy`), Hinweise für Prüfer und ggf. einen Demo-Zugang.
10. [ ] Auf dem iPhone: App "TestFlight" installieren, Einladung annehmen, tuur installieren.

#### Export Compliance

`ITSAppUsesNonExemptEncryption: false` ist in `app.config.ts` gesetzt (geprüft). Damit entfällt die Verschlüsselungs-Frage bei jedem Upload. Das ist nur dann korrekt, wenn die App nur Standardverschlüsselung (HTTPS/TLS der System-APIs) nutzt. Das betrifft tuur laut Code-Stand. Die rechtliche Einordnung bestätigst du selbst (ich gebe keine Rechtsberatung).

#### Hintergrund-Standort (für den Beta-Review relevant)

`UIBackgroundModes` enthält `audio` und `location`. Prüfer fragen, warum. Die Begründung steht in `docs/RELEASE.md` und passt so in die "Hinweise für Prüfer":

> Location is used only while a tour is running so the audio guide can narrate while the screen is off. The permission is requested in context with a rationale screen. Only a coarse map grid cell is sent to the server.

Dazu ein kurzes Demo-Video (Bildschirmaufnahme einer laufenden Tour bei ausgeschaltetem Bildschirm) bereithalten. Die Nutzungstexte stehen in `app.config.ts` (`NSLocationAlwaysAndWhenInUseUsageDescription`). Sie sind auf Englisch.

- [ ] Erstes TestFlight-Build auf dem iPhone installiert und gestartet.

---

## 3. Was du selbst beschaffen musst

Legende der letzten drei Spalten: **A** = Web-Demo (Pfad 1), **B** = Dev Client (Demo-Backend), **C** = TestFlight mit echtem Backend. "-" = nicht nötig, "Pflicht" = ohne geht es nicht, "empfohlen" = geht auch ohne, dann mit Einschränkung.

| Information                                                                                                                                                                                  | Wo bekomme ich sie                                                                                                                                                                      | Wohin gehört sie                                                                                                                                                                                                                                                                                                                                 | A   | B                                                                      | C                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Expo-Konto, EAS-Login                                                                                                                                                                        | https://expo.dev                                                                                                                                                                        | `eas login`                                                                                                                                                                                                                                                                                                                                      | -   | Pflicht                                                                | Pflicht                                                                                                            |
| Apple Developer Program (99 USD/Jahr), Team ID                                                                                                                                               | developer.apple.com > Mitgliedschaft                                                                                                                                                    | Apple-Login bei `eas build`/`eas submit`; Team ID `4GXK973R2W` ist in der AASA-Datei eingetragen                                                                                                                                                                                                                                                 | -   | nur echtes Gerät                                                       | eingerichtet                                                                                                       |
| App-Store-Connect-App (Bundle ID `com.tuurapp`), Apple-ID `6817677603`                                                                                                                       | App Store Connect                                                                                                                                                                       | `apps/mobile/eas.json` > `submit.production.ios.ascAppId`; Team ID `4GXK973R2W`; SKU `42ac54`                                                                                                                                                                                                                                                     | -   | -                                                                      | eingerichtet                                                                                                       |
| Firebase-Projekt (`tuur-prod`, Blaze), Region `europe-west1`                                                                                                                                  | https://console.firebase.google.com                                                                                                                                                     | `.firebaserc` (`default: tuur-prod`); iOS `com.tuurapp`, Android `app.tuur.guide`                                                                                                                                                                                                                                                                 | -   | -                                                                      | eingerichtet                                                                                                       |
| iOS-App im Firebase-Projekt (`com.tuurapp`)                                                                                                                                                   | Firebase > Projekteinstellungen > Meine Apps                                                                                                                                           | iOS Firebase-App-ID `1:261809139951:ios:c9df9603f42afbb74d2b1a`; plist lokal unter `apps/mobile/GoogleService-Info.plist`                                                                                                                                                                                                                         | -   | eingerichtet                                                           | eingerichtet                                                                                                       |
| `GoogleService-Info.plist`                                                                                                                                                                   | Firebase > Projekteinstellungen > iOS-App > herunterladen (nach Aktivieren von Google-Login neu laden)                                                                                  | EAS-Datei-Variable `GOOGLE_SERVICES_INFO_PLIST`, siehe 2.3. Lokal z. B. `GOOGLE_SERVICES_INFO_PLIST=./GoogleService-Info.plist`                                                                                                                                                                                                                  | -   | Pflicht                                                                | Pflicht                                                                                                            |
| `GOOGLE_IOS_URL_SCHEME` (= `REVERSED_CLIENT_ID` aus der plist, Form `com.googleusercontent.apps.123...`)                                                                                     | Steht in der plist unter `REVERSED_CLIENT_ID`                                                                                                                                           | EAS-Variable `GOOGLE_IOS_URL_SCHEME` (Text, Build-Zeit, `app.config.ts`)                                                                                                                                                                                                                                                                         | -   | optional                                                               | Pflicht für Google-Login                                                                                           |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`                                                                                                                                                           | Firebase > Authentication > Anmeldemethode > Google > Web-SDK-Konfiguration > Web-Client-ID                                                                                             | EAS-Variable (Text). Der Code `firebaseBackend.ts` liest sie. Sie fehlt in `.env.example` und in `check-release.mjs`, das ist eine Lücke                                                                                                                                                                                                         | -   | -                                                                      | für Google-Login                                                                                                   |
| Auth-Anbieter aktivieren: Anonym, E-Mail/Passwort, Apple, Google                                                                                                                             | Firebase > Authentication > Anmeldemethode                                                                                                                                              | Firebase-Konsole                                                                                                                                                                                                                                                                                                                                 | -   | -                                                                      | Pflicht (Anonym ist der Start-Login)                                                                               |
| App Check (App Attest bzw. DeviceCheck)                                                                                                                                                      | Firebase > App Check > App registrieren                                                                                                                                                 | Firebase-Konsole, siehe Abschnitt 4                                                                                                                                                                                                                                                                                                              | -   | -                                                                      | Pflicht, siehe Warnung                                                                                             |
| Functions-Secrets `GEMINI_API_KEY`, `ORS_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REDEMPTION_TOKEN_SECRET`                                      | Gemini: Google AI Studio. ORS: openrouteservice.org. Stripe/RevenueCat: jeweilige Dashboards. `REDEMPTION_TOKEN_SECRET`: beliebiger Zufallstext, mindestens 32 Zeichen, selbst erzeugen | `firebase functions:secrets:set NAME` (fragt den Wert verdeckt ab). Nie in den Chat, nie in Git                                                                                                                                                                                                                                                  | -   | -                                                                      | Pflicht zum Deployen (auch für Mock einen Dummy-Wert), echte Werte nur für Live-Provider                           |
| Provider-Parameter `TUUR_LLM_PROVIDER`, `TUUR_TTS_PROVIDER`, `TUUR_ROUTING_PROVIDER`, `TUUR_GEOCODING_PROVIDER`, `TUUR_POI_PROVIDER`, `TUUR_PAYMENTS_PROVIDER`, `TUUR_WEB_BASE_URL`          | Du entscheidest                                                                                                                                                                         | Firebase-Functions-Parameter. Alle haben im Code den Standard `mock` (Web-URL: `https://tuur.app`). Ohne Angabe läuft also alles auf Mock. Wie du sie sonst setzt, frag die CLI bei `firebase deploy --only functions` bzw. `firebase deploy --help` **[unverifiziert, weil der Functions-Quellordner `functions/deploy` ein Build-Ordner ist]** | -   | -                                                                      | Standard (mock) reicht                                                                                             |
| RevenueCat: Projekt, Sandbox, Produkte `tuur_credit_1`, `tuur_credit_5`, `tuur_sub_monthly`, `tuur_sub_yearly`, öffentlicher iOS-SDK-Key                                                     | RevenueCat-Dashboard > Projekt > API-Keys (öffentlicher Key, beginnt mit `appl_`) und App Store Connect > In-App-Käufe                                                                  | EAS-Variable `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (Text, öffentlich). Webhook-URL auf die Funktion `revenueCatWebhook`, Secret siehe oben                                                                                                                                                                                                            | -   | -                                                                      | nur zum Testen von Käufen. Ohne Key: Paywall/Kauf gehen nicht, Rest schon **[Laufzeitverhalten unverifiziert]**    |
| AdMob App-IDs und Werbeeinheiten                                                                                                                                                             | AdMob-Konsole                                                                                                                                                                           | `ADMOB_IOS_APP_ID` (Build-Zeit), `EXPO_PUBLIC_ADMOB_REWARDED_UNIT`, `EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT`. Ohne Werte gelten Googles Test-IDs, das ist für TestFlight in Ordnung                                                                                                                                                                 | -   | -                                                                      | nicht nötig (Test-IDs). Für den Store: echte IDs                                                                   |
| MapTiler-Schlüssel oder fertige Stil-URL                                                                                                                                                     | https://cloud.maptiler.com                                                                                                                                                              | `EXPO_PUBLIC_MAPTILER_KEY` oder `EXPO_PUBLIC_MAP_STYLE_URL` (EAS-Variable, Text). Der Schlüssel liegt im App-Bundle, in MapTiler auf deine Domains/Bundle-ID beschränken                                                                                                                                                                         | -   | empfohlen (sonst keine oder leere Karte **[Verhalten unverifiziert]**) | empfohlen                                                                                                          |
| Web-Basis-URL, Invite-Links, `apple-app-site-association`                                                                                                                                   | Öffentliche Hosting-Adresse (keine Produkt-Website erforderlich)                                                                                                                        | Die AASA-Datei enthält bereits `4GXK973R2W.com.tuurapp`; für Universal Links muss sie unter der verwendeten Domain ohne Weiterleitung ausgeliefert werden                                                                                                                                                                                        | -   | -                                                                      | optional. Ohne läuft die App, nur Einladungs-Links öffnen sie nicht. Der Build braucht die Domain nicht            |
| Betreiberdaten für Rechtstexte: `EXPO_PUBLIC_OPERATOR_NAME`, `_ADDRESS`, `_EMAIL`, `_REPRESENTATIVE`, `_PRIVACY_EMAIL`, `_SUPERVISORY_AUTHORITY` (optional `_PHONE`, `_REGISTER`, `_VAT_ID`) | Du als Betreiber (Impressumsdaten)                                                                                                                                                      | EAS-Variablen (Text, öffentlich)                                                                                                                                                                                                                                                                                                                 | -   | -                                                                      | für Tests optional (Texte zeigen dann `⟦operator data missing⟧`), für Beta-Review empfohlen, für den Store Pflicht |
| Support-Mail `EXPO_PUBLIC_SUPPORT_EMAIL`                                                                                                                                                     | Du                                                                                                                                                                                      | EAS-Variable                                                                                                                                                                                                                                                                                                                                     | -   | -                                                                      | optional (Standard `support@tuur.app`)                                                                             |

**Wo welche Variable wirkt:**

- `EXPO_PUBLIC_*`: werden vom Metro-Bundler ins JS eingebaut. Sie sind **öffentlich** (stehen lesbar in der App). Nie Geheimnisse dort.
- `GOOGLE_SERVICES_INFO_PLIST`, `GOOGLE_IOS_URL_SCHEME`, `ADMOB_*_APP_ID`: werden beim nativen Build von `app.config.ts` gelesen. Also EAS-Variablen oder `env` in `eas.json`.
- Functions-Secrets und `TUUR_*`: nur in Firebase, nie in der App.
- Setzen einer EAS-Variable als Text (Beispiel):

  ```bash
  cd apps/mobile
  eas env:create --name EXPO_PUBLIC_MAPTILER_KEY --value "<dein-key>" \
    --environment production --visibility plaintext
  ```

- Die Variablen `EXPO_PUBLIC_FIREBASE_API_KEY` und `EXPO_PUBLIC_FIREBASE_PROJECT_ID` aus `.env.example` liest der **Mobile-Code nicht** (geprüft: kein Treffer in `apps/mobile`). Die App bekommt ihr Firebase-Projekt ausschließlich aus der plist. Sie gelten nur für die Web-App.

---

## 4. Firebase für den echten Test

### 4.1 Reihenfolge

1. [ ] Firebase-Projekt anlegen. Für das Backend **Blaze-Tarif** aktivieren (Functions, Secrets, externe Aufrufe; `docs/SETUP.md`). Budget-Alarm in Google Cloud einrichten.
2. [x] iOS-App mit Bundle ID `com.tuurapp` registriert; lokale Plist aktualisiert (siehe Tabelle).
3. [ ] Authentication aktivieren: Anonym, E-Mail/Passwort, Apple, Google. Für Sign in with Apple braucht der Apple-Developer-Account zusätzlich die Capability "Sign in with Apple" an der App-ID (macht EAS beim Build, siehe Abschnitt 5) und in Firebase ist für iOS keine weitere Schlüsselkonfiguration nötig, solange man nur nativ anmeldet **[unverifiziert]**. Google-Login vor dem plist-Download aktivieren, sonst fehlt `REVERSED_CLIENT_ID`.
4. [ ] Firestore und Storage anlegen, Region passend (Functions laufen in `europe-west1`).
5. [ ] `.firebaserc` auf deine Projekt-ID setzen, dann:

   ```bash
   firebase login
   pnpm deploy:rules
   pnpm deploy:functions
   ```

   Secrets vorher setzen (`firebase functions:secrets:set ...`). Für Mock-Provider genügen beliebige Platzhalter-Werte, `REDEMPTION_TOKEN_SECRET` mit 32+ Zeichen. Fehlende Secrets können das Deployment blockieren oder verlangen eine Eingabe **[unverifiziert]**.

6. [ ] Zusätzlich für die TTL-Regeln und Indizes: `firebase deploy --only firestore:indexes`, und die IAM-Bindung für signierte Audio-URLs (`docs/SETUP.md`, Abschnitt "Storage signing"). Ohne sie liefert die App keine Audios.

### 4.2 Was Mock-Provider bedeuten (Standard ohne Konfiguration)

Belegt im Code (`functions/src/providers/*`, `functions/src/config.ts`):

- **Mock-LLM:** Baut Erzählungen aus den vorhandenen Quelltexten, erfindet nichts dazu. Sind keine Quellen da, sagt sie nur "Das ist <Name>." Die Texte wirken also dünn.
- **Mock-TTS:** liefert **stille Audiodateien** mit realistischer Länge. Du hörst also nichts, der Player läuft aber durch.
- **Mock-POI/Geocoding/Routing:** erzeugt synthetische Orte für jede Koordinate und geschätzte Laufzeiten. Gut, um den Ablauf zu testen, nicht um echte Sehenswürdigkeiten zu sehen.
- **Mock-Payments:** keine echten Stripe-Zahlungen. Betrifft vor allem Partner-Funktionen.

Für echte Sprache und Orte brauchst du `TUUR_LLM_PROVIDER=gemini`, `TUUR_TTS_PROVIDER=gemini`, `TUUR_POI_PROVIDER=live`, `TUUR_ROUTING_PROVIDER=openrouteservice`, `TUUR_GEOCODING_PROVIDER=nominatim` plus die passenden Secrets. Das kostet Geld pro Aufruf, die Kostenbremsen sind in `config/ai` (Firestore) einstellbar (siehe `docs/DECISIONS.md` D19).

### 4.3 App Check: Achtung, hier ist eine Lücke (Repo-Befund)

- `functions/src/index.ts` erzwingt App Check **fest** in Produktion (`enforceAppCheck = !isEmulator`). Es gibt keinen Schalter per Parameter. Fast alle Client-Funktionen (`ensureArea`, Narration, Tour, `spendCredit` usw.) lehnen Aufrufe ohne gültiges App-Check-Token ab.
- Im Mobile-Code gibt es **keinen Aufruf, der App Check aktiviert** (kein `initializeAppCheck` o. ä. in `apps/mobile`, geprüft per Suche). Das Plugin `@react-native-firebase/app-check` ist zwar eingebunden, ob die native Standardeinstellung ohne JS-Aufruf ein Token liefert, habe ich nicht verifiziert **[unverifiziert]**.
- **Vermutung:** Ein Test gegen die deployten Functions scheitert sehr wahrscheinlich mit "unauthenticated/failed-precondition", bis App Check im App-Code aktiviert oder in den Functions abgeschaltet wird.
- **Dein Weg:** Das ist eine Code-Änderung (z. B. App-Check-Start in `apps/mobile`, mit App Attest im Release und Debug-Provider im Test). Sag mir Bescheid, dann baue ich sie ein. Bis dahin ist der sichere Testweg das Demo-Backend bzw. der Emulator (`enforceAppCheck` ist dort aus).
- Die Durchsetzung für Firestore und Storage schaltest du getrennt in der Firebase-Konsole (App Check > APIs). Für erste Tests auf "nicht erzwingen" lassen. **Risiko:** Ohne Durchsetzung können Dritte, die deine Projekt-Daten kennen, Kontingente verbrauchen. Nach den Tests wieder erzwingen.
- Debug-Provider (nur für Tests): In der Firebase-Konsole ein Debug-Token registrieren. Nie in einem Store-Release lassen.

### 4.4 Firebase-Emulator mit Gerät/Simulator

Einzig sinnvoll mit dem Profil `emulator` (`EXPO_PUBLIC_USE_EMULATORS=true`, `EXPO_PUBLIC_EMULATOR_HOST=10.0.2.2`). Der Host `10.0.2.2` gilt für den **Android**-Emulator. Für den iOS-Simulator passt `localhost` (Standard in `config.ts`). Für ein echtes iPhone: die LAN-IP deines Rechners. Da `EXPO_PUBLIC_*` beim Metro-Start eingebaut werden, setzt du es so:

```bash
cd apps/mobile
EXPO_PUBLIC_USE_EMULATORS=true EXPO_PUBLIC_EMULATOR_HOST=<deine-LAN-IP> npx expo start --dev-client
```

Voraussetzung: `pnpm emulators` läuft (braucht Java) und die Functions sind gebaut. Dieser Weg ist am aufwendigsten, hier habe ich nichts ausgeführt **[unverifiziert]**. Er eignet sich nur für Dev Client, nicht für TestFlight.

---

## 5. Typische Fehler und Lösungen

Alle Einträge sind Erfahrungswerte bzw. aus dem Repo abgeleitet. Ich habe keinen der Fehler live reproduziert **[unverifiziert]**.

| Fehler                                                                                                                                 | Ursache                                                                                                                      | Lösung                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Path to GoogleService-Info.plist is not defined" oder "doesn't exist"                                                                 | `GOOGLE_SERVICES_INFO_PLIST` fehlt im Build oder zeigt ins Leere                                                             | Datei-Variable anlegen (2.3), im richtigen `--environment`, Profil muss dieselbe Umgebung nutzen                                                                                                                                               |
| Build bricht bei Pods ab (z. B. "The Swift pod ... does not define modules", "non-modular header", Fehler mit Firebase/MapLibre/AdMob) | `useFrameworks: 'static'` ist in `app.config.ts` gesetzt (wegen React Native Firebase) und einzelne Pods vertragen das nicht | Komplettes Log lesen (EAS > Build > "Install pods"). Häufig helfen Paket-Updates. Log an mich schicken (Fehlerabschnitt, ohne Geheimnisse). Nicht selbst `useFrameworks` entfernen, Firebase braucht es                                        |
| "No provisioning profile / Distribution certificate"                                                                                   | Erster Build, Apple-Login fehlte oder wurde abgebrochen                                                                      | `eas credentials` und `eas build` interaktiv (ohne `--non-interactive`) starten, Apple-Login und 2FA abschließen                                                                                                                               |
| Gerät kann Internal-Build nicht installieren                                                                                           | Gerät nicht im Provisioning Profile                                                                                          | `eas device:create`, dann **neu bauen** (neue Geräte erfordern ein neues Build). Entwicklermodus am iPhone aktivieren                                                                                                                          |
| Bundle-ID-Konflikt ("An App ID with Identifier 'com.tuurapp' is not available")                                                       | ID gehört schon einem anderen Apple-Team                                                                                     | Apple Developer Identifier, App-Store-Connect-Eintrag und Firebase-iOS-App müssen alle `com.tuurapp` verwenden                                                                        |
| Sign in with Apple schlägt fehl / "Capability not enabled"                                                                             | Capability fehlt an der App-ID                                                                                               | In developer.apple.com > Identifiers > `com.tuurapp` die Capability "Sign In with Apple" aktivieren, Build wiederholen (`eas credentials` zeigt/erneuert das Profil)                                                                        |
| Universal Links öffnen die App nicht                                                                                                   | Associated Domains: Capability fehlt oder AASA nicht erreichbar/falsche Team ID                                              | Capability "Associated Domains" aktivieren. Die AASA muss `4GXK973R2W.com.tuurapp` enthalten und auf der gewählten Domain ohne Weiterleitung erreichbar sein. App danach neu installieren |
| Upload abgelehnt: "The bundle version must be higher" / Build-Nummer schon vergeben                                                    | Build-Nummer doppelt                                                                                                         | Profil mit `autoIncrement: true` nutzen (hat `production`). Kommt der Fehler dennoch: `eas build:version:set` (prüfe `--help`)                                                                                                                 |
| Export-Compliance-Frage bei jedem Build                                                                                                | `ITSAppUsesNonExemptEncryption` nicht gesetzt                                                                                | In tuur gesetzt auf `false`. Erscheint die Frage trotzdem, in App Store Connect beim Build beantworten ("Standardverschlüsselung/ausgenommen")                                                                                                 |
| Beta-Review lehnt wegen Hintergrund-Standort ab                                                                                        | Begründung unklar oder Demo fehlt                                                                                            | Begründung aus Abschnitt 2.6 in die Prüfernotizen, Demo-Video, Hinweis, dass Standort nur bei laufender Tour genutzt wird. Zugleich muss der Text in `NSLocationAlwaysAndWhenInUseUsageDescription` zum Verhalten passen                       |
| Review-Hinweis: Datenschutz-URL fehlt, Impressum leer                                                                                  | `EXPO_PUBLIC_OPERATOR_*` nicht gesetzt, Web nicht veröffentlicht                                                             | Betreiberdaten setzen, Web-App mit `/legal/privacy` veröffentlichen                                                                                                                                                                            |
| App startet und zeigt sofort Fehler bei Aufrufen                                                                                       | Functions nicht deployed, App Check (Abschnitt 4.3), Region                                                                  | `health`-Funktion prüfen, Region `europe-west1`, App Check klären                                                                                                                                                                              |
| Audio stumm                                                                                                                            | Mock-TTS liefert Stille (gewollt)                                                                                            | Für Sprache `TUUR_TTS_PROVIDER=gemini` + `GEMINI_API_KEY`                                                                                                                                                                                      |
| Karte leer                                                                                                                             | Kein MapTiler-Key / Stil-URL                                                                                                 | `EXPO_PUBLIC_MAPTILER_KEY` oder `EXPO_PUBLIC_MAP_STYLE_URL` setzen                                                                                                                                                                             |
| Änderung an `EXPO_PUBLIC_*` wirkt nicht                                                                                                | Werte werden beim Bündeln eingebaut, Metro-Cache                                                                             | Metro mit `npx expo start --dev-client --clear` neu starten, bei Standalone-Builds neu bauen                                                                                                                                                   |

---

## 6. Was ich (Claude) nicht verifizieren konnte

- Keinen einzigen Cloud-Build (`eas build`), kein `eas submit`, keine Apple-/App-Store-Connect-/Firebase-Oberfläche: fehlende Konten und Zugang.
- `expo start --web` nicht gestartet (Dauerprozess). Verifiziert wurde nur `expo export --platform web` mit `EXPO_PUBLIC_BACKEND=demo`: erfolgreich.
- Ob die App mit einer **Platzhalter**-plist nativ startet.
- Genaue aktuelle Flags von `eas env:create`, `eas build:version:set`, `eas device:create`, `--auto-submit`, `environment` in `eas.json` und die Priorität zwischen `eas.json`-`env` und EAS-Variablen. Bitte mit `eas <befehl> --help` gegenprüfen. Ich habe nur die Namen nach bestem Wissen verwendet.
- Ob `eas init` mit der dynamischen `app.config.ts` die `projectId` automatisch einträgt.
- Ob EAS die Capabilities "Sign in with Apple" und "Associated Domains" automatisch mit der App-ID abgleicht.
- Ob App Check auf iOS ohne JS-Aktivierung ein Token liefert (Abschnitt 4.3).
- Laufzeitverhalten ohne RevenueCat-Key, ohne MapTiler-Key, ohne Operator-Daten.
- Fristen und Prüfzeiten bei Apple (Beta-Review, Ablauf der Builds nach 90 Tagen), Dauer der Developer-Freischaltung und D-U-N-S.
- Ob `tuur.app` dir gehört und dort die AASA-Datei ausgeliefert wird.
- Ob es für SDK 57 bereits eine passende Expo-Go-Version gäbe: irrelevant, weil Expo Go wegen der nativen Module ohnehin ausfällt.
- Die Doku von docs.expo.dev habe ich nicht abgerufen. Die Aussagen beruhen auf Repo-Fakten und meinem Wissensstand.

---

## 7. Was du mir geben musst, damit ich weiterhelfe (priorisiert)

**Nie Geheimnisse in den Chat posten** (API-Schlüssel, Passwörter, Secrets, App-Store-Connect-Keys, die plist-Inhalte als Ganzes). Secrets gehören in EAS-Variablen, Firebase-Secrets bzw. Passwortmanager, nicht in die Konversation. Öffentliche Kennungen (Bundle ID, Team ID, Projekt-ID) und Fehlermeldungen sind unkritisch.

1. [ ] **Mac ja/nein, iPhone ja/nein, iOS-Version.** Damit wähle ich den Weg (Simulator, Gerät, TestFlight).
2. [ ] **Privatperson oder Firma** beim Apple-Developer-Account, und ob er schon aktiv ist (ja/nein, Datum).
3. [ ] **Firebase-Projekt-ID** (z. B. `tuur-xyz`), Tarif (Spark/Blaze) und die Region.
4. [ ] Bestätigung, dass `GOOGLE_SERVICES_INFO_PLIST` als EAS-Datei-Variable angelegt ist (Ausgabe von `eas env:list`, ohne Werte). Die plist **nicht** posten.
5. [ ] Die **Apple-ID der App** (numerisch) aus App Store Connect und deine **Team ID**.
6. [ ] Die **Fehlermeldung aus dem EAS-Build-Log** (nur den Abschnitt der fehlgeschlagenen Phase), falls ein Build scheitert. Dazu den Link der Build-Seite (`expo.dev/...`).
7. [ ] Ob `tuur.app` dir gehört und ob die Web-App schon ausgeliefert wird.
8. [ ] Screenshots: Fehlerdialoge am iPhone, App Store Connect > TestFlight (Build-Status), Firebase > App Check (Status). Bitte ohne sichtbare Schlüssel.
9. [ ] Welche Provider du zuerst live haben willst (Gemini, ORS, RevenueCat, AdMob) oder ob Mock reicht. Bei Live: Bestätigung, dass die Secrets bereits in Firebase gesetzt sind (nur ja/nein).
10. [ ] Betreiberdaten für die Rechtstexte (Name, Adresse, Kontakt-E-Mail) nur zum Eintragen in EAS-Variablen, sobald du sie freigeben möchtest.
