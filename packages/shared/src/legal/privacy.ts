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
          'Deinen genauen Standort verarbeitet tuur auf deinem Gerät. An unsere Server geht nur die Kennung eines Kartenrasters (ein Rechteck von etwa 1,2 km mal 0,6 km), damit wir Inhalte für die Gegend laden können.',
          'Du kannst tuur ohne Registrierung nutzen. Analyse und Absturzberichte sind aus, bis du zustimmst. Werbung wird erst nach deiner Einwilligung (EU/EWR/UK) geladen.',
          'Die Erzählungen werden von KI erzeugt (Google Gemini) und in der App als KI-generiert gekennzeichnet. In die KI-Anfragen fließen keine personenbezogenen Daten ein.',
        ],
      },
      {
        heading: '3. Welche Daten wir verarbeiten und warum',
        paragraphs: [
          'Konto und Anmeldung (Art. 6 Abs. 1 lit. b DSGVO): Beim ersten Start legen wir ein anonymes Konto an (Firebase Authentication). Wenn du dich mit E-Mail, Apple oder Google anmeldest, speichern wir die dafür nötigen Kennungen (z. B. E-Mail-Adresse). Das Konto verknüpft deine Käufe, Guthaben, Freischaltungen und Einstellungen.',
          'Standort (Art. 6 Abs. 1 lit. b, Einwilligung über die Systemabfrage): Position und Blickrichtung nutzt die App lokal, um zur richtigen Zeit am richtigen Ort zu erzählen. Für „Geplante Route“ senden wir Start und Ziel an unseren Routing-Dienst, um Gehzeiten zu berechnen (siehe Abschnitt 5); sie werden nicht in deinem Konto gespeichert. Beim Einlösen eines Partnerangebots wird deine Position einmalig für die Nähe-Prüfung an den Server gesendet und nicht gespeichert. Die Hintergrund-Standortfreigabe wird nur während einer laufenden Tour genutzt, damit die Erzählung bei ausgeschaltetem Bildschirm weiterläuft.',
          'Inhalte und Nutzung (Art. 6 Abs. 1 lit. b): Wir laden Orte, Touren, Erzählungen und Audio für das jeweilige Kartenraster. Bei Anfragen werden Konto-Kennung, Zeitpunkt und Art der Anfrage verarbeitet, um Zugriffsrechte zu prüfen.',
          'Käufe und Guthaben (Art. 6 Abs. 1 lit. b und c): Käufe laufen über den App Store bzw. Google Play und den Dienst RevenueCat. Wir erhalten Kaufereignisse (Produkt, Zeitpunkt, Ablauf) und speichern Guthaben, Freischaltungen und Abonnementstatus. Einladungslinks enthalten ein zufälliges Token; wir speichern nur dessen Hash.',
          'Meldungen (Art. 6 Abs. 1 lit. f): Wenn du einen Fehler in einer Erzählung meldest, speichern wir Meldegrund, optionalen Text und deine Konto-Kennung, um die Erzählung zu prüfen und Missbrauch zu begrenzen.',
          'Sicherheit und Missbrauchsschutz (Art. 6 Abs. 1 lit. f): Zur Abwehr von Missbrauch nutzen wir App Check und Rate-Limits (Zähler pro Konto und Zeitfenster) sowie Protokolle mit begrenzter Speicherdauer.',
          'Kosten- und Nutzungsstatistik: Kosten der KI-Erzeugung werden pro Kartenraster und Tag aggregiert, ohne Konto-Kennung.',
          'Analyse und Absturzberichte (Art. 6 Abs. 1 lit. a): Nur mit deiner Einwilligung in den Einstellungen sendet die App Absturzberichte (Firebase Crashlytics) mit Gerätemodell, Betriebssystemversion und technischem Fehlerbild. Du kannst die Einwilligung jederzeit widerrufen.',
          'Werbung (Art. 6 Abs. 1 lit. a): Kostenlose Nutzer sehen Werbung (Google AdMob). In der EU/im EWR/in Großbritannien fragen wir zuvor per Einwilligungsdialog (Google UMP) ab. Ohne Einwilligung erscheinen keine personalisierten Anzeigen; ohne jede Einwilligung wird keine Anzeige geladen. Abonnenten sehen keine Werbung. Bei belohnter Werbung prüft ein Server die Belohnung mit deiner Konto-Kennung und einem einmaligen Code.',
        ],
      },
      {
        heading: '4. Künstliche Intelligenz',
        paragraphs: [
          'Erzählungen, Tourtexte und Übergänge erzeugt Google Gemini aus öffentlichen Quellen (OpenStreetMap, Wikipedia, Wikidata, Wikimedia Commons) und ggf. Angaben von Partnern. Die Audiofassung erzeugt eine Text-zu-Sprache-Funktion von Google. An diese Dienste gehen Ortsnamen und Quelltexte, keine Konto- oder Standortdaten.',
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
          'Nur serverseitig genutzte Quellen, bei denen deine IP-Adresse nicht übermittelt wird: OpenStreetMap/Overpass, Nominatim, Wikipedia, Wikidata, Wikimedia Commons. Bilder werden mit Urheber- und Lizenzangabe angezeigt; ihr Abruf erfolgt von den Servern der Wikimedia Foundation.',
          'Stripe Payments Europe Ltd. (nur für Partner): Abrechnung von Partnerpaketen.',
          'Wir schließen mit Dienstleistern, soweit erforderlich, Auftragsverarbeitungsverträge nach Art. 28 DSGVO.',
        ],
      },
      {
        heading: '6. Speicherdauer',
        paragraphs: [
          'Kontodaten, Guthaben und Freischaltungen speichern wir, bis du dein Konto löschst (Einstellungen → Konto löschen). Dabei werden auch Meldungen, Einladungen und QR-Tokens deines Kontos gelöscht bzw. anonymisiert. Kaufbelege bewahren die Stores und RevenueCat im Rahmen gesetzlicher Aufbewahrungspflichten auf.',
          'Rate-Limit-Zähler und Nonces verfallen automatisch nach wenigen Stunden bis Tagen. QR-Tokens gelten 10 Minuten. Statistiken für Partner sind aggregiert und anonym.',
          'Heruntergeladene Touren und Einstellungen liegen nur auf deinem Gerät und verschwinden mit dem Löschen der App bzw. der Downloads.',
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
          'tuur processes your exact location on your device. Only the identifier of a map grid cell (a rectangle of about 1.2 km by 0.6 km) is sent to our servers so that we can load content for the area.',
          'You can use tuur without registering. Analytics and crash reports are off until you agree. Ads are only loaded after your consent (EU/EEA/UK).',
          'Narrations are generated by AI (Google Gemini) and are labeled as AI-generated in the app. No personal data goes into AI requests.',
        ],
      },
      {
        heading: '3. What we process and why',
        paragraphs: [
          'Account and sign-in (Art. 6(1)(b) GDPR): on first start we create an anonymous account (Firebase Authentication). If you sign in with email, Apple or Google we store the identifiers needed for that (e.g. your email address). The account links your purchases, credits, unlocks and settings.',
          'Location (Art. 6(1)(b), consent through the system prompt): the app uses position and heading locally to narrate at the right time and place. For "planned route" we send start and destination to our routing service to calculate walking times (see section 5); they are not stored in your account. When you redeem a partner offer your position is sent once for the proximity check and not stored. Background location is only used during a running tour so the narration continues with the screen off.',
          'Content and usage (Art. 6(1)(b)): we load places, tours, narrations and audio for the map grid cell. Requests carry your account identifier, time and type of request so that access rights can be checked.',
          'Purchases and credits (Art. 6(1)(b) and (c)): purchases go through the App Store or Google Play and the service RevenueCat. We receive purchase events (product, time, expiry) and store credits, unlocks and subscription status. Invite links contain a random token; we only store its hash.',
          'Reports (Art. 6(1)(f)): when you report an error in a narration we store the reason, optional text and your account identifier to review the narration and limit abuse.',
          'Security and abuse protection (Art. 6(1)(f)): we use App Check and rate limits (counters per account and time window) and logs with limited retention.',
          'Cost and usage statistics: costs of AI generation are aggregated per map grid cell and day, without account identifiers.',
          'Analytics and crash reports (Art. 6(1)(a)): only with your consent in the settings does the app send crash reports (Firebase Crashlytics) with device model, OS version and the technical error. You can withdraw consent at any time.',
          'Advertising (Art. 6(1)(a)): free users see ads (Google AdMob). In the EU/EEA/UK we ask for consent first (Google UMP). Without consent no personalized ads are shown; without any consent no ad is loaded. Subscribers do not see ads. For rewarded ads a server verifies the reward using your account identifier and a one-time code.',
        ],
      },
      {
        heading: '4. Artificial intelligence',
        paragraphs: [
          'Narrations, tour texts and hand-overs are generated by Google Gemini from public sources (OpenStreetMap, Wikipedia, Wikidata, Wikimedia Commons) and, where applicable, partner information. The audio is produced by a Google text-to-speech function. These services receive place names and source texts, no account or location data.',
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
          'Sources used server-side only, so your IP address is not transmitted: OpenStreetMap/Overpass, Nominatim, Wikipedia, Wikidata, Wikimedia Commons. Images are shown with author and license; they are fetched from the servers of the Wikimedia Foundation.',
          'Stripe Payments Europe Ltd. (partners only): billing of partner plans.',
          'Where required we conclude data processing agreements under Art. 28 GDPR.',
        ],
      },
      {
        heading: '6. Retention',
        paragraphs: [
          'We keep account data, credits and unlocks until you delete your account (Settings → Delete account). This also deletes or anonymizes your reports, invites and QR tokens. Purchase records are kept by the stores and RevenueCat under statutory retention duties.',
          'Rate-limit counters and nonces expire automatically after hours to days. QR tokens are valid for 10 minutes. Partner statistics are aggregated and anonymous.',
          'Downloaded tours and settings are stored on your device only and disappear when you delete the app or the downloads.',
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
