# tuur – Marketingplan (vor, bei und nach dem Release)

> Stand: 2026-09-30. Sprache: Deutsch, du-Form. Zielgruppe dieses Dokuments: der Gründer (Einzelperson oder Kleinstteam, keine Marketing-Vorerfahrung, kleines Budget).
> Grundlage: `docs/PRODUCT_SPEC.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/RELEASE.md`, `docs/TESTING_IOS.md`, `packages/shared/src/legal/terms.ts`, `apps/mobile/src/i18n/de.ts`, `apps/mobile/app/onboarding`, `assets/brand`.
>
> **Wie du dieses Dokument benutzt:** Arbeite die Schritte von oben nach unten ab, hake Checkboxen ab, trage Zahlen in die Ausfüllfelder ein. Alle Zahlen sind **Schätzungen oder Hypothesen** (so markiert), keine Marktdaten. Alles mit **„vor Nutzung prüfen"** ist ein Fakt (Preis, Limit, Regel), den ich nicht belegen konnte und den du an der genannten Stelle nachschlägst. Dieses Dokument ist keine Rechtsberatung.

---

## Inhaltsverzeichnis

- [0. Kurzfassung und Annahmen](#0-kurzfassung-und-annahmen)
- [1. Fundament (T-12 bis T-8 Wochen)](#1-fundament-t-12-bis-t-8-wochen)
- [2. KI-gestützter Marketing-Werkzeugkasten](#2-ki-gestützter-marketing-werkzeugkasten)
- [3. Vor dem Release (T-8 bis T0)](#3-vor-dem-release-t-8-bis-t0)
- [4. Release-Woche (T-7 bis T+7)](#4-release-woche-t-7-bis-t7)
- [5. Nach dem Release (T+1 Woche bis T+12 Monate)](#5-nach-dem-release-t1-woche-bis-t12-monate)
- [6. Kalender und Kennzahlen](#6-kalender-und-kennzahlen)
- [7. Rechtliche und ethische Leitplanken](#7-rechtliche-und-ethische-leitplanken-für-marketing)
- [8. Sofort-Aufgaben und Entwicklungs-Backlog](#8-was-du-sofort-tun-kannst-und-was-entwicklung-ergänzen-sollte)
- [9. Anhang: Vorlagen und KI-Prompt-Bibliothek](#9-anhang-vorlagen-und-ki-prompt-bibliothek)

---

## 0. Kurzfassung und Annahmen

### 0.1 Die Strategie in 10 Sätzen

1. tuur ist ein KI-Audio-Stadtguide für Fußgänger und Radfahrer mit dem Versprechen „Lauf los, tuur erzählt dir, was du gerade siehst"; der Kern-Beweis ist die **erste Tour pro Ort gratis**, also ist jeder Marketing-Kontakt ein Ein-Klick-Test ohne Kaufhürde.
2. Weil jede neue Region KI-Kosten verursacht (Ingest, Erzählungen, TTS) und die Qualität je nach Datenlage variiert, **bündeln wir Marketing hart auf 2 bis 3 vorgewärmte Städte** statt „weltweit" zu werben; die App bleibt weltweit nutzbar, das Marketing nicht.
3. Vor jeder Kampagne wird eine Stadt **vorgewärmt und von dir per Hand durchgehört** (Gebiete ingesten, Touren prüfen, Free-Tour ist die beste, Budgetdeckel setzen); nur geprüfte Touren werden beworben.
4. Die stärkste Marketing-Ressource ist das Produkt selbst: **echte tuur-Erzählungen** (Text/Audio) werden als „Tour des Tages", Kurzvideos und Stadtseiten (SEO) wiederverwendet, immer als KI-generiert gekennzeichnet.
5. Kanäle nach Aufwand/Wirkung: **Kurzvideo (TikTok/Reels/Shorts) + ASO (Store-Suche) + lokale Partner/Tourismus + kleine Reise-Creator**; bezahlte Anzeigen erst, wenn organische Signale stimmen.
6. Messen ohne DSGVO-Bruch: App-Store-Connect-Analytics, Play Console, cookielose Web-Analytics, UTM/Custom-Product-Pages, Invite-Einlösungen und Partnerstatistiken; App-Analytics bleibt opt-in.
7. Wachstum kommt aus sechs Schleifen: Content, SEO-Stadtseiten, Einladungen, Partner (QR-Aufsteller/Sticker), Creator/Community, Saison/Events.
8. B2B ist ein eigener, langsamer Kanal: Partner werden **persönlich** angesprochen (vor Ort, Telefon, LinkedIn, Verbandskanäle), nicht per Kaltmail (UWG-Risiko); Pilot-Partner liefern Statistik-Fallstudien.
9. KI im Marketing läuft mit **30 bis 60 € Tool-Budget pro Monat**: günstige Modelle für Masse, starkes Modell nur für Strategie und Feinschliff, **immer mit Menschen-Freigabe**, keine erfundenen Bewertungen/Zitate, keine Personendaten in Prompts.
10. Jede Woche zählst du dieselben 6 Zahlen; **Entscheidungsregeln** („wenn X < Y nach 4 Wochen, dann Z") verhindern, dass du Geld in Kanäle steckst, die nicht funktionieren.

### 0.2 Budgetrahmen in drei Stufen (6 Monate, ohne Store-Gebühren und ohne Entwicklungszeit)

Alle Beträge sind **Schätzungen**. Unvermeidbare Fixkosten (Apple Developer Program ca. 99 USD/Jahr, Google Play Konsole einmalig ca. 25 USD, Domain, Anwalt für die Rechtstexte laut `docs/RELEASE.md`) sind **nicht** enthalten – vor Nutzung prüfen (developer.apple.com/programs, play.google.com/console).

| Stufe | Budget (6 Monate) | Was du bekommst | Was du NICHT bekommst |
|---|---|---|---|
| **A: 0 €** | 0 € (nur deine Zeit, ca. 10–15 h/Woche) | Selbstgehostete/kostenlose Analytics, Kurzvideos mit kostenlosen Tools, ASO per Hand, Reddit/Community ohne Spam, TestFlight-Beta mit 50 Testern, Partner-Ansprache vor Ort, Pressemails, Waitlist mit kostenlosem Mail-Tier, kostenlose KI-Tiers | Ads, Creator-Honorare, Druckmaterial, ASO-Tools, bezahlte Newsletter-Kapazität, KI-Komfort (Limits der Gratis-Tarife) |
| **B: ca. 500 €** | ca. 80 €/Monat verteilt: KI-/Tool-Budget 30–40 €/Monat, Druck (Sticker/Aufsteller, ca. 100–150 € einmalig), 2–5 Micro-Creator mit Gratis-Guthaben + kleiner Pauschale/Revenue-Share, Domain-E-Mail, ggf. Newsletter-Tool | Alles aus A plus: professionellere Videos/Grafiken, 20 Partner-Aufsteller, erste Creator-Videos, Presse-/Partner-Material gedruckt, zwei kleine Apple-Ads-Tests | Skalierbare Paid-Kampagnen, ASO-Profi-Tools dauerhaft |
| **C: ca. 3.000 €** | ca. 500 €/Monat: Tools 60 €/Monat, Creator-Budget ca. 1.000 €, Apple Ads/Meta/TikTok-Tests ca. 1.000 €, Druck/Events ca. 300 €, Freelancer-Feinschliff (Video/Grafik) ca. 340 € | Alles aus B plus: 10–15 Creator-Kooperationen, 4–6 Wochen Paid-Tests mit sauberem Messplan, Freelancer-Schnitt der besten Videos, Präsenz bei 1–2 lokalen Events | Garantierte Reichweite. Bezahlt wird für Tests, nicht für Ergebnisse |

**Ehrlicher Hinweis:** Die Beispielrechnung in Abschnitt 5.6 legt nahe, dass Paid-Installs bei einem 1,99-€-Einzelkauf-Modell **schwer profitabel** sind. Stufe C ist daher ein Lernbudget, kein Wachstumsmotor.

### 0.3 Annahmen (du fragst nicht zurück, ich habe entschieden)

Jede Annahme ist markiert **[A-n]**. Wenn sie bei dir nicht stimmt, ersetzt du sie wie angegeben.

| Nr. | Annahme | So ersetzt du sie |
|---|---|---|
| A-1 | Du sitzt in Deutschland, DACH ist Fokusmarkt, Deutsch + Englisch (die zwei Sprachen der App). | Anderes Land: Abschnitt 7 (Recht) und Launch-Städte-Matrix (3.9) mit lokalen Städten neu ausfüllen. |
| A-2 | Das Produkt entspricht dem Stand in `docs/PROGRESS.md` (Phasen 0–12 „done"), aber **es gibt keinen Beleg für einen Lauf auf echten Geräten/Stores**. Marketing-Termin T0 wird erst festgesetzt, wenn `docs/RELEASE.md` Abschnitte 1–5 abgehakt sind. | Wenn Release früher/später: alle Wochenangaben relativ zu T0 verschieben. |
| A-3 | Heimatstadt = `<HEIMATSTADT>` (dein Wohnort). Du kannst sie vor Ort testen, bewerben und Partner persönlich besuchen. | Trage deine Stadt in Matrix 3.9 ein. |
| A-4 | Web-Domain ist `tuur.app` (steht in `apps/mobile/app.config.ts` unter `associatedDomains`). | Andere Domain: alle Links/UTM-Beispiele ersetzen. |
| A-5 | Preise: Einzeltour/Credit 1,99 €, Abo 4,99 €/Monat (Spezifikation 6.1; die App zeigt lokalisierte Store-Preise, nichts ist fest im Code). | Endpreise stehen in App Store Connect/Play Console/RevenueCat; rechne Abschnitt 5.6 neu. |
| A-6 | Es existiert **kein** Produkt-Analytics-SDK; nur Crashlytics (opt-in). Kein Push, kein In-App-Review-Prompt, keine Warteliste, keine SEO-Stadtseiten, keine Store-Buttons auf der Landingpage (Stand des Repos: `apps/web/app/page.tsx`). | Wenn Entwicklung etwas ergänzt: Abschnitt 8.2 abhaken und Messplan (1.5) anpassen. |
| A-7 | Kosten pro generierter Erzählung/Kachel sind dir noch nicht bekannt. Du liest sie im Admin-Kosten-Dashboard (`usageLogs`, siehe PROGRESS Phase 11). | Trage sie in die Unit-Economics-Tabelle (5.6) ein. |
| A-8 | Du hast weniger als 15 h/Woche Zeit. Deshalb sind Aufgaben nach Zeit geschätzt und priorisiert. | Mehr Zeit: Creator-/Partnerblöcke früher starten. |
| A-9 | Store-Provision: 15 % (Small Business Program bzw. Play-Reduktion) oder 30 % – vor Nutzung prüfen (developer.apple.com/app-store/small-business-program, support.google.com/googleplay/android-developer). | Wert als Variable `f` in 5.6. |
| A-10 | Du bist Kleinunternehmer oder Gewerbetreibender; Umsatzsteuer-/Rechtsform-Fragen klärst du mit Steuerberatung. | – |
| A-11 | Erzählsprachen sind aktuell **nur Deutsch und Englisch** (Allowlist `NARRATION_LANGS`, D35). fr/es/it sind Zukunft, nicht bewerben, bevor sie existieren. | – |
| A-12 | Wir bewerben **keine** Funktion, die es nicht gibt (kein Dark Mode, keine Gruppentour in Echtzeit, keine Web-Tour-App, kein User-Content). | – |

### 0.4 Was tuur wirklich kann (Produktfakten für alle Texte)

Nutze diese Liste als **Faktencheck** für jeden Text und jedes Video. Nichts darüber hinaus behaupten.

- KI-Audio-Stadtguide für **Fußgänger und Radfahrer**; UI Deutsch/Englisch; Erzählung in der Sprache des Users.
- **Vier Modi:** Standardtour (fertige, automatisch erzeugte Touren), Route planen (Zeit, Ziel/Rundtour, zu Fuß oder Rad, Interessen), Weggabelung (an jedem Wegpunkt zwei Vorschläge), Streifzug (einfach losgehen, tuur erkennt Richtung und erzählt).
- **Interessen (optional):** Geschichte, Architektur, Kulinarik, Kunst & Kultur, Natur, Geheimtipps, Nachtleben, Shopping.
- Tempo-Anpassung (Pacing): Beim Radfahren kurze Erzählungen; „Mehr erfahren" bei Stillstand; Pause bei Fahrzeug-Geschwindigkeit; Erzählung endet nie mitten im Satz.
- **Erzählungen sind KI-generiert** (Gemini) aus **Wikipedia, Wikidata, OpenStreetMap**, automatisch faktengeprüft, als KI gekennzeichnet, mit „Fehler melden". Bilder aus Wikimedia Commons mit Attribution. Transkript zu jeder Erzählung.
- **Offline-Downloads** pro Tour (Karte, Audio, Bilder, Texte).
- **Erste (kürzeste) Standardtour pro Ort gratis**; weitere Touren per **Tour-Guthaben (1,99 €)**: Standardtour dauerhaft **oder** 24-h-Session für einen dynamischen Modus an einem Ort; **Abo** (alle Touren, werbefrei); **belohnte Werbung** (tägliches Limit, nur Standardtouren); **Einladungslinks** (gekaufte Standardtour 2x verschenken).
- **Datenschutz:** Position wird auf dem Gerät verarbeitet; für die Inhalte geht nur ein **grobes Kartenquadrat (Geohash)** an den Server; einmalige Position nur bei Routenplanung und Angebots-Einlösung. Analytics und Crashberichte sind **aus, bis du zustimmst**; Werbung erst nach Einwilligung (UMP).
- **Partnerprogramm:** lokale Betriebe (Stripe-Abos „Sichtbarkeit"/„Angebote"), QR-Einlösung, Partnerportal mit Statistiken, Kennzeichnung „Anzeige · Partner"; Partnerstationen erscheinen mit Sichtbarkeits-Bonus, aber gedeckelt.
- **Barrierefreiheit:** Screenreader-Labels, Transkripte, skalierbare Schrift, Reduce-Motion, 44-pt-Ziele.
- Weltweit nutzbar, Inhalte entstehen **bei erster Nutzung** im Gebiet (Kaltstart dauert, Qualität variiert; dünne Gebiete bekommen ehrlich „Hier gibt es wenig zu erzählen").

**Was du NICHT sagen darfst** (weil falsch oder riskant, teils von den internen Rechts-Reviews bereits beanstandet):

| Nicht sagen | Warum | Sagen stattdessen |
|---|---|---|
| „Dein Standort verlässt nie dein Handy" | Falsch: Kartenquadrat, einmalige Position bei Planung/Einlösung | „Deine Position wird auf dem Gerät verarbeitet. Für die Inhalte geht nur ein grobes Kartenquadrat an unsere Server." |
| „Tracking-frei / keine Werbe-IDs" | In der kostenlosen Nutzung läuft AdMob nach Einwilligung | „Analytics und Crashberichte sind aus, bis du zustimmst. Werbung nur mit deiner Einwilligung." |
| „Alle Fakten 100 % korrekt" | KI kann irren, Prüfung minimiert nur | „Aus Quellen wie Wikipedia und OpenStreetMap, automatisch geprüft, als KI gekennzeichnet. Fehler kannst du melden." |
| „Unabhängige Empfehlungen" (ohne Einschränkung) | Partner zahlen für Sichtbarkeit | „Partnerstationen sind als ‚Anzeige · Partner' gekennzeichnet." |
| „Funktioniert überall perfekt" | Datenlage variiert | „Funktioniert weltweit, am besten in großen Städten/Touristenorten mit viel Wikipedia-Material." |
| „Von echten Stadtführern gesprochen" | Synthetische KI-Stimme | „Eine KI-Stimme erzählt dir …" |
| „Kostenlos" ohne Zusatz | Nur erste Tour pro Ort + Werbung | „Erste Tour pro Ort gratis." |

---

## 1. Fundament (T-12 bis T-8 Wochen)

Ziel dieser vier Wochen: Du weißt, **für wen**, **gegen wen**, **mit welcher Stimme** und **an welchen Zahlen** du misst. Kein Content, keine Ads, bevor das steht.

### 1.1 Positionierung

**Schritt 1.1.1 – Positionierungssatz festlegen (T-12 W)**

- [ ] **Ziel:** Ein Satz, den jeder Kanal, jeder Store-Text und jede Partner-Mail wiederverwenden.
- **Exakte Handlung:** Fülle die Schablone: „tuur ist der KI-Audio-Stadtguide für **[Zielgruppe]**, der **[Nutzen]**, ohne **[Schmerz]**." Beispiel (Vorschlag, teste ihn): *„tuur ist der Audio-Stadtguide für alle, die zu Fuß oder per Rad unterwegs sind: Lauf los, und tuur erzählt dir die Geschichten zu dem, was du gerade siehst – ohne Guidebook, ohne Buchung, ohne feste Uhrzeit."* Kurzform (Claim, 8 Wörter): *„Lauf los. tuur erzählt dir deine Stadt."* App-Store-Tagline steht schon in der App: „Dein KI-Audio-Stadtguide".
- **Werkzeug:** Notiz-App, 3 Freunde zum Gegenlesen.
- **Zeit:** 2 h. **Kosten:** 0 €.
- **Erfolgsmetrik:** 5 von 5 fremden Personen können nach dem Lesen in eigenen Worten sagen, was tuur tut (5-Sekunden-Test).
- **Fehler vermeiden:** Mehrere Nutzenversprechen mischen („Guide, Planer, Community, Audio, Karte …"). Ein Nutzen: **Geschichten zu deinem Ort, im Ohr, unterwegs.**

**Schritt 1.1.2 – Vier Endnutzer-Personas + eine B2B-Persona (T-12 W)**

- [ ] **Ziel:** Für jede Persona ein konkreter **Trigger-Moment** (wann sucht sie im Store / schaut ein Video?), damit Inhalte und Kanäle darauf zielen.
- **Exakte Handlung:** Übernimm die Steckbriefe, ersetze Fantasiewerte durch Gesprächsergebnisse aus 5 echten Interviews (Schritt 1.1.3). Die Personen sind Arbeitshypothesen, keine Marktdaten.
- **Werkzeug:** Tabelle unten, Notion/Papier.
- **Zeit:** 3 h. **Kosten:** 0 €. **Erfolgsmetrik:** je Persona mindestens 1 echter Interviewpartner bestätigt oder widerlegt den Trigger.
- **Fehler vermeiden:** Personas mit Fantasie-Statistiken („68 % der Reisenden …") auffüllen. Keine erfundenen Marktdaten.

| Persona | Beschreibung (Hypothese) | Trigger-Momente | Wichtigste Botschaft | Kanäle | Passender Modus |
|---|---|---|---|---|---|
| **1. Städtereisende (Sophie, 28–45)** | Kurztrip in eine Stadt, will mehr als Sehenswürdigkeiten abhaken, keine Lust auf Gruppen-Tour zu festen Zeiten | 1–2 Wochen vor der Reise: sucht „Audioguide <Stadt>", „Stadtführung Alternative"; **im Zug/Flieger** beim Herunterladen von Offline-Inhalten; am ersten Morgen im Hotel | „Deine eigene Stadtführung, wann du willst. Erste Tour gratis." | ASO, Pinterest, Reels/Shorts, SEO-Stadtseiten, Reddit r/travel-Antworten | Standardtour, Offline-Download |
| **2. Radtouristen (Jonas, 30–60)** | Radreise oder Tagestour, Ohren frei für Verkehr, Kopfhörer eher einseitig oder Lautsprecher | Saisonbeginn (Frühjahr); Planung von Radweg-Etappen; Regenpause im Ort | „Kurze Geschichten am Wegesrand, die zu deinem Tempo passen." | Rad-Communities/Foren, Instagram, Radverleih/Hostels als Partner | Streifzug, Weggabelung |
| **3. Einheimische „Entdecke deine eigene Stadt" (Lena, 25–50)** | Wohnt seit Jahren in der Stadt, kennt nur ihre Ecke | Besuch von Freunden/Familie; Sonntagsspaziergang; neuer Kiez; Museumsnacht | „Du wohnst hier – kennst du die Geschichte hinter deiner Straße?" | lokale Instagram-Accounts, Stadtblogs, r/<Stadt>, Lokalpresse, Partner-Cafés | Streifzug, Route planen |
| **4. Museums-/Geschichtsfans (Markus, 35–70)** | Liest Wikipedia, mag Tiefe, prüft Fakten | Vor/nach einem Museumsbesuch; Jubiläen, Denkmaltag; sucht „Geschichte von <Ort>" | „Erzählungen mit Quellen (Wikipedia/OSM), Transkript zum Nachlesen, Fehler melden." | SEO, Geschichtsforen, Podcasts-Communities, Lokalgeschichte-Vereine | Standardtour Geschichte, lange Erzählstufe |
| **B2B: Partner-Betrieb (Aylin, Café-/Fahrradverleih-/Hostel-/Museumsshop-Inhaberin)** | Kleiner Betrieb, wenig Zeit, will Laufkundschaft | Saisonstart, leere Nachmittage, Konkurrenz durch Ketten, Suche nach günstigem lokalem Marketing | „Wer an deinem Laden vorbeigeht, hört von dir – gekennzeichnet als Partner, mit einlösbarem Angebot und Statistik." | Vor-Ort-Besuch, Verbandskanäle, LinkedIn, Empfehlung | Partnerportal |

**Schritt 1.1.3 – Fünf echte Interviews (T-12 bis T-10 W)**

- [ ] **Ziel:** Annahmen mit Realität abgleichen (synthetische Personas ersetzen niemals echte Gespräche).
- **Handlung:** 5 Personen (1 pro Persona, plus 1 Partnerbetrieb) je 20 Min. Fragen: „Wie hast du deine letzte Stadt erkundet?", „Welche Tools hast du benutzt?", „Was hat genervt?", „Würdest du für eine zweite Tour zahlen? Warum (nicht)?" Dann 3 Min. Demo (Screenshot-Video), Reaktion notieren. Kein Bezahl-Versprechen, keine Suggestivfragen. Einwilligung zur Notiz einholen, Notizen ohne Klarnamen ablegen.
- **Werkzeug:** Telefon/Video, Notizvorlage aus Abschnitt 9.9 (Interview-Leitfaden). **Zeit:** 6 h. **Kosten:** 0–50 € (Kaffee als Dankeschön; kein Bewertungs-Deal).
- **Erfolgsmetrik:** Mindestens 3 wiederkehrende Aussagen (Muster), 1 neue Erkenntnis, die du nicht erwartet hast.
- **Fehler vermeiden:** Nur Freunde fragen, die dir gefallen wollen. Frag mindestens 2 Fremde (Reddit-Anfrage, Hostel, Tourist-Info).

### 1.2 Wettbewerbsanalyse (Anleitung, keine erfundenen Fakten)

**Schritt 1.2.1 – Konkurrenten recherchieren (T-11 W)**

- [ ] **Ziel:** Du weißt, wo tuur sich unterscheidet und wo nicht; du kennst die Sprache der Kategorie (Keywords).
- **Handlung:** (1) Suche in App Store und Play Store (DE und EN) die Suchbegriffe unten, notiere die ersten 10 Treffer je Begriff. (2) Lade 5 Apps, mache pro App eine Erst-Nutzungs-Session (Onboarding, Preis, erste Erzählung). (3) Fülle die Tabelle. (4) Lies die **neuesten 1-Stern- und 5-Sterne-Bewertungen** jeder App, kopiere 10 wiederkehrende Aussagen (ohne Namen) in eine Liste „Was Nutzer lieben/hassen". (5) Schreibe 3 Lücken auf, die tuur füllen kann.
- **Suchbegriffe (Store, Google, YouTube, TikTok):** `audioguide`, `audio guide <Stadt>`, `stadtführung app`, `stadtführung audio`, `city audio tour app`, `self guided walking tour app`, `walking tour app`, `free walking tour`, `sightseeing app`, `reiseführer app`, `radtour app`, `bike tour audio guide`, `rick steves audio europe`, `voicemap`, `komoot`, `google maps guides`, `ki reiseplaner`, `ai travel planner`, `tripadvisor audio`, `izi.travel`, `wikitude`-artige AR-Guides, `geführte tour offline`.
- **Kategorien und Beispiele zum Recherchieren (ohne Fakten von mir):** Audio-Guides (Rick Steves Audio Europe, VoiceMap, izi.TRAVEL), GPS-/Routen-Apps (Komoot), Karten-Apps (Google Maps mit Guides-/Listenfunktion), KI-Reiseplaner (Suche in Stores), Free-Walking-Tour-Anbieter vor Ort, klassische Reiseführer-Apps, Museums-Apps. Prüfe selbst: Preise, Bewertungszahlen, Sprachen, Offline, Städteabdeckung, Nutzungsmodell.
- **Werkzeug:** Store-Suche, YouTube, Google, Tabelle. **Zeit:** 6–8 h. **Kosten:** 0 € (evtl. Käufe zum Testen: ca. 0–20 €).
- **Erfolgsmetrik:** Ausgefüllte Tabelle für 8+ Konkurrenten, 3 klar formulierte Differenzierungs-Sätze.
- **Fehler vermeiden:** Zahlen (Downloads, Umsätze, Marktanteile) aus dubiosen Blogs übernehmen. Nur beobachten, was du selbst siehst (Preis, Features, Bewertungstext).

**Ausfüllfeld: Wettbewerbstabelle** (leer lassen, selbst füllen, Stand-Datum notieren)

| App/Anbieter | Typ (Audio/GPS/KI-Planer/Tour-Anbieter) | Preismodell (selbst prüfen) | Städte/Abdeckung | Sprachen | Offline? | Live-Position/automatisch? | Menschliche oder KI-Stimme? | Bewertungssnitt (Stand: __) | Stärke (Nutzerzitat-Muster, nicht wörtlich) | Schwäche | Was macht tuur anders? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1. | | | | | | | | | | | |
| 2. | | | | | | | | | | | |
| … | | | | | | | | | | | |

**Vergleichshypothese zum Prüfen:** tuur = automatische, standortbasierte Erzählung **überall** (nicht nur in kuratierten Städten) + Tempoanpassung für Rad + Weggabelung/Streifzug + Datenschutz-Argument + Erste-Tour-gratis. Wenn ein Konkurrent das schon genauso tut, ändere deinen Claim.

### 1.3 Markenstimme

**Schritt 1.3.1 – Markenstimme festlegen (T-11 W)**

- [ ] **Ziel:** Alle Texte klingen wie ein Autor; die KI schreibt im gleichen Ton.
- **Handlung:** Kopiere den Kasten in eine Datei `brand-voice.md` und hänge ihn **jedem** KI-Prompt an (Vorlage siehe 9.12).
- **Werkzeug:** Textdatei. **Zeit:** 1 h. **Kosten:** 0 €.
- **Erfolgsmetrik:** 10 zufällige Texte ergeben denselben Ton (Blindtest mit einem Freund).
- **Fehler vermeiden:** Zu „werblich", zu „Tech-Bro". tuur ist neugierig, warm, präzise.

**Markenstimme (Vorschlag):** du-Form, kurze Sätze, konkret (Straßen, Bauwerke, Jahre nur wenn belegt), freundlich-neugierig, ein Augenzwinkern, nie belehrend. Marke: **weiße Flächen, sparsam Rot #ED0516, Herz-Pin-Marke, fette runde Headlines in Plus Jakarta Sans**. Rot ist Akzent: ein roter Pin, ein roter CTA-Button pro Bild – nicht flächig.

| Sag so | Nicht so |
|---|---|
| „Lauf los. tuur erzählt." | „Revolutioniere dein Reiseerlebnis mit modernster KI!" |
| „Die Fassade da vorn? Die hat eine Geschichte." | „Erlebe unvergessliche Einblicke." |
| „Erste Tour pro Ort gratis." | „Kostenlos für immer!" |
| „Eine KI-Stimme erzählt dir das, aus Quellen wie Wikipedia und OpenStreetMap." | „Erzählt von echten Experten." |
| „Falsch? Sag Bescheid, wir prüfen das." | „Unsere KI irrt nie." |
| „Deine Position bleibt auf deinem Gerät." (mit Fußnote zu Kartenquadrat) | „100 % anonym." |

**Wörter, die wir nutzen:** loslaufen, erzählen, Ecke, Geschichte, Stadt, Station, Tour, Ohr, Pin. **Wörter, die wir meiden:** revolutionär, disruptiv, einzigartig (unbelegt), perfekt, Insider-Geheimnis (Übertreibung), „AI-powered" ohne Inhalt.

**Beispiel-Captions (DE):**
- „Du gehst hier seit Jahren vorbei. Weißt du, was in dem Haus mal war? 🎧" (Emoji nur in Social, nicht in Doku)
- „3 Minuten. 1 Ecke. 0 Guidebook. Tour des Tages: <Stadt>."
- „Mit dem Rad durch <Stadt>: kurze Geschichten, die zu deinem Tempo passen."

### 1.4 Nordstern-Metrik und Funnel

**Schritt 1.4.1 – Nordstern definieren (T-10 W)**

- [ ] **Ziel:** Eine Zahl, die zeigt, ob Nutzer echten Wert bekommen.
- **Handlung:** Setze als Nordstern: **„Abgeschlossene Touren pro Woche" (WCT = Weekly Completed Tours)**, hilfsweise „Anteil der Erst-Nutzer, die ihre erste Tour abschließen (Activation)". Grund: Wer eine Tour zu Ende hört, hat den Kernnutzen erlebt; Zahlung und Teilen folgen daraus. Zähle sie **ohne Personenbezug**: aus opt-in Analytics (wenn zugestimmt) hochgerechnet oder als aggregierter Server-Zähler (Backlog 8.2, Punkt 9, erst nach Rechtsprüfung).
- **Werkzeug:** Tabelle/Notion, später Admin-Dashboard. **Zeit:** 1 h. **Kosten:** 0 €.
- **Erfolgsmetrik:** Du kannst die Zahl in 10 Minuten jeden Montag ermitteln.
- **Fehler vermeiden:** Downloads als Nordstern. Downloads sind Eitelkeit; Abschlüsse sind Nutzen.

**Der Funnel (Ausfüllfeld; Zielwerte sind Hypothesen, nicht Marktdaten)**

| Stufe | Definition | Woher die Zahl | Hypothese Zielbereich | Ist |
|---|---|---|---|---|
| 1. Impression | Store-Suchergebnis/Post gesehen | App Store Connect „Impressions", Play „Store-Listing-Besucher", Social-Analytics | – | |
| 2. Store-Besuch | Produktseite angesehen | ASC „Product Page Views", Play „Store-Listing-Besucher" | Impression→Besuch 3–8 % (Store-Suche) | |
| 3. Installation | Download | ASC „Downloads/Units", Play „Installationen" | Besuch→Install 20–40 % | |
| 4. Erste Tour gestartet | Onboarding + „Tour starten" | opt-in Analytics; Näherung: Kachel-Ingest/Narration-Zähler pro Gebiet aus `usageLogs` | 40–60 % der Installs | |
| 5. Tour abgeschlossen | „Tour beendet"-Screen | opt-in Analytics / künftiger Zähler | 40–60 % der Starter | |
| 6. Zahlung | Kauf von Credit oder Abo | RevenueCat-Dashboard (aggregiert, ohne Personendaten nutzbar) | 2–5 % der Installs (hoch gegriffen, prüfen) | |
| 7. Einladung/Teilen | Invite-Link erzeugt und eingelöst | Firestore `invites` (aggregiert per Admin-Abfrage), Invite-Landingpage-Besuche | 5–15 % der Zahler | |

**Fehler vermeiden:** Funnel-Zahlen aus verschiedenen Zeiträumen vermischen. Immer Kohorte pro Woche.

### 1.5 Messplan (DSGVO-konform, kostenlos oder günstig)

**Wichtiger Ausgangspunkt (aus dem Repo):** In der App sind **Analytics und Crashberichte aus, bis der Nutzer zustimmt**; die Datenschutzerklärung sagt auch: die Website nutzt **keine Analytics- oder Werbe-Cookies**. Wenn du Web-Analytics einführst, muss die Datenschutzerklärung (`packages/shared/src/legal/privacy.ts`) angepasst werden – **lass das juristisch prüfen**.

**Schritt 1.5.1 – Messstack aufsetzen (T-10 bis T-8 W)**

- [ ] **Ziel:** Jede Stufe des Funnels hat eine Quelle, ohne Einwilligungsbanner auf der Website und ohne Personenprofile.
- **Handlung (Reihenfolge):**
  1. **App Store Connect → Analytics** aktivieren: Impressionen, Produktseitenaufrufe, Downloads, Umsatz, Retention (nur von Nutzern, die Apples Datenweitergabe erlaubt haben; Zahlen sind daher Stichproben – vor Nutzung prüfen, wie Apple das dokumentiert).
  2. **Google Play Console → Statistiken**: Installationen, Store-Listing-Konversion, ANR/Crash, Bewertungen. Für Kampagnenlinks: Play-Referrer-Parameter (`&referrer=utm_source%3D...`) und **Custom Store Listings** für Landingpage-Varianten.
  3. **Web:** eine der cookielosen Analytics: **Plausible (selbst gehostet gratis, gehostet ca. 9 €/Monat – vor Nutzung prüfen)**, **Umami (selbst gehostet gratis, Cloud mit Gratis-Kontingent – prüfen)** oder **Cloudflare Web Analytics (gratis)**. Kriterien: keine Cookies, keine personenbezogenen Daten, IP nicht gespeichert, EU-Hosting, AV-Vertrag (Art. 28). Ergänze die Datenschutzerklärung. Prüfe bei Tools mit Cloud-Hosting den Serverstandort.
  4. **UTM-Konvention** (siehe unten) für **jeden** Link, den du postest.
  5. **iOS Custom Product Pages** (App Store Connect) je Kampagne: eigene Produktseite pro Zielgruppe, mit Kampagnen-Link (`ct=`-Parameter) – bringt Aufrufe/Downloads pro Kampagne **ohne** Tracking in der App.
  6. **Invite-/Referral-Links:** Server-Zähler in Firestore `invites` (Anzahl erzeugter/eingelöster). Zähle wöchentlich per Admin/Emulator-Abfrage (dev-Aufgabe 8.2: Admin-Kachel „Einladungen").
  7. **RevenueCat-Dashboard**: Käufe, Abos, Refunds (aggregiert), Testphasen. Kein weiterer Aufwand.
  8. **Partnerportal-Statistiken** (Impressionen, Besuche, Einlösungen – bereits anonymisiert/aggregiert) für B2B-Erfolgsgeschichten.
  9. **Opt-in-Analytics in der App** (Backlog 8.2): erst nach Einwilligung Ereignisse `onboarding_done`, `tour_started`, `tour_completed`, `paywall_viewed`, `purchase_started`, `invite_created`, `offline_download_done`. Bis dahin: Näherungen aus Server-Aggregaten (`usageLogs`, ohne User-IDs).
  10. **Qualitative Signale:** „Fehler melden"-Queue im Admin, Support-Mails, App-Reviews.
- **Werkzeug:** siehe oben. **Zeit:** 6–8 h (ohne Entwicklung). **Kosten:** 0–10 €/Monat (Plausible Cloud) – vor Nutzung prüfen.
- **Erfolgsmetrik:** Du beantwortest „Woher kamen die letzten 100 Installs?" mit mindestens 60 % zugeordnet (UTM/CPP-Link/Store-Quelle).
- **Fehler vermeiden:** Google Analytics/Meta-Pixel „mal eben" einbauen (Consent-Pflicht, Datenschutz-Widerspruch zur Positionierung). Auch kein Fingerprinting/Geräte-IDs zum „Attribuieren".

**UTM-Konvention (Vorschlag)**

`https://tuur.app/?utm_source=<kanal>&utm_medium=<typ>&utm_campaign=<kampagne>&utm_content=<variante>`

| Feld | Werte-Beispiele |
|---|---|
| `utm_source` | `tiktok`, `instagram`, `reddit`, `newsletter`, `creator_<name>`, `partner_<name>`, `presse_<medium>` |
| `utm_medium` | `organic`, `bio`, `paid`, `qr`, `mail`, `print` |
| `utm_campaign` | `launch_<stadt>`, `tourdestages`, `advent26`, `radsaison27` |
| `utm_content` | `video01`, `story03`, `aufsteller_cafe_x` |

**Attributions-Grenze (ehrlich):** Ohne Tracking-SDK lässt sich Web→Store→Install **nicht lückenlos** verbinden. Du arbeitest mit Korrelation (Zeitraum + Kanal + Custom Product Pages + Promo-Codes). Das reicht für Entscheidungen bei kleiner Größe.

### 1.6 Abschluss Fundament – Checkliste

- [ ] Positionierungssatz + Claim stehen
- [ ] 4 Personas + B2B-Persona mit Trigger-Momenten, 5 Interviews geführt
- [ ] Wettbewerbstabelle mit ≥ 8 Zeilen, 3 Differenzierungs-Sätze
- [ ] Markenstimme als `brand-voice.md`
- [ ] Nordstern (WCT) + Funnel-Tabelle
- [ ] Messstack (ASC, Play, cookielose Web-Analytics, UTM, CPP) läuft, Datenschutzerklärung angepasst
- [ ] Marketing-Release-Gate: `docs/RELEASE.md` Abschnitte 1–5 sind absehbar erfüllt (Rechtstexte anwaltlich geprüft, echte-Geräte-Test)


---

## 2. KI-gestützter Marketing-Werkzeugkasten

Prinzip: **KI macht Entwürfe, Recherche-Vorarbeit und Varianten. Du entscheidest, prüfst und gibst frei.** Kein Text geht ohne Menschen-Freigabe (Checkliste 2.11) raus. Alle Prompts hängen die Markenstimme (9.12) und den Faktenkasten (0.4) an.

### 2.1 Kostenkontrolle: welches Modell/Tool wofür

**Grundregel „Zwei-Stufen-Modell":**

| Aufgabe | Modellklasse | Warum |
|---|---|---|
| Massenarbeit: 30 Caption-Varianten, Übersetzungen, Untertitel, Keyword-Listen, Tabellen füllen, Kommentar-Antwortentwürfe, Recherche-Zusammenfassungen | **günstige „Lite/Flash/Haiku"-Klasse** | billig, schnell, für Struktur reichend |
| Strategie, Positionierung, Pressetext-Reinschliff, Pitch, Krisenantworten, heikle Rechtsformulierungen (nur als Entwurf) | **starkes Modell** (Opus/Sonnet-/Pro-Klasse) | wenige, wichtige Texte |
| Recherche mit Web-Zugriff (Partnerlisten, Creator-Suche) | Modell mit Suchfunktion, **immer Quelle prüfen** | Halluzination bei Adressen/Zahlen |

**Modellnamen ändern sich ständig – nenne im Prozess nur die Klasse und prüfe Preise auf der Preisseite des Anbieters (vor Nutzung prüfen).**

**Kostenhebel:**
1. **Batch-Verarbeitung:** Viele Aufgaben in einem Aufruf (z. B. „erzeuge 20 Hooks für 4 Städte in einer Tabelle"). Anbieter-Batch-APIs sind oft deutlich günstiger, aber verzögert (vor Nutzung prüfen).
2. **Prompt-Caching:** Wenn du per API arbeitest, lege den langen, gleichbleibenden Kontext (Produktfakten + Markenstimme, ca. 1.500 Wörter) an den **Anfang** des Prompts, damit er gecacht wird (Anbieter-Doku prüfen).
3. **Kurze Ausgaben:** „Antworte nur als Tabelle, maximal 150 Wörter."
4. **Projekte statt Copy-Paste:** In Chat-Tools ein „Projekt" mit `brand-voice.md` + Faktenkasten als Wissen anlegen.
5. **Eigenes Produkt zuerst:** Für Content-Rohmaterial nutzt du die **bereits generierten und geprüften tuur-Erzählungen** (Kosten: 0 €, da gecacht).
6. **Monatliches Tool-Budget-Limit:** siehe unten.

**Monatliches Tool-Budget (Beispiel; Werte vor Nutzung prüfen):**

| Posten | Betrag/Monat |
|---|---|
| KI-Chat-Abo (ein Anbieter, nicht drei) | ca. 20 € |
| KI-API-Guthaben für Batch-Aufgaben (Prepaid-Limit setzen!) | 10–20 € |
| Design/Video (Canva Free/Pro oder CapCut/DaVinci gratis) | 0–12 € |
| Newsletter/Analytics-Cloud | 0–10 € |
| **Summe Ziel** | **30–60 €** |

**Regel:** Setze bei jedem API-Anbieter ein **hartes Monatslimit** (Prepaid oder Spending-Limit) und trage jeden Monat die Ist-Kosten ein. Über Limit = Tool-Review, nicht Limit erhöhen.

### 2.2 Liste günstiger/kostenloser Tools (Preise = „prüfen")

| Zweck | Tool-Beispiele | Ungefähre Kosten | Hinweis |
|---|---|---|---|
| KI-Chat/Recherche | Claude, ChatGPT, Gemini, Perplexity-artige Suche | 0–20 €/Monat (prüfen) | Free-Tiers haben Limits; keine Personendaten eingeben |
| KI-Bild | nur für abstrakte Grafiken/Moodboards; **keine** KI-Bilder realer Orte (Produktregel, Spezifikation 3) | – | Reale Orte = Wikimedia-Commons-Fotos oder eigene Fotos |
| Synthetische Stimme | **eigene tuur-Guide-Stimme** (Gemini TTS über das Produkt) | 0 € (Produkt) | Als „KI-Stimme" kennzeichnen |
| Video-Schnitt | CapCut, DaVinci Resolve (gratis), Canva | 0–12 €/Monat | Lizenz der Vorlagen/Musik prüfen |
| Untertitel | Auto-Untertitel in CapCut/Instagram/YouTube; KI-Nachkorrektur | 0 € | **Immer manuell nachprüfen** |
| Planung/Scheduling | Buffer/Later/Metricool Free-Tiers, Notion/Airtable Free | 0–10 €/Monat | Prüfen, welche Netzwerke im Free-Tier |
| Cookielose Web-Analytics | Plausible, Umami, Cloudflare Web Analytics | 0–9 €/Monat | siehe 1.5 |
| Newsletter/Waitlist | Brevo (Free-Tier), MailerLite, Listmonk (selbst gehostet), Buttondown | 0–15 €/Monat | **Double-Opt-in**, AV-Vertrag, EU-Server bevorzugen |
| ASO | App Store Connect + Play Console (gratis); Suchvorschläge; **Apple Ads Advanced** liefert Keyword-Popularität; ASO-Tools (AppTweak, AppFollow, MobileAction u. ä.) | 0 € bis 30+ €/Monat | Erst gratis versuchen, Tool nur bei Bedarf/Testmonat |
| Presse-Verteiler | selbst gebaute Liste (Tabelle) | 0 € | Kein Kauf von Adresslisten (DSGVO/UWG) |
| Design/Print | Canva, Vistaprint/Flyeralarm-artige Druckereien | 100–150 € einmalig für Sticker/Aufsteller (prüfen) | QR-Code-Kontrast/Größe testen |
| Tabellen/CRM | Google Sheets/Notion/Airtable Free, HubSpot Free CRM | 0 € | Personenbezogene Daten sparsam, Löschfristen setzen |

### 2.3 Workflow A: Marktforschung und Zielgruppen (Ideenfindung, nicht Beweis)

**Regel:** Synthetische Personas („frag die KI als Sophie") sind **nur zur Ideenfindung**. Sie ersetzen **keine** echten Interviews (1.1.3). Sie können Fragen für Interviews schärfen und Einwände sammeln.

- [ ] **Ziel:** Bessere Interviewfragen, Einwand-Liste, Kanal-Ideen.
- **Handlung:** Prompt P-01 (9.8) mit Faktenkasten; ergänze eine Tabelle „Einwand → Antwort → Beweis, den ich brauche". Prüfe jede Antwort im Interview.
- **Zeit:** 1 h. **Kosten:** < 1 €. **Erfolgsmetrik:** Nach Interviews: mindestens 5 Einwände sind bestätigt/widerlegt. **Fehler:** Die KI als Marktforscher zitieren („Studien zeigen …").

### 2.4 Workflow B: Content-Kalender und Kurzvideo-Skripte

- [ ] **Ziel:** 12-Wochen-Content-Plan (3.3) und je Woche 3 Videoskripte in 1 Stunde.
- **Handlung:** Prompt P-02 (Kalender) und P-03 (Skripte). Skripte enthalten: Hook (0–2 s), Konflikt/Frage, Antwort (echter Erzähltext aus tuur), CTA („Erste Tour pro Ort gratis"), Untertitel-Text, Kennzeichnung „KI-Stimme". Lass die KI die **Erzähltext-Passage direkt aus der echten tuur-Erzählung** übernehmen (Copy-Paste aus dem Transkript), sie schreibt nur Hook und Rahmen.
- **Werkzeug:** Chat-Modell (günstig), CapCut. **Zeit:** 1 h Skripte + 1 h pro Video-Schnitt. **Kosten:** < 2 €/Woche. **Erfolgsmetrik:** Video-Drehzeit ≤ 45 Min pro Video; Sehdauer (Watch-time) ≥ 50 % (Hypothese; siehe 6.2).
- **Fehler:** Das KI-Skript erfindet Fakten („Dieses Haus wurde 1743 gebaut"). **Regel:** Fakten stammen **nur** aus der geprüften tuur-Erzählung oder aus einer Quelle (Wikipedia-Link), die du geöffnet hast.

### 2.5 Workflow C: Untertitel und Übersetzungen (DE/EN, später FR/ES/IT)

- [ ] **Ziel:** Jeder Post in DE und EN; Untertitel immer.
- **Handlung:** Prompt P-04. Reihenfolge: (1) Untertitel als SRT aus dem Video-Tool, (2) KI-Übersetzung mit Anweisung „gesprochene Sprache, keine Wort-für-Wort-Übersetzung, Ortsnamen im Original lassen", (3) **Gegenlesen** durch Muttersprachler (bei EN: deine Sprachkompetenz oder Freund; bei FR/ES/IT: erst wenn App und Erzählung diese Sprache **können**, siehe A-11).
- **Zeit:** 15 Min/Video. **Kosten:** < 1 €/Video. **Metrik:** Fehlerquote in Stichprobe (5 Untertitel) = 0 sinnentstellende Fehler. **Fehler:** Automatische Untertitel ungeprüft posten; Eigennamen (Straßen) falsch.

### 2.6 Workflow D: ASO-Keywords und Store-Texte

- [ ] **Ziel:** Store-Texte, die in Suche und Konversion funktionieren.
- **Handlung:** (1) Prompt P-05 erzeugt 80 Keyword-Kandidaten DE/EN (Nutzerfragen, Synonyme, Long-Tail wie „Stadtführung Audio selbst", „Rundgang Altstadt Geschichte"). (2) Prüfe Suchvorschläge in App Store/Play (Autocomplete) manuell. (3) In Apple Ads Advanced Keyword-Popularität ansehen (Konto nötig; vor Nutzung prüfen). (4) Prompt P-06 erzeugt Store-Texte **innerhalb der Zeichenlimits** (Abschnitt 3.8). (5) **Du zählst die Zeichen selbst** (z. B. `echo -n "Text" | wc -m`), die KI zählt schlecht.
- **Zeit:** 3 h. **Kosten:** < 3 €. **Metrik:** Ranking-Beobachtung (Schritt 5.9), Konversion Besuch→Install. **Fehler:** Wettbewerbernamen/Marken als Keywords (Regelverstoß, vor Nutzung prüfen: App-Store-Richtlinien 2.3).

### 2.7 Workflow E: Pressetexte und Partner-Akquise-Mails

- [ ] **Ziel:** Entwürfe in 15 Minuten statt 2 Stunden; **Personalisierung mit belegter Recherche**.
- **Handlung Presse:** Prompt P-07. Eingabe: 5 Fakten + Story-Winkel + Gründer-Zitat (dein **echtes** Zitat; die KI darf kein Zitat erfinden). Ausgabe: Pressemitteilung (max. 300 Wörter), Betreffzeilen-Varianten.
- **Handlung Partner (Recherche):** Prompt P-08: „Recherchiere zu diesem Betrieb (Name, Ort, Website-Link): Angebot, Zielgruppe, Lage zu Sehenswürdigkeiten, Öffnungszeiten, Auffälliges (Preise, Bewertungen nur beschreiben). Gib **Quelle als URL** für jede Aussage. Schreibe keine Vermutungen." Dann Prompt P-09 für den **Erstansprache-Text** (Telefon-Skript oder Brief/LinkedIn-Nachricht, **nicht** als unaufgeforderte Werbe-E-Mail, siehe Abschnitt 5.7 und 7).
- **Zeit:** 10–15 Min/Betrieb. **Kosten:** < 0,50 €/Betrieb. **Metrik:** Rückmeldequote (siehe 5.7). **Fehler:** KI behauptet Details, die nicht auf der Website stehen; du sprichst den Betrieb darauf an, es stimmt nicht – Vertrauen weg. **Immer**: jede Personalisierung mit URL belegen.

### 2.8 Workflow F: FAQ, Support-Vorlagen, Community-Moderation

- [ ] **Ziel:** Antworten in < 24 h, konsistent, nicht juristisch riskant.
- **Handlung:** Prompt P-10 (FAQ aus Produktfakten), P-11 (Support-Antworten, Vorlagen 9.5), P-12 (Moderationsregeln, siehe 5.8). Die KI entwirft, du prüfst besonders: Erstattungen (Store-Prozess), Datenlöschung (`/delete-account`, In-App), Fehlerberichte, Datenschutz-Auskünfte (ans Postfach für Datenschutz aus `OPERATOR_*`).
- **Zeit:** 3 h einmalig. **Kosten:** < 3 €. **Metrik:** Antwortzeit, Anteil Tickets mit Vorlage. **Fehler:** Vorlagen versprechen Erstattungen, die der Store entscheidet; rechtliche Aussagen ohne Prüfung.

### 2.9 Das eigene Produkt als Marketing-Asset: „Tour des Tages/der Woche"

Das ist dein größter Hebel: Jede tuur-Erzählung ist ein fertiger, faktengeprüfter (automatisch) Content-Baustein, den du **nicht extra erzeugen** musst, sobald er gecacht ist.

**Schritt 2.9.1 – Content-Pipeline „Tour des Tages" (T-8 W aufwärts, wöchentlich)**

- [ ] **Ziel:** 3 Social-Posts/Woche plus 1 Stadtseite/Woche aus echten Touren, mit minimalem Extra-Aufwand.
- **Exakte Handlung:**
  1. **Auswahl (10 Min):** Öffne im Admin (`/admin`, Tours) eine Tour in einer vorgewärmten Stadt; prüfe Kriterien: Status nicht gesperrt, Stopps ≥ 5, Route plausibel, `aiGenerated`-Kennzeichnung sichtbar.
  2. **Faktenprüfung durch Menschen (20 Min):** Höre 2–3 Stopps komplett. Öffne für jede Jahreszahl/Namen die Wikipedia-Seite. Fehler → im Admin „Narration sperren/neu generieren" oder „Fakten als Zusatzquelle" (Admin-Funktion laut PROGRESS Phase 11). Erst dann verwenden.
  3. **Rohmaterial (15 Min):** Screenrecording des Players (Karte, roter Fortschritt, Transkript, Herz-Pin), Audio-Ausschnitt (30–45 s aus der `short`-Stufe), Transkript-Zitat als Text. Bild nur aus dem Bildkarussell mit Attribution (Wikimedia-Lizenz beachten, siehe Abschnitt 7).
  4. **Aufbereitung (30 Min):** Kurzvideo (Hook + Screen-Recording + Erzähler-Audio + Untertitel + Endkarte „Erste Tour pro Ort gratis" + Hinweis „KI-Stimme, aus Wikipedia/OSM"). Prompt P-03/P-13.
  5. **Veröffentlichung:** Instagram Reels, TikTok, YouTube Shorts (gleiches Video, plattformspezifische Caption), Pinterest-Pin mit Link auf die Stadtseite, kurzer Newsletter-Block.
  6. **Dokumentation:** In der Content-Tabelle: Datum, Stadt, Tour-ID, Stopp, Kanal, Ergebnis (Views, Saves, Klicks).
- **Werkzeug:** Admin, App (Simulator oder Gerät), CapCut, Buffer. **Zeit:** ca. 1,5 h pro Tour-des-Tages. **Kosten:** 0 € (Erzählungen gecacht). **Erfolgsmetrik:** ≥ 1 Video/Woche mit Sehdauer ≥ 50 %; Klicks auf Store/Web pro Video (UTM).
- **Fehler:** (a) Unverifizierte Erzählung posten – dann viral falsche Fakten (siehe Krisenplan 4.9). (b) **Kein KI-Hinweis** im Video. (c) Bild ohne Attribution (Bußgeld/Abmahnrisiko). (d) Content aus Modi, die kostenpflichtig sind, zeigen als sei er gratis: kennzeichne „Erste Tour pro Ort gratis".

**Kosten-Warnung:** Erzeuge Erzählungen für Content nur in Gebieten, die du sowieso bewirbst; jede neue Region = neue Ingest- und Narrationskosten (Produktregel 4.4). Lege im Admin ein Tagesbudget fest.

### 2.10 Programmatic SEO: „Audio-Tour durch <Stadt>" (Web-Stadtseiten)

**Stand im Repo:** `apps/web` hat Landingpage, Invite-Seite, Legal-Seiten, Partnerportal, Admin, `delete-account`. **Es gibt keine Stadtseiten.** Das ist ein Entwicklungs-Backlog (8.2, Punkt 6). Die Spezifikation (Abschnitt 12) schließt eine **Web-Version der Tour-App** aus; Stadtseiten sind **Marketingseiten mit Auszügen**, keine Tour-App.

**Schritt 2.10.1 – Stadtseiten mit Qualitätsgrenzen (T-6 bis T+12 M)**

- [ ] **Ziel:** Organischer Suchverkehr für „Audioguide <Stadt>", „Stadtführung <Stadt> selbst", „<Stadt> Sehenswürdigkeiten Geschichte".
- **Exakte Handlung:**
  1. **Seitenmodell (Vorschlag):** URL `/de/audio-tour/<stadt>` und `/en/audio-tour/<city>`. Inhalt: H1 mit Stadt; Kurzbeschreibung; **Liste der Auto-Touren** (Titel, Dauer, Strecke, Themen aus `tours`); **je Tour 3 Stationen** mit Titel, Transkript-Auszug (max. ~120 Wörter) und **einem 30-Sekunden-Audio-Beispiel** (Stufe `short`); Karte (statisches Bild, Attribution © OpenStreetMap-Mitwirkende); CTA „Tour in der App starten – erste Tour gratis" mit Store-Links; Hinweis „Erzählungen werden von KI aus Wikipedia, Wikidata und OpenStreetMap erstellt"; Attribution-Fußzeile (Wikipedia CC BY-SA, Bilder Commons je Datei, OSM ODbL); „Fehler melden"-Link.
  2. **Qualitäts-Gate (nur wenn ALLE erfüllt, sonst `noindex` bzw. gar nicht veröffentlichen):**
     - Ort hat Status `ready`, nicht `low_content`;
     - mindestens 2 geprüfte Touren, jede mit ≥ 5 Stopps;
     - Mensch hat mindestens **3 Stopps pro Tour** angehört und Fakten geprüft (Checkliste 2.9);
     - keine gemeldeten/gesperrten Narrationen;
     - ≥ 60 % des Seitentextes ist **stadtspezifisch** (Zahlen, Namen, Stationen), nicht Textbausteine;
     - eigener Einleitungstext (max. 150 Wörter) von dir oder von KI überarbeitet, der etwas Konkretes über die Stadt sagt (z. B. „Startpunkt am …");
     - keine Städte-Seite, wenn du nicht **selbst in den letzten 90 Tagen** die Tour geprüft hast.
  3. **Skalierung:** Erst 3 Städte, dann pro Woche 2–3 neue Städte (Kosten des Aufwärmens beachten, 3.9). **Nie 1.000 Seiten auf einmal.**
  4. **Technik-SEO:** eine Seite pro Stadt+Sprache, `hreflang`, Sitemap, strukturierte Daten (z. B. `ItemList`/`TouristTrip` – vor Nutzung schema.org prüfen), sprechende URL, Ladezeit, Core Web Vitals, kein Duplicate Content zwischen Städten.
  5. **Messung:** Google Search Console (gratis; Datenschutz prüfen: nur Suchdaten), cookielose Web-Analytics, Klicks auf Store-Links (UTM `utm_source=web&utm_medium=seo&utm_campaign=stadt_<x>`).
- **Werkzeug:** Next.js (`apps/web`, Entwicklung), Search Console, Sitemap-Generator. **Zeit:** Entwicklung 5–8 Tage (Backlog), pro Stadt 1,5 h Redaktion. **Kosten:** 0 € Werkzeuge (Hosting laufend, prüfen).
- **Erfolgsmetrik:** Nach 3 Monaten: ≥ 50 % der Seiten indexiert; ≥ 1 Seite auf Suchseite 1 für eine Long-Tail-Suche (Hypothese). Klicks/Woche pro Stadtseite.
- **Fehler:** **Thin Content** (Seiten mit 2 Sätzen und generischen Absätzen) → Google kann als „scaled content abuse" werten (Richtlinien in der Google Search Central prüfen). **Kein** KI-Text ohne Prüfung; **keine** vollständigen Erzählungen kostenpflichtiger Touren veröffentlichen (Wert verschenken, Paywall unterlaufen); keine CC-BY-SA-Verpflichtungen ignorieren (Wikipedia-Quelltext, siehe Abschnitt 7).

### 2.11 Verantwortungsvoller KI-Einsatz im Marketing (verbindliche Regeln)

1. **Keine erfundenen Zitate, Bewertungen, Testimonials, Nutzerzahlen.** (UWG, irreführende Werbung; Store-Regeln gegen Bewertungsmanipulation.) Kein „Fake-Kundenfoto".
2. **Kennzeichnung synthetischer Stimmen/Bilder:** Jede KI-Stimme („KI-Stimme") und jedes KI-generierte Bild im Video/Post erkennbar machen; Plattform-Label („KI-generiert") aktivieren, wo vorhanden. Der EU-AI-Act verlangt Transparenz bei synthetischen Inhalten – **Details vor Nutzung prüfen** (artificialintelligenceact.eu bzw. amtliche EU-Seite).
3. **Menschen-Freigabe (Human-in-the-loop-Checkliste):**
   - [ ] Alle Zahlen und Jahreszahlen mit Quelle abgeglichen
   - [ ] Keine Behauptung aus dem Abschnitt „Was du NICHT sagen darfst" (0.4)
   - [ ] Preise und Bedingungen stimmen mit App/Store überein
   - [ ] Partnerinhalte/Bezahltes als „Anzeige/Werbung" gekennzeichnet
   - [ ] KI-Stimme/-Inhalt gekennzeichnet
   - [ ] Bildrechte/Attribution vollständig
   - [ ] Namen von Personen/Betrieben korrekt und einverstanden
   - [ ] Ton der Markenstimme
   - [ ] Zweite Person (Freund) hat gegengelesen bei Presse/Recht/Krise
4. **Urheberrecht Bilder:** Nur eigene Fotos, lizenzfreie Bilder oder **Wikimedia Commons** mit Beachtung der konkreten Lizenz (CC BY, CC BY-SA, CC0 …), Attribution je Bild. Keine Google-Places-Fotos (Produktregel). Keine KI-generierten „Fotos" realer Orte.
5. **Keine Personendaten in Prompts:** keine Nutzernamen, Mail-Adressen, Support-Tickets mit Klarnamen, Partnerdaten mit Ansprechpartnern; Support-Texte vor dem Einfügen anonymisieren („Nutzer A"). Prüfe, ob dein KI-Tool Eingaben zum Training nutzt (Einstellungen), und schalte es aus.
6. **Keine KI-Antworten auf Rezensionen ohne Freigabe** und nie so tun, als wäre es ein Mensch, wenn du fragst („bist du ein Bot?").
7. **Protokoll:** Notiere in der Content-Tabelle „KI beteiligt: ja/nein, Freigabe durch, Datum".
8. **Ehrlichkeit über KI-Fehler:** tuur ist ein KI-Produkt. Ein transparenter Umgang („Fehler melden") ist ein Verkaufsargument, kein Makel.


---

## 3. Vor dem Release (T-8 bis T0)

Reihenfolge nach Hebel: (1) Produkt-/Stadt-Qualität, (2) ASO, (3) Landingpage + Warteliste, (4) Kurzvideo + Build-in-Public, (5) Beta, (6) Partner + Creator + PR. Die Abschnitte 3.1 bis 3.11 laufen teilweise parallel (siehe Kalender in Abschnitt 6).

### 3.1 Landingpage und Warteliste

**Ist-Zustand (`apps/web/app/page.tsx`):** Hero mit Spinning-Mark, Wortmarke, Tagline (de/en), KI-Hinweis, Link „Partnerportal", Fußlinks Impressum/Datenschutz/AGB. **Es fehlen** (Marketing-Sicht):

| Fehlt | Warum | Aufwand (Entwicklung, grob) |
|---|---|---|
| Wartelisten-Formular (E-Mail, Sprache, Wunschstadt, Einwilligung) mit Double-Opt-in | Käufer vor Release sammeln, Städte-Wunsch als Datenbasis | 2–3 Tage (oder 0 Tage mit extern gehostetem Formular, siehe unten) |
| Store-Buttons/Links (oder „Bald verfügbar") + Smart-App-Banner (`apple-itunes-app`-Meta) | Konversion | 0,5 Tage |
| Screenshots/Video-Abschnitt, „So funktioniert's", vier Modi, Datenschutz-Abschnitt, FAQ | Vertrauen | 1–2 Tage |
| Social-Preview (Open Graph/Twitter-Cards), `robots.txt`, Sitemap | Teilen, SEO | 0,5 Tage |
| Presse-Seite `/presse` (Pressekit-Download, Kontakt) | PR | 0,5 Tage |
| B2B-Partner-Infoseite (Nutzen, Ablauf, Preise „auf Anfrage/ab …", CTA) vor dem Login-Portal | Partner-Inbound | 1 Tag |
| Cookielose Web-Analytics-Snippet + Datenschutztext | Messung | 0,5 Tage |
| Stadtseiten `/audio-tour/<stadt>` | SEO | 5–8 Tage (Abschnitt 2.10) |
| Tour-Teilen-Seite für Free-Tour-Links (mit Store-Links) | Teilen | 1–2 Tage (Abschnitt 3.11) |

**Schritt 3.1.1 – Warteliste, schnellster Weg (T-8 W, 0 Entwicklung)**

- [ ] **Ziel:** In 2 Stunden eine rechtssichere Warteliste mit Double-Opt-in.
- **Exakte Handlung:** (1) Wähle einen EU-Newsletter-Anbieter (Brevo, MailerLite o. ä.; Serverstandort und AV-Vertrag prüfen). (2) Lege eine Liste „tuur-Warteliste" mit **Double-Opt-in** an (Bestätigungsmail automatisch). (3) Formularfelder: E-Mail (Pflicht), Sprache (de/en, Pflicht), Wunschstadt (optional). **Keine weiteren Pflichtdaten.** (4) Einwilligungstext direkt am Button, **nicht vorangekreuzt**: „Ja, informiere mich per E-Mail über den Start von tuur und Neuigkeiten. Ich kann mich jederzeit abmelden. Infos: Datenschutzerklärung." (5) Link zur Datenschutzerklärung; ergänze dort: Zweck, Anbieter (Auftragsverarbeiter), Speicherdauer (bis Widerruf/Kampagnenende), Widerruf per Link in jeder Mail, Rechtsgrundlage Art. 6 Abs. 1 lit. a DSGVO, § 7 UWG. (6) Bestätigungs- und Willkommensmail (Text 9.11). (7) Einbetten/verlinken auf der Landingpage. (8) Impressum im Footer jeder Mail.
- **Werkzeug:** Newsletter-Tool. **Zeit:** 2–3 h. **Kosten:** 0–15 €/Monat (prüfen).
- **Erfolgsmetrik:** Bestätigungsquote (Double-Opt-in) ≥ 60 % (Hypothese); 300–1.000 Bestätigte bis T0 als Ziel-Range (Hypothese, abhängig von Reichweite).
- **Fehler vermeiden:** Vorausgewählte Checkbox; Kopplung „Warteliste = Newsletter + Partnerwerbung"; Adressen ohne Bestätigung importieren; Kauf von Adresslisten; keine Löschung nach Abmeldung.

**Schritt 3.1.2 – Native Warteliste (Entwicklungswunsch, optional T-6 W)**

- **Handlung (Vorschlag für Entwicklung):** Callable `joinWaitlist` (App-Check-frei, Rate-Limit, Honeypot-Feld), speichert nur `emailHash`, `email` (verschlüsselt/getrennt), `lang`, `city`, `consentTextVersion`, `createdAt`, `confirmedAt`, `token` (gehasht); sendet Bestätigungsmail (Transaktionsmail-Anbieter, z. B. Brevo/Postmark, EU-Region prüfen); `confirmWaitlist`-Seite; `unsubscribe`-Seite; TTL/Löschung; Datenexport/Löschung bei Anfrage. **Aufwand: 3 Tage.** Vorteil: kein Fremdformular, Wunschstadt-Statistik im Admin.
- **Fehler vermeiden:** Wartelisten-Adressen mit App-Nutzerkonten verknüpfen (Zweckbindung); Rechtstext nicht anpassen.

### 3.2 Social-Kanäle (Priorität nach Aufwand/Wirkung)

| Prio | Kanal | Warum | Aufwand/Woche | Zielgruppe |
|---|---|---|---|---|
| 1 | **Kurzvideo-Trio: TikTok + Instagram Reels + YouTube Shorts** (ein Video, drei Kanäle) | Höchste organische Reichweite pro Video-Stunde; Produkt ist audiovisuell demonstrierbar | 3–4 h | Städtereisende, Einheimische |
| 2 | **Instagram** (Profil, Stories, lokale Hashtags, Zusammenarbeit mit Lokal-Accounts) | Stadt-Communities, Partner-Sichtbarkeit | 1–2 h | Einheimische, Partner |
| 3 | **Reddit** (nützlich antworten, kein Spam) | Suchintention „Was in <Stadt> tun?" | 1 h | Reisende, Einheimische |
| 4 | **Pinterest** (Pins mit Stadt-Tourenbildern → Stadtseite) | Langfristiger Reise-Suchverkehr | 1 h (Batch) | Reiseplaner |
| 5 | **LinkedIn** (Gründer-Profil + B2B) | Partner, Tourismus, Presse, Investoren-Netz | 1–2 h | B2B |
| 6 | Bluesky/X/Indie Hackers (Build in Public) | Feedback, Netzwerk, Product Hunt | 1 h | Indie-Szene |

**Schritt 3.2.1 – Profile aufsetzen (T-8 W)**

- [ ] **Ziel:** Einheitliche Profile, Handle reservieren, Links mit UTM.
- **Handlung:** Handle prüfen (z. B. `tuur.app`, `tuur_app`; **prüfen, ob „tuur" schon belegt ist/Markenkollision**, Abschnitt 7.8). Profilbild = **Bildmarke rot auf weiß** (`assets/brand/mark/tuur-mark-red.png` oder `assets/brand/app/store-mark-on-white.png`). Bio (DE): „Dein KI-Audio-Stadtguide. Lauf los, tuur erzählt. Erste Tour pro Ort gratis. ↓ Warteliste". Link: `https://tuur.app/?utm_source=<kanal>&utm_medium=bio&utm_campaign=prelaunch`. Impressumspflicht: Gewerbliche Social-Profile brauchen ein Impressum (Link auf `/legal/imprint`).
- **Werkzeug:** Plattformen, Canva. **Zeit:** 3 h gesamt. **Kosten:** 0 €.
- **Erfolgsmetrik:** Alle Profile live, Link-Klicks messbar. **Fehler:** Zu viele Kanäle auf einmal; Business-Profile ohne Impressum; Logo verzerrt.

**Schritt 3.2.2 – Reddit-Regeln (T-8 W, laufend)**

- [ ] **Ziel:** Sichtbar sein, ohne gesperrt zu werden.
- **Handlung:** Suche relevante Subreddits (Suchbegriffe: Stadtname, „travel", „solotravel", „cycling", „bikepacking", „Germany", „SideProject"). **Lies die Regeln jedes Subreddits (Selbstwerbung oft verboten oder nur in Wochenthreads; vor Nutzung prüfen).** 4 Wochen lang **nur hilfreich** antworten (keine Links), dann bei passenden Fragen („Gibt es eine Audio-Tour für X?") einmal offen antworten: „Ich baue gerade tuur (Gründer), ich weiß, dass das Eigenwerbung ist …". Verwende dein echtes Profil, **nie Fake-Accounts, keine Upvote-Aktionen**.
- **Zeit:** 1 h/Woche. **Kosten:** 0 €. **Metrik:** positive Reaktionen, Klicks. **Fehler:** Link-Spam, Multiple Accounts, „hilfreich" nur als Verkaufsvorwand.

### 3.3 Build-in-Public-Plan (12 Wochen, Wochentakt)

**Rhythmus:** Montag Zahl/Plan (Text, LinkedIn/Bluesky), Mittwoch Video (Shorts/Reels/TikTok), Freitag Story/Behind-the-scenes (Instagram Stories, Reddit-Antwort). 3–4 h/Woche. Jede Woche **ein ehrlicher Lernpunkt**.

| Woche (rel. zu T0) | Thema | Video/Post-Idee | CTA |
|---|---|---|---|
| T-12 | Warum tuur? | Gründer-Story in 30 s: „Ich bin durch meine Stadt gelaufen und wusste nichts über die Häuser" (nur wahre Story!) | Handle folgen |
| T-11 | Der erste Ton | Roher Screen-Recording-Clip: erste Erzählung an einem Ort, KI-Stimme gekennzeichnet | Warteliste |
| T-10 | Wie funktioniert die KI ohne Halluzinationen? | Erklärgrafik: Wikipedia/Wikidata/OSM → Gemini → Faktenprüfung → Audio | Kommentar-Frage: „Welche Fakten würdest du prüfen?" |
| T-9 | Vier Modi | 4 Clips à 15 s: Standardtour, Route planen, Weggabelung, Streifzug | Warteliste |
| T-8 | Rad-Modus | „Kurze Geschichten, weil du fährst": Radszene (sicher gefilmt, Stativ/Helmkamera; nicht beim Fahren tippen) | Radfahrer-Communities |
| T-7 | Datenschutz | „Was verlässt dein Handy? Nur ein Kartenquadrat." Grafik mit Fußnote | Vertrauen |
| T-6 | Tour des Tages #1 | Erste echte Tour <Heimatstadt> | Beta-Aufruf |
| T-5 | Offline im Zug | Flugmodus-Test, Download-Bildschirm | Beta-Aufruf |
| T-4 | Barrierefreiheit | Transkript, große Schrift, VoiceOver | Inklusive Nutzer einladen |
| T-3 | Fehler melden | „KI hat sich geirrt? So melden und korrigieren wir" (echter Fall, ohne Namen) | Vertrauen |
| T-2 | Partner-Teaser | Café/Fahrradverleih-Pilot: QR-Angebot, Kennzeichnung „Anzeige · Partner" (nur mit Einwilligung des Betriebs) | B2B-Interesse |
| T-1 | Countdown | 3 Sekunden-Clips, Store-Link, Launch-Termin | Vorbestellen/Warteliste |

**Fehler vermeiden:** Nur Ankündigungen; keine Zahlen zeigen; Fakten in Videos nicht prüfen; Kollegen oder Nutzer ohne Erlaubnis zeigen.

### 3.4 Beta-Programm (TestFlight und Play-Testing)

**Schritt 3.4.1 – Beta vorbereiten (T-8 bis T-6 W)**

- [ ] **Ziel:** 50–200 echte Tester, die echte Touren laufen, bevor Nutzer es tun.
- **Exakte Handlung:**
  1. **Build:** Nutze `docs/TESTING_IOS.md` (Abschnitte 2.6 TestFlight). Für TestFlight brauchst du Apple Developer Program (ca. 99 USD/Jahr, prüfen) und einen echten Build (`eas build -p ios --profile preview/production`). Interne Tester (bis zu 100, prüfen) sofort, **externe** Tester brauchen Beta-App-Review durch Apple. Kein Mac nötig für EAS-Build (siehe Doku).
  2. **Android:** Interner Test-Track (ohne Review) und **Closed Testing**. **Wichtig (vor Nutzung prüfen):** Für neu angelegte persönliche Play-Entwicklerkonten verlangt Google derzeit einen **Closed-Test mit einer Mindestzahl von Testern über eine Mindestdauer (nach meinem Kenntnisstand ca. 12 Tester über 14 Tage)** vor dem Produktionsrelease. Prüfe die aktuelle Regel in der Play Console. **Plane dafür mindestens 3 Wochen Puffer vor T0.**
  3. **Rekrutierung (50–200):** Warteliste (E-Mail mit Einladung 9.4), Freunde/Familie (max. 20 %), 3 lokale Facebook-/Reddit-/Nachbarschaftsgruppen (Regeln beachten), Uni-Verteiler, Radverein/Wanderverein, Hostels/Tourist-Info-Aushang mit QR, Kontakte aus den 5 Interviews. Ziel: ≥ 30 Tester in **mindestens zwei Städten**, ≥ 15 davon **Radfahrer**, ≥ 10 Touristen (nicht Einheimische) – über Reise-Bekannte oder Hostels.
  4. **Aufgaben für Tester (Missions):** M1: Onboarding + erste Tour draußen komplett durchlaufen (Bildschirm aus, Kopfhörer). M2: Tour offline nutzen (Flugmodus). M3: Modus „Streifzug" 20 Min. M4: Erzählung mit Fehler melden (falls gefunden). M5: Kauf im TestFlight/Play-Testmodus (Sandbox, kein echtes Geld) inklusive Widerrufs-Kontrollkästchen; Einladungslink an eine Person senden.
  5. **Feedback-Schleife:** Kurzes Google/Tally-Formular (EU-Anbieter bevorzugen, keine unnötigen Personendaten; Tally/Typeform Datenschutz prüfen) nach jeder Mission: „Hat es funktioniert? (ja/teilweise/nein)", „Was war der beste Moment?", „Was hat genervt?", „Fehler in Fakten? Wo?", „Hättest du dafür bezahlt? Wofür?", Foto/Video optional. Zusätzlich In-App „Fehler melden". Wöchentliche Zusammenfassung an Tester („Ihr habt gesagt – wir haben getan").
  6. **Kosten-Beobachtung:** Beobachte im Admin, wie viele Kacheln/Erzählungen durch Beta entstehen; setze ein Tagesbudget in `config/ai`.
- **Werkzeug:** EAS/TestFlight/Play Console, Formular, Tabelle. **Zeit:** 12 h Setup + 3 h/Woche. **Kosten:** 0 € (ohne Developer-Gebühren) bis 50 € (Aufklärungsmaterial, Kaffee).
- **Erfolgsmetrik / Release-reif-Kriterien (Hypothesen, du passt an):**
  - [ ] ≥ 50 Tester haben mindestens eine Tour **abgeschlossen** (Selbstbericht + Beobachtung)
  - [ ] Crash-freie Sitzungen ≥ 99 % (Crashlytics, nur bei zugestimmten Testern)
  - [ ] 0 offene Blocker (Standort-Abbruch im Hintergrund, Audio-Abbrüche, Kauf/Restore, Deep-Link)
  - [ ] ≤ 2 gemeldete **sachliche Fehler** pro 50 gehörte Erzählungen; alle gemeldeten Fehler im Admin geprüft/gesperrt
  - [ ] Hintergrund-Standort auf iOS/Android getestet (Demo-Video für Google Play, siehe RELEASE 4)
  - [ ] Mindestens 10 Tester würden „ziemlich" oder „sehr" empfehlen (NPS-Frage; sehr kleines n, nur Tendenz)
  - [ ] Alle Punkte aus `docs/RELEASE.md` Abschnitt 5 abgehakt
- **Fehler vermeiden:** Nur Freunde testen; Kauftests ohne Sandbox; Beta-Feedback nicht auswerten; Tester nicht darüber informieren, dass Kosten (KI) entstehen könnten – **nicht wichtig für sie**, aber du kontrollierst Budget. Nicht Sie-Form/Du-Form mischen.

**Gratis-Guthaben für Beta-Tester:** In TestFlight/Play-Testing sind Käufe Sandbox-Käufe (kein echtes Geld; Details prüfen). Ein **Dankeschön nach Release** (Gratis-Guthaben) braucht einen Admin-„Guthaben schenken"-Weg (Backlog 8.2, Punkt 3, ca. 1–2 Tage) oder Apple-/Google-Promo-Codes (siehe 3.10). Bewertungen dürfen dafür **niemals** belohnt werden (7.7).

### 3.5 Creator- und Micro-Influencer-Outreach

**Schritt 3.5.1 – Liste finden (T-8 bis T-5 W)**

- [ ] **Ziel:** 30 passende Creator identifiziert, 10 angeschrieben, 3–5 Kooperationen.
- **Exakte Handlung:** (1) Suchbegriffe auf TikTok/Instagram/YouTube: `#städtetrip`, `#<stadt>tipps`, `#radtour`, `#bikepacking`, `#reisetipps`, `#hiddengems<stadt>`, `#sightseeing`, `#solotravel`, „Was tun in <Stadt>", „Radweg <Name>". (2) Kriterien: **5k–50k** Follower (Hypothese für gutes Kosten-Nutzen-Verhältnis), thematisch DACH-Reise/Radfahren/Lokalgeschichte, regelmäßiges Posten, echte Kommentare (kein Bot-Muster), Engagement-Verhältnis (Kommentare pro Post), Sprache DE oder EN, in oder in der Nähe der Launch-Städte, bisher Werbung sauber gekennzeichnet. (3) Tabelle: Name, Kanal, Link, Follower (Stand), Themen, Kontakt (öffentliche Business-Mail oder DM), Fit 1–5, Status. (4) Prüfe Fake-Follower-Anzeichen grob: plötzliche Follower-Sprünge, generische Kommentare.
- **Angebot (Vorschlag):** (a) **Tour-Guthaben/Abo gratis** (nach Erstellung eines Admin-Grant-Tools, 8.2/3; bis dahin: **Apple Offer Codes/Google-Play-Promo-Codes**, vor Nutzung prüfen; die Tour in ihrer Stadt ist ohnehin gratis), (b) **kleine Pauschale** (bei 5–50k Followern z. B. 0–300 € pro Video als Hypothese; vor Ansprache selbst Preisrahmen einholen), (c) **Revenue-Share** über tracking-freie Codes: Aktuell gibt es **keinen** Creator-Code/Affiliate-Mechanismus im Produkt (Backlog 8.2/2 und 8.2/4). Bis dahin: eigene Custom Product Page + UTM-Link je Creator und **Pauschale statt Provision**.
- **Ansprache-Vorlage:** 9.2. Jede Kooperation als **„Werbung/Anzeige"** kennzeichnen (Abschnitt 7.2), Fakten-Freigabe vor Veröffentlichung.
- **Werkzeug:** Plattform-Suche, Tabelle, Vorlage. **Zeit:** 8 h Suche + 4 h Outreach. **Kosten:** 0 € (Stufe A: Gratis-Zugang), 100–500 € (Stufe B), 500–1.500 € (Stufe C, siehe 0.2).
- **Erfolgsmetrik:** 3–5 zugesagte Creator, ≥ 3 Videos live um T0, Klicks/Installs je Creator (CPP/UTM), Kosten pro Klick/Install (Ausfüllfeld).
- **Fehler vermeiden:** Große Reichweite ohne Fit; Bezahlung ohne Vertrag; **Fake-Reviews oder Bewertungen kaufen**; Creator schreiben lassen, was sie nicht erlebt haben; Produkt falsch beschreiben („Weltweit perfekt").

### 3.6 Lokale Partnerschaften (Reichweite ohne Werbebudget)

**Schritt 3.6.1 – Kooperationsliste je Launch-Stadt (T-8 bis T-2 W)**

- [ ] **Ziel:** Pro Stadt 5–10 Kontakte, 2–3 Pilotpartner (Partnerprogramm) und 1–2 Reichweitenpartner (Tourismus/Stadtmarketing).
- **Exakte Handlung:** Liste erstellen (Ausfüllfeld unten), Reihenfolge: (1) **Tourist-Info/Stadtmarketing/Tourismusverband** (Ziel: Erwähnung, QR-Karte im Auslage, Newsletter), (2) **Museen/Gedenkstätten** (Ziel: Partner „Angebote"/Kooperation ohne Kosten für Pilot, gemeinsame Inhalte), (3) **Fahrradverleih/Radläden** (Ziel: Radmodus; QR-Aufsteller „Tour zum Leihrad"), (4) **Hostels/Hotels/Pensionen** (QR-Kärtchen im Zimmer/Empfang), (5) **Free-Walking-Tour-Anbieter** (nicht als Gegner: Position „tuur ergänzt deine Tour – für die Zeit davor und danach"; prüfe Interessenkonflikte ehrlich), (6) Cafés/Bäckereien/Gastronomie als Partner-Betriebe (5.7).
- **Vorgehen:** Vor Ort besuchen oder anrufen (nicht Kaltmail, 5.7/7.4), 3-Minuten-Pitch + Demo auf dem Handy, Papier-Einseiter (Flyer/QR).
- **Werkzeug:** Tabelle, Flyer (Canva), Handy-Demo. **Zeit:** 10 h. **Kosten:** 20–100 € Druck.
- **Erfolgsmetrik:** ≥ 15 Gespräche, ≥ 5 Interessenten, ≥ 2 Pilot-Zusagen je Stadt. **Fehler:** Erwartung, dass Verbände sofort verlinken; Zusagen ohne Schriftform („Mail zur Bestätigung").

| Organisation | Typ | Ort | Kontaktperson (öffentlich) | Erstkontakt | Angebot | Status | Nächster Schritt |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

### 3.7 PR: Pressekit, Verteiler, Product Hunt, Show HN

**Schritt 3.7.1 – Pressekit bauen (T-6 W)**

- [ ] **Ziel:** Ein Ordner/eine Seite `/presse`, aus der Journalisten in 2 Minuten alles nehmen können.
- **Inhalt:**
  - **Kurzbeschreibung** (3 Längen: 1 Satz, 50 Wörter, 150 Wörter; DE/EN), Beispiel 1 Satz: *„tuur ist ein KI-Audio-Stadtguide für Fußgänger und Radfahrer, der die passende Geschichte erzählt, sobald man an einem Ort ankommt – die erste Tour pro Ort ist gratis."*
  - **Logos:** aus `assets/brand/logo/` (Wortmarke rot/schwarz/weiß, PNG+SVG), **Bildmarke** aus `assets/brand/mark/` (Herz-Pin rot/weiß), **App-Icon** `assets/brand/app/icon-ios-1024.png`, **Marke auf Weiß** `assets/brand/app/store-mark-on-white.png`. Hinweis im Kit: SVGs sind automatisch nachgezeichnet (docs/DECISIONS D4); wenn Designer-Vektoren vorliegen, ersetzen.
  - **Screenshots** (8, siehe 3.8) in hoher Auflösung + Video 30 s.
  - **Founder-Story (echt!):** 150 Wörter Vorlage: *„Ich bin <Name>, <Beruf/Stadt>. <Auslöser: konkrete Begebenheit>. Ich wollte <Problem lösen>. Seit <Datum> baue ich tuur …"* Nur Wahres, keine Erfindungen. Foto: 1 Porträt in guter Qualität (mit Einverständnis, Bildrechte bei dir).
  - **Story-Winkel** (mindestens 5): „KI erzählt dir deine Stadt"; **Datenschutz** („Position bleibt auf dem Gerät, nur Kartenquadrat"); **Barrierefreiheit** (Transkripte, Screenreader); **Rad-Modus** (Erzählung passt sich Tempo an); **Lokale Wirtschaft** (Partner-Cafés mit Angebot per QR, klar als Anzeige gekennzeichnet); **Transparenz** („Fehler melden", KI-Kennzeichnung).
  - **Fakten-Box:** Plattformen (iOS/Android), Sprachen (de/en), Preise (Stand), Datenquellen, Team, Kontakt, Verfügbarkeit.
  - **Boilerplate** („Über tuur"), **Ansprechpartner**, Erreichbarkeit.
  - **Nutzungsrechte** für Bilder klarstellen; Attribution der Kartendaten © OSM-Mitwirkende, Wikimedia-Bilder nur mit Autor/Lizenz.
- **Werkzeug:** Canva, Notion/Ordner, `/presse` (Web). **Zeit:** 8 h. **Kosten:** 0 €.
- **Erfolgsmetrik:** Journalist kann in < 2 Min ein Zitat, ein Bild und einen Link finden. **Fehler:** Marketingsprech statt Nachricht; kein Kontakt; Bilder ohne Rechte.

**Schritt 3.7.2 – Presseverteiler regional aufbauen (T-6 bis T-3 W)**

- [ ] **Ziel:** 40–60 **persönlich ausgewählte** Kontakte.
- **Handlung:** Recherchiere per Impressum/Redaktionsseiten **einzelne Redakteure** (nicht nur `info@`): (a) **Lokalmedien** der Launch-Städte (Lokalredaktion Zeitung, Radio, Stadtmagazin, lokale Blogs, Stadtportale), (b) **Reise** (Reiseressorts, Reiseblogger, Podcasts), (c) **Tech/Startup** (regionale Startup-Newsletter, IHK/Gründerzentren-Kanäle, deutsche Tech-Magazine), (d) **Rad** (Rad-Magazine, ADFC-Regionalverbände), (e) **Barrierefreiheit/Digitalisierung** (Fachportale). **Presse-Kontakte E-Mail:** Journalisten dürfen zu redaktionellen Zwecken angeschrieben werden (Pressearbeit ist keine Werbung im engen Sinn, dennoch: relevant, kurz, Abmeldeoption, keine Massen-Mails; vor Nutzung prüfen/Rechtsrat, 7.4).
- **Zeit:** 10 h. **Kosten:** 0 €. **Metrik:** Öffnungs-/Antwortquote, Veröffentlichungen. **Fehler:** Adresslisten kaufen, Serienmail mit 100 offenen Empfängern (CC statt BCC = Datenschutzpanne!), jede Pressemail derselbe Text.

**Schritt 3.7.3 – Product Hunt / Show HN / Indie Hackers vorbereiten (T-4 bis T-1 W)**

- [ ] **Ziel:** Ein einmaliger Reichweiten-Peak in der englischsprachigen Tech-Szene, ohne Kostenexplosion.
- **Handlung:** **Product Hunt:** Maker-Profil aufbauen (4 Wochen vorher aktiv sein), Produktseite (Tagline ≤ 60 Zeichen, Beschreibung, 5+ Galerie-Bilder, Video), „Hunter"/eigener Post, Erster-Kommentar-Text, Launch-Uhrzeit früh (Pacific Time; vor Nutzung Plattformregeln prüfen). **Show HN:** Titel „Show HN: tuur – audio city guide that tells the story where you stand" – **Regeln beachten** (nutzbar ohne Login/Bezahlung? Das ist bei tuur teils gegeben: erste Tour gratis, aber App-Download nötig; Alternative: Web-Stadtseiten mit Audio-Beispiel als „Try it now"-Link, siehe 2.10). Keine Upvote-Aufrufe (Regelverstoß). **Indie Hackers/Reddit r/SideProject:** Build-in-Public-Beitrag „What I learned building an AI audio guide", Zahlen ehrlich.
- **Kostenlenkung:** Der Traffic kommt weltweit, aber nur vorgewärmte Städte liefern Top-Qualität. **Vor dem Launch:** in Text klar schreiben: „Works everywhere, best in: <Städte>". Tagesbudget und Kill-Switch im Admin prüfen (4.5).
- **Zeit:** 8 h. **Kosten:** 0 €. **Metrik:** Upvotes/Kommentare, Web-Besuche (UTM), Installs. **Fehler:** Launch ohne Antwort-Kapazität am Launch-Tag; Kommentare ignorieren; „Bitte upvote!" per DM.

### 3.8 ASO komplett

**Hinweis Limits (vor Nutzung prüfen):** Apple App Store: Name 30, Untertitel 30, Keyword-Feld 100 Zeichen, Promo-Text 170, Beschreibung 4.000, „Neuheiten" 4.000 (developer.apple.com → App Store Connect Hilfe „Platform version information"). Google Play: App-Name 30, Kurzbeschreibung 80, Vollständige Beschreibung 4.000 (support.google.com/googleplay/android-developer → „Erstelle einen Store-Eintrag"). **Die unten gezählten Zeichen stimmen zum Schreibzeitpunkt mit meinem Wissensstand; zähle sie beim Einfügen selbst nach.**

**Schritt 3.8.1 – Metadaten festlegen (T-6 W)**

- [ ] **Ziel:** Vollständige, konsistente Store-Metadaten DE + EN.
- **App Store (iOS) – Deutsch**
  - **Name (25/30):** `tuur: KI-Audio-Stadtguide`
  - **Untertitel (28/30):** `Geschichten zu Fuß & per Rad`
  - **Keywords (96/100, Komma ohne Leerzeichen, keine Wiederholung von Wörtern aus Name/Untertitel):** `audioguide,stadtführung,sightseeing,reiseführer,radtour,geschichte,sehenswürdigkeiten,städtetrip`
  - **Promo-Text (120/170):** `Erste Tour pro Ort gratis: Lauf oder radel los, tuur erzählt dir Geschichten zu dem, was du gerade siehst. Auch offline.`
- **App Store (iOS) – Englisch**
  - **Name (25/30):** `tuur: AI Audio City Guide`
  - **Subtitle (26/30):** `Stories on foot or by bike`
  - **Keywords (95/100):** `audioguide,walking tour,sightseeing,travel guide,bike tour,history,landmarks,city break,offline`
  - **Promo Text:** `First tour in each place is free: start walking or cycling and tuur tells you the story of what you see. Works offline, too.`
- **Google Play – Deutsch:** Titel (25/30) `tuur: KI-Audio-Stadtguide`; Kurzbeschreibung (79/80) `Dein KI-Audioguide: Stadtführung im Ohr, zu Fuß oder mit dem Rad, auch offline.`
- **Google Play – Englisch:** Titel (25/30) `tuur: AI Audio City Guide`; Short description (78/80) `Your AI audio guide: city tours in your ear, on foot or by bike, even offline.`
- **Beschreibung Deutsch (ca. 1.900 Zeichen, Limit 4.000; passt für App Store und Play):**

```text
Lauf los, tuur erzählt. tuur ist dein Audio-Stadtguide für Spaziergänge und Radtouren: Sobald du an einem Ort ankommst, erzählt dir eine KI-Stimme die passende Geschichte, wie ein Stadtführer im Ohr.

SO FUNKTIONIERT'S
• Öffne tuur, wähle eine Tour oder gehe einfach los.
• Kopfhörer rein, Bildschirm aus: tuur erzählt zur richtigen Zeit.
• Die erste Tour pro Ort ist gratis.

VIER WEGE, EINE STADT ZU ENTDECKEN
• Standardtour: fertige Touren für den Ort, in dem du bist.
• Route planen: sag tuur, wie viel Zeit du hast und wohin du willst.
• Weggabelung: an jeder Station zwei Vorschläge, du entscheidest.
• Streifzug: einfach loslaufen, tuur erzählt, was am Weg liegt.

FÜR FUSSGÄNGER UND RADFAHRER
tuur passt die Länge der Erzählung deinem Tempo an. Auf dem Rad gibt es kurze Geschichten, beim Stehenbleiben „Mehr erfahren". Bist du schnell unterwegs, pausiert tuur.

FAKTEN MIT QUELLEN
Die Erzählungen werden von KI aus Quellen wie Wikipedia, Wikidata und OpenStreetMap erstellt, automatisch geprüft und als KI-Inhalt gekennzeichnet. Zu jeder Erzählung gibt es ein Transkript. Fehler kannst du direkt in der App melden.

AUCH OHNE NETZ
Lade Touren vorab herunter (Karte, Audio, Bilder) und nutze sie offline.

DEIN STANDORT BLEIBT BEI DIR
Deine Position wird auf deinem Gerät verarbeitet. Für die Inhalte geht nur ein grobes Kartenquadrat an unsere Server. Analytics und Crashberichte sind aus, bis du zustimmst. Du kannst ohne Konto starten.

FAIR UND TRANSPARENT
Erste Tour pro Ort gratis, weitere Touren mit Tour-Guthaben oder im Abo. In der kostenlosen Nutzung siehst du gekennzeichnete Werbung. Partner-Stationen sind als „Anzeige · Partner" markiert.

Wichtig: Achte unterwegs auf den Verkehr. tuur erzählt per Audio, der Bildschirm kann aus bleiben.

Kartendaten © OpenStreetMap-Mitwirkende. Bilder: Wikimedia Commons mit Urhebernennung in der App.
```

- **Beschreibung Englisch (ca. 1.750 Zeichen):**

```text
Just walk. tuur tells the story. tuur is your audio city guide for walks and bike rides: when you arrive somewhere, an AI voice tells you the story of the place, like a guide in your ear.

HOW IT WORKS
• Open tuur, pick a tour or simply start walking.
• Earbuds in, screen off: tuur speaks at the right moment.
• The first tour in each place is free.

FOUR WAYS TO EXPLORE A CITY
• Standard tour: ready-made tours for the place you are in.
• Plan a route: tell tuur how much time you have and where you want to go.
• Crossroads: two suggestions at every stop, you decide.
• Roam: just start walking, tuur tells you what is along the way.

FOR WALKERS AND CYCLISTS
tuur adapts the length of each story to your pace. On a bike you get short stories; when you stop you can tap "Learn more". If you are moving fast, tuur pauses.

FACTS WITH SOURCES
Stories are generated by AI from sources such as Wikipedia, Wikidata and OpenStreetMap, checked automatically and labeled as AI content. Every story has a transcript. You can report mistakes right in the app.

EVEN WITHOUT A NETWORK
Download tours in advance (map, audio, images) and use them offline.

YOUR LOCATION STAYS WITH YOU
Your position is processed on your device. Only a coarse map square is sent to our servers to load content. Analytics and crash reports stay off until you agree. You can start without an account.

FAIR AND TRANSPARENT
The first tour in each place is free; further tours use tour credits or a subscription. Free use shows labeled ads. Partner stops are marked "Ad · Partner".

Important: watch the traffic. tuur speaks through audio, the screen can stay off.

Map data © OpenStreetMap contributors. Images: Wikimedia Commons, credited in the app.
```

- **Zusatzhinweise ASO:**
  - Keyword-Feld: kein „App", keine Marken Dritter, kein Preisversprechen (Regeln prüfen: Apple Review Guidelines 2.3.7 – „keine irreführende Metadaten"; vor Nutzung prüfen).
  - Wörter aus **Name und Untertitel** zählen bereits als Keywords; **nicht** im Keyword-Feld wiederholen. Singular/Plural: Apple erkennt beides oft; teste (Recherche via Apple Ads Keyword-Popularität).
  - Für Play: Keywords fließen in Titel, Kurz- und Langbeschreibung; natürliche Wiederholung (3–5x) des Hauptbegriffs „Audioguide"/„Stadtführung".
  - **Kategorien:** Primär **Reisen** (Travel / „Reisen & Lokales" bei Play). Sekundär (iOS): **Navigation** oder **Bildung** – wähle die, die du **ehrlich** beschreiben kannst (tuur ist keine Turn-by-Turn-Navigation; Navigation-Kategorie kann falsche Erwartungen wecken). Vorschlag: **Reisen + Bildung**. Vor Nutzung prüfen: Kategorienlisten in ASC/Play Console.
  - **Altersfreigabe:** Fragebogen ehrlich beantworten. Die Datenschutzerklärung schließt Kinder unter 16 aus (`docs/RELEASE.md` Abschnitt 4: „not for children under 16"). **Nicht** in Kinder-/Familien-Kategorien einreichen. Ergebnis (z. B. 4+/12+) hängt vom Fragebogen ab, Apple hat das System geändert (Altersstufen, vor Nutzung prüfen). Play: IARC-Fragebogen.
  - **Datenschutz-Labels (konsistent mit `docs/RELEASE.md` Abschnitt 4):** Standort (präzise Position bleibt auf dem Gerät für App-Funktion; nur Kartenquadrat an Server; einmalige Position für Routenplanung/Einlösung), Kennungen (User-ID, Geräte-ID für Werbung), Käufe, Diagnose (nur mit Einwilligung), Nutzungs-/Werbedaten (AdMob). Für Android „Data safety" entsprechend; Löschungs-URL `<web>/delete-account`. **Im Marketingtext nichts versprechen, was das Label nicht abdeckt.** Prüfe vor jedem Update, dass Beschreibung, Label und Datenschutzerklärung übereinstimmen.
  - **Links:** Support-URL, Marketing-URL (`https://tuur.app`), Datenschutz (`/legal/privacy`), AGB (`/legal/terms`).
  - **Lokalisierung:** DE (Deutschland/Österreich/Schweiz), EN (US/UK/Alt). Weitere Sprachen erst, wenn die App sie liefert (A-11).

**Schritt 3.8.2 – Screenshot-Storyboard (8 Motive; T-6 W)**

- [ ] **Ziel:** 6–8 Screenshots, die in 3 Sekunden „Was ist das?" beantworten.
- **Stil (Marke):** weißer Hintergrund, Headline in fetter, runder Plus Jakarta Sans, **ein** roter Akzent (Pin oder Wort), realer UI-Ausschnitt (nie erfundene Funktionen zeigen). Screenshots aus dem echten Build (Simulator/Gerät) in einer **vorgewärmten Stadt** (Qualität!). Bilder mit Attribution nur, wenn sichtbar; iPhone-Rahmen optional. Größen prüfen (App Store Connect Screenshot-Spezifikationen, vor Nutzung prüfen).

| Nr. | Motiv (echte Screens) | Headline DE | Headline EN | Botschaft/Persona |
|---|---|---|---|---|
| 1 | Home: Karte + Modi + Touren „Touren in <Stadt>" | **Lauf los. tuur erzählt.** | **Just walk. tuur tells.** | Kernversprechen (alle) |
| 2 | Player: Karte mit roter Route + Herz-Pin, Bild-Karussell, roter Fortschritt | **Die Geschichte, genau dort, wo du stehst.** | **The story, right where you stand.** | Städtereisende |
| 3 | Modi-Auswahl (Standardtour, Route planen, Weggabelung, Streifzug) | **Vier Wege, deine Stadt zu entdecken.** | **Four ways to explore.** | Alle |
| 4 | Weggabelung: zwei Vorschläge mit Teaser + Gehzeit | **Du entscheidest an jeder Ecke.** | **You decide at every corner.** | Einheimische |
| 5 | Rad-Szene/Streifzug-Ansicht | **Kurze Geschichten für dein Tempo.** | **Short stories at your pace.** | Radtouristen |
| 6 | Transkript + KI-Hinweis + „Fehler melden" | **Mit Quellen. Zum Nachlesen. Ehrlich als KI markiert.** | **Sourced. Readable. Honestly labeled AI.** | Geschichtsfans, Vertrauen |
| 7 | Download-Manager (Offline) | **Auch ohne Netz.** | **Even offline.** | Reisende |
| 8 | Onboarding-Berechtigungen/Datenschutz-Erklärung ODER Paywall/Erste-Tour-gratis | **Deine Position bleibt auf deinem Gerät.** (Fußnote: „Nur ein grobes Kartenquadrat geht an unsere Server.") | **Your position stays on your device.** (footnote) | Datenschutz-Bewusste |

- **Reihenfolge nach Wichtigkeit:** 1, 2, 3, 5, 4, 6, 7, 8. Die ersten drei sind in der Suche sichtbar.
- **Zeit:** 8–12 h (Canva-Vorlage). **Kosten:** 0 €. **Metrik:** Konversion Produktseite→Install (siehe Product Page Optimization 5.9). **Fehler:** Erfundene UI; Hintergrund rot flächig (Marke: sparsam); zu kleine Schrift; nicht-echte Bewertungen/Preise in den Bildern.

**Schritt 3.8.3 – App-Vorschau-Video (30 s; T-6 W)**

- [ ] **Ziel:** Ein Video, das ohne Ton funktioniert (Untertitel), 15–30 s (Apple-Limits vor Nutzung prüfen).
- **Skript (DE):**
  | Sek. | Bild | Text/Ton |
  |---|---|---|
  | 0–3 | Straße, Person geht, Kopfhörer | Untertitel: „Du gehst hier oft vorbei." |
  | 3–8 | Home-Screen, Tour tippen | „Weißt du, was hier passiert ist?" |
  | 8–16 | Player, Route, Bilder, Erzähler-Audio (KI-Stimme) | Ausschnitt (max. 6 Sek.) aus echter Erzählung; Untertitel |
  | 16–21 | Modi-Wechsel (Weggabelung/Streifzug) | „Vier Wege, deine Stadt zu entdecken." |
  | 21–26 | Rad + Kopfhörer einseitig ODER Offline-Download | „Kurze Geschichten für dein Tempo. Auch offline." |
  | 26–30 | Logo (Wortmarke rot), „Erste Tour pro Ort gratis" | „tuur. Lauf los." + Hinweis „KI-Stimme" |
- **Werkzeug:** iOS/Android-Bildschirmaufnahme, CapCut/DaVinci. **Zeit:** 6 h. **Kosten:** 0 €. **Fehler:** Musik ohne Lizenz; falsche Funktionen; Video zeigt Gerät, das App-Store-Richtlinien für Vorschauen verletzt (nur App-Inhalte; Regeln prüfen).

**Schritt 3.8.4 – Custom Product Pages / Custom Store Listings (T-2 W)**

- **Handlung:** Erstelle 3 CPP (iOS): „Städtereisende", „Rad", „Einheimische" mit passendem ersten Screenshot und Text; je Kanal ein eigener Link. Play: Custom Store Listings für dieselben Segmente (prüfe Verfügbarkeit im Konto).
- **Zeit:** 3 h. **Kosten:** 0 €. **Metrik:** Konversion pro CPP. **Fehler:** Zu früh testen (< 500 Aufrufe je Variante).

### 3.9 Launch-Städte-Wahl

**Warum wichtig:** Jede neue Region kostet KI-Geld und liefert variable Qualität. Marketing ist ein **Kostenverstärker**: Wer eine Stadt bewirbt, in der nichts vorgewärmt ist, bezahlt für Kaltstart-Erlebnisse und riskiert schlechte erste Eindrücke.

**Schritt 3.9.1 – Bewertungsmatrix ausfüllen (T-8 W)**

- [ ] **Ziel:** 6–8 Kandidatenstädte bewerten, 3 wählen.
- **Handlung:** Bewerte jede Stadt 1–5 je Kriterium, multipliziere mit Gewicht, addiere. **Die Beispielwerte unten sind nur Hypothesen zum Ausprobieren, keine Fakten.**

| Kriterium | Gewicht | Wie prüfen |
|---|---|---|
| **Touristische Nachfrage** (Stadt wird oft besucht, viele Suchanfragen) | 3 | Google Trends (Suchbegriff „<Stadt> Sehenswürdigkeiten"), Tourismus-Statistik der Stadt (selbst recherchieren) |
| **Inhaltliche Datenlage** (Wikipedia-Artikel, Wikidata, OSM-Dichte) | 3 | Im Admin nach Ingest: Status `ready`, Score-Verteilung; Wikipedia-Artikelanzahl in der Nähe selbst prüfen |
| **Kompaktheit** (Highlights in 60–120 Minuten erlaufbar) | 2 | Karte ansehen, Highlights-Tour prüfen |
| **Erreichbarkeit für dich** (Testen, Partner besuchen, Content drehen) | 3 | Entfernung/Zeit |
| **Partner-Potenzial** (Cafés, Radverleihe, Museen, Hostels) | 2 | Google Maps Suche/Branchenlisten |
| **Community/Sprache** (deutsch- oder englischsprachige Communities, lokale Accounts) | 2 | Reddit/Instagram Suche |
| **Rad-Tauglichkeit** (Radwege, Radtourismus) | 1 | Radkarten, ADFC-Infos |
| **Konkurrenzdichte** (weniger gut, Free-Walking-Tours sind Partner/Wettbewerber) | 1 | Store-Suche, Tour-Anbieter |
| **Pre-Warm-Kosten** (Größe des Stadtgebiets in Kacheln, Anzahl Touren) | 2 (inverse) | Admin: Kachelanzahl × Kosten pro Kachel |

**Kandidatenliste (Vorschläge zum Prüfen, nicht zum Glauben):** `<HEIMATSTADT>`; große Städte mit englischsprachigen Touristen (z. B. Berlin, München, Hamburg, Wien); kompakte „Postkartenstädte" mit viel Wikipedia-Material (z. B. Rothenburg ob der Tauber – in den Testfixtures enthalten –, Heidelberg, Bamberg, Regensburg, Salzburg); Radtourismus-Städte an bekannten Radwegen.

**Bewertungstabelle (Ausfüllfeld):**

| Stadt | Nachfrage ×3 | Daten ×3 | Kompakt ×2 | Erreichbar ×3 | Partner ×2 | Community ×2 | Rad ×1 | Konkurrenz ×1 | Kosten ×2 | **Summe** |
|---|---|---|---|---|---|---|---|---|---|---|
| <HEIMATSTADT> | | | | | | | | | | |
| Kandidat 2 | | | | | | | | | | |
| Kandidat 3 | | | | | | | | | | |

**Empfehlung mit Begründung (Vorschlag, prüfe mit deiner Matrix):**

1. **Heimatstadt** – Du kannst jede Tour selbst gehen, Partner persönlich besuchen, lokale Presse/Vereine kennen, Content schnell drehen. Sie ist dein **Qualitätslabor** und dein erster **Partner-Beweis**.
2. **Eine große touristische DACH-Stadt mit hoher englischer Nachfrage** (Beispiele s. o.): Bringt Suchvolumen und englischsprachige Nutzer; erfordert **mehr Kacheln** (höhere Pre-Warm-Kosten), dafür starke Wikipedia-Basis.
3. **Eine kompakte Postkartenstadt** (1–2 Highlight-Touren reichen): Beste Qualität pro KI-Euro, ideal für Videos und Stadtseiten.

Nicht empfohlen zum Start: „Weltweit" bewerben; mehr als 3 Städte; ländliche Gebiete (Status `low_content` wahrscheinlich, siehe Fixture Uckermark).

**Schritt 3.9.2 – Pre-Warm-Checkliste (Admin; T-8 bis T-2 W je Stadt)**

Was der Admin laut `docs/PROGRESS.md` (Phase 11) **tatsächlich** kann: Gebietsübersicht (Kacheln nach Status/Kosten), Ingest manuell auslösen/wiederholen, Gebiete sperren/entsperren, Auto-Touren prüfen/bearbeiten/sperren/anpinnen, POIs ausblenden/gewichten/Zusatzfakten, Narrationen ansehen/neu erzeugen/sperren, Feedback-Queue, Partner-Freigabe, KI-Konfiguration (Modelle, Prompt-Version, Grounding, Kill-Switch, Budgets, Rate-Limits, Preise), Kosten-Dashboard. **Nicht vorhanden:** ein „Stadt aufwärmen"-Knopf, der alles auf einmal erzeugt. Deshalb:

- [ ] **Ziel:** Vor jeder Kampagne sind Gebiet, Touren und Erzählungen der Stadt erzeugt, geprüft und kostenkontrolliert.
- **Exakte Handlung:**
  1. [ ] **Budget zuerst:** Im Admin „AI config": Tages- und Gebietsbudget und Kill-Switch prüfen; Google-Cloud-Billing-Budget-Alert anlegen (RELEASE Abschnitt 2). Notiere Ausgangswert der Kosten (Dashboard „Heute/7 Tage").
  2. [ ] **Modelle verifizieren:** `config/ai` Modellnamen gegen aktuelle Gemini-Dokumentation prüfen (RELEASE Abschnitt 1, D16), sonst erzeugst du Erzählungen mit abgekündigten Modellen.
  3. [ ] **Stadt in Kacheln zerlegen:** Bestimme die Kacheln der Innenstadt (Geohash Präzision 6, ca. 1,2 × 0,6 km je Kachel – **vor Nutzung prüfen**; Admin-Weltkarte zeigt Kacheln). Ziel: die 10–30 Kacheln mit den meisten Highlights (Altstadt, Bahnhofsumfeld, Radwege).
  4. [ ] **Ingest auslösen:** Im Admin für jede Kachel „Retry ingest" bzw. beim Öffnen der App an der Stelle (`ensureArea` löst Nachbarn mit aus). Prüfe Status `ready`; bei `low_content`: Kachel aus dem Werbeumfeld nehmen oder POIs im Admin gewichten.
  5. [ ] **Touren erzeugen:** Beim ersten User entstehen Auto-Touren automatisch (Spezifikation 4.3). Öffne als „erster User" in der App an einer Stelle in der Stadt (oder mit Demo/Simulations-Modus, falls in deinem Build vorhanden) und lasse die Standardtouren erzeugen. Prüfe im Admin (Tours): 60-min-Highlights, 2-h-Große Runde, Thementouren; sinnvolle Stopps, keine Doppelungen, keine Umwege.
  6. [ ] **Free-Tour prüfen:** Die **kürzeste** Standardtour ist automatisch `free` (Spezifikation 6.2). Das ist deine Visitenkarte: Wenn sie langweilig ist, kaufen Nutzer nie eine zweite. **Prüfe im Admin, ob du die Free-Markierung auf die beste kurze Tour legen kannst**; falls nicht möglich, passe Tour-Länge/Stopps an oder ergänze Entwicklungswunsch 8.2/11.
  7. [ ] **Erzählungen erzeugen und prüfen:** Ein **vollständiger Download** einer Tour triggert die Generierung aller Stopps (Spezifikation 4.3/4.8) – nutze das, um die 3 Kern-Touren in **Deutsch und Englisch** vorzugenerieren (jeweils alle Längenstufen der gewählten Sprache; Kosten je Sprache!). Höre mindestens 30 % der Stopps jeder Tour komplett (Faktencheck mit Wikipedia). Fehler: im Admin Narration sperren/neu erzeugen oder Zusatzfakten setzen. Bewusst **nicht** alle Nebenkacheln vorwärmen.
  8. [ ] **Touren pinnen/sperren:** Beste Touren „anpinnen", schwache sperren (Admin). Ziel: Eine Nutzerin sieht in der Stadt nur Touren, die du selbst gehört hast.
  9. [ ] **Partner-Layer:** Pilot-Partner (5.7) freigeben (Admin) und Kennzeichnung „Anzeige · Partner" in der Tour prüfen.
  10. [ ] **Kosten notieren:** Nach Abschluss: Tageskosten-Delta ⇒ `K_stadt` (Kosten für Aufwärmen dieser Stadt) und Kosten pro Tour/Erzählung; trage sie in 5.6 ein. Wenn `K_stadt` > 10 % deines Marketingbudgets: Stadt verkleinern.
  11. [ ] **Live-Test:** Gehe eine Tour real (30 Min), Hintergrund, Kopfhörer. Erst dann Content drehen.
  12. [ ] **Regelmäßig:** Alle 4–8 Wochen Stichprobe erneut hören (Daten ändern sich, Inhalte verfallen; areas haben Ablaufdatum).
- **Werkzeug:** Admin (`/admin`), App, Notizen. **Zeit:** 8–16 h pro Stadt. **Kosten:** `K_stadt` (**unbekannt, musst du messen**; Hypothese: wenige € bis zweistellige € pro Stadt, abhängig von Modell, Stopps, Sprachen).
- **Erfolgsmetrik:** ≥ 3 geprüfte Touren, ≥ 30 gehörte Stopps, Free-Tour-Qualität 4/5 (Selbstbewertung), `K_stadt` dokumentiert.
- **Fehler vermeiden:** Kampagne starten, ohne vorher gehört zu haben; nur Deutsch vorwärmen, aber englische Touristen bewerben; Modellnamen nicht geprüft; Tagesbudget zu klein (mitten im Launch Kill-Switch) oder zu groß (Kostenexplosion).

**Entwicklungswunsch (Empfehlung):** „Stadt-Aufwärmen" als Admin-Aktion (Polygon oder Kachelliste → Ingest → Auto-Touren → Erzählungen der Top-3-Touren in gewählten Sprachen → Bericht mit Kosten). Das weicht bewusst von der Nicht-Ziel-Regel „keine proaktive weltweite Vorab-Generierung" ab (Spezifikation 12), ist aber **stadtbegrenzt, budgetiert und manuell** → in `docs/DECISIONS.md` als neue Entscheidung festhalten. Aufwand: 4–6 Tage.

### 3.10 Preis- und Angebots-Tests

**Ausgangslage (Annahme A-5):** Einzeltour/Credit 1,99 €, Abo 4,99 €/Monat, optional Jahresabo; Preise liegen in den Stores/RevenueCat. Produkt-IDs laut RELEASE: `tuur_credit_1`, `tuur_credit_5`, `tuur_sub_monthly`, `tuur_sub_yearly`.

**Schritt 3.10.1 – Angebots-Experimente planen (T-3 W)**

- [ ] **Ziel:** Ein Startangebot festlegen und 3 Experimente für die ersten 3 Monate definieren.
- **Handlung:** Halte **Regeln** ein: (1) nur **ein** Faktor gleichzeitig, (2) mindestens 4 Wochen oder 300 Käuferbesuche je Variante (Hypothese), (3) Ergebnisse dokumentieren (5.9), (4) keine Preisdiskriminierung, die AGB/Recht verletzt, (5) Preise stehen im Store, Marketing zeigt „ab", keine Fantasiepreise.
  | Experiment | Variante A | Variante B | Messgröße |
  |---|---|---|---|
  | E1 Einführungsaktion | Ohne Aktion | Abo mit 7-Tage-Testphase (Introductory Offer in App Store Connect/Play, prüfen) | Testphase-Start, Konversion zu Zahlung, Kündigungsquote |
  | E2 Paketgrößen | Nur 1er-Credit sichtbar | 1er + 5er-Paket (Produkt existiert laut RELEASE) mit Rabatt-Anker | Durchschnittsumsatz pro Zahler |
  | E3 Paywall-Zeitpunkt | Paywall bei 2. Tour | Paywall nach Fortschritt der 1. Tour (Teaser der nächsten) | Konversion, Absprung |
- **Werkzeug:** RevenueCat (Experiments/Offerings; Verfügbarkeit im Tarif prüfen), App Store Connect, Play Console. **Zeit:** 6 h. **Kosten:** 0 € (RevenueCat-Preis prüfen; große Umsatzschwelle beachten).
- **Fehler vermeiden:** Zu früh testen (kleines n); Preise per Region unbedacht; **Widerrufs-Kontrollkästchen**/AGB nicht mit Aktion synchron; Testphasen ohne klare Kündigungshinweise (Apple/Play-Pflichten, § 356 BGB).

**Weitere Ideen:**
- **Einführungsaktion:** Launch-Woche „Erste Tour pro Ort gratis + 1 Guthaben zum Kennenlernen" – benötigt Admin-Grant/Promo-Mechanik (8.2/3). Ohne Entwicklung: Marketing-Aussage bleibt **„Erste Tour pro Ort gratis"** (existiert).
- **Beta-Dank:** siehe 3.4.
- **Einladungs-Mechanik:** siehe 3.11.
- **Belohnte Werbung** deckt kostenlose Nutzer ab (Standardtouren); nicht als „gratis alles" bewerben.
- **Zeitlich begrenzte Saison-Angebote** (Advent, Radsaison) als Push-freie Kommunikation (Newsletter, Social).

### 3.11 Referral-Loop-Design mit den vorhandenen Einladungslinks

**Ist-Zustand (aus Spezifikation 6.3 + PROGRESS Phase 9):** Wer eine **Standardtour gekauft** hat, kann sie **2x per Link verschenken**. Invite-Token: einmal einlösbar, an die Tour gebunden, gehasht, läuft nach **14 Tagen** ab (AGB). Landingpage `apps/web/app/invite/[token]` mit Store-Links; Universal Links/App Links (Platzhalter für Team-ID/Fingerabdruck müssen vor Release ersetzt werden). Geschenkte Touren können nicht weiter verschenkt werden. **Es gibt keine Belohnung für den Einladenden** und **keinen Weg, eine kostenlose Tour zu teilen**.

**Was realistisch ist (ohne Code):**
- Käufer bitten (in Support-Mail/Post-Purchase-Text – nicht in der App ohne Code): „Verschenke deine Tour an 2 Freunde." Mund-zu-Mund im Freundeskreis.
- Creator/Partner bekommen Tour-Links **nur** über normale Käufe (kein Gratis-Kontingent) → nicht praktikabel für Massen-Seeding.

**Was Code braucht (Wunschliste, Aufwand grob in Entwicklertagen):**

| Nr. | Wunsch | Effekt | Aufwand |
|---|---|---|---|
| R1 | **Free-Tour teilen** („Diese Tour hat mir gefallen"): Web-Seite `/t/<tourId>` mit Titel, Kurzbeschreibung, 30-s-Audio-Beispiel, Store-Links | Virale Basis: jeder Nutzer wird Werbeträger (auch ohne Kauf) | 2–3 Tage |
| R2 | **Einlader-Belohnung:** Wenn Eingeladene eine Tour **abschließen**, erhält der Einlader 1 Guthaben (serverseitig, Missbrauchsschutz: nur echte Konten, Limit pro Monat, keine Selbst-Einladung, Geräte-/Konto-Heuristiken ohne Fingerprinting) | Klarer Anreiz | 3–5 Tage |
| R3 | **Deferred Deep Link** (Invite-Token übersteht Store-Installation): Android Install Referrer; iOS: nach Installation Code-Eingabe oder Zwischenseite (keine heimlichen Pasteboard-Tricks) | Reibung senken | 2–4 Tage |
| R4 | **Promo-/Creator-Codes** (Freischalt-Code → Guthaben; Zähler pro Code für Revenue-Share) | Creator-Kooperationen messbar | 3–4 Tage + Rechtsprüfung (Store-Regeln für Freischaltmechanismen, App-Store-Richtlinie 3.1.1 vor Nutzung prüfen; alternativ Apple Offer Codes/Google-Promo-Codes) |
| R5 | **Admin „Guthaben schenken"** (Beta-Tester, Creator, Support-Kulanz) | Dankeschöns ohne Store-Codes | 1–2 Tage |
| R6 | **Einladungs-Statistik im Admin** (erzeugt/eingelöst/abgeschlossen, aggregiert) | Messung | 1 Tag |

**Schritt 3.11.1 – Referral-Loop-Regeln (T-2 W)**

- [ ] **Ziel:** Schleife definieren: *Nutzer beendet Tour → Teilen-Angebot → Freund öffnet Seite → installiert → erste Tour → beendet → …*
- **Handlung:** Zeichne die Schleife auf ein Blatt; markiere jeden Schritt: „existiert / braucht Code". Ziel-Kennzahl **Viralitätsfaktor k = Einladungen pro Nutzer × Konversion** (Hypothese: k = 0,05–0,2 realistisch; > 1 ist nicht zu erwarten). **Keine** Rewards für Bewertungen, **keine** Belohnung für Spam-Einladungen (Nutzer ohne Einwilligung des Empfängers; per Link/Share-Sheet, nicht durch Adressbuch-Upload).
- **Zeit:** 2 h. **Kosten:** 0 €. **Metrik:** Einladungen/Zahler, Einlösequote, Abschlussquote der Eingeladenen. **Fehler:** Eingebaute „Kontakte importieren"-Funktion (DSGVO), zu großzügige Belohnung (Betrug), Anreiz, der Bewertungen oder Downloads künstlich hochzieht.


---

## 4. Release-Woche (T-7 bis T+7)

**Grundsätze:** (1) T0 = ein **Dienstag oder Mittwoch** (Hypothese: Wochenmitte gibt dir Reaktionszeit; kein Freitag-Launch ohne Support). (2) Apple/Google-Review braucht Zeit (Apple oft Tage, Google bei neuen Konten länger – **vor Nutzung prüfen**): reiche das Release-Build **spätestens T-14** ein, stelle den Apple-Release auf **„manuell freigeben"**, nach Freigabe live schalten. (3) Du bist am Launch-Tag **allein zuständig**: plane Schlaf, Essen, feste Prüfzeiten. (4) Plane **keine** neuen Funktionen in der Release-Woche (Feature-Freeze).

### 4.1 T-7 bis T-1 (Tag für Tag)

| Tag | Aufgaben (jeweils Checkbox) | Zeit |
|---|---|---|
| **T-7** | [ ] Store-Review-Status prüfen, evtl. Ablehnungsgründe beantworten (Hintergrund-Standort-Begründung und Demo-Video, RELEASE 4) [ ] `node scripts/check-release.mjs` grün [ ] letzte Regression: Onboarding, Tour, Offline, Kauf, Restore, Invite-Deep-Link [ ] Universal-Link-Dateien (`apple-app-site-association`, `assetlinks.json`) mit echten Werten live | 4 h |
| **T-6** | [ ] Creator-Seeding: Zugang (TestFlight/Promo-Codes) + Briefing + Fakten-Freigabe-Prozess [ ] Content-Batch 1 (5 Videos) fertig (Tour des Tages je Launch-Stadt) [ ] Warteliste-Mail (9.11) fertigstellen | 5 h |
| **T-5** | [ ] **Presse-Vorabinformation unter Embargo** (Mail 9.1, Embargo bis T0 08:00) an 10–15 persönlich ausgewählte Kontakte [ ] Partner-Piloten: Aufsteller/Sticker platzieren (Vor-Ort-Besuche), Angebote im Portal prüfen [ ] Landingpage: Store-Links vorbereitet (noch nicht öffentlich) | 4 h |
| **T-4** | [ ] Support-Setup: Postfach `support@`, FAQ live (Web), Vorlagen (9.5), Ansprechzeiten [ ] Monitoring-Dashboards öffnen: Crashlytics (opt-in Daten), Admin-Kosten, Google-Cloud-Billing, RevenueCat, App Store Connect/Play Console [ ] **Kill-Switch-Übung**: im Admin an/aus testen, Verhalten der App prüfen | 3 h |
| **T-3** | [ ] Kosten-Trockenlauf: 20 Testerinnen bitten, gleichzeitig Touren in der Launch-Stadt zu starten, Kosten beobachten [ ] Budgets endgültig setzen (Tagesbudget, Gebietsbudget, Rate-Limits) [ ] Billing-Alerts auf 50/80/100 % [ ] Pre-Warm-Checkliste (3.9.2) je Stadt final | 4 h |
| **T-2** | [ ] Countdown-Posts [ ] Landingpage-Texte final, Presse-Seite live [ ] Launch-Post (9.6) in 4 Varianten vorbereiten (LinkedIn, Bluesky/X, Instagram, Reddit) [ ] Product-Hunt-/Show-HN-Texte final | 4 h |
| **T-1** | [ ] Release-Build final geprüft, alles Freigegeben [ ] Warteliste-Mail geplant (T0 09:00) [ ] Content-Batch 2 (Launch-Tag-Videos) geplant/hochgeladen (Buffer) [ ] Notfallkontakte, Telefonnummer der Familie für Ausfälle [ ] früh schlafen | 3 h |

### 4.2 Launch-Tag (T0) – Stunde für Stunde

**Uhrzeiten sind Vorschläge (MEZ). Passe an dein Zeitfenster an.**

| Zeit | Aktion | Werkzeug/Zweck |
|---|---|---|
| 06:30 | [ ] Store-Status prüfen; Apple „Freigeben" auslösen (falls manuell); Google Play Produktion sichtbar? | ASC/Play Console |
| 07:00 | [ ] **Selbsttest**: App im Store suchen, frisch installieren, Onboarding, Tour starten (Free-Tour), **echter Kauf mit eigenem Geld** (später erstatten/verbuchen) und Restore | Gerät |
| 07:30 | [ ] Admin-Dashboard: Kosten, Kill-Switch **aus (normal)**, Tagesbudget geprüft | `/admin` |
| 08:00 | [ ] Embargo endet: **Presse-Mail** an alle (9.1) mit Link zu `/presse` und Store-Links (UTM `presse_<medium>`) | Mail |
| 08:30 | [ ] Landingpage: Store-Buttons freischalten; Warteliste-Mail vorbereiten | Web |
| 09:00 | [ ] **Warteliste-Mail** senden (9.11) [ ] **Launch-Post** auf LinkedIn/Bluesky/Instagram (9.6) [ ] Product Hunt live (falls geplant; Startzeit prüfen) | Newsletter, Social |
| 09:30 | [ ] Launch-Video (Tour des Tages) auf TikTok, Reels, Shorts | Buffer/manuell |
| 10:00 | [ ] Reddit: in **Wochenthreads/erlaubten Threads** (Regeln!) ehrlich vorstellen; keine Cross-Post-Flut | Reddit |
| 10:30 | [ ] Partner-Piloten informieren, dass es live ist (Foto/Story mit Einwilligung) | Telefon/Insta |
| 11:00 | [ ] **Creator-Videos gehen live** (Absprache); Kennzeichnung „Werbung" prüfen | Creator |
| 12:00 | [ ] **Checkpoint 1:** Installationszahlen, Crash-Rate, Kosten seit 00:00, Support-Postfach, Store-Bewertungen | Dashboards |
| 13:00 | [ ] Kommentare beantworten (Social, PH, Reddit); Feedback in Tabelle | – |
| 15:00 | [ ] **Checkpoint 2:** Kosten vs. Tagesbudget (siehe 4.5 Regeln), Fehlerberichte („Fehler melden"-Queue, Admin) | Admin |
| 16:00 | [ ] Zweiter Content-Drop (Story/Reel) mit erstem Nutzerfeedback (nur mit Erlaubnis) | Social |
| 18:00 | [ ] **Checkpoint 3:** Zahlen, Bugs; entscheide: Hotfix nötig? | – |
| 19:30 | [ ] Persönliche Dankes-Nachricht an Beta-Tester/Community | Mail/Post |
| 21:00 | [ ] Letzter Blick: Kosten, Crash, Support; **Kill-Switch-Schwelle prüfen** | Admin |
| 22:00 | [ ] Launch-Log schreiben (Zahlen, Fehler, Learnings), schlafen | Notiz |

**Launch-Tag-Ziele (Hypothesen, nicht Versprechen):** 50–300 Installs (abhängig von Warteliste/Creator/Presse), ≥ 40 % Tour-Start, 0 kritische Bugs, 0 Kostenspitzen über Tagesbudget.
**Fehler vermeiden:** 20 Kanäle gleichzeitig bespielen; Support ignorieren; Kosten-Dashboard nicht prüfen; Bewertungen erbitten oder belohnen.

### 4.3 T+1 bis T+7 (Tag für Tag)

| Tag | Fokus | Aufgaben |
|---|---|---|
| **T+1** | Stabilität | [ ] Crash-/Fehler-Triage [ ] Antworten auf alle Support-Mails [ ] Hotfix-Entscheidung [ ] Danke-Post mit ehrlichen Zahlen (z. B. „Wir hatten X Nutzer, Y Touren …") |
| **T+2** | Presse-Nachfassung | [ ] Höfliche Nachfass-Mail (nur bei Nicht-Reaktion, einmal) an Journalisten, Mail 9.1b [ ] Lokalredaktionen anrufen |
| **T+3** | Content | [ ] Tour-des-Tages #2 in zweiter Stadt [ ] erstes Nutzer-Feedback als Post (mit Erlaubnis) |
| **T+4** | Partner | [ ] 5 neue Partner-Gespräche vor Ort [ ] ersten Pilotbericht (Impressionen/Besuche) besprechen |
| **T+5** | Kosten & Qualität | [ ] Kosten pro aktiver Nutzer/Tour prüfen [ ] gemeldete Fehler im Admin abarbeiten [ ] Free-Tour-Qualität stichprobenartig prüfen |
| **T+6** | ASO | [ ] Rezensionen lesen, sachlich antworten (Vorlagen 9.5) [ ] Keyword-Ranking notieren |
| **T+7** | Retro | [ ] Wochenreview: Funnel, Kosten, Bugs, Kanäle; 3 Entscheidungen für Woche 2; Launch-Retro (4.8) |

### 4.4 Support-Bereitschaft

- [ ] **Ziel:** Jede Nachricht innerhalb von 24 h (Werktage), Kritisches innerhalb von 4 h am Launch-Tag.
- **Handlung:** Zentrales Postfach `support@<domain>` (Adresse aus `OPERATOR_*`-Daten konsistent halten), Filter „Kritisch" (Daten, Kauf, Fehler, Sicherheit), FAQ-Seite online, Antwortvorlagen (9.5), Eskalationsliste: (a) Rückerstattung → Store-Prozess erklären, (b) Datenschutzauskunft/Löschung → In-App oder `/delete-account`, (c) Faktenfehler → Fehlerformular/Admin, (d) Partner → Portal. **Feste Sprechzeiten** kommunizieren.
- **Zeit:** 1–2 h/Tag in der Launch-Woche. **Kosten:** 0 €. **Metrik:** Erstantwortzeit; Anteil gelöst in einer Antwort. **Fehler:** Rückerstattungsversprechen; Personendaten in KI-Tools kopieren (2.11).

### 4.5 Monitoring und Kill-Switch-Regeln

**Was du beobachtest:**
- **Crashlytics** (nur von Nutzern mit Einwilligung; entsprechend lückenhaft) und Store-Crash-Statistiken (App Store Connect/Play Console – vollständiger).
- **Admin-Kosten-Dashboard** (`usageLogs`, Tages- und 7-Tage-Kosten je Art, Budget, Kill-Switch).
- **Google-Cloud-Billing-Alerts** (50/80/100 %) plus **Cloud-Functions-Fehler-Alerts** und Uptime-Check auf `health` (RELEASE Abschnitt 6).
- **RevenueCat** (Käufe, Refunds), **App Store Connect/Play** (Installs, Bewertungen).
- **Admin-Feedback-Queue** („Fehler melden").

**Kill-Switch-Entscheidungstabelle (Vorschlag; Schwellen an dein Tagesbudget `B` in `config/ai` binden):**

| Beobachtung | Schwelle | Aktion |
|---|---|---|
| Kosten seit 00:00 | > 50 % von `B` vor 12:00 | Rate-Limits pro Nutzer/Gebiet im Admin **senken**; Marketingpost pausieren; Quelle der Anfragen prüfen (Gebiete in Admin-Weltkarte) |
| Kosten seit 00:00 | > 80 % von `B` | Nicht-vorgewärmte Gebiete **sperren** (Admin: Gebiet sperren); Rest-Budget für Launch-Städte reservieren; Post ändern: „Best in X, Y" |
| Kosten | 100 % von `B` | Budget stoppt Generierung automatisch (Produkt-Verhalten, D19); Cache-Treffer laufen weiter. **Kommuniziere ehrlich:** Status-Post (Vorlage 4.9-C) |
| Ungewöhnliche Nachfrage aus einer Region ohne Marketing | z. B. neue Kacheln außerhalb Launch-Städte in Massen | Prüfen ob Bot/Missbrauch → Kill-Switch **an**, App Check/Rate-Limits prüfen, Gebiete sperren |
| Faktenfehler viral oder ≥ 3 unabhängige Meldungen zum selben Text | – | Narration **sperren/neu erzeugen** (Admin), Post-Korrektur (4.9-A) |
| Sicherheits-/Datenvorfall | jeder Verdacht | **Kill-Switch an**, Vorgehen 4.9-B |
| Crash-Rate | > 2 % der Sitzungen (Hypothese) | Hotfix-Build; ggf. Store-Rollout stoppen (Play: gestaffelt; Apple: Phased Release bei Updates) |

**Regel:** Kill-Switch **ohne Zögern** nutzen; ein pausierter Dienst ist billiger als ein Kostenexplosions-Wochenende. Du **kommunizierst** danach.

### 4.6 Bewertungs-Strategie (ohne Manipulation)

- **In-App-Review-Prompt** existiert derzeit **nicht** (PROGRESS/Repo). Entwicklungswunsch 8.2/7 (0,5–1 Tag; `expo-store-review`, Apple begrenzt Anzeigen pro Jahr, Details prüfen). **Zeitpunkt:** direkt **nach einer abgeschlossenen Tour** („Tour beendet"-Bildschirm), **frühestens nach der 2. abgeschlossenen Tour**, nie nach Fehlern/Paywall/Werbung, nie während laufender Audio-Wiedergabe.
- **Wortlaut** (falls eigener Vorab-Dialog): *„Hat dir die Tour gefallen? Wir freuen uns über deine Bewertung im Store."* – **ohne** Gegenleistung. Optional zweiter Button: „Feedback an uns" (interne Formular-Seite). Beachte: Manche Plattform-Richtlinien lehnen „Review Gating" (nur Zufriedene zum Store leiten) ab. Vor Nutzung prüfen; sicherste Variante ist der **systemeigene Prompt** ohne Vorfilter.
- **Verboten:** Belohnungen/Guthaben/Rabatte **gegen Bewertung**, Bewertungen kaufen, Fake-Konten, Freunde/Familie massenhaft zur 5-Sterne-Bewertung drängen, negative Bewertungen melden ohne Grund.
- **Antworten auf Bewertungen:** sachlich, kurz, mit Namen, 24–48 h. Kritik → Lösung + Kontakt (Vorlagen 9.5).
- **Ziel:** ≥ 4,3 Sterne bei ≥ 30 Bewertungen nach 3 Monaten (Hypothese). **Fehler:** Auf ein 1-Sterne-Wutposting emotional antworten.

### 4.7 Creator-Seeding und Presse-Follow-up in der Launch-Woche

- [ ] **Creator:** T-6 Zugang; T0 Video live; T+1 Kommentare beantworten; T+3 Auswertung (Klicks, Installs im Fenster, CPP); T+7 Dank + Feedback-Gespräch.
- [ ] **Presse:** T-5 Embargo-Info; T0 08:00 Versand; T+2 einmaliges Nachfassen; T+7 „Learnings"-Beitrag für Lokalredaktion. **Nicht** täglich nachhaken.
- [ ] **Partner:** T0 informieren; T+4 erster Statistik-Austausch.
- **Metrik:** Anzahl Erwähnungen, Backlinks, Installs im Zeitfenster.

### 4.8 Launch-Retro (T+7)

- [ ] Funnel (1.4) für die Woche ausfüllen
- [ ] Was hat die meisten Installs gebracht? (UTM/CPP)
- [ ] Wie hoch waren die KI-Kosten pro aktiver Nutzerin? (5.6)
- [ ] Welche 3 Bugs/Faktenfehler waren am häufigsten?
- [ ] 3 Entscheidungen für Woche 2; 1 Sache **einstellen**
- **Fehler:** Retrospektive nur schreiben, nicht umsetzen.

### 4.9 Krisenplan mit fertigen Antwortvorlagen

**Grundregeln:** (1) **Erst stoppen, dann erklären**: Schaden begrenzen (Narration sperren, Kill-Switch, Gebiet sperren). (2) **Schnell, ehrlich, kurz**: erste öffentliche Reaktion innerhalb von 2–4 Stunden, Details später. (3) **Kein Verstecken, kein Schuldabwälzen.** (4) Zweiter Blick vor Veröffentlichung (Freund/Anwalt bei Datenpanne). (5) Nach der Krise: Ursache, Änderung, Datum.

**Szenario A: Ein KI-Faktenfehler wird viral** (falsche Behauptung über ein Denkmal, Person, Ereignis, Betrieb)

- [ ] Sofort: Narration im Admin **sperren/neu erzeugen** (Tour ggf. sperren), Screenshot/Beleg sichern, Quelle prüfen (Wikipedia/Wikidata).
- [ ] Ursachenanalyse: Quellfehler (Wikipedia) oder Modellfehler? Falls Quellfehler: Hinweis an die Wikipedia-Community (nicht selbst „umschreiben, um Recht zu behalten").
- [ ] Zusatzfakt im Admin setzen, damit Narrationen neu erzeugt werden (Admin-Funktion laut PROGRESS Phase 11).
- [ ] Antwort (Post/Kommentar):

  > *„Danke für den Hinweis, das war falsch. Unsere KI-Erzählung hat an dieser Stelle einen Fehler gemacht. Wir haben den Text gesperrt und prüfen die Quelle. Die korrigierte Version ist in <Zeitraum> online. tuur erzählt aus Quellen wie Wikipedia und OpenStreetMap, prüft automatisch und kennzeichnet KI-Inhalte – trotzdem passieren Fehler. Wer einen findet, kann ihn in der App mit ‚Fehler melden' schicken. Das hilft uns wirklich."*

- [ ] Presseanfrage: Kurzstatement (max. 3 Sätze) + Ansprechpartner. **Nicht** behaupten, Fehler seien „extrem selten", ohne Zahl.
- [ ] Danach: Prüfquote erhöhen, Prompt-Version prüfen (Admin, `config/ai`), Fall in `docs/DECISIONS.md`/PROGRESS notieren.
- **Fehler vermeiden:** Rechtfertigen, dass „die KI halt so ist"; Kommentar löschen; Fakten selbst ohne Quelle „korrigieren".

**Szenario B: Datenpanne / Sicherheitsvorfall** (Zugriff auf Daten, versehentliche Offenlegung, Fehlkonfiguration)

- [ ] Sofort: Kill-Switch an, betroffene Systeme absichern (Regeln/Keys rotieren), Beweise sichern (Logs), Umfang bestimmen.
- [ ] **DSGVO:** Meldung an die zuständige Aufsichtsbehörde **binnen 72 Stunden** nach Kenntnis, falls Risiko für Betroffene (Art. 33 DSGVO); Benachrichtigung der Betroffenen bei hohem Risiko (Art. 34) – **Rechtsanwalt/Datenschutzberatung sofort einbinden**. Prüfe die Behörde in `OPERATOR_*` (Aufsichtsbehörde-Feld).
- [ ] Dokumentation (was, wann, wer, welche Daten, Maßnahmen).
- [ ] Vorlage (nach Rechtsprüfung):

  > *„Wir haben am <Datum> einen Sicherheitsvorfall festgestellt. Betroffen sind <Datenarten>, <Anzahl> Personen. Wir haben <Sofortmaßnahmen> ergriffen und die Datenschutzbehörde informiert. Du musst <Empfehlung> tun. Wir melden uns bei allen Betroffenen per E-Mail. Fragen: <Datenschutz-Kontakt>. Es tut uns leid."*

- **Fehler vermeiden:** Warten, „ob es jemand merkt"; falsche Beruhigung („keine Daten betroffen"), bevor geprüft ist; Details veröffentlichen, die Angriffe erleichtern.

**Szenario C: Kostenexplosion** (Bot-Traffic, viraler Post in nicht vorgewärmter Region, Fehlkonfiguration)

- [ ] Sofort: Kill-Switch an; Ursache (Gebiete, Nutzerzahlen, Endpunkte) im Admin/Cloud-Logs; Gebiete sperren; App Check/Rate-Limits prüfen; Google-Cloud-Billing-Alerts/Limits prüfen.
- [ ] Marketing-Posts anpassen/pausieren.
- [ ] Nach Klärung: Budget neu setzen, Kill-Switch aus.
- [ ] Nutzer-Kommunikation:

  > *„Sehr viele von euch sind heute gleichzeitig unterwegs – danke! Damit tuur bezahlbar bleibt, begrenzen wir gerade, wie viele neue Gebiete pro Tag erzeugt werden. In <Städten> läuft alles normal. In neuen Gebieten kann es heute länger dauern, oder wir erzählen erst morgen. Bereits geladene Touren funktionieren wie gewohnt, auch offline."*

- **Fehler vermeiden:** Weiter werben, obwohl Budget leer; Budget einfach erhöhen ohne Ursache; Nutzer im Ungewissen lassen.

**Szenario D (kurz): App-Review-Ablehnung/Store-Sperre**
- [ ] Ablehnungsgrund lesen, sachlich antworten (Beweise, Demo-Video für Hintergrund-Standort), Fix, neu einreichen; Launch-Kommunikation verschieben; **nicht** die Community mit Beschwerden gegen Apple/Google mobilisieren. Kontakt: Resolution Center/Play Console Support.

**Szenario E (kurz): Partner-Kennzeichnung/Anzeige-Vorwurf**
- [ ] Prüfe im Produkt: Label „Anzeige · Partner" sichtbar? Antwort: „Partner-Stationen sind gekennzeichnet; sie erscheinen mit einem begrenzten Sichtbarkeits-Bonus." (Fakten: AGB §6, D28). Falls Bug: schnell beheben und öffentlich sagen.


---

## 5. Nach dem Release (T+1 Woche bis T+12 Monate)

### 5.1 Wochenrhythmus (ab T+2)

**Feste Wochenstruktur (10–15 h/Woche; passe an):**

| Tag | Fokus | Aufgaben | Zeit |
|---|---|---|---|
| **Montag** | **Zahlen** | [ ] Funnel-Tabelle (1.4) für die Vorwoche ausfüllen (Installs, Tour-Starts/-Abschlüsse aus verfügbaren Quellen, Käufe, Bewertungen, Kosten) [ ] Kosten-Dashboard (Admin) [ ] 3 Erkenntnisse, 1 Entscheidung [ ] Kanal-Regel prüfen (6.2) | 1,5 h |
| **Dienstag** | **Content** | [ ] Tour des Tages/der Woche auswählen, hören, Fakten prüfen (2.9) [ ] 1–2 Videos drehen/schneiden | 3 h |
| **Mittwoch** | **Partner & B2B** | [ ] 3–5 Partnergespräche/Besuche [ ] Follow-ups (5.7) [ ] Pilotpartner-Statistik besprechen | 3 h |
| **Donnerstag** | **Community & Support** | [ ] Kommentare, Reddit, Support, Bewertungen [ ] Feedback-Queue („Fehler melden") im Admin abarbeiten | 2 h |
| **Freitag** | **Optimierung** | [ ] ASO/CPP-Test prüfen (5.9) [ ] SEO-Stadtseite (2.10) veröffentlichen [ ] Wochen-Log, Backlog-Wünsche an Entwicklung | 2,5 h |
| **Monatlich** | **Review** | [ ] Kohortenanalyse, Unit-Economics-Tabelle (5.6) aktualisieren [ ] Tool-Budget (2.1) [ ] Stadt-Qualitätsstichprobe [ ] Regeln aus 6.2 anwenden | 3 h |

**Erfolgsmetrik:** Du schaffst 8 von 10 Wochen alle fünf Blöcke. **Fehler:** Montag-Zahlen auslassen („keine Zeit") – dann steuerst du blind.

### 5.2 Die sechs Wachstumsschleifen

Ein **Loop** ist ein Kreislauf, bei dem ein Ergebnis des Marketings den nächsten Zulauf erzeugt. Starte Loops (a) und (b) zuerst, (c) und (d) danach, (e) und (f) laufend.

#### (a) Content-Loop mit echten Touren

**Kreislauf:** Neue Stadt/Tour geprüft → Tour des Tages (Video, Audio, Text) → Social-Reichweite → Installs → mehr Touren gehört (Cache = keine Zusatzkosten) → neue Fehler-Meldungen verbessern Qualität → besserer Content.

- [ ] **Handlung:** 2–3 Videos/Woche aus dem Content-Prozess (2.9); Serien: „Tour des Tages", „Fehler der KI (wir korrigieren live)", „3 Dinge, die du auf deinem Weg zur Arbeit nicht wusstest" (nur aus echten Erzählungen), „Radtour-Story", „Was war hier vorher?". Jedes Video: Hook 2 s, Wert 20 s, CTA 3 s.
- **Metrik:** Sehdauer ≥ 50 %, Saves/Shares, Link-Klicks; **Regel:** Nach 8 Videos ohne Video über 1.000 Views → Format ändern (Hook, Länge, Stadt).
- **Fehler vermeiden:** Content nur für Reichweite (kein Link, kein CTA); Tour-Content aus ungeprüften Städten; Kanäle vermischen.

#### (b) SEO-Loop (Stadtseiten)

**Kreislauf:** Geprüfte Stadt → Stadtseite (Abschnitt 2.10) → Suche „Audioguide <Stadt>" → Klick → Install/Stadt-Newsletter → Nutzungsdaten (welche Stadt funktioniert) → nächste Stadtseite.

- [ ] **Handlung:** 1–2 Seiten/Woche; interne Verlinkung (Stadtübersicht → Stadt → Tour); Search Console wöchentlich (Impressionen, Klicks, Position); Seiten mit < 5 Klicks nach 12 Wochen **verbessern oder `noindex`**.
- **Metrik:** Indexierte Seiten, Klicks/Woche, Klicks auf Store-Button. **Fehler:** Massenerzeugung ohne Prüfung, Duplicate Content, Seiten für Städte, in denen tuur nichts Gutes liefert (schlechter Ersteindruck).

#### (c) Referral-Loop (Einladungen)

**Kreislauf:** Nutzer kauft/teilt → Freund erhält Link → Landingpage → Install → erste Tour → Teilen (siehe 3.11).

- [ ] **Handlung (ohne Code):** Post-Kauf-Hinweis in Support-Antworten/Store-Beschreibung? (nicht in der App möglich ohne Code). **Mit Code:** R1 (Free-Tour teilen), R2 (Einlader-Belohnung), R3 (Deferred Deep Link).
- **Metrik:** Einladungen pro Zahler, Einlösequote, k-Faktor. **Regel:** Wenn nach 8 Wochen weniger als 5 % der Zahler einladen → R1/R2 priorisieren statt weitere Anzeigen.
- **Fehler vermeiden:** Adressbuch-Import, Belohnung für Sockenpuppen-Accounts, Bewertungen belohnen.

#### (d) Partner-Loop

**Kreislauf:** Betrieb wird Partner → Aufsteller/Sticker/QR-Kärtchen im Laden („Hier erzählt tuur" oder „Tour-Angebot: X") → Kundschaft/Touristen installieren → Besuche/Einlösungen in Statistik → Partner-Fallstudie → weitere Partner (Empfehlung/Verband).

- [ ] **Handlung:**
  1. **Offline-Material (Kosten ca. 100–150 € für Startauflage, prüfen):** Aufsteller A6 (Tischaufsteller), Fenster-Sticker (rund, ca. 10 cm), Kärtchen (Visitenkarten-Größe) mit **QR-Code zum Store/Landingpage** (`https://tuur.app/?utm_source=partner_<name>&utm_medium=qr&utm_campaign=aufsteller`) und Text: „Erste Tour gratis. Lass dir <Stadt> erzählen." Keine Angebote im QR bewerben, die es im Produkt nicht gibt. **Achtung:** Der Aufsteller-QR (Werbung für die App) ist etwas anderes als der Einlöse-QR im Produkt (App → Partner-Scanner).
  2. Markenregeln: weiß, **roter Pin**, Wortmarke aus `assets/brand/logo/`, Kontrast, Mindestgröße QR (ca. 2,5 × 2,5 cm, testen!).
  3. **Partner-Fallstudie** nach 8–12 Wochen: Zahlen aus dem Partnerportal (Impressionen, Besuche, Einlösungen), ein Zitat des Inhabers (**nur mit Freigabe, nicht erfunden**), Foto (mit Einwilligung), Ergebnis in 1 Seite, Website `/partner-info`, LinkedIn-Post, Verbandsnewsletter.
  4. **Selbstbewerbung:** Auf `/partner-info` und im Portal-Registrierungsflow klaren Nutzen zeigen; Partner-Empfehlungsprogramm (Empfehle einen Betrieb, erhalte 1 Monat gratis – braucht Entwicklung/Stripe-Gutschrift; optional).
- **Metrik:** Partner-Anzahl, Installs über Aufsteller-UTM, Einlösungen pro Partner, Partner-Kündigungsquote (Ziel: < 15 % im Quartal, Hypothese).
- **Fehler vermeiden:** Partner-Statistiken **personenbezogen** darstellen (nur aggregierte Zahlen); Partner versprechen, was das Produkt nicht liefert (Besucherzahl-Garantie); Aufsteller ohne QR-Test.

#### (e) Creator-/Community-Loop

**Kreislauf:** Creator zeigt tuur in seiner Stadt → Installs → beste Nutzer-Momente (Erlaubnis!) → Creator-Reposts → Nachahmer-Creator.

- [ ] **Handlung:** Ab T+4 W: 5 weitere Creator/Monat; **Regel:** Creator mit CPP/UTM-Klicks ≥ 0,5 % Klickrate auf ihre Story-Views oder einem Installs-Ergebnis über deinen Erwartungswert behalten, andere nicht wiederholen. „Tour-Challenge": 1 Tour/Woche in einer Stadt, Ergebnis-Clip taggen (kein Gewinnspiel ohne Regeln, 7.3).
- **Metrik:** Installs/Creator, Kosten pro Install, Wiederholungsquote. **Fehler:** Creator-Videos ohne Kennzeichnung; „Empfehlung" für Produkte, die der Creator nicht genutzt hat.

#### (f) Saison-/Event-Marketing

**Kreislauf:** Anlass → thematische Tour/Aktion → Content/Presse/Partner → Installs → nächster Anlass. **Termine im Voraus und prüfen**, viele Termine wechseln pro Jahr/Stadt.

| Anlass | Zeitraum (prüfen) | Idee |
|---|---|---|
| Fahrradsaison | März–Oktober | „Radtour-Wochen": Radmodus, Partner Radverleih, Radverband-Newsletter |
| Osterferien/Pfingsten/Brückentage | jährlich | „Kurztrip-Guide": Tour des Tages in Postkartenstädten |
| Lange Nacht der Museen/Museumsnacht | je Stadt | Partner Museen, Thementour Kunst & Kultur |
| Tag des offenen Denkmals | jährlich im Spätsommer (Termin prüfen) | Geschichts-Tour mit Denkmal-Fokus, Presse |
| Sommerferien | Juli–September | Familien? (tuur ist nicht für Kinder unter 16 – nicht auf Kinder zielen), Gäste-Guides |
| Advent/Weihnachtsmärkte | Nov–Dez | „Advents-Tour" (Kulinarik, Geschichte), Partner Gastronomie |
| Silvester/Neujahr | Dez–Jan | „Stadt-Rückblick: Was in <Stadt> geschah" nur mit belegten Fakten |
| Stadtjubiläen/Feste | je Stadt | lokale Presse, Stadtmarketing-Kooperation |

- **Handlung:** 6 Wochen vorher Kalender prüfen, 4 Wochen vorher Tour prüfen/pinnen (Admin), 2 Wochen vorher Content, 1 Woche vorher Presse. **Kosten:** 0–100 €. **Metrik:** Saison-Installs vs. Vorwochen. **Fehler:** Aktionen ohne geprüfte Tour; Saison-Content nach Ende weiter promoten.

### 5.3 Erweiterung in neue Städte: Kosten-Nutzen-Regel

**Regel:** Eine neue Stadt wird erst beworben, wenn **alle** folgenden Bedingungen in den bestehenden Städten erfüllt sind (Hypothesen; passe nach 3 Monaten mit echten Daten an):

- [ ] Activation (Install → erste Tour abgeschlossen) ≥ 35 %
- [ ] Bewertung ≥ 4,0 bei ≥ 20 Bewertungen
- [ ] Kosten pro aktiver Nutzerin (KI+Infrastruktur) ≤ 50 % des Erlöses pro aktiver Nutzerin (5.6)
- [ ] ≥ 2 Partner pro bestehender Stadt **oder** ≥ 100 organische Installs/Monat pro Stadt
- [ ] Pre-Warm-Kosten der neuen Stadt `K_neu` ≤ 10 % des monatlichen Marketingbudgets
- [ ] Du hast Kapazität für die Qualitätsprüfung (8–16 h)

**Entscheidungsregel:** Wenn nach 8 Wochen weniger als 25 % dieser Bedingungen erfüllt → **nicht erweitern**, bestehende Städte verbessern.

### 5.4 Bezahlte Kanäle: Apple Ads (früher Apple Search Ads), Basic zuerst

**Wann erst? (Product-Market-Fit-Signale, Hypothesen):** Activation ≥ 35 %; Tour-Abschluss ≥ 40 %; Zahlungsquote ≥ 2 % der Installs; Retention/Wiederkehr (Woche-2-Nutzung) ≥ 15 % (je nach Messbarkeit); Bewertung ≥ 4,2; ≥ 300 organische Installs in 4 Wochen; Kostenkennzahlen aus 5.6 sind positiv genug (CPI-Zielwert > 0). **Sonst kein Geld für Anzeigen** (ASO und Organik zuerst).

**Schritt 5.4.1 – Apple Ads Basic einrichten (frühestens T+8 W)**

- [ ] **Ziel:** Ein kleines, lernendes Suchanzeigen-Experiment, das nur installiert, wenn jemand nach Begriffen sucht.
- **Exakte Handlung:** (1) Konto bei ads.apple.com (Apple Ads; Bezeichnung/Funktion **vor Nutzung prüfen**, da Apple das Produkt umbenannt hat). (2) **Basic** wählen: Apple wählt Keywords/Platzierung automatisch, du legst **monatliches Budget** und **maximalen Preis pro Installation (CPI)** fest (Details, Länder und Limits im Programm prüfen). (3) **Start:** 5–10 €/Tag (150–300 € im Monat), **nur Deutschland**, nur iPhone. (4) **Custom Product Page** passend zur Kampagne (Städtereisende/Rad). (5) Nach 3–4 Wochen zu **Advanced** wechseln (Keyword-Kontrolle) oder aufhören.
- **Keywords zum Testen (Advanced):** exakt/„Broad": `audioguide`, `stadtführung`, `audioguide berlin`/`<stadt>`, `stadtführung app`, `sightseeing`, `radtour`, `reiseführer`; **negative** Keywords: `kostenlos download`, Marken Dritter (Regeln beachten), unpassende Begriffe (`navigation auto`, `wanderkarte`, falls unpassend).
- **CPI-Zielwerte (nicht raten, ausrechnen):** `CPI_max = M × x`, wobei `M` = Marge pro Install (5.6) und `x` = Anteil, den du bereit bist, für Akquise auszugeben (Startwert 0,3–0,5; Hypothese). Wenn `CPI_max` unter dem tatsächlichen CPI liegt (Apple Ads zeigt den Ist-CPI), ist die Kampagne **nicht profitabel**; sie darf dann nur als Lern-Budget laufen. **Keine Benchmarks von mir:** Suche „CPI travel apps Germany" selbst, nutze Quellen mit Datum, oder nur deinen Ist-Wert.
- **Abbruchkriterien (Vorab festlegen):** (a) 2 Wochen ohne einen Install, (b) CPI > 2 × `CPI_max` nach 100 Klicks, (c) Activation der Ads-Nutzer < 25 %, (d) Zahlungsquote 0 nach 200 Installs, (e) Kostenaufwand pro Stadt über Pre-Warm-Budget.
- **Werkzeug:** Apple Ads, ASC (Product Page Views, Download-Quelle „Apple Ads"). **Zeit:** 3 h Setup + 1 h/Woche. **Kosten:** 150–300 €/Monat (Stufe B/C). **Metrik:** Impressionen, Tap-Through-Rate (TTR), CPI, Activation, Zahlungen.
- **Fehler vermeiden:** Budget zu hoch starten; unpassende Länder; Tagesbudget ohne Obergrenze; Marken-Keywords Dritter; alles auf einmal ändern.

### 5.5 Meta-/TikTok-Ads-Tests (Mini-Budget) und Google Ads

**Meta (Instagram/Facebook) und TikTok – Kreativ-Tests:**
- [ ] **Vorbedingung:** PMF-Signale (5.4) **und** Landingpage-CPP-Messung; **kein** Tracking-SDK in der App → Attribution eingeschränkt (Store-Console, UTM, CPP, iOS SKAdNetwork-Berichte durch Plattform). **Kein Meta-Pixel/TikTok-Pixel auf der Website ohne Einwilligung** (Datenschutz-Widerspruch zum Produktversprechen). Nimm die Kosten für „Konversionsmessung" nicht als gegeben an.
- **Handlung:** Budget-Limit **100–300 €** gesamt für den ersten Test; 3 Kreativ-Varianten (Video „Tour des Tages", Video „Fehler? Wir korrigieren", Statisch „Erste Tour gratis"), jede 5–7 Tage, 5–10 €/Tag; Zielgruppe: Geo (Launch-Stadt + Umkreis), Interessen (Reisen, Radfahren, Geschichte); KI erzeugt **Text/Hook-Varianten** (P-13), **du** prüfst Fakten; Video-Material aus echten Erzählungen; Anzeige **als Werbung** (Plattform-Kennzeichnung).
- **Erfolgsmetrik:** Kosten pro Landingpage-Klick, Klick→Install (über CPP/Store), Kosten pro Install; **Abbruch:** CTR < 0,5 % nach 5.000 Impressionen (Hypothese) oder CPI > `CPI_max` × 2.
- **Fehler vermeiden:** Kreative mit erfundenen Zitaten/Sternen; Retargeting-Listen mit Wartelisten-Mailadressen ohne Einwilligung (verboten); Anzeigen ausspielen in Gebieten, die nicht vorgewärmt sind.

**Google Ads – nur mit klarer Regel:**
- **Regel:** Google Ads nur, wenn (1) PMF-Signale erfüllt, (2) die **Stadtseiten (2.10)** existieren und gut konvertieren, (3) du **Suchanzeigen** auf Long-Tail-Begriffe („audioguide <stadt>", „stadtführung selbst") mit Ziel Stadtseite schaltest, (4) Messung über Search-Console/Analytics-frei (UTM + Store-Stats) reicht. **Keine** App-Kampagnen (Universal App Campaigns), solange keine Conversion-Messung datenschutzkonform vorhanden ist (vor Nutzung prüfen).
- **Budget:** 5 €/Tag Test für 4 Wochen. **Abbruch:** Klickpreis über 1 € ohne Installs (Hypothese) oder Kosten pro Install > `CPI_max` × 2.

### 5.6 Unit Economics: Formeln, Rechenbeispiel und Tabellen-Vorlage

**Ziel:** Du erkennst, ob ein bezahlter Nutzer sich lohnt, **bevor** du Geld ausgibst.

**Variablen (alle Werte sind Hypothesen, du ersetzt sie durch echte Zahlen aus RevenueCat/ASC/Admin):**

| Symbol | Bedeutung | Beispielwert (Hypothese) | Wo ermittelst du den echten Wert |
|---|---|---|---|
| `I` | Installs pro Monat | 1.000 | ASC/Play |
| `a` | Anteil aktiver Nutzer (Install → mind. 1 Tour gestartet) | 0,50 | opt-in Analytics/Näherung |
| `p_c` | Anteil Installs mit ≥ 1 Guthaben-Kauf | 0,03 | RevenueCat |
| `n_c` | durchschnittliche gekaufte Guthaben je Käufer (Beobachtungszeitraum) | 2,5 | RevenueCat |
| `P` | Bruttopreis Guthaben | 1,99 € | Store |
| `t` | USt-Satz (im Preis enthalten; DE 19 %, Ausland abweichend) | 0,19 | Steuerberatung |
| `f` | Store-Provision | 0,15 oder 0,30 | Store-Programm (A-9) |
| `p_s` | Anteil Installs mit Abo | 0,005 | RevenueCat |
| `Pm` | Bruttopreis Abo/Monat | 4,99 € | Store |
| `m` | durchschnittliche bezahlte Abo-Monate | 3 | RevenueCat |
| `r_ad` | Netto-Werbeumsatz je **aktivem** Nutzer im Betrachtungszeitraum | 0,10 € | AdMob-Bericht |
| `c_ai` | KI-Kosten je Install (Ingest + Erzählungen + TTS, **nur neue** Inhalte; Cache-Treffer ≈ 0) | 0,02 € | Admin-Kosten-Dashboard ÷ Installs |
| `c_var` | sonstige variable Kosten je Install (Routing, Storage, Payment, Support) | 0,01 € | Cloud-Billing ÷ Installs |
| `K_stadt` | Fixkosten Aufwärmen je Stadt (einmalig) | unbekannt | 3.9.2 |

**Formeln:**

```text
Netto je Kauf        N_c = P / (1 + t) * (1 - f)          # Beispiel: 1,99 / 1,19 * 0,85 = 1,42 €
Netto je Abo-Monat   N_s = Pm / (1 + t) * (1 - f)         # Beispiel: 4,99 / 1,19 * 0,85 = 3,56 €
Erlös je Install     R = p_c * n_c * N_c + p_s * m * N_s + a * r_ad
Marge je Install     M = R - c_ai - c_var
Ziel-CAC             CAC_max = x * M                       # x = 0,3 bis 0,5 als Startwert (Hypothese)
CAC (bezahlt)        CAC = Werbekosten / bezahlte Installs
Payback (Monate)     = CAC / (M je Monat)                  # nur sinnvoll bei wiederkehrendem Umsatz (Abo)
Break-even Zahlerquote p_c* = (CAC/x + c_ai + c_var - p_s*m*N_s - a*r_ad) / (n_c * N_c)
```

*(USt und Provision: Apple/Google rechnen je Land/Programm unterschiedlich ab; die Formel ist eine Näherung. Vor Nutzung mit den Store-Auszahlungsberichten und Steuerberatung abgleichen.)*

**Rechenbeispiel (rein illustrativ, aus den Beispielwerten oben):**

```text
Credit-Erlös: 0,03 * 2,5 * 1,42 = 0,107 €
Abo-Erlös:    0,005 * 3 * 3,56  = 0,053 €
Werbung:      0,50 * 0,10       = 0,050 €
R  = 0,21 € je Install
M  = 0,21 - 0,02 - 0,01 = 0,18 € je Install
CAC_max (x=0,5) = 0,09 €
```

**Lesehilfe (ehrlich):** Mit diesen Beispielwerten dürften bezahlte Installs **nur wenige Cent** kosten. Die tatsächlichen Klick-/Installpreise liegen in vielen Märkten höher (**prüfe deinen echten CPI, keine Benchmarks von mir**). Das bedeutet: **Organische Kanäle, Partner und Empfehlungen sind für tuur wirtschaftlich wichtiger als Paid**, außer deine Zahler-/Abo-Quoten sind deutlich höher als im Beispiel. Bezahlte Anzeigen sind dann Test-/Lernbudget, kein Wachstumsmotor. Ein Weg zu besseren Zahlen: höhere Activation (bessere Free-Tour), höhere Abo-Quote (Rad-/Vielnutzer), Partnerumsatz (B2B).

**B2B-Rechnung (Partner):** `Partner-Deckungsbeitrag = Monatspreis netto − Stripe-Gebühren − Betreuungszeit × Stundensatz`. Preise stehen im Admin (Stripe-Preise, Währung pro Land; `config/partners`); ermittle den Ist-Preis dort. Kennzahl: `Zeit bis zum Break-even je Partner (Monate)`.

**Tabellen-Vorlage (Google Sheets/Notion; monatlich aktualisieren):**

| Monat | Installs `I` | aktiv `a` | Käufer `p_c` | Abo `p_s` | Erlös R (€) | KI-Kosten (€) | var. Kosten (€) | Marketing (€) | Marge (€) | CAC (€) | Notizen |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | | | | | | | | | | | |
| M2 | | | | | | | | | | | |
| … | | | | | | | | | | | |

### 5.7 B2B-Partner-Vertrieb

**Zielbetriebe (Priorität):** (1) **Cafés/Bäckereien/Eisdielen** an Tour-Wegen (Laufkundschaft), (2) **Fahrradverleih/Radläden** (Radmodus), (3) **Hostels/kleine Hotels** (Gäste), (4) **Museumsshops/Museen/kleine Galerien** (Kultur), (5) **Free-Walking-Tour- und Stadtführer-Anbieter** (Zusatzangebote), (6) Restaurants/Weinstuben (Kulinarik), (7) Souvenir/Kunsthandwerk/Läden mit Story. **Nicht:** große Ketten (Zentralentscheid), Betriebe außerhalb der Launch-Städte, Betriebe ohne Laufkundschaft.

**Was die Partner bekommen (nur was existiert):** Sichtbarkeit (gedeckelter Score-Boost, immer „Partner"-Label; kann in passenden Routen, Auto-Touren und Weggabelungen vorgeschlagen werden), Angebote (Rabatt/Special mit Bedingungen, Gültigkeit, Tageslimit), QR-Einlösung (betrugssicher), Statistiken (Impressionen, Besuche aggregiert/anonymisiert, Einlösungen), Rechnungen (Stripe Customer Portal). **Nicht versprechen:** garantierte Besucherzahl, feste Platzierung, personenbezogene Daten über Besucher.

**Schritt 5.7.1 – Erstansprache (persönlich, ab T-4 W)**

- [ ] **Ziel:** Ein 10-minütiges Vor-Ort-Gespräch mit Demo.
- **Skript Vor-Ort/Telefon (60 Sekunden):**
  > „Guten Tag, ich bin <Name> von tuur. Das ist eine App, die Touristen und Einheimischen beim Spazierengehen die Geschichten zu Orten erzählt. Ihr Laden liegt genau an unserer Route <Tour>. Ich würde Ihnen gern in 5 Minuten zeigen, wie Ihr Café dort als ‚Partner' erscheinen kann, mit einem Angebot, das Gäste per QR-Code einlösen. Passt es gerade, oder darf ich morgen um <Zeit> nochmal vorbeikommen?"
- **Einwandbehandlung:** „Was kostet das?" → Preis nennen (aus Admin), **Pilot: <X> Wochen zum Testen** (wenn möglich). „Kommen da Leute?" → ehrlich: „Wir sind neu; deshalb Pilot mit Statistik, Sie sehen selbst, was ankommt." „Ich habe keine Zeit." → „Einrichtung 10 Minuten, ich mache sie mit Ihnen."
- **Recherche mit KI (2.7):** Vorab 5 Minuten Recherche (P-08) über den Betrieb; alle Fakten mit Link.
- **Zeit:** 15 Min Vorbereitung + 20 Min Besuch. **Kosten:** 0 €.
- **Metrik:** Gespräche/Woche (Ziel: 10), Demo→Pilot-Quote (Hypothese: 20–30 %), Pilot→zahlend (Hypothese: 30–50 %).

**Schritt 5.7.2 – Demo-Ablauf (10 Minuten)**

1. [ ] Handy: **Ihre Straße in der App** – „So läuft die Tour, hier kommt Ihr Café" (Pilotbetrieb zuvor als Testpartner im Admin freigeben, vorheriges Einverständnis). 2. [ ] Portal: Registrierung, **Firmenprofil** (Name, Adresse, Kategorie, Öffnungszeiten, Bilder, Beschreibung), **POI-Verknüpfung**. 3. [ ] **Angebot** anlegen (z. B. „10 % auf Kaffee & Kuchen nach der Tour", Bedingungen, Gültigkeit, Tageslimit). 4. [ ] **QR-Einlösung**: Demo mit zweitem Handy; **Scanner** im Portal (PWA, Kamera). 5. [ ] **Kennzeichnung** zeigen („Anzeige · Partner", „Partnervorstellung"). 6. [ ] **Statistik** zeigen (Impressionen/Besuche aggregiert). 7. [ ] Preis, Kündigung (Stripe Customer Portal), Vertrag/AGB (`/legal/partner-terms`; anwaltlich prüfen lassen, RELEASE Abschnitt 1).
- **Hinweis:** Partner-Content wird von Admin freigegeben; Profiländerungen führen zu erneuter Prüfung (D29). Erkläre das als Qualitätsschutz.

**Schritt 5.7.3 – Pilot-Programm**

- **Angebot:** 8–12 Wochen Pilot, **Ziel: 3–5 Piloten pro Stadt**. Preis-Umsetzung: prüfe, ob im Admin/Stripe ein Test-/Rabattzeitraum pro Partner setzbar ist (Stripe-Coupon/Trial); falls nicht: Entwicklungswunsch 8.2/15 (Stripe-Promotion-Codes oder Trial, 1–2 Tage).
- **Pilot-Vertrag (1 Seite):** Laufzeit, Leistungen, Kennzahlen (Impressionen/Besuche/Einlösungen), Datum der Auswertung, Recht zur Veröffentlichung der **anonymisierten** Zahlen und (nur mit ausdrücklicher Freigabe) Name/Logo/Zitat, Kündigung.
- **Auswertungsgespräch (Woche 8–10):** Zahlen zeigen, Optimierungen (Angebot, Bilder, Text), Entscheidung Weiterführung.
- **Referenzen:** Fallstudie (5.2/d).

**Schritt 5.7.4 – Follow-up-Sequenz (nur mit vorhandenem Kontakt/Interesse; Vorlage 9.10)**

| Tag | Kanal | Inhalt |
|---|---|---|
| 0 | Vor Ort/Telefon | Erstgespräch, Visitenkarte/Kärtchen mit QR zur Demo |
| +1 | Persönliche Nachricht (die der Betrieb **angeboten** hat: E-Mail auf Bitte, WhatsApp auf Bitte) | Danke + Zusammenfassung + Link zur Partner-Infoseite |
| +7 | Anruf/Besuch | „Haben Sie Fragen? Ich richte mit Ihnen das Profil ein." |
| +21 | Kurze Nachricht | Fallstudie aus Nachbarbetrieb (anonymisierte Zahlen) |
| +45 | Abschluss | „Ich melde mich nicht mehr, außer Sie wünschen. Hier bleibt der Link." |

**DSGVO/UWG: Kaltakquise per E-Mail ist in Deutschland riskant.**
- **Kernproblem:** Werbe-E-Mails an Gewerbetreibende brauchen nach § 7 Abs. 2 UWG in der Regel eine **vorherige ausdrückliche Einwilligung**; „mutmaßliche Einwilligung" reicht nur in engen Ausnahmen (Rechtsprechung streng). Abmahnrisiko durch Wettbewerber/Verbände; zusätzlich DSGVO (Art. 6, 13/14). **Das ist keine Rechtsberatung – lass dein Vorgehen vom Anwalt prüfen.**
- **Sichere Alternativen (bevorzugt):**
  1. **Vor Ort besuchen** (freundlich, Hausrecht respektieren; bei „Nein" sofort gehen).
  2. **Telefon** – nur mit vorherigem Kontakt/erkennbarem Interesse; bei Gewerbetreibenden ist mutmaßliche Einwilligung unter Umständen möglich, aber **riskant**; nur nach Prüfung.
  3. **Post/Brief** mit Rückantwortkarte (grundsätzlich weniger riskant als E-Mail, aber Sperrvermerke beachten; prüfen).
  4. **LinkedIn/Social:** persönliche Kontaktanfrage **ohne** Verkaufspitch, Gespräch aufbauen; keine automatisierten Serien-DMs.
  5. **Verbandskanäle:** DEHOGA-Regionalverbände, IHK, Stadtmarketing, Gewerbevereine, Radverleiher-Netzwerke, Tourismusverband-Newsletter (dort **erscheinen**, nicht selbst versenden).
  6. **Inbound:** `/partner-info` + Kontaktformular „Rückruf erwünscht" (Einwilligung im Formular), Aufsteller, Empfehlungen, Events/Netzwerktreffen.
  7. **Anfragen der Betriebe** beantworten (Antwort auf **deren** Anfrage ist zulässig).
- **Fehler vermeiden:** Gekaufte Adresslisten, automatisierte E-Mail-Serien, LinkedIn-Automatisierung, Sammel-Mails mit offenem Verteiler.

**Wie KI hilft (und wo nicht):** Recherche-Steckbrief pro Betrieb mit Links (P-08), Erstgespräch-Skript anpassen (P-09), Einwandliste, Fallstudien-Text aus **deinen** Zahlen (P-14), Follow-up-Text. **KI erfindet niemals** Details oder Zitate; **keine Personendaten** in Prompts (nur Betriebsname/Website).

### 5.8 Community-Aufbau

| Option | Vorteile | Nachteile | Empfehlung |
|---|---|---|---|
| **Discord** | Themenkanäle (#stadt-berlin, #radtour, #feedback), keine Telefonnummern nötig, kostenlos | Zielgruppe (Reisende 30–60) nutzt Discord wenig; Moderationsaufwand | Später, bei ≥ 500 aktiven Nutzern oder für Tester/Creator |
| **WhatsApp-Community/-Gruppe** | Sehr hohe Nutzung, niedrige Hürde | **Telefonnummern sichtbar**, DSGVO-Risiko, Meta-Konzern, schwer zu moderieren | Nur kleiner Tester-Kreis, mit klaren Regeln; **nicht** als Haupt-Community |
| **Telegram/Signal** | Signal datenschutzfreundlicher | Reichweite geringer | Nische |
| **Instagram-Broadcast/Stories + Kommentare** | Nutzer sind schon da | Weniger Tiefe | **Start hier** |
| **Newsletter (Double-Opt-in)** | Eigene Reichweite, DSGVO gut steuerbar | Aufbau dauert | **Start hier** (Waitlist-Liste) |
| **Kein Gruppenformat** (Feedback per App/Formular) | Null Aufwand | wenig Bindung | Für Woche 1–12 ausreichend |

**Empfehlung:** Erst Instagram + Newsletter + In-App-Feedback. Discord erst, wenn es echte Fragen/Diskussion gibt.

**Moderationsregeln (Vorlage; Prompt P-12 hilft beim Feinschliff):**
1. Sei freundlich: keine Beleidigung, keine Diskriminierung.
2. Keine Werbung/Spam/Links ohne Freigabe; keine Weitergabe personenbezogener Daten.
3. Fehler in tuur: gern melden (Kanal #feedback oder in der App), mit Ort und Beschreibung.
4. Keine Screenshots mit Personen ohne Einwilligung.
5. Sicherheit: kein Filmen/Tippen beim Radfahren; Verkehr geht vor.
6. Moderation: 1. Verwarnung, 2. Timeout, 3. Ausschluss; Entscheidungen begründet; Beschwerdeweg per Mail.
7. Community-Team: du + 1–2 freiwillige Moderatoren (nach 3 Monaten).
8. Datenschutzhinweis im Kanal-Header; Löschbitte wird erfüllt.

### 5.9 Retention und Optimierungs-Zyklen

**Retention (ehrlich):** tuur ist bei Touristen oft **anlassbezogen** (Reise → Nutzung → Pause). Retention entsteht durch (a) Einheimische (Streifzug/Route planen im Alltag), (b) Wiederkehr im nächsten Urlaub, (c) neue Städte/Touren, (d) Abo-Vielnutzer (Radler). Erwarte kein „täglich aktiv".

- **Push-Benachrichtigungen:** **Aktuell keine Push-Infrastruktur** in der App (Repo-Stand, A-6). **Entwicklungswunsch 8.2/5**: `expo-notifications`, nur mit **Opt-in** (nach Wert-Moment, nicht im Onboarding), Themen-Schalter („Neue Touren in meiner Stadt", „Saison-Tipps"), Frequenz-Limit (max. 1/Woche), Sprache/Zeitzone, Deep-Link ins Ziel; Server-Versand über Cloud Functions/FCM; DSGVO: Push-Token pseudonym, Löschung mit Konto. Aufwand 4–6 Tage. Bis dahin: **kein** Push versprechen.
- **Andere Retention-Mittel:** (1) **Newsletter** (Waitlist/optionales Opt-in; Vorschlag: In-App-Newsletter-Opt-in als Wunsch 8.2/13), (2) **Home-Screen „Neu/Saison"** (Admin-Pin der Saisontour; ohne Push), (3) **Social/Community** (Tour des Tages), (4) **Partner-Angebote** (Grund für Rückkehr), (5) **E-Mail nur transaktional** (Belege), (6) **Wiedereinladung im Store**: Neuheiten-Text „Was ist neu" ehrlich.
- **Metrik:** Wiederkehr in Woche 2 (Hypothese: 10–20 %), Zweite abgeschlossene Tour innerhalb 30 Tagen (Ziel 25 %), Abo-Kündigungsquote.

**Optimierungs-Zyklen (ASO A/B-Tests):**

- [ ] **Ziel:** Alle 4–6 Wochen ein Test, jedes Ergebnis dokumentiert.
- **iOS – Product Page Optimization:** In App Store Connect bis zu 3 Varianten der Produktseite (Icon, Screenshots, Vorschauvideo) gegen die Original-Seite (nur organischer Traffic; Laufzeit und Limits **prüfen**). Nicht testbar: Name, Untertitel, Beschreibung (prüfen).
- **Android – Store Listing Experiments** (Play Console): Symbol, Feature-Grafik, Screenshots, Kurzbeschreibung, Beschreibung; Zielgruppen/Sprachen.
- **Vorgehen:** (1) Hypothese („Screenshot 1 mit ‚Lauf los' konvertiert besser als mit ‚Vier Wege'"), (2) **nur eine** Änderung, (3) Stichprobe: bis das Werkzeug „signifikant" anzeigt, mindestens 2–4 Wochen (Hypothese), (4) Gewinner ausrollen, (5) Ergebnis dokumentieren.
- **Test-Reihenfolge:** 1) erster Screenshot, 2) Icon/Videovorschau, 3) Promo-Text/Kurzbeschreibung, 4) Screenshot-Reihenfolge, 5) Keywords (nur Metadaten-Update, mit Ranking-Beobachtung).
- **Dokumentation (Ausfüllfeld):**

| Datum | Test | Hypothese | Variante A | Variante B | Dauer | Impressionen | Konversion A/B | Gewinner | Entscheidung |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

- **Ranking beobachten:** Notiere wöchentlich die Position für 10 Haupt-Keywords (händisch oder gratis-Testmonat eines ASO-Tools).
- **Fehler vermeiden:** Zu früh abbrechen; mehrere Änderungen gleichzeitig; Metadaten alle Woche ändern (Rankings brauchen Zeit).


---

## 6. Kalender und Kennzahlen

### 6.1 26-Wochen-Kalender (T-12 bis T+14)

**Zählung:** W-12 bis W-1 = 12 Wochen vor dem Launch, **W+1 = Launch-Woche (enthält T0)**, danach W+2 bis W+14. Zusammen 26 Wochen. Zeitaufwand und Budget sind **Schätzungen**; Budget-Spalte = **Stufe B** (Stufe A = 0 €; Stufe C = grob das Sechsfache in den Creator-/Ads-Wochen, siehe 0.2). **Summe Stufe B: ca. 550 €** (inkl. Puffer für Druck und Tests).

| Woche | Fokus | Aufgaben (3–5) | Zeit (h) | Budget € |
|---|---|---|---|---|
| **W-12** | Fundament | 1) Positionierung + Claim (1.1.1) 2) Personas + Interviewleitfaden (1.1.2/9.9) 3) 5 Interviews starten 4) Wettbewerbstabelle anlegen (1.2) | 12 | 0 |
| **W-11** | Fundament | 1) Interviews fertig 2) Wettbewerbsrecherche (8 Zeilen) 3) Markenstimme `brand-voice.md` 4) Handle-/Markenprüfung (7.8) | 12 | 0 |
| **W-10** | Messplan | 1) Nordstern + Funnel 2) ASC/Play-Analytics 3) cookielose Web-Analytics + Datenschutztext (Anwalt) 4) UTM-Konvention | 10 | 10 |
| **W-9** | KI-Toolkit + Stadtwahl | 1) Prompt-Bibliothek/Projekt anlegen (9.8) 2) Launch-Städte-Matrix (3.9.1) 3) Tool-Budget-Limits setzen 4) Rechts-/Release-Gate-Check (`docs/RELEASE.md`) | 10 | 0 |
| **W-8** | Landingpage + Warteliste | 1) Warteliste (extern, 3.1.1) mit Double-Opt-in 2) Landingpage-Ausbau beauftragen (Backlog 8.2/14) 3) Social-Profile (3.2.1) 4) Pre-Warm Stadt 1 (Heimatstadt) | 14 | 20 |
| **W-7** | Beta + Stadt 1 | 1) TestFlight/Play-Closed-Test-Setup (3.4.1) 2) Beta-Einladung (9.4) an Warteliste + Freunde 3) Build-in-Public T-7 4) Free-Tour prüfen | 12 | 0 |
| **W-6** | ASO + Pressekit | 1) ASO-Texte final (3.8.1) 2) Screenshot-Storyboard (3.8.2) 3) Pressekit (3.7.1) 4) Pre-Warm Stadt 2 | 15 | 30 |
| **W-5** | Beta + Creator | 1) Beta-Feedback auswerten 2) Creator-Liste 30 (3.5.1) 3) 10 Creator anschreiben (9.2) 4) Vorschau-Video (3.8.3) | 14 | 40 |
| **W-4** | Partner + Druck | 1) 15 Partnergespräche (5.7.1) vor Ort 2) Aufsteller/Sticker drucken 3) Presseverteiler (3.7.2) 4) Pre-Warm Stadt 3 | 15 | 100 |
| **W-3** | Härtung | 1) Kosten-Trockenlauf (4.1 T-3) 2) Preis-/Angebots-Experimente planen (3.10) 3) Custom Product Pages (3.8.4) 4) Beta-Kriterien prüfen (3.4) | 12 | 20 |
| **W-2** | Vorbereitung Launch | 1) Product-Hunt/Show-HN-Texte 2) Launch-Post-Varianten (9.6) 3) Creator-Zusagen & Briefing 4) Support/FAQ live | 12 | 40 |
| **W-1** | Countdown | 1) Tägliche Countdown-Aufgaben (4.1) 2) Presse-Embargo-Mail 3) Kill-Switch-Übung 4) Content-Batches | 15 | 20 |
| **W+1** | **Launch-Woche** | 1) T0-Drehbuch (4.2) 2) Support-Bereitschaft 3) Kosten-Checkpoints 4) Retro T+7 | 20 | 20 |
| **W+2** | Stabilisieren | 1) Bugfix/Hotfix 2) Bewertungen beantworten 3) 3 Videos 4) Partnergespräche | 12 | 20 |
| **W+3** | Wochenrhythmus start | 1) Montags-Zahlen (5.1) 2) Tour des Tages 3) SEO-Stadtseite 1 (nach Entwicklung) 4) Creator-Auswertung | 12 | 30 |
| **W+4** | Erste Entscheidungen | 1) 4-Wochen-Regeln (6.3) anwenden 2) 1. ASO-Test (5.9) 3) Partner-Pilot-Auswertung | 12 | 0 |
| **W+5** | Content-Loop | 1) 3 Videos 2) neue Creator 3) Stadtseite 2 4) Partnergespräche | 12 | 20 |
| **W+6** | Unit Economics | 1) Tabelle 5.6 mit echten Daten 2) Kosten pro Nutzer prüfen 3) Preis-Experiment E1 starten 4) Kill-Switch-Regeln anpassen | 10 | 0 |
| **W+7** | Partner-Loop | 1) Fallstudie 1 2) 5 weitere Partner 3) Verbandskanal (Newsletter/Beitrag) 4) Stadtseite 3 | 12 | 20 |
| **W+8** | PMF-Check + Ads-Entscheidung | 1) PMF-Signale (5.4) prüfen 2) Apple Ads Basic, wenn Signale erfüllt 3) Zwei Kreativvarianten 4) Cluster-Review | 12 | 60 |
| **W+9** | Ads-Lernen | 1) Apple-Ads-Zahlen 2) Abbruchkriterien anwenden 3) Referral-/Teilen-Entwicklung priorisieren (3.11) 4) Community-Entscheidung (5.8) | 10 | 60 |
| **W+10** | Erweiterung prüfen | 1) Regel 5.3 anwenden 2) Neue Stadt kalkulieren (`K_neu`) 3) Saisonplan (5.2/f) | 10 | 0 |
| **W+11** | Saison-Vorbereitung | 1) Saisontour prüfen/pinnen 2) Presse-Winkel Saison 3) Partner-Angebote saisonal 4) ASO-Test 2 | 12 | 20 |
| **W+12** | Quartalsreview | 1) Alle Zahlen, Unit Economics 2) Backlog-Priorisierung (8.2) 3) Kanal-Ranking: 2 stoppen, 2 verstärken 4) 3-Monats-Bericht | 12 | 0 |
| **W+13** | Skalierung/Verbesserung | 1) Neue Stadt starten (falls Regel erfüllt) 2) Creator-Runde 2 3) Stadtseiten +3 | 12 | 20 |
| **W+14** | Konsolidierung | 1) Retrospektive 2) Plan für Monate 4–12 3) Rechtliche Kontrolle (Store-Labels, Datenschutztexte) 4) Danke-Post/Community | 10 | 0 |

**Danach (Monate 4–12):** Wochenrhythmus (5.1) beibehalten; monatliche Reviews; Stadterweiterung nach Regel 5.3; Saisonkalender (5.2/f); Partnerwachstum (5.7); 1 ASO-Test pro Monat; halbjährlich Modell-/Preis-/Recht-Review (`docs/RELEASE.md`, D16).

### 6.2 Kennzahlen mit Zielwerten (**Hypothesen**, keine Marktdaten)

| Kennzahl | Definition | Zielbereich (Hypothese, nach 3 Monaten) | Quelle | Prüf-Intervall |
|---|---|---|---|---|
| Produktseite → Installation | Downloads ÷ Produktseitenaufrufe | 20–40 % | ASC/Play | wöchentlich |
| Impression → Produktseitenaufruf (Suche) | Aufrufe ÷ Impressionen | 3–8 % | ASC | wöchentlich |
| Installs organisch/Woche | ohne Ads | 50–300 (stark abhängig von Reichweite) | ASC/Play | wöchentlich |
| Activation | Installs mit abgeschlossener erster Tour | 30–50 % | opt-in Analytics/Näherung | wöchentlich |
| Tour-Abschluss | abgeschlossen ÷ gestartet | 40–60 % | opt-in Analytics | wöchentlich |
| Zahlungsquote | Käufer oder Abo ÷ Installs | 2–5 % | RevenueCat | wöchentlich |
| Abo-Quote | Abos ÷ Installs | 0,3–1 % | RevenueCat | monatlich |
| Bewertung | Sternedurchschnitt (Zahl der Bewertungen) | ≥ 4,2 bei ≥ 30 | Stores | wöchentlich |
| Fakten-Fehlerrate | gemeldete sachliche Fehler ÷ gehörte Erzählungen | ≤ 2 % | Admin-Feedback ÷ Erzählungen | wöchentlich |
| KI-Kosten pro aktivem Nutzer | Admin-Kosten ÷ aktive Nutzer | ≤ 10–20 % des Erlöses pro aktivem Nutzer | Admin, RevenueCat | monatlich |
| Einladungen pro Zahler | Invite-Links ÷ Zahler | 0,2–0,5 | Firestore `invites` | monatlich |
| Waitlist-Bestätigung | bestätigt ÷ angemeldet | ≥ 60 % | Newsletter-Tool | zum Launch |
| Video-Sehdauer | durchschnittliche Sehdauer | ≥ 50 % | Plattform | wöchentlich |
| Stadtseiten-Klicks | Suchklicks/Woche/Seite | 1–20 nach 3 Monaten | Search Console | wöchentlich |
| Partner | aktive zahlende Partner | 3–10 in 3 Monaten (Launch-Städte) | Stripe/Admin | monatlich |
| Partner-Einlösungen | Einlösungen pro Partner/Monat | 5–30 | Partnerportal | monatlich |
| Wochenaktive Nutzer (WCT) | abgeschlossene Touren pro Woche | wächst 10–20 %/Woche in den ersten 8 Wochen | Näherung/Analytics | wöchentlich |
| Crash-freie Sitzungen | – | ≥ 99 % | Stores/Crashlytics | täglich in Woche 1 |

### 6.3 Entscheidungsregeln („wenn X, dann Z")

| Regel | Wenn … | Dann … |
|---|---|---|
| R-01 | Produktseite→Install < 15 % nach 4 Wochen und ≥ 500 Aufrufen | Screenshot 1 und Untertitel testen (PPO), Bewertungen/Preisangaben prüfen, Vorschauvideo überarbeiten |
| R-02 | Activation < 30 % nach 4 Wochen (≥ 200 Installs) | Onboarding (Standortberechtigung, Ladezeit in neuen Gebieten) prüfen; Free-Tour-Qualität; 5 Nutzer beobachten; Kaltstart-Meldung verbessern |
| R-03 | Tour-Abschluss < 35 % | Tourlänge, Route (Umwege), Erzählqualität, Pacing-Probleme prüfen; Touren anpinnen/sperren im Admin |
| R-04 | Zahlungsquote < 1 % nach 8 Wochen (≥ 500 aktive) | Paywall-Test (3.10, E3), Free-Tour-Qualität, Preis-/Paketsicht; Rewarded-Ads-Weg prüfen |
| R-05 | Bewertung < 4,0 | Bewertungstexte auswerten, Top-3-Probleme lösen, Antworten, Hotfix; Werbung pausieren, bis > 4,0 |
| R-06 | Fakten-Fehlerrate > 2 % | Stadt-Promotion pausieren, Stichprobe erhöhen, Prompt-Version/Faktenlage prüfen (Admin), Gebiet ggf. sperren |
| R-07 | Kosten pro aktiver Nutzer > 50 % des Erlöses pro aktivem Nutzer | Aufwärmen enger (weniger Kacheln/Sprachen), Budget im Admin senken, keine neue Stadt, nur Cache-Nutzung fördern |
| R-08 | Video-Format: 8 Videos ohne ≥ 1.000 Views | Hook/Länge/Thema ändern; 1 anderes Format testen; Kanal-Fokus prüfen |
| R-09 | Warteliste-Bestätigung < 40 % | Bestätigungsmail-Betreff/Absender ändern; Spam-Ordner prüfen |
| R-10 | Partner: < 15 % der Gespräche → Pilot (nach 30 Gesprächen) | Pitch, Preis, Zielbetriebe ändern; mehr Verbandskanal; Case-Study zuerst |
| R-11 | Apple-Ads-CPI > 2 × `CPI_max` nach 100 Klicks | Kampagne stoppen; Keywords/CPP prüfen; Paid pausieren |
| R-12 | Stadtseiten < 50 % indexiert nach 8 Wochen | Qualität (Thin Content) prüfen, interne Links, Sitemap, Einzigartigkeit |
| R-13 | < 5 % der Zahler laden ein nach 8 Wochen | Referral-Wünsche R1/R2 priorisieren |
| R-14 | Crash-freie Sitzungen < 98,5 % | Feature-Freeze, Hotfix, Marketing-Ausspielung pausieren |
| R-15 | Support-Erstantwortzeit > 48 h | FAQ/Vorlagen erweitern, Ansprechzeiten reduzieren, Hilfe suchen |
| R-16 | Creator-Ergebnis: Kosten pro Install > 3 × Median deiner Creator | Nicht verlängern |
| R-17 | Tageskosten > 80 % des Budgets an 3 Tagen in Folge | Ursache klären (4.5), Budget nicht erhöhen bevor Ursache verstanden |

---

## 7. Rechtliche und ethische Leitplanken für Marketing

**Wichtig:** Dies ist eine **Orientierung** aus Sicht eines Marketers, **keine Rechtsberatung**. Lass Rechtstexte, Wartelisten-/Newsletter-Prozesse, Gewinnspiele und Partnerverträge von einer Anwältin/einem Anwalt prüfen (vgl. `docs/RELEASE.md` Abschnitt 1). Gesetzliche Verweise sind **vor Nutzung zu prüfen**.

### 7.1 Kennzeichnung von Werbung

- **Erkennbarkeit:** Werbung muss als Werbung erkennbar sein (UWG; Telemediengesetze). In tuur ist „Partner" / „Anzeige · Partner" fest im Produkt (AGB §6, D29). Marketing muss dazu passen: **nie** Partnerstationen als „neutrale Empfehlungen" darstellen.
- **Eigene Werbung auf Social:** Als Unternehmen erkennbar (Impressum, Business-Profil).
- **Impressum:** Social-Profile mit geschäftlicher Nutzung brauchen ein Impressum (Link auf `/legal/imprint`). Firmendaten aus `OPERATOR_*` vollständig eintragen (`scripts/check-release.mjs` prüft).

### 7.2 Influencer-Kooperationen

- **Kennzeichnung:** Bezahlte oder produktgestützte Kooperationen **deutlich** als „Werbung" oder „Anzeige" kennzeichnen, zu **Beginn** des Beitrags, in Video **gesprochen und eingeblendet**; Plattform-Funktion „Bezahlte Partnerschaft" zusätzlich nutzen. „#ad" allein am Ende reicht nicht als sicherer Standard. Ausnahmen (z. B. echte eigene Käufe) prüft man einzeln.
- **Vertrag:** Leistung, Kennzeichnung, Freigabe von Fakten, Nutzungsrechte, Vergütung, Löschfristen, keine Fake-Bewertungen, Haftung; Creator verantwortet eigene Inhalte, du prüfst **Fakten über tuur**.
- **Fakten:** Creator darf nur behaupten, was aus dem Faktenkasten (0.4) folgt.
- **Fehler vermeiden:** Unklare Kennzeichnung; Creator schreiben lassen, sie hätten „ein Jahr genutzt"; Erfolgsversprechen.

### 7.3 Gewinnspiele

- **Regeln:** Klare **Teilnahmebedingungen** (Zeitraum, Teilnahmeberechtigung, Gewinn, Ziehung, Veranstalter, Datenschutz, Kein Zusammenhang mit Apple/Google), **keine** Kopplung an Bewertungen, **keine** Verlosung „unter allen, die die App bewerten". Store-Richtlinien (Apple/Google) zu Wettbewerben/Gewinnspielen prüfen (Apple: Wettbewerbe müssen vom Entwickler ausgerichtet werden, Apple ist nicht Sponsor – vor Nutzung prüfen). Plattformregeln (Instagram/TikTok) zu Promotions prüfen.
- **Datenschutz:** Nur zur Ziehung nötige Daten, danach löschen; keine automatische Aufnahme in den Newsletter.
- **Empfehlung:** In den ersten 6 Monaten **keine Gewinnspiele**, außer mit anwaltlicher Vorlage.

### 7.4 Datenschutz bei Warteliste und Newsletter

- **Double-Opt-in** (Bestätigungsmail), Einwilligungstext, Protokoll (Zeitpunkt, Text-Version, IP falls nötig – minimal halten), **einfaches Abmelden** in jeder Mail, Löschfristen, Auftragsverarbeitungsvertrag (Art. 28) mit dem Versanddienst; Datenschutzerklärung ergänzen (Zweck, Empfänger, Dauer). **Transaktionsmails** (Bestätigung/Beleg) und **Werbemails** getrennt betrachten.
- **Keine Bestandskunden-Ausnahme unbedacht nutzen** (§ 7 Abs. 3 UWG hat enge Voraussetzungen).
- **Keine Verknüpfung:** Wartelisten-Mail nicht mit Nutzer-/Standortdaten aus der App verknüpfen.
- **Keine Kaltmails an Betriebe/Journalisten in Serie:** Pressearbeit im engen Sinn ist üblich; Marketing-E-Mails an Unternehmen brauchen in der Regel Einwilligung (Abschnitt 5.7). Persönlich, relevant, kurz, abmeldbar.

### 7.5 Store-Richtlinien für Werbung und Ranking

- **Apple:** Metadaten müssen korrekt sein (keine Konkurrenzmarken, keine irreführenden Behauptungen, keine Preise/Promo-Behauptungen im Namen); Bewertungen dürfen nicht manipuliert werden; Screenshots zeigen die App; In-App-Käufe für digitale Inhalte nur über Apple-IAP (Richtlinie 3.1.1 – vor Nutzung prüfen; relevant für Promo-Codes/Belohnungen); Privatsphäre-Label ehrlich.
- **Google Play:** Ähnlich; Werbung/Metadaten-Spam, Fake-Installationen, Anreize für Bewertungen/Installs sind untersagt; Datenschutz-Sicherheitsformular; Hintergrund-Standort-Begründung.
- **Bewertungs-Manipulation ist verboten** (Abschnitt 7.7).

### 7.6 Bildrechte und Kartenattribution

- **Wikimedia Commons:** Pro Bild Lizenz lesen (CC BY, CC BY-SA, CC0, gemeinfrei): **Urheber, Lizenz, Link, Änderung** angeben; bei CC BY-SA gilt „Share Alike" für Bearbeitungen. Screenshot aus der App zeigt die Bild-Attribution (`player.imageBy`), belasse sie sichtbar.
- **OpenStreetMap:** Karten-/Datenmaterial „© OpenStreetMap-Mitwirkende" (ODbL) in Marketingmaterial mit Karten (Screenshots, Videos, Stadtseiten), mit Link zu openstreetmap.org/copyright. **Nominatim/Overpass:** Die öffentlichen Instanzen sind nicht für Produktions-Traffic gedacht (D14, RELEASE Abschnitt 1); Attribution und Nutzungsbedingungen einhalten.
- **Wikipedia-Texte:** Wikipedia-Texte stehen unter CC BY-SA. Wenn du Erzähltexte (aus Wikipedia abgeleitet) auf Webseiten veröffentlichst, prüfe **Attribution und Share-Alike-Pflichten** (Quellenangabe „Wikipedia, CC BY-SA 4.0, Link"). Anwaltlich klären, bevor Programmatic-SEO in Massen startet (2.10).
- **Kartenkacheln (MapTiler):** Attributionspflicht laut Anbieter; im Marketing bei Screenshots sichtbar lassen (Bedingungen prüfen).
- **Eigene Fotos von Personen:** Einwilligung/Model-Release; keine Kinder; im Straßenbild Unbeteiligte unkenntlich.
- **Musik:** nur lizenzfrei/gekauft; Plattform-Musikbibliotheken nur für erlaubten Zweck (Business-Konten oft eingeschränkt – prüfen).

### 7.7 Bewertungs-Manipulation

- **Verboten:** gekaufte/gefälschte Bewertungen, Belohnung gegen Bewertung, Massen-Aufrufe, Bewertungen durch Mitarbeiter/Familie ohne Offenlegung in großer Zahl, Löschung negativer Bewertungen durch Meldungen ohne Grund. Rechtsfolgen: UWG (irreführende Werbung), Store-Sperre, Rufschaden.
- **Erlaubt:** neutraler Hinweis („Wir freuen uns über Feedback"), In-App-System-Prompt (4.6), Antworten auf Bewertungen.

### 7.8 Markenrecht: „tuur" auf Kollisionen prüfen

**Warum:** Eine Abmahnung nach dem Launch kostet Namen, Domain, Reichweite.

**Schritt 7.8.1 – Recherche-Anleitung (T-12 W, 3–4 h, 0 €)**

- [ ] **Register:** DPMA (register.dpma.de) – nach „tuur" suchen (auch ähnlich klingend: „tur", „tour", „tuhr", „tuuur"; Wortbild); **EUIPO** eSearch plus (euipo.europa.eu) und **TMview** (tmdn.org/tmview) für EU/Weltweit; **WIPO Global Brand Database** (branddb.wipo.int).
- [ ] **Klassen (Nizza):** 9 (Software/Apps), 35 (Werbung/Marketing), 38 (Telekommunikation), 39 (Reise/Touren), 41 (Bildung/Unterhaltung/Führungen), 42 (Software-Dienste). Prüfe Treffer in diesen Klassen und benachbarten.
- [ ] **Store-Suche:** App Store (DE/US) und Google Play nach „tuur", ähnlichen Namen, Kategorie Reisen/Navigation.
- [ ] **Domains:** `tuur.app`, `tuur.de`, `tuur.com`, `tuur.io` (Inhaber, Nutzung); Social-Handles.
- [ ] **Google-Suche:** „tuur" + „app/tour/city/guide"; Namensbedeutung (z. B. in Sprachen/Regionen als Vorname/Wort) und ungewollte Assoziationen.
- [ ] **Bewertung:** Identität/Ähnlichkeit (Klang, Schrift, Bedeutung) und Waren-/Dienstleistungsähnlichkeit → Verwechslungsgefahr. **Lass bei Treffern einen Markenanwalt prüfen.**
- [ ] **Optional Anmeldung:** Wortmarke/Wort-Bildmarke (Gebühren **vor Nutzung prüfen** auf dpma.de bzw. euipo.europa.eu; grobe Größenordnung: dreistellig bis niedrig vierstellig je nach Region und Klassen). Bildmarke (Herz-Pin) separat betrachten; Fonts/Designer-Rechte klären (Plus Jakarta Sans ist typischerweise offen lizenziert, Lizenz prüfen).
- **Erfolgsmetrik:** Dokumentierte Recherche mit Datum (PDF/Screenshots). **Fehler:** Nur Google statt Register; „.app ist frei, also kein Problem".

### 7.9 Weitere Leitplanken (Kurzliste)

- **Radfahren und Kopfhörer:** In Deutschland darf das Gehör im Straßenverkehr nicht so beeinträchtigt sein, dass die Verkehrssicherheit leidet (§ 23 StVO, vor Nutzung prüfen). Zeige in Bild/Video **keine** Radfahrer mit beidseitig vollständig abgedichteten Kopfhörern, nutze Einohr-/Knochenschall-/Lautsprecher-Szenen, und **sprich das Thema im Radcontent an** („Verkehr geht vor", die App zeigt beim Start einen Sicherheitshinweis).
- **Sicherheitshinweis:** Kein Content, der zum Filmen/Tippen beim Fahren anregt.
- **Kinder:** Datenschutzerklärung: nicht für Kinder unter 16; nicht auf Kinder zielen.
- **Barrierefreiheit:** Untertitel; Alt-Texte; nicht „vollständig barrierefrei" behaupten (Aussage nur: „Screenreader-Labels, Transkripte, skalierbare Schrift" – wie im Produkt).
- **AI-Kennzeichnung:** siehe 2.11.
- **Preisangaben (PAngV):** Preise nennen inkl. USt, Stores zeigen sie; im Marketing „ab" oder Store verweisen; Testphasen/Abo-Bedingungen deutlich.
- **Widerruf:** Bei Werbung für Käufe nichts gegen die AGB behaupten (Widerrufsverzicht bei digitalen Inhalten, `terms.ts` §4).
- **Vergleichende Werbung:** Nur sachlich und belegbar; keine Herabsetzung Dritter; **keine Zahlen von Konkurrenten**, die du nicht belegen kannst.
- **Gemeinsame Nutzung von Personenfotos/Zitaten:** immer schriftliche Freigabe.


---

## 8. Was du sofort tun kannst und was Entwicklung ergänzen sollte

### 8.1 Die ersten 10 Aufgaben für die nächsten 7 Tage

Alle ohne Entwicklung und ohne oder mit sehr kleinem Budget. Reihenfolge = Priorität.

| Nr. | Aufgabe | Zeit | Kosten | Fertig wenn … |
|---|---|---|---|---|
| 1 | [ ] **Release-Gate klären:** `docs/RELEASE.md` durchgehen, ehrlich markieren, was fehlt (Rechtstexte, Store-Konten, echte-Geräte-Test); Marketing-T0 vorläufig setzen (frühestens: Beta läuft + Rechtstexte geprüft) | 2 h | 0 € | Terminvorschlag steht, Blocker-Liste ist geschrieben |
| 2 | [ ] **Namens-/Markenrecherche** (7.8): DPMA, EUIPO/TMview, WIPO, Stores, Domains, Handles | 3 h | 0 € | Recherche-Dokument mit Datum |
| 3 | [ ] **Positionierungssatz + Claim** (1.1.1), 3 Freunde testen | 2 h | 0 € | 5-Sekunden-Test bestanden |
| 4 | [ ] **5 Interviews terminieren** (1.1.3) und 2 davon in dieser Woche führen | 3 h | 0 € | 2 Interviews notiert |
| 5 | [ ] **Wettbewerbsrecherche starten** (1.2): 10 Suchbegriffe, 5 Apps installieren | 3 h | 0–20 € | Tabelle mit 5 Zeilen |
| 6 | [ ] **Heimatstadt vorwärmen und selbst hören** (3.9.2): Budget im Admin prüfen, Ingest, Touren prüfen, 1 Tour real gehen | 4 h | Kosten `K_stadt` (messen) | ≥ 3 geprüfte Touren, Kosten notiert |
| 7 | [ ] **Warteliste (extern) mit Double-Opt-in** aufsetzen (3.1.1), Datenschutztext vorbereiten (Anwalt bald) | 3 h | 0–15 € | Testanmeldung mit Bestätigungsmail funktioniert |
| 8 | [ ] **Social-Profile + Handle reservieren** (3.2.1) und **erstes Video** aus einer echten Tour der Heimatstadt drehen (2.9) | 4 h | 0 € | Profil live, Video gepostet |
| 9 | [ ] **Messstack:** ASC/Play, cookielose Web-Analytics (Testinstanz), UTM-Konvention (1.5) | 3 h | 0–10 € | Ein Testlink wird in der Analytics sichtbar |
| 10 | [ ] **Beta vorbereiten:** TestFlight/Play-Closed-Test starten (`docs/TESTING_IOS.md`), 10 Testerinnen aus dem Umfeld gewinnen | 4 h | 0 € (Developer-Gebühren separat) | ≥ 5 Testerinnen haben installiert |

**Gesamt:** ca. 30 h (verteilt auf 7 Tage, ggf. 10 Tage). **Wenn du nur 10 Stunden hast:** Aufgaben 1, 2, 6, 7.

### 8.2 Was Entwicklung ergänzen sollte (Backlog)

**Stand (Repo, siehe A-6):** kein Produkt-Analytics, kein Push, kein In-App-Review-Prompt, keine Warteliste, keine Stadtseiten, keine Store-Buttons, Invite-Links nur für gekaufte Touren (2x), Admin ohne Marketing-Kacheln. Aufwand = **grobe Entwicklerschätzung in Personentagen (PT)**, ohne Rechtsprüfung. Priorität: **P1** = vor/zum Launch sinnvoll, **P2** = in den ersten 3 Monaten, **P3** = später.

| Nr. | Wunsch | Nutzen fürs Marketing | Aufwand | Prio | Hinweise |
|---|---|---|---|---|---|
| 1 | **Wartelisten-Formular (nativ)** mit Double-Opt-in, Wunschstadt, Admin-Statistik | Vorlauf-Reichweite, Datenbasis für Städtewahl | 3 PT | P2 (extern reicht zum Start) | Datenschutztext, AV-Vertrag Versanddienst |
| 2 | **Promo-/Creator-Codes** (Freischalt-Code → Guthaben/Testzeitraum, Zähler pro Code) | Creator-Kooperationen messbar, Revenue-Share | 3–4 PT | P2 | **Store-Regeln prüfen** (3.1.1, Belohnungs-/Freischaltmechanismen); Alternative: Apple Offer Codes/Play-Promo-Codes |
| 3 | **Admin „Guthaben schenken"** (Nutzer-ID/Credit, Grund, Audit-Log) | Beta-Dank, Creator, Support-Kulanz | 1–2 PT | P1 | `adminAudit` nutzen |
| 4 | **Referral: Einlader-Belohnung + Deferred Deep Link** (3.11: R2, R3) | Virale Schleife | 5–9 PT | P2 | Missbrauchsschutz, Recht/Store-Regeln |
| 5 | **Push-Benachrichtigungen (Opt-in)** (5.9) | Retention, Saison | 4–6 PT | P2/P3 | Einwilligungsflow, Themen, Frequenzlimit, DSGVO |
| 6 | **Web-Stadtseiten (SEO)** `/de/audio-tour/<stadt>`, `hreflang`, Sitemap, Qualitätsgate, 30-s-Audio-Beispiel, Attribution | Organischer Traffic | 5–8 PT | P1/P2 | Qualitätsgate 2.10; CC-BY-SA-Prüfung; nur `ready` + geprüfte Touren |
| 7 | **In-App-Review-Prompt** nach abgeschlossener Tour (2. Abschluss, nie nach Fehler/Paywall) | Bewertungen (ohne Manipulation) | 0,5–1 PT | P1 | `expo-store-review`, Frequenz-Limit, systemeigener Dialog |
| 8 | **Tour teilen (Free-Tour-Link)** `/t/<tourId>` mit Store-Links + Deep Link | Viralität | 2–3 PT | P1/P2 | (3.11: R1) |
| 9 | **Analytics-Events (opt-in)** `onboarding_done`, `tour_started`, `tour_completed`, `paywall_viewed`, `purchase_started`, `invite_created`, `offline_download_done` (+ optional **aggregierte, personenlose Server-Zähler**) | Funnel-Messung | 3–5 PT | P1 | Consent-Gate (Einstellungen), Datenschutzerklärung, kein Fingerprinting; Zähler-Variante juristisch prüfen |
| 10 | **Universal Links/App Links final** (Team-ID/Fingerabdruck), Install-Referrer (Android), Testmatrix | Reibung bei Einladungen/Kampagnen | 1–2 PT | P1 | `apple-app-site-association`, `assetlinks.json` |
| 11 | **Free-Tour im Admin wählbar** („diese Tour ist gratis") | Visitenkarte steuern | 1–2 PT | P1 | Aktuell: kürzeste Standardtour automatisch `free` |
| 12 | **„Stadt aufwärmen" im Admin** (Kachelliste/Polygon → Ingest → Touren → Erzählungen Top-Touren in Sprachen → Kostenbericht) | Kontrollierte Kosten und Qualität | 4–6 PT | P1 | Neue Entscheidung in `docs/DECISIONS.md` |
| 13 | **Newsletter-Opt-in in der App/Web** (Double-Opt-in) | Owned Audience | 2–3 PT | P2 | mit #1 zusammenlegen |
| 14 | **Landingpage-Ausbau:** Store-Links, Smart-App-Banner, Screenshots, FAQ, Presse-Seite, Partner-Infoseite, OG-Tags, Robots/Sitemap | Konversion | 4–6 PT | P1 | 3.1 Tabelle |
| 15 | **Partner-Piloten: Trial/Promotion-Codes in Stripe** (per Admin) | Piloten ermöglichen | 1–2 PT | P1/P2 | Stripe Checkout `allow_promotion_codes`/Trial (prüfen) |
| 16 | **Admin-Marketing-Kacheln:** Einladungen (erzeugt/eingelöst), Wartelisten-Wunschstädte, aktive Gebiete, Kosten pro Stadt | Montags-Report | 2–3 PT | P2 | Nur aggregierte Daten |
| 17 | **Partner-Empfehlungsprogramm** (Gutschrift bei geworbenem Partner) | Partner-Loop | 2–3 PT | P3 | Stripe-Gutschrift |
| 18 | **Web-Analytics-Snippet + Datenschutztext** | Messung | 0,5 PT | P1 | 1.5 |

**Empfohlene Reihenfolge für Entwicklung:** P1: 14, 18, 7, 9, 10, 11, 12, 3, 8, 6 → P2: 15, 2, 4, 16, 13, 1 → P3: 5, 17.

---

## 9. Anhang: Vorlagen und KI-Prompt-Bibliothek

**Platzhalter** stehen in `<spitzen Klammern>`. Ersetze sie, prüfe jede Zahl und jedes Faktum. Wo „Zitat des Gründers" steht, schreibe **dein echtes Zitat**. Sprache: Du-Form für Nutzer; **Sie-Form** für Presse und Betriebe.

### 9.1 Presse-Mail

**Betreff-Varianten (teste 2–3):**
- `Neue App: KI erzählt dir deine Stadt beim Spazierengehen (<Stadt>)`
- `<Stadt>: Audio-Stadtführer für Fuß und Rad startet – erste Tour gratis`
- `Radfahren und zuhören: tuur erzählt Stadtgeschichte im Tempo der Fahrerin`

**Mail:**

```text
Betreff: <Betreff>

Guten Tag <Frau/Herr Nachname>,

<Ein persönlicher Satz, warum diese Redakteurin/dieser Redakteur gemeint ist, z. B. "Ihr Beitrag zu <Thema> am <Datum> hat mich zum Schreiben gebracht.">

am <Datum> erscheint tuur in den App Stores: ein KI-Audio-Stadtguide für Fußgänger und Radfahrer. Sobald man an einem Ort ankommt, erzählt eine KI-Stimme die passende Geschichte, wie ein Stadtführer im Ohr. Die Erzählungen entstehen aus öffentlichen Quellen wie Wikipedia und OpenStreetMap, werden automatisch geprüft und als KI-Inhalt gekennzeichnet. Die erste Tour pro Ort ist gratis.

Warum das für Ihre Leserinnen und Leser interessant sein könnte:
• <Story-Winkel 1: z. B. "Die Position bleibt auf dem Gerät. Für die Inhalte geht nur ein grobes Kartenquadrat an den Server.">
• <Story-Winkel 2: z. B. "In <Stadt> erzählt tuur ab dem Start <n> Touren (Stand <Datum>). Lokale Cafés und Museen können sich als gekennzeichneter Partner beteiligen.">
• <Story-Winkel 3: z. B. "Zu jeder Erzählung gibt es ein Transkript, Screenreader-Unterstützung und einen 'Fehler melden'-Knopf.">

Zitat: „<Dein echtes Zitat in 1–2 Sätzen>", sagt <Name>, Gründer von tuur.

Pressematerial (Logos, Screenshots, Video, Kurzbeschreibung, Founder-Foto): <Link /presse>
Auf Wunsch stelle ich einen Zugang zur App (Testflug/Codes) bereit oder gehe mit Ihnen eine Tour in <Stadt>.

Embargo: Bitte veröffentlichen Sie nicht vor <Datum, 08:00 Uhr>.

Freundliche Grüße
<Name>
tuur · <Adresse laut Impressum> · <Telefon> · <E-Mail>
Abmelden von Pressemitteilungen: einfach kurz antworten.
```

**9.1b – Nachfassen (einmalig, T+2):**

```text
Betreff: Kurze Nachfrage: tuur (<Stadt>)

Guten Tag <Frau/Herr Nachname>,

ich wollte kurz nachfragen, ob meine Mail vom <Datum> bei Ihnen angekommen ist und ob ich Ihnen weiteres Material oder einen Zugang zur App schicken kann. Falls das Thema nicht passt, sagen Sie bitte kurz Bescheid; dann melde ich mich nicht mehr.

Freundliche Grüße
<Name>
```

### 9.2 Creator-Anfrage

**DM oder E-Mail (an öffentliche Business-Adresse; kurz):**

```text
Hi <Vorname>,

ich bin <Name> und baue tuur, einen Audio-Stadtguide für Fußgänger und Radfahrer: Man läuft los, und eine KI-Stimme erzählt die Geschichte zu dem, was man gerade sieht. Deine Videos über <konkretes Video/Thema> haben mir gefallen, weil <ehrlicher Grund>.

Ich würde dir gern tuur zum Ausprobieren geben (kostenlos, mit Guthaben) und dir vorschlagen, in <Stadt> eine Tour zu machen. Wenn es für dich passt, sprechen wir über ein bezahltes Video: <Rahmen z. B. Pauschale + Link>. Wichtig: Es wird als Werbung gekennzeichnet, und ich gebe dir vorab die Fakten, damit du nichts Falsches sagst. Du entscheidest frei, was du von der App hältst, positiv wie negativ.

Wenn du magst, schicke ich dir ein 30-Sekunden-Video und einen Testzugang. Kein Druck, ein kurzes „Nein danke" ist völlig okay.

Viele Grüße
<Name> · tuur · <Web>
```

**Briefing-Kasten (nach Zusage):**
- Ziel: <1 Satz>. Ort/Tour: <Stadt/Tour>. Was du sagen darfst: Faktenkasten (0.4). Was nicht: „100 % korrekt", „unabhängig", „weltweit perfekt".
- Pflicht: **„Werbung"** deutlich; „KI-Stimme" erwähnen; Sicherheitshinweis (Verkehr).
- Freigabe: Fakten prüft <Name> bis <Datum>; Inhalte bleiben deine; Nutzungsrechte: <Dauer>.
- Link: `https://tuur.app/?utm_source=creator_<name>&utm_medium=paid&utm_campaign=<kampagne>`.

### 9.3 Partner-Erstansprache

**A) Vor-Ort/Telefon:** Skript in 5.7.1.

**B) Brief (Post, kein E-Mail-Versand):**

```text
<Absender-Block laut Impressum>

An <Betrieb>
<Ansprechperson falls bekannt>

Betreff: Ihr Café in <Stadt> als Station einer Audio-Stadtführung

Guten Tag <Frau/Herr Nachname>,

Ihr <Betrieb> liegt an einer Strecke, die tuur, ein KI-Audio-Stadtguide für Fußgänger und Radfahrer, in <Stadt> ausspielt. Wer dort vorbeigeht, hört die Geschichte des Ortes.

Wir suchen 3 bis 5 Betriebe in <Stadt> für einen Pilot von <X> Wochen: Ihr Betrieb erscheint als gekennzeichnete „Partnerstation" (Anzeige · Partner), mit einem Angebot, das Gäste per QR-Code bei Ihnen einlösen, und einer Statistik über Anzeigen, Besuche und Einlösungen (anonymisiert, ohne Personenbezug). <Pilot-Konditionen>

Ich rufe Sie am <Datum> zwischen <Zeit> an oder schaue kurz vorbei, wenn Ihnen das recht ist. Sie können auch einfach unter <Telefon/QR zur Partner-Infoseite> zurückmelden, wenn es nicht passt. Ich melde mich dann nicht mehr.

Freundliche Grüße
<Name>, tuur
```

**C) LinkedIn – Kontaktanfrage (ohne Pitch, max. 300 Zeichen):**

```text
Hallo <Vorname>, ich baue tuur, einen Audio-Stadtguide für <Stadt>, und suche Austausch mit lokalen Betrieben. Über eine Vernetzung würde ich mich freuen.
```

(Erst nach Annahme und Gespräch weitere Informationen senden.)

### 9.4 Beta-Einladung

```text
Betreff: Testest du tuur mit? (Audio-Stadtguide, iOS/Android)

Hallo <Vorname>,

du hast dich für die tuur-Warteliste eingetragen (danke!). Wir suchen 50 bis 200 Testerinnen und Tester, die tuur vor dem Start draußen ausprobieren: eine Tour laufen oder radeln, Kopfhörer auf, Bildschirm aus.

Was du bekommst: früher Zugang, Einfluss auf das Produkt und ein Dankeschön nach dem Start (<Guthaben, falls Admin-Grant existiert; sonst "unsere Dankbarkeit und Namen im Dank" nur mit Einverständnis>).
Was wir brauchen: ca. 60 Minuten über zwei Wochen, ehrliches Feedback (auch zu Fehlern in den Fakten).
Wichtig: Bitte achte unterwegs auf den Verkehr. Käufe im Test sind Testkäufe (kein echtes Geld).

So geht’s:
1) iPhone: TestFlight-Link <Link>. Android: Testlink <Link>.
2) Aufgaben (ca. 20 Minuten je Aufgabe): <Mission 1–5>.
3) Feedback-Formular: <Link> oder in der App „Fehler melden".

Datenschutz: In der App sind Analytics und Crashberichte aus, bis du zustimmst. Details: <Datenschutz-Link>. Dein Feedback speichern wir nur zur Verbesserung und ohne Klarnamen im Bericht. Löschen auf Anfrage jederzeit.

Danke, dass du mitmachst!
<Name>
```

### 9.5 Support-Antworten (Vorlagen)

Nutze immer den Namen der Person, wenn bekannt; **keine Personendaten in KI-Tools einfügen**.

**1) Kostenlose Tour / Wie funktioniert das mit den Kosten?**
> Hallo <Name>, danke für deine Nachricht! Die erste (kürzeste) Standardtour pro Ort ist gratis. Weitere Standardtouren schaltest du mit einem Tour-Guthaben dauerhaft frei; die Modi Route planen, Weggabelung und Streifzug gelten nach Einlösung eines Guthabens 24 Stunden an dem Ort. Mit einem Abo sind alle Touren und Modi ohne Werbung nutzbar. Kostenlose Nutzer können außerdem per belohnter Werbung (täglich begrenzt) ein Guthaben für eine Standardtour bekommen. Preise siehst du vor dem Kauf im Store. Viele Grüße, <Name> vom tuur-Team

**2) Kauf angekommen? / Restore**
> Hallo <Name>, das tut uns leid. Bitte öffne in tuur die Einstellungen bzw. das Paywall-Fenster und tippe auf „Käufe wiederherstellen". Wenn du auf einem neuen Gerät bist, melde dich mit dem gleichen Konto an. Falls es danach noch nicht klappt: Schick uns bitte (ohne Kartendaten) den Zeitpunkt und die Beleg-/Bestellnummer aus dem Store. Wir prüfen das. Viele Grüße, <Name>

**3) Rückerstattung**
> Hallo <Name>, du hast den Kauf über den <App Store/Google Play> gemacht. Erstattungen laufen über den Store: <Link zum Store-Support/Erstattungsformular; Link prüfen>. Zusätzlich gelten die Widerrufsregeln für digitale Inhalte aus unseren AGB (<AGB-Link>). Wenn etwas technisch nicht funktioniert hat, sag uns bitte, was passiert ist, damit wir helfen können. Viele Grüße, <Name>

**4) Fehler in einer Erzählung**
> Hallo <Name>, danke, dass du das gemeldet hast! Unsere Erzählungen werden von KI aus Quellen wie Wikipedia und OpenStreetMap erstellt und automatisch geprüft; trotzdem passieren Fehler. Wir haben die Erzählung zu „<Station>" gesperrt und prüfen sie. Du kannst Fehler auch direkt im Player mit „Fehler melden" schicken. Viele Grüße, <Name>

**5) Datenschutz: Was passiert mit meinem Standort?**
> Hallo <Name>, deine Position wird auf deinem Gerät verarbeitet. Für die Inhalte geht nur ein grobes Kartenquadrat an unsere Server, keine exakte Position. Nur bei einer geplanten Route oder beim Einlösen eines Partnerangebots wird einmalig eine Position übermittelt (um die Route zu berechnen bzw. die Nähe zum Partner zu prüfen). Analytics und Crashberichte sind aus, bis du in den Einstellungen zustimmst. Details stehen in der Datenschutzerklärung: <Link>. Viele Grüße, <Name>

**6) Konto löschen / Datenexport**
> Hallo <Name>, in der App: Einstellungen → Konto löschen bzw. Daten exportieren. Ohne App: <Web>/delete-account. Bitte beachte: Abos, die du über den Store abgeschlossen hast, musst du dort selbst kündigen, wir können das nicht für dich tun. Partner-Konten löschst du im Partnerportal unter „Konto". Viele Grüße, <Name>

**7) Audio bricht ab / Führung läuft nicht bei ausgeschaltetem Bildschirm**
> Hallo <Name>, damit die Führung auch bei ausgeschaltetem Bildschirm weiterläuft, braucht tuur den Standortzugriff „Immer" (nur während einer laufenden Tour). Bitte prüfe: Einstellungen → tuur → Standort → „Immer" (bzw. Android: „Immer zulassen"), Akku-Optimierung für tuur ausschalten. Nach Anrufen oder anderen Audio-Apps: Wiedergabe in der App erneut starten. Wenn es weiter hakt: Gerätemodell, Betriebssystem und Uhrzeit nennen. Danke! <Name>

**8) Offline**
> Hallo <Name>, öffne die Tour und tippe auf „Für offline laden". Das lädt Karte, Audio, Bilder und Texte. Schau vorher, ob genug Speicher frei ist. Danach funktioniert die Tour im Flugmodus. Viele Grüße, <Name>

**9) Einladungslink geht nicht**
> Hallo <Name>, Einladungslinks funktionieren einmal und laufen nach 14 Tagen ab. Pro gekaufter Standardtour kannst du bis zu zwei Freunde einladen. Geschenkte oder durch Werbung erworbene Touren können nicht weiterverschenkt werden. Bitte teile den Link erneut über den Teilen-Bildschirm der Tour, wenn er abgelaufen ist. Viele Grüße, <Name>

**10) Werbung / kein Ton bei Anzeigen**
> Hallo <Name>, in der kostenlosen Nutzung siehst du gekennzeichnete Werbung, nur zwischen zwei Stationen und nie während die Erzählung läuft. Abonnenten sehen keine Werbung. Einwilligung zur Werbung kannst du unter Einstellungen → Werbung ändern (Privatsphäre-Optionen). Viele Grüße, <Name>

**11) Partner-Anfrage (eingehend)**
> Hallo <Name>, vielen Dank für dein Interesse an tuur-Partnerschaften! Kurz: Partnerstationen erscheinen gekennzeichnet als „Anzeige · Partner", mit einem begrenzten Sichtbarkeits-Bonus, und Betriebe können Angebote per QR-Code einlösen lassen. Im Partnerportal (<Link>) siehst du Pakete und Statistik. Ich melde mich gern telefonisch: <Terminvorschlag>. Viele Grüße, <Name>

**12) Sprachen**
> Hallo <Name>, die App gibt es in Deutsch und Englisch, die Erzählungen ebenfalls in beiden Sprachen. Weitere Sprachen sind geplant, aber noch nicht verfügbar. Danke für den Hinweis! <Name>

**13) Antwort auf Store-Bewertung (negativ)**
> Hallo <Name>, danke für dein ehrliches Feedback und sorry für die schlechte Erfahrung. Wir möchten das gern klären: Schreib uns bitte an <E-Mail> mit Gerät, Ort und was passiert ist. Viele Grüße, <Name> vom tuur-Team

**14) Antwort auf Store-Bewertung (positiv)**
> Danke, das freut uns sehr! Viel Spaß bei den nächsten Touren. <Name> vom tuur-Team

### 9.6 Launch-Post

**LinkedIn/Bluesky (lang):**

```text
Heute startet tuur. 🎧

tuur ist ein KI-Audio-Stadtguide für Fußgänger und Radfahrer. Du gehst los, und tuur erzählt dir die Geschichte zu dem, was du gerade siehst.

Was mir wichtig war:
• Die erste Tour pro Ort ist gratis.
• Die Erzählungen entstehen aus Quellen wie Wikipedia und OpenStreetMap, werden automatisch geprüft und sind als KI gekennzeichnet. Fehler kannst du direkt melden.
• Deine Position bleibt auf deinem Gerät. Nur ein grobes Kartenquadrat geht an unsere Server.
• Auch offline nutzbar.

Zum Start am besten in <Stadt 1>, <Stadt 2> und <Stadt 3>. In anderen Städten funktioniert tuur auch, das erste Laden dauert dort aber länger, und die Qualität schwankt je nach Datenlage.

Danke an alle Tester, an <Partner/Personen mit Einverständnis> und an alle, die Feedback gegeben haben.

App Store: <Link> · Google Play: <Link> · Infos: <Link>
(Erzählung: KI-Stimme.)
```

**Instagram/TikTok Caption (kurz):**

```text
Du gehst hier oft vorbei. Weißt du, was in dem Haus mal war? 🎧
Heute startet tuur: dein KI-Audio-Stadtguide zu Fuß und per Rad. Erste Tour pro Ort gratis. Link in Bio.
(Stimme: KI, aus Wikipedia/OSM-Quellen.)
#tuur #städtetrip #audioguide #<stadt>
```

**Reddit (hilfreich, ehrlich; nur wo erlaubt):**

```text
Titel: Ich habe einen KI-Audio-Stadtguide gebaut. Feedback zu <Stadt> gesucht

Hi, ich bin <Name>, Gründer von tuur (Transparenz: Eigenwerbung). tuur erzählt beim Gehen/Radeln die Geschichte zu Orten in der Nähe. Erste Tour pro Ort gratis, Erzählungen sind KI-generiert (Quellen: Wikipedia, OSM), Position bleibt auf dem Gerät. Ich suche ehrliches Feedback von Leuten, die <Stadt> kennen: Stimmen die Fakten? Welche Orte fehlen? Wenn es die Regeln hier erlauben, schicke ich gern einen Link/Codes. Danke!
```

**Product Hunt – Tagline (≤ 60 Zeichen; Limit prüfen):** `Audio city guide that tells the story where you stand`
**Show HN Titel:** `Show HN: tuur – an AI audio city guide for walkers and cyclists`

### 9.7 Krisenvorlagen

Siehe **4.9** (A: Faktenfehler viral, B: Datenpanne, C: Kostenexplosion, D: Store-Ablehnung, E: Partner-Kennzeichnung). Zusatz:

**Kurzstatement für Presseanfragen (Faktenfehler):**
> „tuur erstellt Erzählungen mit KI aus öffentlichen Quellen und prüft sie automatisch. Ein Fehler in <Station> ist uns gemeldet worden; die Erzählung wurde gesperrt und wird geprüft. Nutzer können Fehler direkt in der App melden. Wir haben <Maßnahme> ergriffen und informieren hier über den Stand: <Link>."

### 9.8 KI-Prompt-Bibliothek

**Hinweise für alle Prompts:**
- **Kontextblock anhängen** (aus 9.12): Produktfakten + Markenstimme.
- Auf Deutsch prompten, wenn Deutsch ausgegeben werden soll.
- **Keine Personendaten** einfügen.
- **Ausgabeformat** immer angeben (Tabelle/Liste/Zeichenlimit).
- Fakten **prüfen** (Quelle verlangen).
- Zeichenzahlen selbst zählen.
- Modellwahl: **günstig** für Serien, **stark** für P-01, P-07, P-14, Krisen.

**P-01 – Synthetische Persona (nur Ideenfindung)**
```text
Du bist Marktforschungs-Assistent. Nutze den KONTEXT (Produktfakten). Erzeuge für die Zielgruppe "<Persona>" 12 Einwände, die sie gegen tuur haben könnte, sortiert nach Wahrscheinlichkeit, jeweils mit: (a) wörtlicher Einwand in eigener Sprache, (b) versteckte Sorge, (c) welche Frage ich in einem echten Interview stellen sollte, um es zu prüfen. Kennzeichne klar: "Hypothese, keine Daten". Erfinde keine Studien oder Statistiken. Ausgabe: Tabelle.
KONTEXT: <Faktenkasten>
```

**P-02 – Content-Kalender**
```text
Erstelle einen 12-Wochen-Content-Kalender (Tabelle: Woche | Kanal | Thema | Hook (max 12 Wörter) | Beweis (welcher echte tuur-Screen/Erzähltext) | CTA). Kanäle: TikTok/Reels/Shorts (3/Woche), Instagram Story (2/Woche), LinkedIn (1/Woche). Themen aus: vier Modi, Rad-Modus, Datenschutz, Offline, Fehler melden, Tour des Tages in <Stadt 1>/<Stadt 2>, Partner (Kennzeichnung), Barrierefreiheit. Nur Funktionen aus KONTEXT. Ton: MARKENSTIMME. Keine Zitate, keine Statistiken erfinden.
KONTEXT: <Faktenkasten>  MARKENSTIMME: <brand-voice.md>
```

**P-03 – Kurzvideo-Skript aus echter Erzählung**
```text
Aufgabe: Schreibe ein 25-Sekunden-Video-Skript für <Plattform>. Ich gebe dir das ECHTE TRANSKRIPT einer tuur-Erzählung. Verwende nur Fakten daraus; ändere keine Zahlen/Namen; füge nichts hinzu. Format: Zeitcode | Bild | Sprechtext/Untertitel. Struktur: Hook (2 s), Frage (3 s), Erzähl-Ausschnitt aus dem Transkript (10–12 s, wörtlich), Auflösung (3 s), CTA "Erste Tour pro Ort gratis" (3 s), Hinweis "KI-Stimme". Gib zusätzlich 3 Hook-Varianten und 5 Hashtags. Kennzeichne unklare Fakten mit [PRÜFEN].
TRANSKRIPT: <Text aus der App>
```

**P-04 – Untertitel/Übersetzung**
```text
Übersetze diese Untertitel (SRT) von <Deutsch> nach <Englisch>. Gesprochene, natürliche Sprache, keine Wort-für-Wort-Übersetzung. Ortsnamen und Eigennamen unverändert lassen. Zeilenlänge max 42 Zeichen, max 2 Zeilen, Zeitcodes unverändert. Gib nur die SRT-Datei zurück. Danach eine Liste unsicherer Stellen [PRÜFEN].
SRT: <Text ohne Personendaten>
```

**P-05 – ASO-Keyword-Recherche**
```text
Erzeuge 80 Suchbegriff-Kandidaten (DE) und 80 (EN) für eine App: KI-Audio-Stadtguide für Fußgänger und Radfahrer (Fakten: KONTEXT). Gruppiere: (1) Kernbegriffe, (2) Nutzerfragen, (3) Long-Tail mit Stadt <Stadt>, (4) Synonyme, (5) Radfahren, (6) Geschichte/Architektur. Markiere pro Begriff: Absicht (Info/Kauf/Vergleich), Wettbewerbsstärke (niedrig/mittel/hoch; nur Schätzung, kennzeichnen), Relevanz 1–5. **Keine Markennamen anderer Apps.** Ausgabe: Tabelle.
KONTEXT: <Faktenkasten>
```

**P-06 – Store-Texte innerhalb der Zeichenlimits**
```text
Schreibe für <App Store/Google Play> in <DE/EN>: Name (max 30), Untertitel (max 30) bzw. Kurzbeschreibung (max 80), Promo-Text (max 170), Keyword-Feld (max 100, Komma, keine Leerzeichen, keine Wörter aus Name/Untertitel), Beschreibung (max 4000). Nur Funktionen aus KONTEXT. Keine Superlative ohne Beleg, keine Preise, keine Markennamen Dritter. Gib je Feld die Zeichenzahl an; ich zähle nach.
KONTEXT: <Faktenkasten + "Was du NICHT sagen darfst">
```

**P-07 – Pressemitteilung**
```text
Schreibe eine Pressemitteilung (max 300 Wörter, Sie-Form, sachlich) über den Start von tuur. Struktur: Überschrift (max 70 Zeichen), Untertitel, Lead (Wer/Was/Wann/Wo), Nutzen für Leser, Datenschutz-Absatz, Barrierefreiheit-Absatz, Zitat (VERWENDE NUR DIESES ZITAT: "<echtes Zitat>"), Verfügbarkeit/Preis (nur, was in KONTEXT steht), Boilerplate, Kontakt. Erfinde keine Zahlen, keine Zitate, keine Auszeichnungen. Liste am Ende alle Behauptungen, die ich prüfen soll.
KONTEXT: <Faktenkasten + Fakten des Starts>
```

**P-08 – Partner-Recherche (mit Web-Zugriff)**
```text
Recherchiere den Betrieb "<Name>", <Ort>, Website <URL>. Nutze nur Quellen, die du öffnen kannst. Gib: (1) Was der Betrieb anbietet, (2) Lage/nahe Sehenswürdigkeiten, (3) Zielgruppe/Saison, (4) Öffnungszeiten (falls angegeben), (5) 3 Gesprächsanknüpfungspunkte, (6) Risiken (z. B. Wettbewerber nebenan). Jede Aussage mit URL belegen. Wenn unklar: "nicht gefunden". Keine Vermutungen, keine privaten Personendaten (nur Betriebsdaten).
```

**P-09 – Partner-Erstansprache (Vor-Ort/Telefon/Brief, keine Kaltmail)**
```text
Schreibe ein 60-Sekunden-Telefon-/Vor-Ort-Skript (Sie-Form, freundlich, kein Druck) und einen Brief-Entwurf (max 150 Wörter) an <Betrieb>. Verwende NUR die belegten Fakten aus RECHERCHE. Erwähne: gekennzeichnete "Anzeige · Partner"-Station, Angebot per QR-Code, anonymisierte Statistik, Pilot <X> Wochen. Keine Versprechen zu Besucherzahlen. Am Ende: 3 mögliche Einwände mit ehrlicher Antwort.
RECHERCHE: <Ergebnis P-08>  KONTEXT: <Partnerfakten aus 5.7>
```

**P-10 – FAQ**
```text
Erstelle 20 FAQ-Einträge (Frage, Antwort max 60 Wörter, du-Form) für tuur auf Basis von KONTEXT: Kosten/Gratis-Tour, Modi, Offline, Datenschutz/Standort, KI-Fehler, Konto löschen, Kauf wiederherstellen, Einladungslinks (einmal einlösbar, 14 Tage), Partner, Barrierefreiheit, Sprachen. Antworten dürfen nichts enthalten, was nicht in KONTEXT steht; wenn Info fehlt: "[LÜCKE]".
KONTEXT: <Faktenkasten + AGB-Auszüge>
```

**P-11 – Support-Antwort-Entwurf**
```text
Formuliere eine freundliche, kurze Antwort (du-Form) auf diese ANONYMISIERTE Support-Anfrage. Nutze nur Fakten aus KONTEXT. Keine Rückerstattungs-Zusagen (Store entscheidet), keine Rechtsauskünfte; bei Datenschutz auf Datenschutzerklärung verweisen. Schließe mit 1 Rückfrage, falls Infos fehlen.
ANFRAGE (anonymisiert): <Text ohne Namen/E-Mail>  KONTEXT: <FAQ>
```

**P-12 – Community-Moderationsregeln**
```text
Schreibe Community-Regeln (max 10, verständlich, freundlich) für eine tuur-Community (Discord/WhatsApp) mit Schwerpunkt Tour-Feedback. Enthalten: Respekt, Datenschutz, Sicherheit im Verkehr, Fehlermeldungen, Werbeverbot, Verwarnstufen, Beschwerdeweg. Ergänze 6 typische Vorfälle mit empfohlener Moderationsreaktion.
```

**P-13 – Anzeigen-Kreativvarianten (Paid Test)**
```text
Erzeuge 12 Anzeigen-Varianten (Primärtext max 125 Zeichen, Überschrift max 40, CTA) für <Plattform>. Zielgruppe: <Persona>, Ort: <Stadt>. Nutze ausschließlich Fakten aus KONTEXT. Jede Variante testet EINEN Hebel (Hook/Problem/Nutzen/Datenschutz/Rad/Gratis). Keine Übertreibungen, keine Zitate, keine Sterne/Bewertungen. Kennzeichne, welcher Hebel getestet wird.
KONTEXT: <Faktenkasten>
```

**P-14 – Partner-Fallstudie (aus deinen Zahlen)**
```text
Schreibe eine 1-seitige Fallstudie (max 250 Wörter, sachlich) über den Partner <Betrieb> aus diesen ECHTEN Daten: <Impressionen, Besuche, Einlösungen, Zeitraum>. Zitat verwenden NUR wenn hier eingefügt: "<Zitat mit Freigabe>". Keine Interpretation über die Zahlen hinaus, keine Umsatzangaben, wenn nicht genannt. Ende mit einer Frage an interessierte Betriebe (Kontakt).
```

**P-15 – SEO-Stadtseite: Einleitungstext (Handarbeit-Assistent)**
```text
Schreibe eine Einleitung (max 120 Wörter, du-Form) für die Stadtseite "Audio-Tour durch <Stadt>". Verwende nur diese FAKTEN: <5–8 geprüfte Fakten aus Wikipedia/tuur mit Quelle>. Nenne die Touren: <Titel, Dauer>. Kein Marketing-Blabla, keine Superlative ohne Beleg. Gib Vorschläge für Title (max 60 Zeichen) und Meta-Description (max 155 Zeichen).
```

**P-16 – Bewertungs-Antwort**
```text
Schreibe eine kurze, freundliche Antwort auf diese ANONYMISIERTE Store-Bewertung (Ton: MARKENSTIMME, max 60 Wörter). Bei Kritik: konkret, Lösung anbieten, Kontakt nennen. Keine Rechtfertigung. Keine Zusagen, die wir nicht halten können.
BEWERTUNG: <Text>
```

**P-17 – Tour des Tages: Social-Post aus echtem Transkript**
```text
Ich gebe dir das echte Transkript einer tuur-Erzählung zu "<Station>" in <Stadt>. Schreibe (1) Instagram-Caption (max 300 Zeichen), (2) LinkedIn-Post (max 700 Zeichen), (3) Pinterest-Titel (max 100 Zeichen) + Beschreibung (max 300 Zeichen). Fakten nur aus dem Transkript. Hinweis "KI-Stimme, Quellen: Wikipedia/OSM" einbauen. CTA: "Erste Tour pro Ort gratis".
TRANSKRIPT: <Text>
```

**P-18 – Wochenreview (nur Zahlen, keine Personendaten)**
```text
Hier meine Wochenzahlen (Tabelle). Analysiere: (1) Wo bricht der Funnel ein? (2) Welche 3 Hypothesen erklären das? (3) Welche Tests würdest du vorschlagen (mit Aufwand/Wirkung)? (4) Was sollte ich diese Woche STOPPEN? Sei ehrlich über Unsicherheit und kleine Stichproben. Wende die Entscheidungsregeln R-01 bis R-17 an, wenn passend.
ZAHLEN: <Tabelle>  REGELN: <Tabelle 6.3>
```

### 9.9 Interview-Leitfaden (20 Minuten)

1. **Einstieg (2 Min):** Danke; Ziel: lernen, nicht verkaufen; Einwilligung zur Notiz; anonym.
2. **Verhalten (6 Min):** „Erzähl von deiner letzten Städtereise/Radtour. Wie hast du entschieden, was du ansiehst?" „Welche Apps/Guides hast du benutzt?" „Was war der beste/schlechteste Moment beim Erkunden?"
3. **Problem (4 Min):** „Wann hast du dir gewünscht, mehr über einen Ort zu wissen?" „Was hast du dann getan?" „Wie viel Zeit/Geld hast du dafür ausgegeben?"
4. **Demo (4 Min):** Kurzvideo/Prototyp. „Was denkst du, macht die App?" „Was fehlt?" „Wovor hast du Sorge (Datenschutz, KI-Fakten, Akku)?"
5. **Preis (2 Min):** „Erste Tour pro Ort gratis, weitere 1,99 €: wie wirkt das?" (nicht suggestiv; danach Schweigen).
6. **Abschluss (2 Min):** „Wen sollte ich noch fragen?" Danke. **Kein** Bewertungs- oder Kaufversprechen.
- **Notizen:** Zitate (ohne Klarnamen) und Beobachtungen in Tabelle: Persona | Verhalten | Schmerz | Reaktion | Einwand | Idee.

### 9.10 Follow-up-Sequenz-Texte (Partner, nur mit bestehendem Kontakt)

**+1 Tag (nur wenn der Betrieb dir seine Adresse gegeben hat/dies gewünscht hat):**
```text
Betreff: Danke für das Gespräch heute – tuur-Pilot

Guten Tag <Name>,
danke für Ihre Zeit heute im <Betrieb>. Wie besprochen: ... <2–3 Sätze Zusammenfassung>. Zur Ansicht: <Partner-Infoseite>. Sie können jederzeit „stopp" sagen; dann melde ich mich nicht mehr. Nächster Schritt: <Termin/Einrichtung 10 Minuten>.
Freundliche Grüße <Name>
```
**+7 Tage (Telefon-Skript):** „Guten Tag, <Name> von tuur. Ich wollte fragen, ob Sie noch Fragen zum Pilot haben. Ich kann das Profil in 10 Minuten mit Ihnen einrichten."
**+21 Tage (Kurznachricht):** „Kurz zur Info: Ein Betrieb in <Stadt> hatte im Pilot <Zahl> Einlösungen in <Zeitraum> (anonymisierte Statistik). Wenn Sie Interesse haben: <Link>."
**+45 Tage (Abschluss):** „Ich habe mich einige Male gemeldet; ich beende das jetzt. Falls sich etwas ändert, ist hier der Link: <Partner-Infoseite>. Alles Gute für Ihren Betrieb!"

### 9.11 Wartelisten-Mails (Double-Opt-in)

**Bestätigungsmail (Transaktion):**
```text
Betreff: Bitte bestätige deine Anmeldung bei tuur

Hallo,
du (oder jemand mit deiner E-Mail) hast dich für die tuur-Warteliste eingetragen. Bitte bestätige mit einem Klick:
<Bestätigungslink>
Damit willigst du ein, dass wir dir per E-Mail über den Start von tuur und Neuigkeiten schreiben. Du kannst dich jederzeit abmelden (Link in jeder Mail). Infos zum Datenschutz: <Link>.
Wenn du dich nicht angemeldet hast, ignoriere diese Mail einfach.
<Name>, tuur · <Impressum-Link>
```
**Willkommensmail (nach Bestätigung):**
```text
Betreff: Du bist dabei! Was tuur ist und wie es weitergeht

Hallo,
danke für deine Anmeldung. tuur ist ein KI-Audio-Stadtguide für Fußgänger und Radfahrer: Du gehst los, und tuur erzählt dir die Geschichte zu dem, was du siehst. Die erste Tour pro Ort ist gratis.
Wir starten zuerst in <Städte>. Du kannst uns mit einer Antwort auf diese Mail verraten, welche Stadt dich interessiert.
Wir suchen außerdem Testerinnen und Tester: <Link>.
Abmelden: <Link> · Datenschutz: <Link> · Impressum: <Link>
```
**Launch-Mail:**
```text
Betreff: tuur ist da: Lauf los, tuur erzählt

Hallo,
heute startet tuur. iPhone: <Link>. Android: <Link>. Die erste Tour pro Ort ist gratis. Am besten startest du in <Städte>. Fehler in Erzählungen? Bitte melde sie direkt in der App, das hilft allen.
Viel Spaß beim Loslaufen!
<Name>
Abmelden: <Link>
```

### 9.12 Vorlagen für KI-Kontext

**`brand-voice.md` (Vorlage):**

```text
MARKENSTIMME tuur
- Du-Form (Nutzer), Sie-Form (Presse/Betriebe)
- Kurze Sätze, konkret, warm, neugierig, präzise; kein Marketingsprech
- Ein Augenzwinkern erlaubt, nie belehrend
- KI ehrlich benennen ("KI-Stimme", "aus Quellen wie Wikipedia und OSM")
- Verbotene Wörter: revolutionär, disruptiv, einzigartig (unbelegt), perfekt, 100 %, Insider-Geheimnis
- Marke: weiß, sparsam rot #ED0516, Herz-Pin
- Claim: "Lauf los. tuur erzählt."
```

**Faktenkasten (Vorlage, siehe 0.4, hier komprimiert):**

```text
FAKTEN tuur
- KI-Audio-Stadtguide für Fußgänger und Radfahrer; UI+Erzählung Deutsch/Englisch
- Modi: Standardtour, Route planen, Weggabelung, Streifzug
- Tempoanpassung (kurze Erzählungen beim Radfahren), "Mehr erfahren", Pause bei Fahrzeug-Tempo
- Erzählungen: KI (Gemini) aus Wikipedia/Wikidata/OSM, automatisch geprüft, KI-gekennzeichnet, Transkript, "Fehler melden"
- Offline-Downloads (Karte, Audio, Bilder, Texte)
- Erste (kürzeste) Standardtour pro Ort gratis; weitere Touren per Guthaben (Preis im Store), Abo (werbefrei), belohnte Werbung, Einladungslinks (2x pro gekaufter Standardtour)
- Datenschutz: Position auf dem Gerät; nur grobes Kartenquadrat an Server; einmalige Position bei Routenplanung/Einlösung; Analytics/Crash erst nach Zustimmung; Werbung nach Einwilligung
- Partner: gekennzeichnet "Anzeige · Partner", QR-Einlösung, anonymisierte Statistik
- Nicht vorhanden: Dark Mode, Gruppentour in Echtzeit, Web-Tour-App, User-Content, Push (Stand <Datum>)
- Nicht sagen: "Standort verlässt nie das Handy", "tracking-frei", "100 % korrekt", "unabhängig" (ohne Zusatz)
```

**Ende des Dokuments.** Pflege dieses Plans: Nach jedem Monat Abschnitte 6.2/6.3 mit echten Zahlen aktualisieren, veraltete Annahmen (0.3) ersetzen, neue Erkenntnisse in `docs/DECISIONS.md` (Produkt) oder hier (Marketing) festhalten.
