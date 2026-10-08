import { LEGAL_VERSION, MISSING, type LegalDocument, type OperatorInfo } from './types';
import { CREDIT_TOUR_MINUTES, SUBSCRIPTION_TOUR_MINUTES_PER_MONTH } from '../billing/timeBudget';

const v = (s: string | undefined) => (s && s.trim() ? s.trim() : MISSING);

export function termsDe(o: OperatorInfo): LegalDocument {
  return {
    id: 'terms',
    title: 'Allgemeine Geschäftsbedingungen',
    version: LEGAL_VERSION,
    sections: [
      {
        heading: '1. Geltungsbereich und Anbieter',
        paragraphs: [
          `Diese Bedingungen gelten für die Nutzung der App tuur von ${v(o.name)}, ${v(o.address)} (Anbieter). tuur ist ein KI-gestützter Stadtguide mit Texten und Audioguide für unterwegs: zu Fuß, mit dem Rad, im Auto oder in öffentlichen Verkehrsmitteln.`,
        ],
      },
      {
        heading: '2. Leistungen',
        paragraphs: [
          'Online-Texttouren mit Infokarten und Wegführung sind kostenlos und werbefinanziert. Ohne Premium starten Touren im Textmodus; vorhandenen bezahlten Audiozugang kannst du gesondert aktivieren. Vor einer neuen kostenlosen Tour wird eine feste, als KI-generiert gekennzeichnete Stimmvorstellung abgespielt und anschließend, soweit verfügbar und nach deinen Datenschutzeinstellungen zulässig, eine Anzeige gezeigt. Weitere Anzeigen können zwischen Stationen erscheinen. Fehlt eine verfügbare oder zulässige Anzeige, bleibt die Texttour nutzbar.',
          `Ein Tour-Guthaben enthält bis zu ${CREDIT_TOUR_MINUTES} Minuten aktive Audiotourzeit. Du löst es für den Audioguide einer Standardtour oder für die Modi „Geplante Route“, „Weggabelung“ und „Streifzug“ an einem Ort ein. Pausen, die Nutzung im Textmodus und die festen Stimmvorstellungen verbrauchen keine Audiominuten; das verbleibende Zeitguthaben verfällt nicht während einer Pause. Bereits gekaufte dauerhafte Tourfreischaltungen und ältere gekaufte 24-Stunden-Freischaltungen behalten ihre ursprünglichen Rechte.`,
          `Monats- und Jahresabonnements (Premium) enthalten jeweils ${SUBSCRIPTION_TOUR_MINUTES_PER_MONTH} Minuten aktive Audiotourzeit pro Kalendermonat für alle Touren und Modi, ohne Werbeanzeigen. Das Monatskontingent erneuert sich am ersten Tag des Monats um 00:00 Uhr UTC, solange dein Abonnement aktiv ist. Nicht verbrauchte Abominuten werden nicht in den nächsten Monat übertragen. Das Wiederherstellen eines Kaufs füllt bereits verbrauchte Minuten nicht erneut auf.`,
          'Der Audioguide erfordert bezahlten Audiozugang; die festen Stimmvorstellungen sind kostenlos. Das Ansehen einer Anzeige sowie frühere kostenlose oder durch Werbung erworbene Freischaltungen gewähren keinen kostenpflichtigen Audioguide und keinen Offline-Download.',
          'Für Offline-Downloads einer festen Standardtour oder geplanten Route brauchst du ein Abonnement oder bezahlten Zugang. Bei zeitbegrenztem Zugang wird die angegebene Tourdauer bei der Vorbereitung einmalig vom verbleibenden Minutenkontingent abgezogen. Die vollständig gespeicherte Fassung kannst du auf deinem Gerät anschließend ohne weiteren Minutenverbrauch abspielen; eine neue Fassung kann erneut Minuten benötigen.',
          'Bei einer Live-Gruppentour hören Gäste die Erzählungen aus dem bezahlten Audiozugang des Gastgebers. Nur die aktive Audiotourzeit des Gastgebers wird angerechnet. Die Teilnahme funktioniert online und endet mit der Gruppe; sie vermittelt keinen eigenen dauerhaften Zugang und keinen Offline-Download. Die verfügbare Teilnehmerzahl und gegebenenfalls kostenpflichtige Zusatzplätze werden in der App angezeigt.',
          'Ältere, dauerhaft mit einem bezahlten Guthaben freigeschaltete Standardtouren kannst du weiterhin bis zu zweimal per Geschenklink weitergeben. Daraus entstandene Audiofreischaltungen bleiben erhalten; sie umfassen keinen Offline-Download und können nicht weiter verschenkt werden. Neue Freischaltungen mit Minutenkontingent sowie kostenlose und durch Anzeigen erworbene Touren sind nicht verschenkbar. Ein Geschenklink gilt einmal und läuft nach 30 Tagen ab. Die Teilnahme an einer vom Gastgeber finanzierten Live-Gruppentour ist davon unabhängig.',
          'Wir stellen Inhalte für viele Orte automatisch zusammen. Es besteht kein Anspruch auf Verfügbarkeit für einen bestimmten Ort oder eine bestimmte Sprache.',
        ],
      },
      {
        heading: '3. Preise, Zahlung und Abonnement',
        paragraphs: [
          'Alle Preise werden vor dem Kauf im App Store bzw. bei Google Play in deiner Währung einschließlich Umsatzsteuer angezeigt. Die Zahlung wickelt der jeweilige Store ab.',
          'Ein Abonnement verlängert sich automatisch um die gebuchte Laufzeit (monatlich oder jährlich), wenn du es nicht spätestens 24 Stunden vor Ablauf in den Einstellungen deines Store-Kontos kündigst. Die Kündigung wirkt zum Ende der laufenden Laufzeit. Über „Käufe wiederherstellen“ überträgst du Käufe auf ein neues Gerät.',
        ],
      },
      {
        heading: '4. Widerrufsrecht bei digitalen Inhalten',
        paragraphs: [
          'Als Verbraucher hast du grundsätzlich ein 14-tägiges Widerrufsrecht. Dieses erlischt bei digitalen Inhalten (Tour-Guthaben, Freischaltungen), wenn wir mit der Ausführung begonnen haben, nachdem du ausdrücklich zugestimmt hast, dass wir vor Ablauf der Widerrufsfrist mit der Ausführung beginnen, und du bestätigt hast, dass du dadurch dein Widerrufsrecht verlierst (§ 356 Abs. 5 BGB). Diese Zustimmung holen wir vor jedem Kauf mit einem Kontrollkästchen ein und speichern sie mit Zeitpunkt in deinem Konto; die Kaufbestätigung erhältst du vom Store. Beim Kauf über einen Store gelten zusätzlich dessen Bedingungen, insbesondere für Erstattungen.',
          'Widerrufsbelehrung: Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses. Um dein Widerrufsrecht auszuüben, musst du uns (Kontakt siehe Impressum) mittels einer eindeutigen Erklärung (z. B. E-Mail) über deinen Entschluss, diesen Vertrag zu widerrufen, informieren. Zur Wahrung der Widerrufsfrist reicht es aus, dass du die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absendest. Folgen des Widerrufs: Wenn du diesen Vertrag widerrufst, haben wir dir alle Zahlungen, die wir von dir erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über deinen Widerruf bei uns eingegangen ist. Beim Kauf über einen Store erfolgt die Erstattung über den Store. Das Widerrufsrecht erlischt bei digitalen Inhalten unter den oben genannten Voraussetzungen.',
        ],
      },
      {
        heading: '5. KI-Inhalte, Genauigkeit und Sicherheit',
        paragraphs: [
          'Die Erzählungen werden von KI aus öffentlichen Quellen erzeugt und automatisch geprüft. Trotzdem können sie unvollständig oder fehlerhaft sein. Auf Fehler kannst du in der App hinweisen.',
          'Achte jederzeit auf deine Umgebung. Nutze tuur im Straßenverkehr nur so, dass du weiterhin Verkehrsgeräusche hörst und sicher unterwegs bist. Folge Routenvorschlägen nicht, wenn sie dich in Gefahr bringen oder gesperrte oder nicht zugängliche Bereiche betreffen. Die Audiowiedergabe läuft auch im Auto und in öffentlichen Verkehrsmitteln weiter. Wenn du selbst fährst, richte tuur vor der Fahrt ein, bediene den Bildschirm erst wieder an einem sicheren Halteort und beachte die geltenden Verkehrsregeln. tuur bietet keine Auto- oder ÖPNV-Navigation; vorgeschlagene Fuß- und Radwege sind keine Fahranweisungen für Kraftfahrzeuge.',
        ],
      },
      {
        heading: '6. Partnerinhalte und Werbung',
        paragraphs: [
          'Partnerorte sind als „Partner“ gekennzeichnet; ihre Vorstellungen werden als Partnervorstellung angekündigt und beruhen auf Angaben des Partners. Partnerorte werden durch einen begrenzten, bezahlten Sichtbarkeitsbonus höher eingestuft (bezahlte Platzierung) und können dadurch häufiger vorgeschlagen werden. Angebote von Partnern löst du per QR-Code direkt beim Partner ein; der Partner ist für sein Angebot verantwortlich. In der kostenlosen Nutzung wird Werbung angezeigt und als solche gekennzeichnet.',
        ],
      },
      {
        heading: '7. Pflichten und zulässige Nutzung',
        paragraphs: [
          'Du nutzt tuur nur für private Zwecke, gibst keine Zugangsdaten weiter und unterlässt Missbrauch (automatisierte Abrufe, Umgehen von Freischaltungen, Manipulation von Belohnungen). Bei Missbrauch dürfen wir Zugänge sperren.',
        ],
      },
      {
        heading: '8. Haftung',
        paragraphs: [
          'Wir haften unbeschränkt bei Vorsatz, grober Fahrlässigkeit, Verletzung von Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz. Bei einfacher Fahrlässigkeit haften wir nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vorhersehbaren, vertragstypischen Schaden. Gesetzliche Mängelrechte, insbesondere bei digitalen Produkten, bleiben unberührt.',
        ],
      },
      {
        heading: '9. Änderungen, anwendbares Recht',
        paragraphs: [
          'Änderungen dieser Bedingungen, die den Vertragsinhalt betreffen, bedürfen deiner Zustimmung; wir teilen sie in der App mit Vorlauf mit. Stimmst du nicht zu, bleibt der Vertrag zu den bisherigen Bedingungen bestehen, und du kannst ein Abonnement zum Ende der Laufzeit kündigen. Reine Anpassungen an geänderte Rechtslage oder technische Angaben ohne Nachteil für dich sind zulässig. Es gilt deutsches Recht; zwingende Verbraucherschutzvorschriften deines Aufenthaltsstaats bleiben unberührt.',
          'Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
          `Kontakt: ${v(o.email)}. Stand: ${LEGAL_VERSION}.`,
        ],
      },
    ],
  };
}

export function termsEn(o: OperatorInfo): LegalDocument {
  return {
    id: 'terms',
    title: 'Terms of use',
    version: LEGAL_VERSION,
    sections: [
      {
        heading: '1. Scope and provider',
        paragraphs: [
          `These terms apply to the use of the tuur app provided by ${v(o.name)}, ${v(o.address)} (provider). tuur is an AI-assisted city guide with text and audio for exploring on foot, by bike, in a car or on public transport.`,
        ],
      },
      {
        heading: '2. Services',
        paragraphs: [
          'Online text tours with info cards and navigation are free and supported by ads. Without Premium, tours start in text mode; you can separately enable any paid audio access you hold. Before a new free tour, a fixed voice introduction labeled as AI-generated plays, followed by an ad when available and permitted by your privacy choices. Further ads may appear between stops. The text tour remains available if an ad is unavailable or not permitted.',
          `One tour credit includes up to ${CREDIT_TOUR_MINUTES} minutes of active audio tour time. You redeem it for the audio guide of one standard tour or for the modes "planned route", "crossroads" and "roam" at one place. Pauses, text mode and the fixed voice introductions use no audio minutes, and remaining credit minutes do not expire while paused. Existing purchased permanent tour unlocks and older purchased 24-hour unlocks retain their original rights.`,
          `Both monthly and yearly subscriptions (Premium) include ${SUBSCRIPTION_TOUR_MINUTES_PER_MONTH} minutes of active audio tour time per calendar month for all tours and modes, without ads. The monthly allowance renews on the first day of each month at 00:00 UTC while your subscription is active. Unused subscription minutes do not roll over to the next month. Restoring a purchase does not refill minutes already used.`,
          'The audio guide requires paid audio access; the fixed voice introductions are free. Watching an ad or holding an earlier free or ad-earned unlock does not grant the paid audio guide or an offline download.',
          'Offline downloads of a fixed standard tour or planned route require a subscription or paid access. For access with a time allowance, the stated tour duration is deducted once from your remaining minutes when the download is prepared. You can then replay the fully saved version on your device without using more minutes; preparing a new version may use minutes again.',
          'On a live group tour, guests hear narrations funded by the host’s paid audio access. Only the host’s active audio tour time is counted. Participation works online and ends with the group; it does not grant separate permanent access or an offline download. The available group capacity and any paid extra places are shown in the app.',
          'Older standard tours permanently unlocked with a paid credit can still be gifted up to twice using a gift link. Audio unlocks originating from these purchases are preserved; they do not include an offline download and cannot be gifted again. New unlocks with a time allowance, free tours and tours earned through ads cannot be gifted. A gift link works once and expires after 30 days. Participation in a live group tour funded by its host is separate.',
          'We compile content for many places automatically. There is no entitlement to availability for a particular place or language.',
        ],
      },
      {
        heading: '3. Prices, payment and subscription',
        paragraphs: [
          'All prices are shown in your currency including VAT in the App Store or Google Play before purchase. The store handles payment.',
          'A subscription renews automatically for the booked term (monthly or yearly) unless you cancel it at least 24 hours before it ends in your store account settings. Cancellation takes effect at the end of the current term. "Restore purchases" transfers purchases to a new device.',
        ],
      },
      {
        heading: '4. Right of withdrawal for digital content',
        paragraphs: [
          'As a consumer you generally have a 14-day right of withdrawal. For digital content (tour credits, unlocks) it expires once we have started performance after you expressly agreed that we start before the withdrawal period ends and confirmed that you thereby lose your right of withdrawal (Sec. 356(5) German Civil Code). We ask for this consent with a checkbox before every purchase and store it with a timestamp in your account; the store sends the purchase confirmation. For store purchases the store’s terms also apply, especially for refunds.',
          'Right of withdrawal notice: You have the right to withdraw from this contract within fourteen days without giving any reason. The withdrawal period is fourteen days from the day of conclusion of the contract. To exercise your right of withdrawal you must inform us (contact see imprint) of your decision to withdraw by a clear statement (e.g. email). To meet the withdrawal deadline it is sufficient to send your communication before the withdrawal period has expired. Effects of withdrawal: if you withdraw, we will reimburse all payments received from you without undue delay and no later than fourteen days from the day we received your notice. For store purchases the refund is made through the store. For digital content the right of withdrawal expires under the conditions described above.',
        ],
      },
      {
        heading: '5. AI content, accuracy and safety',
        paragraphs: [
          'Narrations are generated by AI from public sources and checked automatically. They can still be incomplete or wrong. You can report errors in the app.',
          'Stay aware of your surroundings at all times. In traffic use tuur only in a way that lets you hear traffic and stay safe. Do not follow route suggestions that put you at risk or lead into closed or inaccessible areas. Audio continues in cars and on public transport. If you are driving, set up tuur before departure, use the screen again only after stopping in a safe place and follow applicable traffic rules. tuur does not provide driving or public transport navigation; suggested walking and cycling paths are not driving directions.',
        ],
      },
      {
        heading: '6. Partner content and advertising',
        paragraphs: [
          'Partner places are labeled "Partner"; their introductions are announced as partner introductions and based on information from the partner. Partner places are ranked higher through a limited paid visibility bonus (paid placement) and can be suggested more often. You redeem partner offers by QR code directly at the partner, who is responsible for the offer. Free use shows ads, which are labeled as such.',
        ],
      },
      {
        heading: '7. Permitted use',
        paragraphs: [
          'You use tuur for private purposes only, do not share access credentials and refrain from abuse (automated retrieval, circumventing unlocks, manipulating rewards). We may block access in case of abuse.',
        ],
      },
      {
        heading: '8. Liability',
        paragraphs: [
          'We are liable without limitation for intent, gross negligence, injury to life, body or health and under the Product Liability Act. For simple negligence we are only liable for breach of essential contractual obligations and limited to foreseeable, typical damage. Statutory warranty rights, in particular for digital products, remain unaffected.',
        ],
      },
      {
        heading: '9. Changes, governing law',
        paragraphs: [
          'Changes to these terms that affect the content of the contract require your consent; we announce them in the app in advance. If you do not agree, the contract continues on the previous terms and you can cancel a subscription at the end of its term. Pure adaptations to changed law or technical details without disadvantage to you are permitted. German law applies; mandatory consumer protection rules of your country of residence remain unaffected.',
          'We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.',
          `Contact: ${v(o.email)}. Version: ${LEGAL_VERSION}.`,
        ],
      },
    ],
  };
}
