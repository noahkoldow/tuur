import { LEGAL_VERSION, MISSING, type LegalDocument, type OperatorInfo } from './types';

const v = (s: string | undefined) => (s && s.trim() ? s.trim() : MISSING);

export function privacyDe(o: OperatorInfo): LegalDocument {
  const contact = v(o.privacyEmail ?? o.email);
  return {
    id: 'privacy',
    title: 'Datenschutzerklärung',
    version: LEGAL_VERSION,
    sections: [
      {
        heading: '1. Verantwortlicher',
        paragraphs: [
          `Verantwortlich für die Datenverarbeitung ist ${v(o.name)}, ${v(o.address)}. Kontakt für Datenschutzanfragen: ${contact}.`,
          'Diese Erklärung gilt für die tuur-App, die Partnerwebseite und den Administrationsbereich.',
        ],
      },
      {
        heading: '2. Kurzfassung',
        paragraphs: [
          'Deinen genauen Standort verarbeitet tuur auf deinem Gerät. Für die Inhalte deiner Gegend geht nur die Kennung eines Kartenrasters (ein Rechteck von etwa 1,2 km mal 0,6 km) an unsere Server. Nur wenn du eine geplante Route berechnest oder ein Partnerangebot einlöst, wird zusätzlich einmalig eine Position übermittelt (bei Routen auf etwa 100 m gerundet), siehe Abschnitt 3.',
          'Du kannst tuur ohne Registrierung nutzen. Analyse und Absturzberichte sind aus, bis du zustimmst. Werbung wird erst nach deiner Einwilligung (EU/EWR/UK) geladen.',
          'Die Erzählungen werden von KI erzeugt (Google Gemini) und in der App als KI-generiert gekennzeichnet. In die KI-Anfragen fließen keine personenbezogenen Daten ein.',
        ],
      },
      {
        heading: '3. Welche Daten wir verarbeiten und warum',
        paragraphs: [
          'Konto und Anmeldung (Art. 6 Abs. 1 lit. b DSGVO): Beim ersten Start legen wir ein anonymes Konto an (Firebase Authentication). Wenn du dich mit E-Mail, Apple oder Google anmeldest, speichern wir die dafür nötigen Kennungen (z. B. E-Mail-Adresse). Das Konto verknüpft deine Käufe, Guthaben, Freischaltungen und Einstellungen.',
          'Standort (Art. 6 Abs. 1 lit. b, Einwilligung über die Systemabfrage): Position und Blickrichtung nutzt die App lokal, um zur richtigen Zeit am richtigen Ort zu erzählen. Für „Geplante Route“ senden wir Start (auf etwa 100 m gerundet) und Ziel an unseren Server und von dort an den Routing-Dienst, um Gehzeiten zu berechnen (siehe Abschnitt 5). Die berechnete Route wird bis zu 24 Stunden in deinem Konto gespeichert (damit du sie unterwegs abspielen kannst); Routing-Ergebnisse ohne Konto-Bezug werden bis zu 30 Tage zwischengespeichert. Beim Einlösen eines Partnerangebots wird deine Position einmalig für die Nähe-Prüfung an den Server gesendet und nicht gespeichert. Die Hintergrund-Standortfreigabe wird nur während einer laufenden Tour genutzt, damit die Erzählung bei ausgeschaltetem Bildschirm weiterläuft.',
          'Inhalte und Nutzung (Art. 6 Abs. 1 lit. b): Wir laden Orte, Touren, Erzählungen und Audio für das jeweilige Kartenraster. Bei Anfragen werden Konto-Kennung, Zeitpunkt und Art der Anfrage verarbeitet, um Zugriffsrechte zu prüfen.',
          'Käufe und Guthaben (Art. 6 Abs. 1 lit. b und c): Käufe laufen über den App Store bzw. Google Play und den Dienst RevenueCat. Wir erhalten Kaufereignisse (Produkt, Zeitpunkt, Ablauf) und speichern Guthaben, Freischaltungen und Abonnementstatus. Einladungslinks enthalten ein zufälliges Token; wir speichern nur dessen Hash.',
          'Meldungen (Art. 6 Abs. 1 lit. f): Wenn du einen Fehler in einer Erzählung meldest, speichern wir Meldegrund, optionalen Text und deine Konto-Kennung, um die Erzählung zu prüfen und Missbrauch zu begrenzen.',
          'Sicherheit und Missbrauchsschutz (Art. 6 Abs. 1 lit. f): Zur Abwehr von Missbrauch nutzen wir App Check und Rate-Limits (Zähler pro Konto und Zeitfenster, automatische Löschung nach wenigen Stunden bis Tagen) sowie Protokolle mit den in Abschnitt 6 genannten Speicherfristen.',
          'Kosten- und Nutzungsstatistik: Kosten der KI-Erzeugung werden pro Kartenraster und Tag aggregiert, ohne Konto-Kennung.',
          'Analyse und Absturzberichte (Art. 6 Abs. 1 lit. a): Nur mit deiner Einwilligung in den Einstellungen sendet die App Absturzberichte (Firebase Crashlytics) mit Gerätemodell, Betriebssystemversion und technischem Fehlerbild. Du kannst die Einwilligung jederzeit widerrufen.',
          'Werbung (Art. 6 Abs. 1 lit. a): Kostenlose Nutzer sehen Werbung (Google AdMob). In der EU/im EWR/in Großbritannien fragen wir zuvor per Einwilligungsdialog (Google UMP) ab. Ohne Einwilligung erscheinen keine personalisierten Anzeigen; ohne jede Einwilligung wird keine Anzeige geladen. Abonnenten sehen keine Werbung. Bei belohnter Werbung prüft ein Server die Belohnung mit deiner Konto-Kennung und einem einmaligen Code.',
        ],
      },
      {
        heading: '4. Künstliche Intelligenz',
        paragraphs: [
          'Erzählungen, Tourtexte und Übergänge erzeugt Google Gemini aus öffentlichen Quellen (OpenStreetMap, Wikipedia, Wikidata, Wikimedia Commons) und ggf. Angaben von Partnern. Die Audiofassung erzeugt eine Text-zu-Sprache-Funktion von Google. An diese Dienste gehen Ortsnamen und Quelltexte, keine Konto- oder Standortdaten. Die Audiodateien enthalten eine maschinenlesbare Kennzeichnung als KI-generiert.',
          'Die Inhalte sind als „KI-generiert“ gekennzeichnet. Sie werden automatisch gegen die Quellen geprüft, können aber Fehler enthalten. Du kannst Fehler melden. Es gibt keine automatisierten Entscheidungen mit rechtlicher Wirkung über dich.',
        ],
      },
      {
        heading: '5. Empfänger und Dienstleister',
        paragraphs: [
          'Google Ireland Limited / Google LLC: Firebase (Authentication, Firestore, Cloud Functions, Storage, App Check, Crashlytics), Gemini, AdMob/UMP. Datenübermittlung in die USA auf Grundlage des EU-US Data Privacy Framework bzw. Standardvertragsklauseln.',
          'RevenueCat, Inc. (USA): Verwaltung von In-App-Käufen und Abonnements. Apple bzw. Google: Zahlungsabwicklung.',
          'MapTiler AG (Schweiz): Kartenkacheln. Beim Laden der Karte wird deine IP-Adresse an den Kartendienst übermittelt.',
          'HeiGIT / OpenRouteService (Deutschland): Berechnung von Gehzeiten und Routen für geplante Routen (Start, Ziel und Zwischenpunkte, ohne Konto-Kennung).',
          'Nur serverseitig genutzte Quellen, bei denen deine IP-Adresse nicht übermittelt wird: OpenStreetMap/Overpass, Nominatim, Wikipedia, Wikidata. Wikimedia Foundation, Inc. (USA): Die App lädt Bilder (Wikimedia Commons) direkt von den Servern der Wikimedia Foundation; dabei wird deine IP-Adresse übermittelt. Die Bilder werden mit Urheber- und Lizenzangabe angezeigt. Für die Übermittlung in die USA stützen wir uns auf Standardvertragsklauseln bzw. das EU-US Data Privacy Framework, soweit anwendbar.',
          'Stripe Payments Europe Ltd. (nur für Partner): Abrechnung von Partnerpaketen.',
          'Wir schließen mit Dienstleistern, soweit erforderlich, Auftragsverarbeitungsverträge nach Art. 28 DSGVO.',
        ],
      },
      {
        heading: '6. Speicherdauer',
        paragraphs: [
          'Kontodaten, Guthaben und Freischaltungen speichern wir, bis du dein Konto löschst (Einstellungen → Konto löschen). Dabei werden auch Meldungen, Einladungen, QR-Tokens, gespeicherte Routen und deine Einwilligungsnachweise gelöscht. Kaufbelege bewahren die Stores und RevenueCat im Rahmen gesetzlicher Aufbewahrungspflichten auf.',
          'Rate-Limit-Zähler, Belohnungs-Codes, Sperren und QR-Tokens verfallen automatisch (Stunden bis zwei Tage). QR-Tokens gelten 10 Minuten. Fehlermeldungen von Nutzern speichern wir 12 Monate, Kostenprotokolle 90 Tage, das Protokoll von Administrator-Aktionen 24 Monate; danach werden sie automatisch gelöscht. Statistiken für Partner sind aggregiert und anonym.',
          'Heruntergeladene Touren und Einstellungen liegen nur auf deinem Gerät und verschwinden mit dem Löschen der App bzw. der Downloads.',
        ],
      },
      {
        heading: '6a. Webseite, Partnerportal und Administrationsbereich',
        paragraphs: [
          'Beim Aufruf der Webseite verarbeitet unser Hosting-Anbieter technisch notwendige Server-Logdaten (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browser) zur Auslieferung und Absicherung (Art. 6 Abs. 1 lit. f DSGVO). Die Seite nutzt keine Analyse- oder Werbe-Cookies. Technisch notwendig speichert der Browser die Firebase-Anmeldung (IndexedDB) und deine Sprachauswahl (localStorage „tuur.lang“); dafür ist nach § 25 Abs. 2 TDDDG keine Einwilligung nötig.',
          'Partner (Unternehmer) registrieren sich mit E-Mail-Adresse und geben Firmenprofil (Name, Adresse, Kategorie, Öffnungszeiten, Beschreibung, Webseite), Ortsverknüpfung und Angebote an (Art. 6 Abs. 1 lit. b). Die Beschreibung wird als „Partnervorstellung“ vorgelesen und Nutzern angezeigt. Die Abrechnung erfolgt über Stripe; Stripe speichert Kunden- und Rechnungsdaten nach eigenen gesetzlichen Aufbewahrungspflichten (u. a. § 147 AO) auch nach Löschung des Kontos. Der QR-Scanner nutzt die Kamera deines Geräts nur lokal zum Lesen des Codes; es werden keine Bilder übertragen.',
          'Der Administrationsbereich ist nur für berechtigte Betreiber-Konten zugänglich; Änderungen werden mit Konto-Kennung protokolliert (Art. 6 Abs. 1 lit. f).',
        ],
      },
      {
        heading: '7. Deine Rechte',
        paragraphs: [
          'Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Auskunft und Löschung kannst du direkt in der App auslösen (Einstellungen → Daten exportieren / Konto löschen). Erteilte Einwilligungen kannst du jederzeit mit Wirkung für die Zukunft widerrufen.',
          `Wende dich für Anfragen an ${contact}. Du hast außerdem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren${o.authority ? `, z. B. bei ${o.authority}` : ''}.`,
        ],
      },
      {
        heading: '8. Kinder',
        paragraphs: [
          'tuur richtet sich nicht an Kinder unter 16 Jahren. Wenn du unter 16 bist, nutze die App bitte nur mit Zustimmung der Eltern.',
        ],
      },
      {
        heading: '9. Änderungen',
        paragraphs: [
          `Wir passen diese Erklärung an, wenn sich die Verarbeitung ändert. Stand: ${LEGAL_VERSION}.`,
        ],
      },
    ],
  };
}

export function privacyEn(o: OperatorInfo): LegalDocument {
  const contact = v(o.privacyEmail ?? o.email);
  return {
    id: 'privacy',
    title: 'Privacy policy',
    version: LEGAL_VERSION,
    sections: [
      {
        heading: '1. Controller',
        paragraphs: [
          `The controller is ${v(o.name)}, ${v(o.address)}. Contact for privacy requests: ${contact}.`,
          'This policy covers the tuur app, the partner website and the administration area.',
        ],
      },
      {
        heading: '2. In short',
        paragraphs: [
          'tuur processes your exact location on your device. For the content of your area only the identifier of a map grid cell (a rectangle of about 1.2 km by 0.6 km) is sent to our servers. Only when you calculate a planned route or redeem a partner offer is a position additionally sent once (rounded to about 100 m for routes), see section 3.',
          'You can use tuur without registering. Analytics and crash reports are off until you agree. Ads are only loaded after your consent (EU/EEA/UK).',
          'Narrations are generated by AI (Google Gemini) and are labeled as AI-generated in the app. No personal data goes into AI requests.',
        ],
      },
      {
        heading: '3. What we process and why',
        paragraphs: [
          'Account and sign-in (Art. 6(1)(b) GDPR): on first start we create an anonymous account (Firebase Authentication). If you sign in with email, Apple or Google we store the identifiers needed for that (e.g. your email address). The account links your purchases, credits, unlocks and settings.',
          'Location (Art. 6(1)(b), consent through the system prompt): the app uses position and heading locally to narrate at the right time and place. For "planned route" we send the start (rounded to about 100 m) and the destination to our server and from there to the routing service to calculate walking times (see section 5). The calculated route is stored in your account for up to 24 hours (so you can play it on the way); routing results without account reference are cached for up to 30 days. When you redeem a partner offer your position is sent once for the proximity check and not stored. Background location is only used during a running tour so the narration continues with the screen off.',
          'Content and usage (Art. 6(1)(b)): we load places, tours, narrations and audio for the map grid cell. Requests carry your account identifier, time and type of request so that access rights can be checked.',
          'Purchases and credits (Art. 6(1)(b) and (c)): purchases go through the App Store or Google Play and the service RevenueCat. We receive purchase events (product, time, expiry) and store credits, unlocks and subscription status. Invite links contain a random token; we only store its hash.',
          'Reports (Art. 6(1)(f)): when you report an error in a narration we store the reason, optional text and your account identifier to review the narration and limit abuse.',
          'Security and abuse protection (Art. 6(1)(f)): we use App Check and rate limits (counters per account and time window, deleted automatically after hours to days) and logs with the retention periods named in section 6.',
          'Cost and usage statistics: costs of AI generation are aggregated per map grid cell and day, without account identifiers.',
          'Analytics and crash reports (Art. 6(1)(a)): only with your consent in the settings does the app send crash reports (Firebase Crashlytics) with device model, OS version and the technical error. You can withdraw consent at any time.',
          'Advertising (Art. 6(1)(a)): free users see ads (Google AdMob). In the EU/EEA/UK we ask for consent first (Google UMP). Without consent no personalized ads are shown; without any consent no ad is loaded. Subscribers do not see ads. For rewarded ads a server verifies the reward using your account identifier and a one-time code.',
        ],
      },
      {
        heading: '4. Artificial intelligence',
        paragraphs: [
          'Narrations, tour texts and hand-overs are generated by Google Gemini from public sources (OpenStreetMap, Wikipedia, Wikidata, Wikimedia Commons) and, where applicable, partner information. The audio is produced by a Google text-to-speech function. These services receive place names and source texts, no account or location data. The audio files carry a machine-readable marking as AI-generated.',
          'Content is labeled "AI-generated". It is checked against the sources automatically but may contain errors. You can report errors. There are no automated decisions with legal effect about you.',
        ],
      },
      {
        heading: '5. Recipients and processors',
        paragraphs: [
          'Google Ireland Limited / Google LLC: Firebase (Authentication, Firestore, Cloud Functions, Storage, App Check, Crashlytics), Gemini, AdMob/UMP. Transfers to the US rely on the EU-US Data Privacy Framework or standard contractual clauses.',
          'RevenueCat, Inc. (USA): management of in-app purchases and subscriptions. Apple or Google: payment processing.',
          'MapTiler AG (Switzerland): map tiles. Loading the map transmits your IP address to the map provider.',
          'HeiGIT / OpenRouteService (Germany): calculation of walking times and routes for planned routes (start, destination and waypoints, without account identifier).',
          'Sources used server-side only, so your IP address is not transmitted: OpenStreetMap/Overpass, Nominatim, Wikipedia, Wikidata. Wikimedia Foundation, Inc. (USA): the app loads images (Wikimedia Commons) directly from the Wikimedia Foundation’s servers, which transmits your IP address. Images are shown with author and license. For the transfer to the US we rely on standard contractual clauses or the EU-US Data Privacy Framework where applicable.',
          'Stripe Payments Europe Ltd. (partners only): billing of partner plans.',
          'Where required we conclude data processing agreements under Art. 28 GDPR.',
        ],
      },
      {
        heading: '6. Retention',
        paragraphs: [
          'We keep account data, credits and unlocks until you delete your account (Settings → Delete account). This also deletes your reports, invites, QR tokens, stored routes and consent records. Purchase records are kept by the stores and RevenueCat under statutory retention duties.',
          'Rate-limit counters, reward codes, locks and QR tokens expire automatically (hours to two days). QR tokens are valid for 10 minutes. We keep user reports for 12 months, cost logs for 90 days and the log of administrator actions for 24 months, then they are deleted automatically. Partner statistics are aggregated and anonymous.',
          'Downloaded tours and settings are stored on your device only and disappear when you delete the app or the downloads.',
        ],
      },
      {
        heading: '6a. Website, partner portal and administration area',
        paragraphs: [
          'When you visit the website our hosting provider processes technically necessary server logs (IP address, time, page, browser) to deliver and secure it (Art. 6(1)(f) GDPR). The site uses no analytics or advertising cookies. The browser stores the Firebase sign-in (IndexedDB) and your language choice (localStorage "tuur.lang") as strictly necessary; no consent is required under Sec. 25(2) TDDDG.',
          'Partners (businesses) register with an email address and provide a business profile (name, address, category, opening hours, description, website), a place link and offers (Art. 6(1)(b)). The description is read aloud as a "partner introduction" and shown to users. Billing runs through Stripe; Stripe keeps customer and invoice data under its own statutory retention duties (e.g. Sec. 147 German Fiscal Code) even after the account is deleted. The QR scanner uses your device camera locally to read the code only; no images are transmitted.',
          'The administration area is accessible only to authorized operator accounts; changes are logged with the account identifier (Art. 6(1)(f)).',
        ],
      },
      {
        heading: '7. Your rights',
        paragraphs: [
          'You have the right of access, rectification, erasure, restriction, data portability and objection. You can trigger access and erasure directly in the app (Settings → Export data / Delete account). You can withdraw consent at any time with effect for the future.',
          `Contact ${contact} for requests. You also have the right to lodge a complaint with a data protection authority${o.authority ? `, e.g. ${o.authority}` : ''}.`,
        ],
      },
      {
        heading: '8. Children',
        paragraphs: [
          'tuur is not directed at children under 16. If you are under 16 please use the app only with your parents’ consent.',
        ],
      },
      {
        heading: '9. Changes',
        paragraphs: [`We update this policy when processing changes. Version: ${LEGAL_VERSION}.`],
      },
    ],
  };
}
