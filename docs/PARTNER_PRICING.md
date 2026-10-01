# Partner-Preismodell: Abrechnung pro Traktion

Stand 2026-09-30. Entscheidungsvorlage für den Betreiber. Umgesetzt als Default in `packages/shared/src/partner/traction.ts` (`DEFAULT_TRACTION_PRICING`), überschreibbar über Firestore `config/partners.traction`. Verbindliche Preise stehen erst im Partnervertrag.

## Empfehlung

Keine Grundgebühr. Partner zahlen nur für Traktion, die tuur nachweislich erzeugt hat, gedeckelt durch ein selbst gewähltes Monatslimit.

| Posten               | Preis (Café, Basis)                                 | Warum                                                                                                                                                          |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verifizierter Besuch | 0,40 €                                              | Eine Person wurde von tuur als Station zum Ort geführt und ist angekommen (Geofence, einmal pro Person, Ort und Tag). Stärkstes Signal, das wir messen können. |
| Eingelöstes Angebot  | 0,80 €                                              | QR-Code wurde vom Partner gescannt. Kaufnah, fälschungssicher (signiertes Einmal-Token, existiert schon).                                                      |
| Startguthaben        | 25 Besuche gratis                                   | Senkt die Hürde für kleine Läden; der Partner sieht Wirkung, bevor er zahlt.                                                                                   |
| Monatslimit          | ab 25 €                                             | Planbarkeit. Ist das Limit erreicht, pausiert nur die Bevorzugung; der Ort bleibt organisch sichtbar.                                                          |
| Kategorie-Faktor     | Restaurant ×1,25, Hotel ×1,5, Laden ×0,75, sonst ×1 | Unterschiedlicher Wert eines Besuchs.                                                                                                                          |

Impressionen (Partnervorstellung abgespielt, Angebot angezeigt) sind kostenlos. Sie sind leicht aufzublähen und für kleine Partner schwer zu bewerten.

## Warum pro Traktion statt Abo

- **Passt zum Produkt:** tuur baut Partner nur ein, wenn es zur Route passt (gedeckelter Boost, max. Umweg/Anteil). Ein fester Abopreis würde Erwartungen wecken, die wir bewusst nicht garantieren.
- **Kleine Orte:** Ein Café in einer Kleinstadt hat anfangs kaum Traffic. Abo = Risiko für den Partner, Traktion = kein Risiko.
- **Vergleichswerte:** Lokale Suchanzeigen kosten typischerweise 0,30 bis 1,50 € pro Klick, Gutschein-Plattformen nehmen 30 bis 50 % Provision. Ein physischer Besuch ist mehr wert als ein Klick; 0,40 € ist bewusst niedrig angesetzt, um Angebot aufzubauen. **[Richtwerte, nicht für diesen Markt verifiziert]**
- **Messbarkeit ist schon da:** Besuche (`recordPartnerEvent: visit`, dedupliziert) und Einlösungen (`redeemToken`) werden bereits protokolliert und im Partner-Dashboard gezeigt.

## Alternativen

1. **Abo-Stufen (bisher: „Sichtbarkeit“ / „Angebot“ über Stripe):** planbar für uns, schlecht für kleine Partner. Bleibt technisch vorhanden und kann später für Ketten oder große Attraktionen angeboten werden (Hybrid).
2. **Provision auf Umsatz:** höchster Wert, aber wir sehen keinen Umsatz. Nur mit Kassenintegration machbar.
3. **Pay per Impression:** einfach, aber manipulierbar und für Partner schwer greifbar.

## Offene Punkte vor dem Start

- Stripe: nutzungsbasierte Abrechnung (metered billing) mit Monatslimit statt fester Price-IDs anbinden; `tractionInvoice()` liefert den Betrag pro Monat.
- Betrugsschutz Besuche: Besuche zählen nur, wenn tuur den Ort als Station geführt hat. Später zusätzlich eine Mindestverweildauer am Ort.
- Rechtlich: Partnerbedingungen um „Abrechnung pro Traktion“ ergänzen; Kennzeichnung als Werbung (UWG) bleibt unverändert Pflicht.
- Preise nach 3 Monaten mit echten Daten prüfen (Besuche pro Partner, Kündigungen, Anteil ausgeschöpfter Limits).
