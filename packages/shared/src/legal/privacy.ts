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
          'Für die Inhalte deiner Gegend geht nur die Kennung eines Kartenrasters (ein Rechteck von etwa 1,2 km mal 0,6 km) an unsere Server. Für die Wegführung zum nächsten Ziel und bei einer Neuberechnung übermittelt die App deinen aktuellen Standort und das Ziel an unseren Server und den Routing-Dienst. Diese Navigationsanfragen werden bei uns nicht dauerhaft gespeichert. Auch geplante Routen und das Einlösen eines Partnerangebots benötigen eine Position, siehe Abschnitt 3.',
          'Für die Nutzung der App ist ein Konto erforderlich; eine Mobilnummer ist freiwillig. Analyse und Absturzberichte sind aus, bis du zustimmst. Vor Werbeanfragen prüft die App deine Datenschutzauswahl über Google UMP; im EWR, in Großbritannien und in der Schweiz wird die erforderliche Einwilligung eingeholt. Die kostenlose Texttour bleibt auch nutzbar, wenn keine Anzeige geladen werden kann.',
          'Die Erzählungen werden von KI erzeugt (Google Gemini) und in der App als KI-generiert gekennzeichnet. Persönlicher Tourkontext wird nur mit deiner gesonderten freiwilligen Zustimmung an KI-Dienste übermittelt. Ortsfolgen können Rückschlüsse auf deinen Weg erlauben; Einzelheiten stehen in Abschnitt 4.',
        ],
      },
      {
        heading: '3. Welche Daten wir verarbeiten und warum',
        paragraphs: [
          'Konto und Anmeldung (Art. 6 Abs. 1 lit. b DSGVO): Die App erfordert eine Anmeldung mit E-Mail, Apple oder Google. Wir speichern die dafür nötigen Kennungen (z. B. E-Mail-Adresse); das Konto verknüpft Käufe, Guthaben, Freischaltungen und Einstellungen. Die zusätzliche Bestätigung einer Mobilnummer per Firebase-SMS ist freiwillig und keine Voraussetzung für Touren oder Käufe. Wenn du sie nutzt, speichern wir die bestätigte Nummer mit deinem Konto. Google verarbeitet Telefonnummern zur Spam- und Missbrauchsabwehr in seinen Diensten. Es können SMS-Gebühren anfallen.',
          'Standort (Art. 6 Abs. 1 lit. b, Einwilligung über die Systemabfrage): Position und Blickrichtung nutzt die App lokal, um zur richtigen Zeit am richtigen Ort zu erzählen. Für „Geplante Route“ senden wir Start (auf etwa 100 m gerundet) und Ziel an unseren Server und von dort an den Routing-Dienst, um Gehzeiten zu berechnen (siehe Abschnitt 5). Für die laufende Wegführung und Neuberechnungen senden wir den aktuellen Standort, das Ziel und die Fortbewegungsart über unseren Server an HeiGIT/OpenRouteService, ohne Konto-Kennung beim Routing-Dienst. Den aktuellen Standort und den Weg aus diesen Navigationsanfragen speichern wir serverseitig nicht dauerhaft; Kosten- und Anfragezähler enthalten nur das Kartenraster bzw. die Konto-Kennung für den Missbrauchsschutz. Die berechnete geplante Route wird bis zu 24 Stunden in deinem Konto gespeichert (damit du sie unterwegs abspielen kannst); Routing-Ergebnisse ohne Konto-Bezug werden bis zu 30 Tage zwischengespeichert. Beim Einlösen eines Partnerangebots wird deine Position einmalig für die Nähe-Prüfung an den Server gesendet und nicht gespeichert. Die Hintergrund-Standortfreigabe wird nur während einer laufenden Tour genutzt, damit die Erzählung bei ausgeschaltetem Bildschirm weiterläuft. Erreichst du eine Station, zählen wir anonym, dass der Ort erkundet wurde (Art. 6 Abs. 1 lit. f, berechtigtes Interesse an der Karte „Von anderen entdeckt“): Gespeichert werden nur Zähler pro Ort; zur Vermeidung von Doppelzählungen dient ein nicht umkehrbarer Tages-Schlüssel, der nach spätestens zwei Tagen gelöscht wird. Orte werden erst ab drei Entdeckungen angezeigt. Deine Tourliste und Stadt-Badges bleiben ausschließlich auf deinem Gerät.',
          'Inhalte und Nutzung (Art. 6 Abs. 1 lit. b): Wir laden Orte, Touren, Erzählungen und Audio für das jeweilige Kartenraster. Bei Anfragen werden Konto-Kennung, Zeitpunkt und Art der Anfrage verarbeitet, um Zugriffsrechte zu prüfen.',
          'Käufe und Guthaben (Art. 6 Abs. 1 lit. b und c): Käufe laufen über den App Store bzw. Google Play und den Dienst RevenueCat. Wir erhalten Kaufereignisse (Produkt, Zeitpunkt, Ablauf) und speichern Guthaben, Freischaltungen und Abonnementstatus. Einladungslinks enthalten ein zufälliges Token; wir speichern nur dessen Hash.',
          'Audiotourzeit und Downloads (Art. 6 Abs. 1 lit. b): Zur Verwaltung der Minutenkontingente speichern wir mit deiner Konto-Kennung die genutzten und verbleibenden Minuten, den Abrechnungsmonat, Tour- oder Ortskennungen sowie Beginn, Pause und Ende einer aktiven Audiotour. Die App bestätigt die aktive Audiotourzeit regelmäßig beim Server; dafür wird keine GPS-Laufspur gespeichert. Texttouren und die festen Stimmvorstellungen verbrauchen keine Audiominuten. Für Downloads speichern wir die Tour- und Fassungkennung, die enthaltenen Stationen, die vorab angerechnete Dauer und den Zeitpunkt, damit dieselbe Fassung nicht mehrfach abgerechnet wird. Beim Übertragen oder Wiederherstellen eines Abonnements wird der bereits verbrauchte Monatsanteil berücksichtigt.',
          'Live-Gruppentouren (Art. 6 Abs. 1 lit. b): Wenn du eine Gruppe gründest oder ihr beitrittst, speichern wir die Konto-Kennungen des Gastgebers und der Teilnehmer, den Tourverlauf mit Stationen, Sprache und Stimme, die Teilnehmerzahl, Gruppenstatus und Ablaufzeit. Mitglieder erhalten die gemeinsame Route und die für den Gastgeber erzeugten Erzählungen. Deine aktuelle Position wird dabei nicht an andere Teilnehmer weitergegeben. Die für Gruppen gespeicherten Audiofassungen enthalten die KI-Erzählungen, keine Mikrofonaufnahmen.',
          'Meldungen (Art. 6 Abs. 1 lit. f): Wenn du Inhalte oder Werbung meldest, speichern wir Meldegrund, die betroffene Inhaltskennung, optionalen Text, Zeitpunkt und deine Konto-Kennung, um die Meldung zu prüfen und Missbrauch zu begrenzen. Bitte füge keine unnötigen personenbezogenen Angaben hinzu.',
          'Sicherheit und Missbrauchsschutz (Art. 6 Abs. 1 lit. f): Zur Abwehr von Missbrauch nutzen wir App Check und Rate-Limits (Zähler pro Konto und Zeitfenster, automatische Löschung nach wenigen Stunden bis Tagen) sowie Protokolle mit den in Abschnitt 6 genannten Speicherfristen.',
          'Kosten- und Nutzungsstatistik: Kosten der KI-Erzeugung werden pro Kartenraster und Tag aggregiert, ohne Konto-Kennung.',
          'Analyse und Absturzberichte (Art. 6 Abs. 1 lit. a): Nur mit deiner Einwilligung in den Einstellungen sendet die App Absturzberichte (Firebase Crashlytics) mit Gerätemodell, Betriebssystemversion und technischem Fehlerbild. Du kannst die Einwilligung jederzeit widerrufen.',
          'Werbung: Kostenlose Texttouren werden durch Google AdMob finanziert. Vor Werbeanfragen aktualisieren wir deine Datenschutzauswahl mit Google UMP. In der EU/im EWR/in Großbritannien erfolgen Personalisierung und einwilligungspflichtige Speicherzugriffe nur mit deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Abhängig von deinen Entscheidungen können nicht personalisierte oder eingeschränkte Anzeigen erscheinen; die Ablehnung der Personalisierung schaltet daher nicht automatisch jede Werbung aus. Dabei verarbeitet Google je nach Anzeigenart und Freigaben unter anderem IP-Adresse, Geräteinformationen und Werbeereignisse. Technisch erforderliche Auslieferung und Missbrauchsschutz beruhen, soweit keine Einwilligung erforderlich ist, auf dem berechtigten Interesse an einer sicheren Finanzierung der Texttouren (Art. 6 Abs. 1 lit. f DSGVO). Auf iOS wird die Werbekennung nur mit der entsprechenden Systemfreigabe übermittelt. Deine Auswahl kannst du in den Einstellungen ändern. Premium zeigt keine Werbeanzeigen; während einer bezahlten Audiotour werden keine Zwischenanzeigen eingeblendet.',
          'Anzeigenhäufigkeit und Stimmvorstellungen: Zur Begrenzung von Zwischenanzeigen speichern wir auf deinem Gerät Zeitpunkte bereits geschlossener Anzeigen und berücksichtigen die vergangenen 24 Stunden. Der Verlauf wird bei weiteren Anzeigen bereinigt und nicht an unseren Server übertragen. Die drei festen Stimmvorstellungen je Sprache sind in der App gespeichert; ihr Abspielen erzeugt keine neue KI-Anfrage und keine Audiominutenabrechnung.',
        ],
      },
      {
        heading: '4. Künstliche Intelligenz',
        paragraphs: [
          'Die kostenlosen Infokarten zeigen vorhandene Ortsangaben und aufbereitete Quellauszüge, etwa aus Wikipedia. Fehlende Auszüge ruft unser Server ab und speichert sie zwischen; dabei wird weder ein KI-Text noch eine Sprachausgabe erzeugt. Die Karten nennen ihre Quellen und die zugehörigen Lizenzhinweise.',
          'Allgemeine Tourbeschreibungen und kurze Ortsvorstellungen erzeugt Google Gemini aus öffentlichen Quellen (OpenStreetMap, Wikipedia, Wikidata, Wikimedia Commons) und ggf. geprüften Partnerangaben. Für persönliche Erzählungen, Übergänge, Routentexte und Empfehlungen übermitteln wir nur nach gesonderter Zustimmung (Art. 6 Abs. 1 lit. a DSGVO) ausgewählte Orte und ihre Reihenfolge, Interessen, Sprache und Erzählrahmen an Google Gemini. Diese Ortsfolge kann Rückschlüsse auf deinen Weg zulassen. Konto-, Telefon-, E-Mail-, Geräte-, Tourinstanz- und Sitzungskennungen sowie genaue GPS-Koordinaten werden nicht an KI-Dienste übermittelt. Für die Sprachausgabe erhält Google oder OpenAI den erzeugten Erzähltext, Sprache und Stimmvorgaben. Die Audiodateien enthalten eine maschinenlesbare Kennzeichnung als KI-generiert.',
          'Du entscheidest im gesonderten KI-Dialog oder unter Einstellungen → Datenschutz → Persönliche KI-Touren. Wir speichern deine Entscheidung mit Textversion und Zeitpunkt in deinem Konto. Ein Widerruf verhindert weitere persönliche KI-Anfragen; eine bereits abgesendete Anfrage kann nicht zurückgerufen werden. Kostenlose Textkarten und Routen sowie bereits gespeicherte Aufnahmen bleiben verfügbar. Ohne Zustimmung entstehen keine neuen persönlichen KI-Aufnahmen. Ein Widerruf löscht vorhandene Aufnahmen nicht; für die Löschung nutze die Konto- oder Downloadlöschung. Die Anbieter können Daten außerhalb der EU verarbeiten, siehe Abschnitt 5.',
          'Diese KI-Inhalte sind als „KI-generiert“ gekennzeichnet. Sie werden automatisch gegen die Quellen geprüft, können aber Fehler enthalten. Du kannst Fehler melden. Es gibt keine automatisierten Entscheidungen mit rechtlicher Wirkung über dich.',
        ],
      },
      {
        heading: '5. Empfänger und Dienstleister',
        paragraphs: [
          'Google Ireland Limited / Google LLC: Firebase (Authentication, Firestore, Cloud Functions, Storage, App Check, Crashlytics), Gemini, AdMob/UMP. Datenübermittlung in die USA auf Grundlage des EU-US Data Privacy Framework bzw. Standardvertragsklauseln.',
          'OpenAI: Text-zu-Sprache für entsprechend konfigurierte Stimmen; übermittelt werden die vorzulesenden Texte und Sprechanweisungen.',
          'RevenueCat, Inc. (USA): Verwaltung von In-App-Käufen und Abonnements. Apple bzw. Google: Zahlungsabwicklung.',
          'Apple Karten (Pausensuche auf dem iPhone): Wenn du „Pause finden“ öffnest, nutzt die App Apple MapKit für Orte in deiner Nähe und deren Kartenanzeige. Dein Standort als Mittelpunkt des Suchbereichs, die gewählte Kategorie und der Kartenausschnitt werden direkt über MapKit verarbeitet; dabei übermitteln wir keine tuur-Konto-Kennung. Beim Öffnen der Wegbeschreibung wird das gewählte Ziel an Apple Karten übergeben. tuur speichert diese Suchergebnisse nicht dauerhaft und übernimmt sie nicht in die Ortsdatenbank, KI-Anfragen oder Offline-Touren. Informationen zur Verarbeitung durch Apple: https://www.apple.com/legal/privacy/data/de/apple-maps/.',
          'OpenFreeMap (Hyperknot Software Kft., Ungarn): Kartenkacheln und Kartenschriften auf Basis von OpenStreetMap. Beim Laden der Karte werden deine IP-Adresse und der angefragte Kartenausschnitt an den Dienst übermittelt. Der Anbieter kann Cloudflare zur Auslieferung verwenden. Datenschutzhinweise: https://openfreemap.org/privacy/.',
          'HeiGIT / OpenRouteService (Deutschland): Berechnung von Gehzeiten und Routen (Start, Ziel und Zwischenpunkte). Die Pelias-Ortssuche erhält den Mittelpunkt eines Kartengebiets zur Ortszuordnung. Die Anfragen laufen über unseren Server, ohne Konto-Kennung und ohne Übermittlung deiner IP-Adresse an HeiGIT.',
          'Nur serverseitig genutzte Quellen, bei denen deine IP-Adresse nicht übermittelt wird: OpenStreetMap/Overpass, Nominatim, Wikipedia, Wikidata. Wikimedia Foundation, Inc. (USA): Die App lädt Bilder (Wikimedia Commons) direkt von den Servern der Wikimedia Foundation; dabei wird deine IP-Adresse übermittelt. Die Bilder werden mit Urheber- und Lizenzangabe angezeigt. Für die Übermittlung in die USA stützen wir uns auf Standardvertragsklauseln bzw. das EU-US Data Privacy Framework, soweit anwendbar.',
          'Stripe Payments Europe Ltd. (nur für Partner): Abrechnung von Partnerpaketen.',
          'Wir schließen mit Dienstleistern, soweit erforderlich, Auftragsverarbeitungsverträge nach Art. 28 DSGVO.',
        ],
      },
      {
        heading: '6. Speicherdauer',
        paragraphs: [
          'Kontodaten, Guthaben und Freischaltungen speichern wir, bis du dein Konto löschst (Einstellungen → Konto löschen). Dabei werden auch Meldungen, Einladungen, QR-Tokens, gespeicherte Routen und deine Einwilligungsnachweise gelöscht. Kaufbelege bewahren die Stores und RevenueCat im Rahmen gesetzlicher Aufbewahrungspflichten auf.',
          'Tourzeitabrechnungen, Tourzeit-Sitzungen und Downloadnachweise sind mit deinem Konto verknüpft und werden bei der Kontolöschung entfernt. Gruppendaten und die zugehörigen Kopien der Erzählungen werden sieben Tage nach dem vorgesehenen Gruppenablauf zur automatischen Löschung vorgesehen. Löschst du als Gastgeber dein Konto, werden deine Gruppen samt gespeicherten Gruppenerzählungen gelöscht; bei einem Teilnehmer wird die Mitgliedschaft entfernt.',
          'Rate-Limit-Zähler, Belohnungs-Codes, Sperren und QR-Tokens verfallen automatisch (Stunden bis zwei Tage). QR-Tokens gelten 10 Minuten. Fehlermeldungen von Nutzern speichern wir 12 Monate, Kostenprotokolle 90 Tage, das Protokoll von Administrator-Aktionen 24 Monate; danach werden sie automatisch gelöscht. Statistiken für Partner sind aggregiert und anonym.',
          'Heruntergeladene Touren und Einstellungen liegen nur auf deinem Gerät und verschwinden mit dem Löschen der App bzw. der Downloads.',
        ],
      },
      {
        heading: '6a. Webseite, Partnerportal und Administrationsbereich',
        paragraphs: [
          'Beim Aufruf der Webseite verarbeitet unser Hosting-Anbieter technisch notwendige Server-Logdaten (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browser) zur Auslieferung und Absicherung (Art. 6 Abs. 1 lit. f DSGVO). Die Seite nutzt keine Analyse- oder Werbe-Cookies. Technisch notwendig speichert der Browser die Firebase-Anmeldung (IndexedDB) und deine Sprachauswahl (localStorage „tuur.lang“); dafür ist nach § 25 Abs. 2 TDDDG keine Einwilligung nötig.',
          'Partner (Unternehmer) registrieren sich mit E-Mail-Adresse und geben Firmenprofil (Name, Adresse, Kategorie, Öffnungszeiten, Beschreibung, Webseite), Ortsverknüpfung und Angebote an (Art. 6 Abs. 1 lit. b). Die Beschreibung wird als „Partnervorstellung“ vorgelesen und Nutzern angezeigt. Die Abrechnung erfolgt über Stripe; Stripe speichert Kunden- und Rechnungsdaten nach eigenen gesetzlichen Aufbewahrungspflichten (u. a. § 147 AO) auch nach Löschung des Kontos. Der QR-Scanner nutzt die Kamera deines Geräts nur lokal zum Lesen des Codes; es werden keine Bilder übertragen. Bewerbungen aus der App („tuur für Unternehmen“: Name und Adresse des Ortes, Kategorie, Kontakt-E-Mail, Webseite, Beschreibung) speichern wir zur Prüfung (Art. 6 Abs. 1 lit. b); sie sind Teil des Datenexports und werden mit dem Konto gelöscht.',
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
          'For content in your area, only the identifier of a map grid cell (a rectangle of about 1.2 km by 0.6 km) is sent to our servers. To find the way to your next destination and recalculate the route, the app sends your current location and destination to our server and the routing service. We do not persist these navigation requests. Planned routes and redeeming a partner offer also require a position, see section 3.',
          'An account is required to use the app; a mobile number is optional. Analytics and crash reports are off until you agree. Before requesting ads, the app checks your privacy choices through Google UMP and obtains any required consent in the EEA, UK and Switzerland. Free text tours remain available if no ad can be loaded.',
          'Narrations are generated by AI (Google Gemini) and are labeled as AI-generated in the app. Personal tour context is only shared with AI services after your separate optional consent. Place sequences may reveal information about your route; see section 4.',
        ],
      },
      {
        heading: '3. What we process and why',
        paragraphs: [
          'Account and sign-in (Art. 6(1)(b) GDPR): using the app requires sign-in with email, Apple or Google. We store the identifiers needed for sign-in (e.g. your email address). The account links purchases, credits, unlocks and settings. Additional mobile-number verification through Firebase SMS is optional and is not required for tours or purchases. If you use it, we store the verified number with your account. Google processes phone numbers for spam and abuse prevention across its services. SMS charges may apply.',
          'Location (Art. 6(1)(b), consent through the system prompt): the app uses position and heading locally to narrate at the right time and place. For "planned route" we send the start (rounded to about 100 m) and the destination to our server and from there to the routing service to calculate walking times (see section 5). For active navigation and rerouting, we send the current location, destination and travel mode through our server to HeiGIT/OpenRouteService, without your account identifier at the routing service. We do not persist the current position or route from these navigation requests on our server; cost and request counters contain only the map cell or the account identifier used to prevent abuse. The calculated planned route is stored in your account for up to 24 hours (so you can play it on the way); routing results without account reference are cached for up to 30 days. When you redeem a partner offer your position is sent once for the proximity check and not stored. Background location is only used during a running tour so the narration continues with the screen off. When you reach a stop we count anonymously that the place was explored (Art. 6(1)(f), legitimate interest in the "explored by others" map): only counters per place are stored; a non-reversible daily key that prevents double counting is deleted after two days at the latest. Places are only shown from three explorations on. Your tour list and city badges stay on your device only.',
          'Content and usage (Art. 6(1)(b)): we load places, tours, narrations and audio for the map grid cell. Requests carry your account identifier, time and type of request so that access rights can be checked.',
          'Purchases and credits (Art. 6(1)(b) and (c)): purchases go through the App Store or Google Play and the service RevenueCat. We receive purchase events (product, time, expiry) and store credits, unlocks and subscription status. Invite links contain a random token; we only store its hash.',
          'Audio tour time and downloads (Art. 6(1)(b)): to manage time allowances, we store used and remaining minutes, the billing month, tour or place identifiers and the start, pause and end of an active audio tour with your account identifier. The app regularly confirms active audio tour time with the server; this does not store a GPS track. Text tours and the fixed voice introductions use no audio minutes. For downloads, we store the tour and version identifiers, included stops, duration charged in advance and time of preparation so that the same version is not charged twice. Transferring or restoring a subscription takes the minutes already used that month into account.',
          'Live group tours (Art. 6(1)(b)): when you create or join a group, we store the account identifiers of the host and participants, the itinerary with stops, language and voice, participant count, group status and expiry time. Members receive the shared route and narrations generated for the host. Your current location is not shared with other participants. Audio versions stored for groups contain AI narrations, not microphone recordings.',
          'Reports (Art. 6(1)(f)): when you report content or advertising, we store the reason, affected content identifier, optional text, time and your account identifier to review the report and limit abuse. Please do not include unnecessary personal details.',
          'Security and abuse protection (Art. 6(1)(f)): we use App Check and rate limits (counters per account and time window, deleted automatically after hours to days) and logs with the retention periods named in section 6.',
          'Cost and usage statistics: costs of AI generation are aggregated per map grid cell and day, without account identifiers.',
          'Analytics and crash reports (Art. 6(1)(a)): only with your consent in the settings does the app send crash reports (Firebase Crashlytics) with device model, OS version and the technical error. You can withdraw consent at any time.',
          'Advertising: free text tours are supported by Google AdMob. Before requesting ads, we update your privacy choices through Google UMP. In the EU/EEA/UK, personalization and storage access requiring consent only occur with your consent (Art. 6(1)(a) GDPR). Depending on your choices, non-personalized or limited ads may appear; declining personalization therefore does not automatically turn off all ads. Depending on the ad type and permissions, Google processes data including IP address, device information and advertising events. Technically necessary delivery and abuse prevention rely, where consent is not required, on the legitimate interest in securely funding text tours (Art. 6(1)(f) GDPR). On iOS, the advertising identifier is only transmitted with the corresponding system permission. You can change your choices in the settings. Premium does not show ads; no interstitials appear during a paid audio tour.',
          'Ad frequency and voice introductions: to limit ads between stops, we store the times of closed ads on your device and consider the preceding 24 hours. The history is pruned as further ads are shown and is not sent to our server. The three fixed voice introductions per language are bundled with the app; playing them creates no new AI request and uses no audio minutes.',
        ],
      },
      {
        heading: '4. Artificial intelligence',
        paragraphs: [
          'Free info cards show existing place information and formatted source excerpts, for example from Wikipedia. Our server retrieves and caches missing excerpts without generating AI text or speech. Cards identify their sources and the corresponding license notices.',
          'General tour descriptions and short place introductions are generated by Google Gemini from public sources (OpenStreetMap, Wikipedia, Wikidata, Wikimedia Commons) and, where applicable, reviewed partner information. Only after your separate consent (Art. 6(1)(a) GDPR), personalized narrations, hand-overs, route texts and recommendations send selected places and their order, interests, language and story context to Google Gemini. The place sequence may reveal information about your route. We do not send account, phone, email, device, tour-instance or session identifiers, or precise GPS coordinates to AI services. For speech generation, Google or OpenAI receives the generated story text, language and voice instructions. Audio files carry a machine-readable marking as AI-generated.',
          'You choose in the separate AI dialog or in Settings → Privacy → Personalized AI tours. We store your decision with its disclosure version and time in your account. Withdrawing consent prevents further personalized AI requests; a request already sent cannot be recalled. Free text cards, routes and existing recordings remain available. Without consent, no new personalized AI recordings are created. Withdrawal does not erase existing recordings; use account or download deletion to remove them. Providers may process data outside the EU, see section 5.',
          'This AI content is labeled "AI-generated". It is checked against the sources automatically but may contain errors. You can report errors. There are no automated decisions with legal effect about you.',
        ],
      },
      {
        heading: '5. Recipients and processors',
        paragraphs: [
          'Google Ireland Limited / Google LLC: Firebase (Authentication, Firestore, Cloud Functions, Storage, App Check, Crashlytics), Gemini, AdMob/UMP. Transfers to the US rely on the EU-US Data Privacy Framework or standard contractual clauses.',
          'OpenAI: text-to-speech for configured voices; we send the text to be spoken and delivery instructions.',
          'RevenueCat, Inc. (USA): management of in-app purchases and subscriptions. Apple or Google: payment processing.',
          'Apple Maps (iPhone break search): when you open "Find a break", the app uses Apple MapKit to find nearby places and display them on a map. Your location as the search-area centre, selected category and map region are processed directly through MapKit; we do not send your tuur account identifier. Opening directions hands the selected destination to Apple Maps. tuur does not persist these search results or add them to its place database, AI requests or offline tours. Apple processing information: https://www.apple.com/legal/privacy/data/en/apple-maps/.',
          'OpenFreeMap (Hyperknot Software Kft., Hungary): map tiles and map fonts based on OpenStreetMap. Loading the map transmits your IP address and requested map area to the service. The provider may use Cloudflare for delivery. Privacy information: https://openfreemap.org/privacy/.',
          'HeiGIT / OpenRouteService (Germany): calculation of walking times and routes (start, destination and waypoints). Pelias geocoding receives the centre of a map area to identify its place. Requests pass through our server without an account identifier or disclosure of your IP address to HeiGIT.',
          'Sources used server-side only, so your IP address is not transmitted: OpenStreetMap/Overpass, Nominatim, Wikipedia, Wikidata. Wikimedia Foundation, Inc. (USA): the app loads images (Wikimedia Commons) directly from the Wikimedia Foundation’s servers, which transmits your IP address. Images are shown with author and license. For the transfer to the US we rely on standard contractual clauses or the EU-US Data Privacy Framework where applicable.',
          'Stripe Payments Europe Ltd. (partners only): billing of partner plans.',
          'Where required we conclude data processing agreements under Art. 28 GDPR.',
        ],
      },
      {
        heading: '6. Retention',
        paragraphs: [
          'We keep account data, credits and unlocks until you delete your account (Settings → Delete account). This also deletes your reports, invites, QR tokens, stored routes and consent records. Purchase records are kept by the stores and RevenueCat under statutory retention duties.',
          'Tour-time accounting, tour-time sessions and download records are linked to your account and removed when you delete it. Group data and the associated copies of narrations are scheduled for automatic deletion seven days after the group’s scheduled expiry. Deleting the host’s account deletes their groups and stored group narrations; deleting a participant’s account removes their membership.',
          'Rate-limit counters, reward codes, locks and QR tokens expire automatically (hours to two days). QR tokens are valid for 10 minutes. We keep user reports for 12 months, cost logs for 90 days and the log of administrator actions for 24 months, then they are deleted automatically. Partner statistics are aggregated and anonymous.',
          'Downloaded tours and settings are stored on your device only and disappear when you delete the app or the downloads.',
        ],
      },
      {
        heading: '6a. Website, partner portal and administration area',
        paragraphs: [
          'When you visit the website our hosting provider processes technically necessary server logs (IP address, time, page, browser) to deliver and secure it (Art. 6(1)(f) GDPR). The site uses no analytics or advertising cookies. The browser stores the Firebase sign-in (IndexedDB) and your language choice (localStorage "tuur.lang") as strictly necessary; no consent is required under Sec. 25(2) TDDDG.',
          'Partners (businesses) register with an email address and provide a business profile (name, address, category, opening hours, description, website), a place link and offers (Art. 6(1)(b)). The description is read aloud as a "partner introduction" and shown to users. Billing runs through Stripe; Stripe keeps customer and invoice data under its own statutory retention duties (e.g. Sec. 147 German Fiscal Code) even after the account is deleted. The QR scanner uses your device camera locally to read the code only; no images are transmitted. Applications from the app ("tuur for businesses": name and address of the place, category, contact email, website, description) are stored for review (Art. 6(1)(b)); they are part of the data export and deleted with the account.',
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
