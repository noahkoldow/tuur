Auftrag: KI-Audio-Stadtguide „tuur“ bauen
Du arbeitest in diesem Repository und baust eine vollständige mobile App samt Backend und Webportal: tuur, einen KI-gestützten Audio-Stadtguide, der standortbasiert echte geführte Stadtführungen imitiert und überall auf der Welt automatisch Touren erzeugt. Diese Datei ist die verbindliche Produktspezifikation.
0. Arbeitsweise (zuerst lesen, strikt befolgen)

1. Spezifikation sichern: Speichere diesen gesamten Prompt unverändert als `docs/PRODUCT_SPEC.md`. Lege eine `CLAUDE.md` im Repo-Root an. Sie enthält Projektüberblick, Stack, Befehle (dev, test, lint, emulators, deploy), Konventionen und den Hinweis, dass `docs/PRODUCT_SPEC.md` und `docs/PROGRESS.md` zu Beginn jeder Session zu lesen sind.
2. Phasenweise arbeiten: Setze die Phasen aus Abschnitt 13 in der angegebenen Reihenfolge um. Beginne eine Phase erst, wenn die vorherige ihre Akzeptanzkriterien erfüllt: Typecheck, Lint und Tests sind grün.
3. Fortschritt dokumentieren: Führe `docs/PROGRESS.md` mit dem Status jeder Phase, erledigten Aufgaben, offenen TODOs und bekannten Problemen. Aktualisiere die Datei nach jeder Phase. Eine spätere Session muss allein anhand dieser Datei nahtlos weitermachen können.
4. Entscheidungen festhalten: Triff fehlende Detailentscheidungen selbst, sinnvoll und konservativ. Dokumentiere jede davon kurz in `docs/DECISIONS.md` (Kontext, Entscheidung, Alternativen). Frag nur nach, wenn eine Entscheidung irreversibel und geschäftskritisch ist.
5. Commits: Committe kleine, logische Einheiten mit aussagekräftigen Messages (Conventional Commits).
6. Externe Dienste: API-Keys und Konten (Gemini, RevenueCat, Stripe, AdMob, Karten- und Routing-Anbieter) sind eventuell nicht vorhanden. Baue jeden externen Dienst hinter ein Interface (Provider-Pattern) und liefere einen Mock-Provider, damit alles lokal mit dem Firebase Emulator läuft. Dokumentiere alle manuellen Einrichtungsschritte in `docs/SETUP.md` (inklusive Hinweis: Firebase Blaze-Plan erforderlich). Keine Secrets im Code; nutze `.env.example` und Firebase `defineSecret`.
7. Aktuelle Modellnamen: Gemini-Modelle werden häufig ersetzt und abgeschaltet. Codiere keine Modellnamen fest, sondern lies sie aus `config/ai` (Firestore) mit Defaults in `packages/shared`. Prüfe bei der Implementierung in der offiziellen Gemini-API-Dokumentation (Models und Deprecations), welche Modelle aktuell empfohlen und nicht abgekündigt sind, und dokumentiere die Wahl in `docs/DECISIONS.md`.
8. Qualität: TypeScript strict, ESLint und Prettier, Unit-Tests für jede Kernlogik (Routing, Pacing, Scoring, Tour-Generierung, Token-Validierung, Entitlements). Code und Kommentare auf Englisch, UI-Texte über i18n.

1. Produktvision
tuur erkennt Position und Umgebung des Users und liefert eine Audio-Führung wie von einem echten Stadtführer: gesprochene Erzählungen, passende Bilder und Infotexte, eine Kartenansicht mit Route und Wegpunkten.
Es gibt keine Pilotstadt. Die App funktioniert vom ersten Tag an überall: Öffnet ein User die App an einem Ort, für den noch keine Daten existieren, erzeugt das Backend automatisch POI-Daten, Touren und Erzählungen für diese Gegend. Alle Inhalte stammen aus verifizierten Quellen und werden von Gemini zu Guide-Texten geformt (keine erfundenen Fakten), per Text-to-Speech vertont und aggressiv gecacht, damit der zweite User in derselben Gegend fast keine Kosten mehr verursacht. Touren lassen sich für die Offline-Nutzung herunterladen.
UI-Sprachen: Deutsch und Englisch, erweiterbar. Die Erzählung erfolgt in der Sprache des Users, auch wenn die Quellen in der Landessprache vorliegen.
2. Branding & Design
2.1 Assets
Die Brand-Assets liegen im Repo unter `assets/brand/` (siehe `assets/brand/README.md`):

* `logo/`: Wortmarke „tuur“ in Rot, Schwarz und Weiß (PNG transparent und SVG).
* `mark/`: Bildmarke (Herz-Pin, das „v“ aus tuur) in Rot und Weiß.
* `app/`: `icon-ios-1024.png`, `adaptive-icon-foreground.png`, `adaptive-icon-monochrome.png`, `splash-mark.png`, `notification-icon.png` und Favicons.

Verwende ausschließlich diese Dateien. Konfiguriere Icons und Splash in `app.config.ts`: iOS-Icon `icon-ios-1024.png`, Android adaptive icon mit Vordergrund `adaptive-icon-foreground.png`, Hintergrundfarbe `#ED0516` und Monochrom-Variante, Splash als rote Bildmarke auf Weiß. Im Web nutzt du die Favicons und die SVG-Logos. Fehlt der Ordner, lege Platzhalter an und vermerke das in `docs/PROGRESS.md`.
2.2 Designsprache

* Weiße App mit roten Akzenten. Weiß ist die dominante Fläche; Rot wird sparsam und gezielt eingesetzt: primäre Buttons, aktive Zustände, Route auf der Karte, aktueller Wegpunkt, Fortschrittsbalken im Player, Logo.
* Design-Tokens (in `packages/ui`, genutzt von Mobile und Web):
   * `brand.red` `#ED0516` (primär), `brand.redPressed` `#C70412`, `brand.redTint` `#FDE8EA` (Hintergründe von Chips und Hinweisen)
   * `ink.primary` `#111111`, `ink.secondary` `#5C5C5C`, `ink.tertiary` `#9A9A9A`
   * `surface.base` `#FFFFFF`, `surface.subtle` `#F6F6F6`, `border` `#E6E6E6`
   * Statusfarben (Erfolg, Warnung) klar vom Markenrot unterscheidbar, damit Rot nicht als Fehler gelesen wird; Fehlerzustände zusätzlich mit Icon und Text kennzeichnen.
* Formensprache: Das Logo ist fett, geometrisch und hat abgerundete Ecken. Übernimm das: großzügige Eckenradien (12–20 px), fette, runde Headline-Schrift (Default: „Plus Jakarta Sans“ oder vergleichbar, über `expo-font`; in DECISIONS.md festhalten), ruhige Body-Schrift.
* Karten-Marker in Herz-Pin-Form: Wegpunkte auf der Karte nutzen die Silhouette der Bildmarke (rot gefüllt mit weißer Nummer für die aktuelle Tour, grau für besuchte Punkte, rot umrandet für kommende). Partner-Marker nutzen dieselbe Form mit einem klar unterscheidbaren „Partner“-Badge.
* Kartenstil: heller, zurückhaltender Grundstil (hell-grau und weiß), damit die rote Route dominiert.
* Barrierefreiheit: Kontraste nach WCAG AA; Weiß auf `#ED0516` nur für große bzw. fette Texte und Icons einsetzen, sonst `redPressed` verwenden.
* v1 ist nur im hellen Theme; die Tokens sind so angelegt, dass ein Dark Mode später ergänzt werden kann.

3. Tech-Stack (verbindlich)
Monorepo mit pnpm workspaces und Turborepo:

```
apps/mobile      Expo (React Native, TypeScript, Expo Router, Development Build – kein Expo Go)
apps/web         Next.js (App Router) – Partnerportal, Admin, Share-Landingpages
functions/       Firebase Cloud Functions (2nd gen, TypeScript)
packages/shared  Gemeinsame Typen, Zod-Schemas, Konstanten, Pure-Logic (Scoring, Routing-Heuristik, Pacing, Tour-Generierung)
packages/ui      Design-Tokens (siehe 2.2)
assets/brand     Brand-Assets
docs/

```

* Firebase: Auth (anonymer Start → Upgrade zu Apple / Google / E-Mail; Sign in with Apple ist auf iOS Pflicht), Firestore, Cloud Storage, Cloud Functions (inklusive Cloud Tasks bzw. Task Queue Functions für Hintergrundjobs), App Check, Hosting bzw. App Hosting für `apps/web`, Emulator Suite für die lokale Entwicklung.
* KI (Text): Google Gemini API, nur serverseitig in Cloud Functions, über das offizielle Google-Gen-AI-SDK (`@google/genai`) hinter einem `LlmProvider`-Interface. Nutze strukturierte Ausgabe (JSON-Schema) für alle generierten Inhalte. Modellwahl gemäß Abschnitt 0.7: ein aktuelles Flash-Modell für Erzähltexte und Tour-Konzepte, ein Flash-Lite-Modell für Klassifikation, Kurzfassungen und Übergänge.
* KI (Sprache): `TtsProvider`-Interface. Default ist Gemini TTS (gleiche Plattform, natürliche Stimmen), Alternative Google Cloud Text-to-Speech. Pro Sprache ist eine feste Stimme als tuur-„Guide-Stimme“ konfigurierbar.
* Karte: `@maplibre/maplibre-react-native` mit OSM-basierten Vektorkacheln. Den Kachel-Anbieter konfigurierbar halten (Default: MapTiler, eigener heller tuur-Stil) und Offline-Packs über den MapLibre Offline Manager bereitstellen.
* Standort: `expo-location` und `expo-task-manager` (Hintergrund-Tracking, Geofencing).
* Audio: `react-native-track-player` (Hintergrundwiedergabe, Sperrbildschirm- und Kopfhörersteuerung, Warteschlange).
* Geo-Abfragen: Geohashes mit `geofire-common` in Firestore.
* POI-Daten: OpenStreetMap (Overpass API, Endpoint konfigurierbar, da öffentliche Instanzen Ratenlimits haben), Wikidata (SPARQL, Umkreissuche), Wikipedia (Geosearch in Landessprache sowie DE und EN). Reverse Geocoding (Stadt- und Ortsnamen) hinter einem `GeocodingProvider`-Interface.
* Bilder: Wikimedia Commons (frei lizenziert) mit Pflicht-Attribution in der UI. Keine KI-generierten Bilder von realen Orten und kein dauerhaftes Speichern von Google-Places-Fotos.
* Routing: OpenRouteService (Profile `foot-walking`, `cycling-regular`) über einen Cloud-Function-Proxy, hinter einem `RoutingProvider`-Interface.
* In-App-Käufe: RevenueCat (`react-native-purchases`) für Einzelkäufe und Abo, Webhook → Cloud Function → Entitlements in Firestore.
* B2B-Zahlungen: Stripe (Checkout, Subscriptions, Customer Portal, Webhooks) im Webportal.
* Werbung: `react-native-google-mobile-ads` inklusive Google UMP Consent (EU-Pflicht).
* i18n: `i18next` (Mobile und Web).
* Validierung: Zod-Schemas in `packages/shared` für alle Firestore-Dokumente und Function-Payloads.

4. Kernsysteme
4.1 Gebiete & automatische Datenerfassung (weltweit, on demand)

* Die Welt ist in Geohash-Kacheln eingeteilt (Präzision 6 als Standard, konfigurierbar). Jede Kachel hat ein Dokument `areas/{geohash}` mit Status `empty → ingesting → ready | failed | low_content`, Zeitstempeln und Ablaufdatum für Aktualisierungen.
* Öffnet ein User die App oder bewegt sich in eine Kachel ohne Daten, stößt die Function `ensureArea` für die aktuelle Kachel und ihre Nachbarn einen Ingest-Job an (Task Queue). Parallele Anfragen werden per Firestore-Transaktion dedupliziert (nur ein Job pro Kachel).
* Der Ingest-Job lädt POIs aus OSM, Wikidata und Wikipedia (Landessprache, DE, EN), führt Dubletten zusammen (Wikidata-ID, Name und Distanz), reichert an, klassifiziert Interessen (Regeln plus Flash-Lite für Grenzfälle) und berechnet den Score.
* Die App zeigt währenddessen „tuur erkundet diese Gegend…“ und lädt progressiv nach, sobald erste POIs verfügbar sind. Ziel: erste Inhalte in unter 30 Sekunden.
* Orte (Stadt oder Gemeinde) werden per Reverse Geocoding automatisch als `places` angelegt; Touren und Statistiken hängen daran.
* Qualitätsschwelle: Kacheln mit zu wenigen oder zu schwachen POIs erhalten den Status `low_content`. Dann bietet die App ehrlich an: „Hier gibt es wenig zu erzählen – Streifzug-Modus mit größerem Radius?“

4.2 POI-Scoring

* Jeder POI hat Kategorien, die auf Interessen abgebildet werden: `history`, `architecture`, `culinary`, `art_culture`, `nature`, `hidden_gems`, `nightlife`, `shopping`.
* Sightseeing-Score (0–100) aus Wikipedia-Existenz und Artikellänge (in allen Sprachen), Wikidata-Sitelinks, OSM-Tags (`tourism`, `historic`, `heritage`), Denkmalstatus, optionaler Admin-Gewichtung und (gedeckeltem) Partner-Boost. Der Score wird relativ zur Umgebung normalisiert, damit auch Kleinstädte sinnvolle Touren erhalten.
* POIs ohne ausreichende Quelldaten erhalten nur kurze Erzählungen oder werden ausgeblendet.

4.3 Automatische Tour-Generierung (ersetzt manuelle Kuratierung)

* Für jeden Ort mit Status `ready` erzeugt die Function `generateAutoTours` auf Anfrage (beim ersten User, nicht vorab weltweit) einen Satz Standardtouren, zum Beispiel „Highlights in 60 Minuten“, „Große Runde in 2 Stunden“ sowie Thementouren (Geschichte, Kulinarik usw.), sofern genug passende POIs existieren.
* Ablauf: Kandidaten-POIs → Orienteering-Optimierer (4.5) erstellt die Route → Gemini erhält Route und Faktenlage und liefert als JSON Tourtitel, Teaser, Beschreibung, einen erzählerischen roten Faden (Einleitung, Übergänge, Abschluss) und optional Vorschläge zur Reihenfolge. Die Vorschläge prüft der Optimierer erneut, damit die Gehzeiten plausibel bleiben.
* Validierung: Mindestanzahl an Stopps, maximale Gehstrecke zwischen Stopps, keine Doppelungen, alle Stopps sind öffentlich zugänglich (OSM-Tags `access` usw.).
* Touren werden versioniert gespeichert (`tours`, `source: "auto"`). Admins können Touren optional sperren, bearbeiten oder anpinnen (`source: "edited"`), müssen es aber nicht.
* Kostenbremse: Beim Erstellen einer Tour werden nur die Erzählungen der ersten Stopps vorgeneriert; der Rest wird während der Tour vorausschauend erzeugt. Ein vollständiger Download triggert die Generierung aller Stopps.

4.4 Narrations-Pipeline (Kosten sind kritisch!)
Cloud Function `getNarration({poiId, lang, lengthTier, primaryInterest, context})`:

1. Cache prüfen: Der Cache-Key ist `poiId + lang + lengthTier + primaryInterest + promptVersion`. Wird er gefunden, liefert die Function Text, Audio-URL und Bilder sofort.
2. Quellen sammeln: Wikipedia-Auszüge (Landessprache bevorzugt, da meist am ausführlichsten), Wikidata-Fakten (Baujahr, Architekt, Stil, Ereignisse), OSM-Tags.
3. Gemini-Aufruf mit striktem System-Prompt: nur Fakten aus den gelieferten Quellen verwenden, bei Unsicherheit weglassen, Quellen in die Zielsprache übertragen, Stil eines charismatischen lokalen Guides, gesprochene Sprache (keine Listen und Klammern), Orientierungshinweise sind erlaubt („Schauen Sie nach oben zur Fassade…“). Ausgabe als JSON: `{title, narration, paragraphs[], keyFacts[], sourcesUsed[]}`.
4. Optionales Grounding: Grounding mit Google Search bzw. Google Maps lässt sich per Feature-Flag zuschalten (Default: aus). Wenn aktiv, müssen die Anzeige-, Attributions- und Speicherbedingungen von Google eingehalten werden (Quellen direkt beim Inhalt sichtbar, Caching-Grenzen). Prüfe die aktuellen Nutzungsbedingungen und dokumentiere das Ergebnis in `docs/DECISIONS.md`. Gegroundete Inhalte werden nur so lange gecacht, wie die Bedingungen es erlauben.
5. Drei Längen-Stufen: `short` (~30 s), `medium` (~90 s), `long` (~3 min). Die Texte sind in Absätze gegliedert, damit die Wiedergabe an Absatzgrenzen sauber enden kann.
6. TTS → Audio in Cloud Storage, die Metadaten (inklusive Dauer pro Absatz) landen in `narrations`.
7. Übergangstexte zwischen Wegpunkten werden kurz und optional generiert (Flash-Lite) und ebenfalls gecacht.
8. Qualitätssicherung: Eine automatische Prüfung (Flash-Lite) gleicht jede Behauptung in `keyFacts` mit den Quellen ab und verwirft Texte mit nicht belegten Fakten. Nutzer können „Fehler melden“; gemeldete Texte werden bis zur Prüfung gesperrt oder neu generiert.
9. Schutz & Kosten: App Check, Rate Limiting pro User und pro Gebiet, globales Tagesbudget mit Not-Aus (Feature-Flag), Kosten-Logging pro Aufruf (Tokens, TTS-Zeichen, Grounding-Queries) in `usageLogs`.

4.5 Routing & Optimierung

* Geplante Route als Orienteering Problem: Start, Ziel und Zeitbudget maximieren den summierten (interessengewichteten) Score, unter Berücksichtigung von Gehzeit und Verweildauer pro POI.
* Heuristik: greedy insertion plus 2-opt-Verbesserung, deterministisch und in `packages/shared` getestet. Die tatsächlichen Wegzeiten kommen vom RoutingProvider (Matrix-API, gecacht).
* Derselbe Optimierer erzeugt die Routen der automatischen Standardtouren (4.3).

4.6 Pacing-Engine (Tempoanpassung)

* Die Fortbewegungsart wird aus der geglätteten GPS-Geschwindigkeit bestimmt (plus optionaler Aktivitätserkennung des OS): `stationary`, `walking`, `cycling`, `vehicle`.
* Die App berechnet die ETA zum nächsten POI und wählt die Längen-Stufe, deren Dauer ins Zeitfenster passt. Beim Radfahren gilt standardmäßig `short`.
* Die Erzählung startet vor der Ankunft, sodass der Höhepunkt am Ort liegt (konfigurierbarer Vorlauf).
* Nie mitten im Satz abbrechen: Kommt der nächste POI näher, endet die laufende Erzählung am nächsten Absatzende und der nächste Inhalt wird eingereiht.
* Bleibt der User stehen, bietet die App „Mehr erfahren“ an (nahtloser Anschluss an die längere Stufe).
* `vehicle` pausiert die Tour mit einem Hinweis.
* Die Logik liegt als reine, getestete Funktionen in `packages/shared`.

4.7 Karte

* Anzeigen: Route in `brand.red`, Wegpunkte als Herz-Pin-Marker (2.2), eigene Position mit Blickrichtung, besuchte und kommende Punkte, Partner-Wegpunkte klar als „Partner“ gekennzeichnet.
* Tippt man einen Wegpunkt an, öffnet sich ein Bottom Sheet mit Bildern (mit Attribution), Infotext, Audio-Start und gegebenenfalls einem Partnerangebot.

4.8 Offline

* Download pro Tour: Kartenkacheln (Tour-Bounding-Box plus Puffer), alle Narrations-Audios (alle Längen-Stufen in der gewählten Sprache), Texte und Bilder. Der Download stößt die Generierung noch fehlender Inhalte an und zeigt den Fortschritt.
* Download-Manager mit Fortschrittsanzeige, Speicherplatzanzeige und Löschen. Offline läuft die Tour vollständig ohne Netz; Käufe werden lokal gecacht und beim nächsten Online-Gang verifiziert.

5. Tour-Modi

1. Standardtour (automatisch erzeugt): Für den aktuellen Ort bietet die App die auto-generierten Touren aus 4.3 an (Titel, Dauer, Länge, Coverbild, Themen). Die Navigation führt von Punkt zu Punkt; offline nutzbar.
2. Geplante Route: Der User gibt Start, Ziel (oder Rundtour), verfügbare Zeit, Fortbewegungsart und Interessen an. Die App kuratiert die optimale Route (4.5), Gemini ergänzt einen roten Faden, und der User sieht vor dem Start eine Vorschau.
3. Weggabelung: An jedem Wegpunkt schlägt die App zwei nächste Ziele vor. Beide müssen zur verbleibenden Zeit, zur groben Richtung (Richtung Ziel, falls gesetzt), zu den Interessen passen und sich untereinander unterscheiden (zum Beispiel Kategorie oder Richtung). Die Anzeige zeigt Name, Bild, Gehzeit und einen Teaser-Satz. Der User wählt, die Route wird fortgeschrieben.
4. Streifzug: Keine feste Route. Die App erkennt die Bewegungsrichtung, sucht POIs in einem Korridor voraus (Geohash-Abfrage, Radius abhängig von der Geschwindigkeit; noch nicht erfasste Kacheln werden per `ensureArea` vorab angestoßen) und spielt passende Inhalte über die Pacing-Engine ab. Eine Dedup-Logik verhindert Wiederholungen, und die Häufigkeit ist einstellbar (viel / normal / wenig erzählen).

In allen Modi gilt: Interessen sind optional (Default: ausgewogener Mix), Sprache und Stimme sind wählbar, und Pause, Weiter, Zurück sowie „Überspringen“ funktionieren auch vom Sperrbildschirm.
6. Monetarisierung
6.1 Produkte (Stores, über RevenueCat)

* Tour-Credit (Consumable, 1,99 €): Ein Credit schaltet entweder eine Standardtour dauerhaft frei (inklusive Download) oder eine dynamische Session (geplante Route, Weggabelung, Streifzug) für 24 h an einem Ort. Die Credit-Verwaltung erfolgt serverseitig in Firestore.
* Abo (Auto-Renewable, 4,99 €/Monat, optional Jahresabo): unbegrenzte Touren und Modi, alle Downloads, werbefrei.
* Die Preise liegen in den Stores und in RevenueCat; die App zeigt lokalisierte Store-Preise an und codiert keine Preise fest.

6.2 Kostenlose Nutzung (werbefinanziert)

* Pro Ort wird die kürzeste Standardtour automatisch als `free` markiert.
* Zusätzlich schaltet ein Rewarded Ad eine Gratis-Tour frei (tägliches Limit, serverseitig geprüft).
* Interstitials erscheinen nur zwischen zwei Wegpunkten, nie während laufender Audio-Wiedergabe, mit Frequency Cap. Abonnenten sehen keine Werbung.
* Das UMP-Consent-Formular erscheint vor der ersten Ad-Anfrage.

6.3 Teilen mit Freunden

* Wer eine Tour gekauft hat, kann sie per Link an bis zu 2 Freunde weitergeben (Deep Link / Universal Link, tuur-gebrandete Landingpage in `apps/web` mit Store-Links).
* Jeder Invite-Token ist einmal einlösbar und an die Tour gebunden; die Eingeladenen erhalten eine Freischaltung für genau diese Tour. Die Validierung erfolgt serverseitig.

6.4 Entitlements

* Einzige Wahrheitsquelle ist `users/{uid}/entitlements`, geschrieben ausschließlich von Cloud Functions (RevenueCat-Webhook, Invite-Einlösung, Rewarded-Ad-Verifikation über Server-Side Verification). Die Client-Schreibrechte darauf sind per Security Rules gesperrt.

7. B2B: Partnerprogramm (weltweit)
7.1 Partner-Webportal (`apps/web`, Bereich `/partner`, im tuur-Design)

* Registrierung und Login (Firebase Auth), Firmenprofil (Name, Adresse, Kategorie, Öffnungszeiten, Bilder, Beschreibung) und Verknüpfung mit einem vorhandenen POI oder Anlage eines neuen POI (Freigabe durch Admin). Existiert für die Adresse noch kein Gebiet, wird der Ingest dafür angestoßen.
* Pakete (Preise im Admin konfigurierbar, Abrechnung über Stripe Subscriptions, Währung abhängig vom Land):
   * Sichtbarkeit: Der Partner-POI erhält einen gedeckelten Score-Boost und kann in passenden Routen, Auto-Touren und Weggabelungen vorgeschlagen werden, immer mit Label „Partner“. Ein Boost darf eine Route nie unsinnig machen (maximaler Umweg und maximaler Anteil an Partnerpunkten pro Tour sind konfigurierbar).
   * Angebot: Der Partner legt Rabatte oder Specials für tuur-User an (Titel, Beschreibung, Bedingungen, Gültigkeit, optional Limit pro Tag).
* Dashboard mit Impressionen, Besuchen (Geofence-Events, anonymisiert und aggregiert), Einlösungen und Rechnungen (Stripe Customer Portal).

7.2 QR-Einlösung (betrugssicher)

1. Der User öffnet ein Angebot in der App, und die Cloud Function `createRedemptionToken` erzeugt ein signiertes Einmal-Token (gebunden an User und Angebot, gültig 10 Minuten; Voraussetzung: der User befindet sich in der Nähe des Partners).
2. Die App zeigt den QR-Code im tuur-Design (Bildmarke in der Mitte, Countdown).
3. Der Partner scannt ihn mit dem Scanner im Partnerportal (PWA-fähige Seite, Kamera-Zugriff).
4. `redeemToken` prüft Signatur, Ablauf, Einmaligkeit und Angebotslimits, markiert das Token als eingelöst und zeigt beiden Seiten eine Bestätigung.
5. Jede Einlösung wird protokolliert (Grundlage für Statistik und eventuelle Abrechnung pro Einlösung).

7.3 Kennzeichnung
Partnerinhalte sind in App und Audio immer als Werbung bzw. Partner erkennbar (UWG-konform). Die KI-Erzählung über Partner basiert auf den Partnerangaben und wird als „Partnervorstellung“ angekündigt.
8. Admin-Bereich (`apps/web`, Bereich `/admin`, Rolle per Custom Claim)

* Gebietsübersicht auf einer Weltkarte (Status der Kacheln, Kosten pro Gebiet), Ingest manuell auslösen oder wiederholen, Gebiete sperren.
* Moderation statt Kuratierung: Auto-Touren prüfen, bearbeiten, sperren oder anpinnen; POIs ausblenden, gewichten oder mit eigenen Faktenkorrekturen als zusätzlicher Quelle versehen.
* Narrationen ansehen, neu generieren oder sperren; „Fehler melden“-Queue bearbeiten.
* Partner freigeben oder sperren, Pakete und Preise konfigurieren.
* KI-Konfiguration: Modellnamen, Prompt-Versionen, Grounding-Flags, Tages- und Gebietsbudgets, Not-Aus.
* Kosten-Dashboard (Gemini-Tokens, TTS, Grounding-Queries, Routing-Aufrufe aus `usageLogs`).

9. Datenmodell (Firestore, Startpunkt; bei Bedarf erweitern und in DECISIONS.md dokumentieren)
`areas` (Geohash-Kacheln mit Ingest-Status), `places` (Städte und Gemeinden, automatisch angelegt), `pois` (inklusive `geohash`, `interests[]`, `score`, `sources`, `imageRefs[]` mit Attribution, `partnerId?`), `tours` (`source: auto | edited`, Version, `free`-Flag), `narrations` (Cache-Key, Text, Absätze mit Dauer, `audioPath`, `promptVersion`, `grounded`-Flag mit Ablaufdatum), `users` (Profil, Interessen, Sprache) mit den Subcollections `entitlements`, `credits`, `downloads`, `sessions`, sowie `invites`, `partners`, `offers`, `redemptionTokens`, `redemptions`, `feedback`, `usageLogs`, `config` (Preise, Limits, Feature Flags, KI-Konfiguration).
Alle Schemas stehen als Zod in `packages/shared`. Die Security Rules werden mit dem Rules-Emulator getestet.
10. Datenschutz & Recht (DSGVO)

* Datensparsamkeit: Die Standortverarbeitung erfolgt primär auf dem Gerät. Der Server erhält für den Ingest nur die Geohash-Kachel, nicht die exakte Position. Keine dauerhafte Speicherung von Bewegungsprofilen; Partner-Statistiken sind nur aggregiert und anonymisiert.
* An Gemini gehen keine personenbezogenen Daten, nur Orts- und Quelldaten.
* Klare Einwilligungsflows für Standort (mit Begründungsscreen vor dem OS-Dialog, speziell für „Immer erlauben“), Werbung (UMP) und Analytics.
* Account-Löschung und Datenexport direkt in der App (Store-Pflicht).
* Kennzeichnung KI-generierter Inhalte (Hinweis im Player und in den Tourdetails).
* Platzhalterseiten für Impressum, Datenschutzerklärung und AGB (Inhalte liefert der Betreiber).
* Sicherheitshinweis beim Start: auf den Verkehr achten, Audio statt Bildschirm.

11. UX-Leitlinien (Mobile)

* Splash: rote Bildmarke auf Weiß. Onboarding: Logo → Sprache → Interessen (überspringbar) → Berechtigungen mit Erklärung → Login optional (anonym starten).
* Startscreen: Karte der Umgebung, darüber die Moduswahl, darunter die Auto-Touren des aktuellen Orts als Karten-Liste. In noch nicht erfassten Gebieten erscheint der Zustand „tuur erkundet diese Gegend…“ mit animierter Bildmarke.
* Tour-Screen: Karte oben, Player-Bottom-Sheet (Titel, Bild-Karussell, roter Fortschrittsbalken, Transkript einblendbar), große bedienbare Buttons.
* Barrierefreiheit: Screenreader-Labels, Transkript für jede Audio-Erzählung, skalierbare Schrift.

12. Nicht-Ziele (vorerst)

* Keine synchronisierte Gruppentour in Echtzeit (nur Teilen per Invite).
* Kein Nutzer-generierter Content außer Feedback.
* Keine Web-Version der Tour-App.
* Kein Dark Mode in v1.
* Keine proaktive weltweite Vorab-Generierung (alles on demand).

13. Phasen & Akzeptanzkriterien
Phase 0 – Fundament & Branding: Monorepo, Tooling (TS strict, ESLint, Prettier, Vitest/Jest), Firebase-Projektstruktur und Emulator-Konfiguration, CI-Workflow (GitHub Actions: lint, typecheck, test), `CLAUDE.md`, `docs/*`, Design-Tokens in `packages/ui`, Icons und Splash aus `assets/brand` eingebunden. Akzeptanz: `pnpm dev` startet die Emulatoren, das Web und den Expo Dev Server; App und Web zeigen das tuur-Branding; CI ist grün.
Phase 1 – Gebiete & POI-Engine: Geohash-Kachelsystem, `ensureArea` mit Deduplizierung, Ingest-Job (OSM, Wikidata, Wikipedia mehrsprachig), Dubletten-Merge, Interessen-Klassifikation, relatives Scoring, Reverse Geocoding. Testfixtures für mehrere unterschiedliche Regionen (Großstadt, Kleinstadt, ländlich, nicht-deutschsprachiges Land). Akzeptanz: Eine Umkreisabfrage an einer beliebigen Koordinate liefert nach dem Ingest angereicherte POIs; parallele Anfragen erzeugen nur einen Job; `low_content` greift korrekt.
Phase 2 – Narrations-Pipeline: Gemini-Provider (echt und Mock), TTS-Provider, Cache, drei Längen-Stufen, Absatz-Timings, Faktenprüfung, optionales Grounding hinter Feature-Flag, Usage-Logging, Rate Limiting, Budget und Not-Aus. Akzeptanz: Der zweite Aufruf mit identischem Key trifft den Cache (Test); nicht belegte Fakten werden verworfen (Test mit Mock); der Mock-Modus läuft ohne Keys.
Phase 3 – Auto-Touren & Routing: Routing-Provider, Orienteering-Heuristik, `generateAutoTours` mit Gemini-Rotem-Faden und Validierung. Akzeptanz: Für die Testfixtures entstehen plausible Touren (Zeitbudget eingehalten, keine Doppelungen, Tests grün).
Phase 4 – App-Kern & Standardtour: Expo-App mit Navigation, Onboarding, Karte im tuur-Stil mit Herz-Pin-Markern, Standort im Vordergrund und Hintergrund, Ingest-Ladezustand, Audio-Player mit Sperrbildschirm-Steuerung, Standardtour Ende-zu-Ende. Akzeptanz: Eine Tour lässt sich im Simulator an einer beliebigen Koordinate mit simulierter GPS-Route komplett durchlaufen.
Phase 5 – Geplante Route: Planungs-UI mit Vorschau, Anbindung an Optimierer und Gemini. Akzeptanz: Das Zeitbudget wird eingehalten (Tests), die Route wird auf der Karte angezeigt.
Phase 6 – Pacing-Engine: Bewegungserkennung, Längenwahl, Vorlauf, Abbruch nur an Absatzgrenzen, „Mehr erfahren“. Akzeptanz: Unit-Tests für Gehen, Radfahren, Stehen und Fahrzeug; Simulation mit verschiedenen Geschwindigkeiten.
Phase 7 – Weggabelung & Streifzug: Auswahllogik für zwei Optionen, Korridor-Suche voraus mit vorausschauendem Ingest, Dedup, Häufigkeitsregler. Akzeptanz: Tests zur Optionsauswahl (Zeit, Richtung, Diversität); simulierter Streifzug über Kachelgrenzen hinweg spielt passende POIs ab.
Phase 8 – Offline: Download-Manager (Kacheln, Audio, Bilder, Texte, Nachgenerierung fehlender Inhalte), Offline-Wiedergabe, Speicherverwaltung. Akzeptanz: Eine heruntergeladene Tour läuft im Flugmodus vollständig.
Phase 9 – Monetarisierung: RevenueCat (Credit und Abo), Webhook-Verarbeitung, Entitlement-Prüfung, Paywall im tuur-Design, AdMob mit UMP, Rewarded-Freischaltung (SSV), Frequency Caps, Invite-System (maximal 2, Einmal-Tokens, Deep Links und Landingpage). Akzeptanz: Die Entitlement-Logik ist getestet; Clients können Entitlements laut Rules-Tests nicht selbst setzen.
Phase 10 – B2B: Partnerportal, Stripe-Abos und Webhooks, Angebotsverwaltung, gedeckelter Partner-Boost in Routing, Auto-Touren und Weggabelung, Partner-Kennzeichnung, QR-Token-Flow mit Scanner, Partner-Statistiken. Akzeptanz: Tests für Token-Ablauf, Einmaligkeit, Limits und Näheprüfung; Boost-Deckel ist getestet.
Phase 11 – Admin: Alle Funktionen aus Abschnitt 8. Akzeptanz: Gebiete, Auto-Touren und Narrationen lassen sich über die Admin-UI überwachen und moderieren; das Kosten-Dashboard zeigt echte `usageLogs`.
Phase 12 – Feinschliff & Release-Vorbereitung: Vollständige i18n (DE/EN), DSGVO-Flows (Löschung, Export), KI-Kennzeichnung, Barrierefreiheit, Crashlytics oder Sentry, EAS-Build-Konfiguration, Store-Checkliste in `docs/RELEASE.md` (Hintergrund-Standort-Begründungen, Datenschutzangaben, IAP-Produkte, Store-Grafiken aus `assets/brand`). Akzeptanz: Die Checkliste ist vollständig, alle Tests sind grün, und `docs/PROGRESS.md` ist aktuell.
Beginne jetzt mit Phase 0. Arbeite danach so viele Phasen wie möglich vollständig ab und halte `docs/PROGRESS.md` stets aktuell, damit eine Folgesession nahtlos übernehmen kann.
