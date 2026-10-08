# Unit Economics: Was kostet eine Tourstunde, reicht die Bepreisung?

## Kostenlose Texttouren und bezahlter Audioguide — 2026-10-08

Die aktuelle lokale Produktänderung trennt kostenlose Texttouren von bezahlter Audioführung. Textmodus, Infokarten und Wegführung verbrauchen keine Audiominuten und erzeugen keine Tour-Sprachausgabe. Der eigene Infokartenabruf `getPoiText` lädt und speichert vorhandene Quelltexte ohne LLM oder TTS. Kosten können weiterhin für Ortsdaten, Routing, Firebase und Datenübertragung sowie separat erzeugte Tourbeschreibungen und Ortsvorstellungen entstehen; „ohne TTS“ bedeutet daher nicht „ohne Betriebskosten“. Ein Guthaben bleibt auf 90 aktive Audiotourminuten begrenzt, das 5er-Paket auf 450, Premium auf 500 pro UTC-Kalendermonat. Die Preise wurden nicht verändert. Bestehende kaufbasierte Legacy-Geschenke und vom bezahlten Host finanzierte Gruppen behalten ihren Audiozugang; neue Gratis-/Reward-Audiorechte werden nicht als Werbebelohnung ausgegeben.

Vor jeder neuen kostenlosen Tour wird eine feste Stimmvorstellung und danach, falls verfügbar und datenschutzrechtlich freigegeben, eine Anzeige abgespielt. Die sechs deutsch-/englischsprachigen Gemini-MP3s wurden einmalig mit sechs TTS-Aufrufen erzeugt und mit der App gebündelt: insgesamt 691.314 Bytes, jeweils 17,00–21,48 Sekunden. Ihre wiederholte Wiedergabe verursacht keinen weiteren TTS-Aufruf, keine erneute Audioauslieferung aus unserem Backend und keinen Verbrauch gekaufter Minuten. Die einmaligen Erzeugungskosten wurden nicht als eigene Provider-Rechnung gemessen; die Dateien vergrößern das App-Paket um rund 0,69 MB. Modell, Texte und Hashes stehen in `scripts/voice-previews.manifest.json`.

**AdMob ist am 08.10.2026 laut Live-Konto nicht genehmigt; Werbeerlöse sind nicht nachgewiesen.** Eine angelegte Anzeigen-ID, ein funktionierender SSV-Test oder Google-Testanzeigen sind keine Einnahmen. Die Kontomeldung und E-Mail nennen keinen spezifischen Ablehnungsgrund. Für eine belastbare Rechnung werden später tatsächliche gültige Impressionen, Füllrate, geografischer Nutzungsmix und Netto-eCPM benötigt. Bis dahin gibt es keine bestätigte Kostendeckung kostenloser Texttouren durch Werbung. Die Texttour bleibt bei fehlender oder nicht zulässiger Anzeige zugänglich; auch solche Nutzung kann Infrastrukturkosten verursachen.

Die Modellrechnung vom 07.10. unten beschreibt weiterhin bezahlte Audio-Nutzung unter ihren genannten Annahmen. Sie enthält weder gemessene Texttour-Kosten noch bestätigte Werbeeinnahmen und belegt insbesondere keine neue positive Werbemarge. Die historischen Szenarien vom 30.09. sind keine aktuelle Preis- oder Betriebskostenabrechnung. Diese Änderung wurde noch nicht als Backend-, Legal-, OTA- oder neuer TestFlight-Release veröffentlicht; Build 9 enthält das neue Modell nicht.

## Aktuelle Produktregel — 2026-10-07

Freigegeben und implementiert: **ein Credit = bis zu 90 aktive Tourminuten**, ein 5er-Paket = 450 Minuten, beide Abos = **500 Minuten pro UTC-Kalendermonat**, ohne Übertrag. Pausen verbrauchen keine Minuten. Eine Gruppe hört dieselbe einmal erzeugte Aufnahme; nur das Zeitkonto des Hosts wird belastet. Downloads reservieren ihre geplante Dauer einmalig, gespeicherte Wiedergabe kostet keine weiteren Minuten.

Die folgende Modellrechnung verwendet die bereits diskutierten Annahmen: 19 % Umsatzsteuer, 15 % Store-Anteil auf den Nettopreis, zusätzliche Reserve von 1 % des Bruttopreises und neu erzeugte Inhalte ohne Cache-Vorteil. Als Nutzungsmix dient zur Hälfte Route und zur Hälfte Explore mit normaler Erzähldichte; Text, Faktenprüfung, Gemini-Flash-Sprachausgabe und variable Infrastruktur sind enthalten. Dies sind Kostenschätzungen, keine gemessenen Rechnungen oder Gewinnzusagen.

| Produkt                              |      Bruttopreis | Verfügbar nach Steuer, Store und Reserve | Variable Kosten bei voller Nutzung |  Deckungsbeitrag |
| ------------------------------------ | ---------------: | ---------------------------------------: | ---------------------------------: | ---------------: |
| 1 Credit / 90 Minuten                |           1,99 € |                                   1,40 € |                             0,61 € |           0,79 € |
| 5 Credits / 450 Minuten              |           7,99 € |                                   5,63 € |                             3,06 € |           2,56 € |
| Monatsabo / 500 Minuten              |           9,99 € |                                   7,04 € |                             3,41 € |           3,63 € |
| Jahresabo / je 500 Minuten monatlich | 59,99 € jährlich |                         3,52 € monatlich |                   3,41 € monatlich | 0,12 € monatlich |

Rundungsdifferenzen sind möglich. Der Deckungsbeitrag finanziert außerdem Entwicklung, Support, feste Betriebskosten und Marketing; erst nach deren Abzug bleibt Gewinn. Je nach Modus kosten 90 Minuten im Modell ungefähr 0,46 € (Route), 0,47 € (Crossroads), 0,77 € (Explore normal) oder 1,11 € (Explore mit hoher Erzähldichte). **Das Jahresabo zu 59,99 € hat bei voller Auslastung kaum Spielraum**; höhere Erzähldichte kann seinen Deckungsbeitrag negativ machen. Die Preise wurden deshalb nicht stillschweigend als wirtschaftlich abgesichert behandelt oder verändert.

Die Analyse ab dem nächsten Absatz stammt vom 2026-09-30. Ihre damaligen Abo-Preise, Cache-Annahmen und Empfehlungen sind historisch und werden durch die Produktregel oben ersetzt. `scripts/unit-economics.mjs` reproduziert weiterhin diese ältere Szenariorechnung.

Stand 2026-09-30. Alle Zahlen lassen sich mit `node scripts/unit-economics.mjs` nachrechnen; dort stehen alle Annahmen an einer Stelle. Preise in USD stammen von den Anbietern, Umrechnung mit 1 € = 1,15 USD. Was nicht auf einer offiziellen Seite bestätigt werden konnte, ist mit **[unverifiziert]** markiert.

## 1. Kurzfazit

- Eine Tourstunde kostet uns **0,04 bis 0,89 USD**. Das hängt vor allem davon ab, ob der Inhalt schon im Cache liegt (also schon einmal für jemanden erzeugt wurde) und wie viel erzählt wird. Eine geführte Route in einer „kalten“ Stadt (noch nichts erzeugt) kostet **ca. 0,37 USD (0,32 €)**, ein Streifzug auf „normal“ **ca. 0,62 USD**. In einer gut besuchten Stadt (95 % Cache) sind es nur **ca. 0,04 bis 0,06 USD**.
- **Die Sprachausgabe (TTS) ist der größte Kostenblock**: 55 bis 65 % einer kalten Stunde. Mit OpenAI `gpt-4o-mini-tts` kostet eine Minute Audio ca. 1,5 ct (USD), mit Gemini Flash-Lite TTS ca. 0,9 ct, mit ElevenLabs v3 ca. 8 ct.
- **Tour-Credit (1,99 €, netto ca. 1,40 € nach MwSt., Store und RevenueCat)** trägt die übliche Nutzung (1 bis 2 Stunden) mit Gewinn. Es wird nur dann ein Verlustgeschäft, wenn jemand die 24-h-Session für mehr als ca. 2,5 bis 4 kalte Stunden nutzt.
- **Das Abo (4,99 €, netto ca. 3,51 €)** trägt leichte und mittlere Nutzung (bis ca. 6 bis 11 kalte Stunden oder ca. 20 warme Stunden im Monat). **Verlust machen Vielnutzer in neuen Städten**, typisch ist der Reisende, der ein Monatsabo für eine Woche Rom abschließt und täglich stundenlang streift (15 h kalt: ca. -2,90 € pro Monat).
- **Wichtig ab 1.1.2027:** Google verdoppelt laut Preisliste die Preise für Gemini 3.8 Flash (Text) und die Gemini-TTS-Modelle. OpenAI-Stimmen bleiben dann die günstigste gute Option. Unsere aktuelle Standardstimme (OpenAI „Mara“) ist also kostenseitig richtig gewählt.
- **Empfehlung:** Tour-Credit bei **1,99 €** lassen, aber eine faire Obergrenze pro 24-h-Session einführen (ca. 3 Stunden Audio-Erzeugung). Monatsabo auf **5,99 €** anheben, solange noch niemand zahlt (später ist das schwerer), dazu ein **Jahresabo für 39,99 €** und eine Fair-Use-Regel (ab ca. 20 Stunden im Monat günstigere Stimme). Werbung deckt eine Gratis-Tour nicht: Die Gratis-Tour ist Marketing und sollte auf gecachte Inhalte und ein Rewarded Ad pro Tag begrenzt werden.

## 2. Annahmen

| Annahme                              | Wert                                                           | Quelle / Begründung                                                                                                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tourdauer geplante Route             | Standard 60 min (Auswahl 30 bis 180)                           | `apps/mobile/app/plan.tsx` (`TIMES`, Default 60)                                                                                                                                                                                                        |
| Tourdauer Weggabelung                | 60 / 90 / 120 min                                              | `apps/mobile/app/fork.tsx`                                                                                                                                                                                                                              |
| Standardtouren                       | 60, 75 (Themen), 120 min                                       | `DEFAULT_TEMPLATES` in `routing/autoTours.ts`                                                                                                                                                                                                           |
| Streifzug                            | offen; wir rechnen mit 60 bis 90 min pro Session **[Annahme]** | keine feste Dauer im Code                                                                                                                                                                                                                               |
| **Durchschnittliche Tour**           | **ca. 75 min** **[Annahme]**                                   | Mittel aus Defaults; echte Werte nach Launch aus `usageLogs`                                                                                                                                                                                            |
| Stopps pro Routen-Stunde             | ca. 5                                                          | 4,5 km/h Gehtempo, Verweildauer 3 bis 12 min je Ort (`estimateDwellMinutes`), ca. 6 min Weg je Etappe, min. 4 Stopps pro 60 min                                                                                                                         |
| Erzähllänge pro Stopp (Route)        | lang, ca. 3 min                                                | Pacing wählt die längste Stufe, die in die Gehzeit passt (`chooseTier`); bei ca. 6 min Weg passt „long“ (180 s)                                                                                                                                         |
| Übergänge (Route)                    | 4 pro Stunde, je ca. 15 s                                      | `transition.ts`, 1 bis 2 Sätze, Flash-Lite, mit eigener Sprachausgabe                                                                                                                                                                                   |
| Weggabelung, Teaser                  | 2 pro Stopp (nur Text)                                         | `teaser.ts`, max. 22 Wörter, Flash-Lite                                                                                                                                                                                                                 |
| Streifzug wenig / normal / viel      | 8 / 15 / 25 Erzählungen pro Stunde, Ø 2 / 1,5 / 1,2 min        | `ROAM_PROFILES`: Pause 120 / 45 / 15 s und Mindestabstand 350 / 150 / 60 m zwischen Orten, bei 1,35 m/s Gehtempo; Länge je nach Abstand meist „medium“. Obergrenze in dichten Innenstädten **[Annahme]**                                                |
| **Audio-Minuten pro Tourstunde**     | Route 16 min, Streifzug 16 / 22,5 / 30 min                     | aus den Zeilen darüber                                                                                                                                                                                                                                  |
| Zeichen pro Minute deutscher Sprache | ca. 1.000                                                      | Code rechnet mit 150 Wörtern/min (`prompt.ts`, `tts.ts`), deutsche Wörter ca. 6,7 Zeichen inkl. Leerzeichen **[Annahme]**                                                                                                                               |
| Tokens pro Erzählung (Text-KI)       | Eingabe ca. 5.000; Ausgabe ca. 1.400 (kurz) bis 2.750 (lang)   | Eingabe: Prompt + bis zu 3 Wikipedia-Auszüge à 5.000 Zeichen (`narrationSources.ts`). Ausgabe: Text **doppelt** (Felder `narration` und `paragraphs`), ca. 250 Tokens Fakten/Titel, ca. 1.000 „Denk-Tokens“ (Thinking ist nicht begrenzt) **[Annahme]** |
| Faktencheck                          | 5.200 Tokens rein, 600 raus (Flash-Lite)                       | `service.ts`: 1 Faktencheck je Versuch                                                                                                                                                                                                                  |
| Versuche                             | Ø 1,2                                                          | max. 2 Versuche (`service.ts`), 20 % brauchen den zweiten **[Annahme]**                                                                                                                                                                                 |
| Cache-Trefferquote                   | kalt 0 %, warm 70 %, beliebt 95 %                              | Schlüssel = Ort + Sprache + Länge + Hauptinteresse + Prompt-Version; Stimmen werden getrennt als Audio gespeichert                                                                                                                                      |
| Audio-Format                         | MP3 48 kbit/s (ca. 0,36 MB/min)                                | DECISIONS D17                                                                                                                                                                                                                                           |
| Karte                                | ca. 150 Kachelabrufe pro Stunde **[Annahme]**                  | MapLibre mit Gerätecache                                                                                                                                                                                                                                |
| Store-Gebühr                         | 15 %                                                           | Apple Small Business Program (< 1 Mio. USD Erlös), Google Play 15 % auf Abos und erste 1 Mio. USD                                                                                                                                                       |

## 3. Kosten pro Tourstunde

### 3.1 Preise der Bausteine (geprüft am 2026-09-30)

| Baustein                                   | Preis laut Anbieter                                                                        | pro Audio-Minute / Einheit                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Text: `gemini-3.8-flash`                   | 0,75 USD / 1 Mio. Tokens rein, 3,75 USD raus; **ab 1.1.2027: 1,50 / 7,50**                 | ca. 1,5 bis 2,1 ct pro Erzählung inkl. Check          |
| Faktencheck: `gemini-3.5-flash-lite`       | 0,30 USD rein, 2,50 USD raus                                                               | in obiger Zahl enthalten                              |
| TTS OpenAI `gpt-4o-mini-tts` (Mara, Jonas) | 0,60 USD / 1 Mio. Text-Tokens, 12 USD / 1 Mio. Audio-Tokens; OpenAI schätzt ca. 1,5 ct/min | **1,5 ct**                                            |
| TTS `gemini-3.8-flash-tts`                 | 0,50 USD Text, 9 USD Audio (ab 2027: 1 / 18)                                               | **1,4 ct** (ab 2027: 2,7 ct)                          |
| TTS `gemini-3.8-flash-lite-tts` (Lina)     | 0,50 USD Text, 6 USD Audio (ab 2027: 1 / 12)                                               | **0,9 ct** (ab 2027: 1,8 ct)                          |
| TTS ElevenLabs v3 (nur Vergleich)          | 0,08 USD / 1.000 Zeichen                                                                   | **8 ct**                                              |
| Firebase Storage Download                  | 0,12 USD / GB                                                                              | < 0,1 ct pro Stunde                                   |
| Firestore Lesezugriffe                     | ca. 0,03 bis 0,06 USD / 100.000 **[unverifiziert]**                                        | < 0,1 ct pro Stunde                                   |
| Routing openrouteservice                   | kostenlos (Standard-Plan: 2.000 Directions + 500 Matrix pro Tag)                           | 0, aber Kontingent-Grenze (siehe 5)                   |
| Karte MapTiler Flex                        | 30 USD/Monat inkl. 500.000 Kachelabrufe, dann 0,15 USD / 1.000                             | ca. 2 ct pro Stunde (Free-Plan ist nicht kommerziell) |

Gemini-TTS rechnet in Audio-Tokens; 25 Tokens pro Sekunde Audio laut Google-Cloud-Preisseite (nur als Suchauszug gesehen, **[unverifiziert]**). Bei OpenAI nennt die Preisseite nur Tokenpreise; die 1,5 ct/min sind OpenAIs eigene Schätzung, im Forum bestätigt, auf der aktuellen Preisseite aber nicht mehr sichtbar (**[teilweise verifiziert]**).

### 3.2 Kosten pro Tourstunde (OpenAI-Stimme, USD)

| Modus                | Audio/h  | Kalt (0 %) | davon Text-KI / TTS / Infrastruktur | Warm (70 %) | Beliebt (95 %) |
| -------------------- | -------- | ---------- | ----------------------------------- | ----------- | -------------- |
| Route / Standardtour | 16 min   | **0,37**   | 0,11 / 0,24 / 0,025                 | 0,13        | 0,04           |
| Weggabelung          | 16 min   | 0,38       | 0,12 / 0,24 / 0,025                 | 0,13        | 0,04           |
| Streifzug wenig      | 16 min   | 0,41       | 0,15 / 0,24 / 0,025                 | 0,14        | 0,04           |
| Streifzug normal     | 22,5 min | **0,62**   | 0,26 / 0,34 / 0,025                 | 0,20        | 0,06           |
| Streifzug viel       | 30 min   | 0,89       | 0,41 / 0,45 / 0,025                 | 0,28        | 0,07           |

Infrastruktur (Karte, Firebase, Routing) ist praktisch vernachlässigbar; die Karte ist davon der größte Teil.

### 3.3 Stimmen im Vergleich (kalte Stunde, Route / Streifzug normal, USD)

| Stimme                 | bis 31.12.2026 | ab 1.1.2027 | Stimme wechseln (nur Audio neu) |
| ---------------------- | -------------- | ----------- | ------------------------------- |
| OpenAI gpt-4o-mini-tts | 0,37 / 0,62    | 0,45 / 0,82 | 0,24 / 0,34                     |
| Gemini Flash TTS       | 0,35 / 0,59    | 0,65 / 1,10 | 0,22 / 0,31                     |
| Gemini Flash-Lite TTS  | 0,28 / 0,49    | 0,51 / 0,90 | 0,15 / 0,21                     |
| ElevenLabs v3          | 1,41 / 2,08    | 1,49 / 2,29 | 1,28 / 1,80                     |

Stimmwechsel: Der Text wird nur einmal erzeugt; eine andere Stimme kostet nur die Sprachausgabe der gehörten Minuten, also ca. 0,02 USD für eine 90-s-Erzählung mit OpenAI. Ist die Stimme für einen Ort schon einmal erzeugt, ist sie kostenlos.

## 4. Erlöse

### 4.1 Netto pro Kauf

| Produkt                       | Brutto  | nach 19 % MwSt. | nach 15 % Store | nach RevenueCat (1 % ab 2.500 USD Monatsumsatz) | bei 30 % Store |
| ----------------------------- | ------- | --------------- | --------------- | ----------------------------------------------- | -------------- |
| Tour-Credit                   | 1,99 €  | 1,67 €          | 1,42 €          | **1,40 €**                                      | 1,15 €         |
| Abo monatlich                 | 4,99 €  | 4,19 €          | 3,56 €          | **3,51 €**                                      | 2,89 €         |
| Abo 5,99 € (Vorschlag)        | 5,99 €  | 5,03 €          | 4,28 €          | **4,22 €**                                      |                |
| Jahresabo 39,99 € (Vorschlag) | 39,99 € | 33,61 €         | 28,56 €         | **28,16 €** (2,35 €/Monat)                      |                |

### 4.2 Abonnenten: Marge pro Monat bei 4,99 € (Mix 50 % Route, 50 % Streifzug normal, OpenAI)

| Nutzer       | Stunden/Monat | Kalt         | Warm (70 %) | Beliebt (95 %) |
| ------------ | ------------- | ------------ | ----------- | -------------- |
| Leicht       | 2             | +2,65 €      | +3,23 €     | +3,43 €        |
| Median       | 5             | +1,36 €      | +2,79 €     | +3,30 €        |
| Viel (Reise) | 15            | **-2,94 €**  | +1,35 €     | +2,89 €        |
| Extrem       | 40            | **-13,70 €** | **-2,25 €** | +1,84 €        |

Die Stundenwerte sind Annahmen **[Annahme]**; echte Werte liefern nach dem Launch `usageLogs` und die Abspielzeiten.

**Gewinnschwelle** (so viele Stunden pro Monat / pro Credit, bevor wir draufzahlen):

| Szenario                               | Abo 4,99 € | Credit 1,99 € |
| -------------------------------------- | ---------- | ------------- |
| Route, kalt, OpenAI                    | 10,9 h     | 4,4 h         |
| Streifzug normal, kalt, OpenAI         | 6,5 h      | 2,6 h         |
| Streifzug viel, kalt, OpenAI           | 4,6 h      | 1,8 h         |
| Streifzug normal, kalt, Flash-Lite TTS | 8,3 h      | 3,3 h         |
| Streifzug normal, warm, OpenAI         | 19,9 h     | 7,9 h         |
| Streifzug normal, kalt, ElevenLabs     | 1,9 h      | 0,8 h         |

### 4.3 Gratis-Nutzung und Werbung

- Werbeerlös pro Gratis-Stunde: 1 Rewarded Ad plus ca. 2 Interstitials (Limit: alle 2 Stopps, 8 min Abstand, max. 4 pro Tag laut `billing/ads.ts`). Mit Branchenwerten für Westeuropa (Rewarded ca. 5 bis 15 USD pro 1.000 Anzeigen, Interstitial ca. 3 bis 10 USD **[Branchen-Benchmark, unverifiziert]**) sind das **ca. 0,01 bis 0,035 USD pro Stunde**.
- Kosten einer Gratis-Stunde: 0,37 USD kalt, 0,13 USD warm, 0,04 USD beliebt. **Werbung deckt eine Gratis-Tour nur in sehr beliebten Städten**, sonst ist sie Kundengewinnung.
- Risiko: Das Rewarded-Limit steht auf **3 Gratis-Touren pro Tag** (`REWARDED_DAILY_LIMIT_DEFAULT`). Ein Nutzer kann damit ca. 1 USD Kosten pro Tag verursachen.

### 4.4 Partner

Pro verifiziertem Besuch 0,40 € (die ersten 25 gratis), pro Einlösung 0,80 €. Partner dürfen max. 25 % der Stopps sein. Realistisch ca. 0,3 Partnerbesuche pro Tourstunde **[Annahme]**, das sind **ca. 0,14 € pro Stunde**. Das deckt eine warme Stunde fast vollständig, fällt am Anfang wegen der 25 Gratis-Besuche und wenigen Partnern aber kaum ins Gewicht.

## 5. Gewinnschwelle und Risiken

**Wo wir Geld verlieren:**

1. **Reise-Abonnenten in neuen Städten.** Ab ca. 6 bis 11 kalten Stunden pro Monat ist das 4,99-€-Abo im Minus. Genau diese Gruppe ist wahrscheinlich: Wer 3 Tage in einer Stadt ist, zahlt für 3 Credits 5,97 € und nimmt stattdessen das Abo.
2. **Lange 24-h-Sessions mit einem Credit.** Ein Credit gilt 24 h lang für alle dynamischen Modi. Streifzug auf „viel“ ist nach ca. 1,8 kalten Stunden im Minus.
3. **Offline-Download einer kalten Tour** erzeugt alle 3 Längen: ca. 0,64 USD für 5 Stopps, fast die Hälfte des Credit-Erlöses.
4. **ElevenLabs als Standardstimme** wäre bei jedem Szenario außer „beliebt“ zu teuer (Abo nach 1,9 kalten Stunden im Minus).
5. **Preisverdopplung bei Gemini am 1.1.2027** (Text und TTS). Mit OpenAI-Stimme steigt eine kalte Streifzug-Stunde von 0,62 auf 0,82 USD, mit Gemini-Stimme auf 0,90 bis 1,10 USD.
6. **Cache-Zersplitterung.** Der Cache-Schlüssel enthält Hauptinteresse (8 Möglichkeiten), Länge (3), Sprache und später je Stimme ein Audio. Pro Ort gibt es also Dutzende Varianten; eine Trefferquote von 70 % braucht deutlich mehr Nutzer pro Ort, als man denkt. Im Streifzug hängt die Länge vom Abstand ab, was weiter zersplittert.

**Tagesbudget 3 USD (D39):** Es reicht für ca. **9 kalte Routen-Stunden oder 5 kalte Streifzug-Stunden pro Tag** (OpenAI; mit Flash-Lite TTS 12 bzw. 6,5 h). Für TestFlight mit 10 bis 20 Testern reicht das, **für einen Launch nicht**: 100 aktive Nutzer mit je einer kalten Stunde brauchen ca. 35 bis 60 USD pro Tag. Zwei Details:

- Die Preise in `DEFAULT_AI_CONFIG.pricing` sind veraltet (Flash 0,50/3 statt 0,75/3,75 USD; Flash-Lite 0,10/0,40 statt 0,30/2,50 USD). Die Text-Kosten werden dadurch um ca. 40 % zu niedrig geloggt; weil TTS (OpenAI mit 17 USD/Mio. Zeichen) leicht zu hoch geloggt wird, liegt die echte Ausgabe bei „3 USD“ trotzdem nur bei ca. 3,3 USD. Die Preise sollten in `config/ai` korrigiert und zum 1.1.2027 erneut angepasst werden.
- Das Gebietsbudget (`areaDailyBudgetUsd`) ist gleich dem Gesamtbudget; eine einzelne Stadt kann das ganze Tagesbudget verbrauchen.
- openrouteservice erlaubt kostenlos nur 500 Matrix-Abfragen pro Tag, das begrenzt geplante Routen ohne Cache-Treffer auf ca. 500 pro Tag. Für mehr muss man ORS anfragen oder selbst hosten.

**Empfehlungen:**

1. **Preise:** Credit bei 1,99 € lassen. Abo auf **5,99 €/Monat** (netto 4,22 €, Gewinnschwelle steigt von 6,5 auf ca. 7,8 kalte Streifzug-Stunden). **Jahresabo 39,99 €** (entspricht 3,33 €/Monat, 44 % Rabatt); weil Jahresabonnenten die App typischerweise nur auf einzelnen Reisen nutzen, ist der Erlös pro genutzter Stunde dort meist höher. Optional ein **Wochenpass (ca. 3,99 €)** für Reisende, damit sie nicht das Monatsabo für eine Woche „ausnutzen“.
2. **Fair Use statt harter Grenzen:** Im Abo ab ca. 20 Stunden pro Monat für neu erzeugte Inhalte automatisch auf die günstigere Gemini-Flash-Lite-Stimme wechseln oder kürzere Längen bevorzugen; gecachte Inhalte bleiben unbegrenzt. Beim Credit: pro 24-h-Session ca. 3 Stunden neu erzeugtes Audio, danach nur noch Cache.
3. **Standardstimme:** OpenAI (Mara/Jonas) bleibt Standard; ab 2027 ist sie günstiger als jede Gemini-Stimme in Gute-Qualität-Stufe. ElevenLabs nur als Premium-Option, wenn überhaupt.
4. **Kosten senken ohne Qualitätsverlust:**
   - Das Feld `narration` aus der Modell-Antwort streichen (der Text kommt doppelt, einmal als `narration`, einmal als `paragraphs`): spart ca. 10 bis 17 % der Text-KI-Kosten.
   - Das „Denken“ (Thinking Budget) für Erzählung und Faktencheck begrenzen.
   - Beliebte Orte (hoher Score, viele Besucher in `poiStats`) nachts in der Hauptsprache vorab erzeugen, in einer Einheitsvariante „ausgewogen“ statt pro Interesse. Das erhöht die Trefferquote am meisten.
   - Im Streifzug die Länge auf wenige Varianten festlegen (z. B. immer „medium“, „Mehr erfahren“ für „long“).
   - Offline-Downloads nur die Länge laden, die die Tour wirklich braucht (meist „long“).
5. **Gratis-Nutzung:** Rewarded-Limit von 3 auf 1 Gratis-Tour pro Tag senken und Gratis-Touren bevorzugt aus dem Cache bedienen.
6. **Budget:** Für den Launch ein Tagesbudget von ca. 30 bis 50 USD und ein Gebietsbudget von ca. 20 % davon; Preise in `config/ai` aktualisieren.

## 6. Sensitivitäten

Basis: Median-Abonnent, 5 h/Monat, Mix Route/Streifzug, 50 % Cache, OpenAI, Abo 4,99 €. **Marge: +2,38 € pro Monat.**

| Was, wenn …                    | Marge pro Monat |
| ------------------------------ | --------------- |
| Basis                          | +2,38 €         |
| TTS-Preis verdoppelt sich      | +1,76 €         |
| Cache nur 20 %                 | +1,77 €         |
| Cache 0 % (nur neue Städte)    | +1,36 €         |
| Gemini-Preise ab 2027 (Text)   | +2,07 €         |
| Denk-Tokens 3.000 statt 1.000  | +2,19 €         |
| Euro fällt auf 1 € = 1 USD     | +2,22 €         |
| Store-Gebühr 30 % statt 15 %   | +1,76 €         |
| Nutzer hört 15 statt 5 Stunden | +0,13 €         |
| Stimme Gemini Flash-Lite TTS   | +2,63 €         |
| Stimme ElevenLabs v3           | **-0,34 €**     |
| Preis 5,99 € statt 4,99 €      | +3,09 €         |

Die Nutzungsdauer und die Stimmwahl bewegen das Ergebnis am stärksten, Preisschwankungen der KI-Anbieter deutlich weniger.

## Quellen (abgerufen 2026-09-30)

- Gemini API Preise (Flash, Flash-Lite, TTS, Preisänderung 1.1.2027): https://ai.google.dev/gemini-api/docs/pricing
- Gemini TTS, Sprachen: https://ai.google.dev/gemini-api/docs/speech-generation
- Gemini Audio-Tokens 25/s: Google Cloud TTS Preisseite https://cloud.google.com/text-to-speech/pricing (nur Suchauszug, [unverifiziert])
- OpenAI Preise: https://developers.openai.com/api/docs/pricing und https://developers.openai.com/api/docs/models/gpt-4o-mini-tts; Schätzung 1,5 ct/min: https://community.openai.com/t/gpt-4o-mini-tts-output-cost-has-exceeded-what-i-calculated/1312195
- ElevenLabs API: https://elevenlabs.io/pricing/api
- MapTiler: https://www.maptiler.com/cloud/pricing/
- openrouteservice Kontingente: https://openrouteservice.org/plans/ (über Suche, Seite leitet auf account.heigit.org weiter)
- Firebase: https://firebase.google.com/pricing; Firestore: https://cloud.google.com/firestore/pricing (genaue Preise je Region nicht abrufbar, [unverifiziert])
- RevenueCat: https://www.revenuecat.com/pricing/
- Apple Small Business Program: https://developer.apple.com/app-store/small-business-program/
- Google Play Gebühren: https://support.google.com/googleplay/android-developer/answer/10632485
- eCPM-Benchmarks: https://www.monetizemore.com/blog/how-much-ad-revenue-can-apps-generate/ ([Branchenwerte, unverifiziert])
- Wechselkurs EZB 15.09.2026 (1,1539): https://www.bancaditalia.it/compiti/operazioni-cambi/cambio/cambi_rif_20260915
