import { LEGAL_VERSION, MISSING, type LegalDocument, type OperatorInfo } from './types';

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
          `Diese Bedingungen gelten für die Nutzung der App tuur von ${v(o.name)}, ${v(o.address)} (Anbieter). tuur ist ein KI-gestützter Audio-Stadtguide für Fußgänger und Radfahrer.`,
        ],
      },
      {
        heading: '2. Leistungen',
        paragraphs: [
          'Die erste (kürzeste) Standardtour eines Ortes ist kostenlos. Weitere Standardtouren schaltest du mit einem Tour-Guthaben dauerhaft frei. Die Modi „Geplante Route“, „Weggabelung“ und „Streifzug“ gelten nach Einlösung eines Guthabens für 24 Stunden an dem jeweiligen Ort. Mit einem Abonnement sind alle Touren und Modi ohne Werbung nutzbar.',
          'Kostenlose Nutzer können durch das Ansehen einer belohnten Anzeige (täglich begrenzt) ein Guthaben für eine Standardtour erhalten. Diese Guthaben gelten nicht für die Modi mit 24-Stunden-Freischaltung.',
          'Gekaufte Standardtouren kannst du zweimal per Einladungslink verschenken. Geschenkte oder durch Anzeigen erworbene Touren können nicht weiterverschenkt werden. Ein Einladungslink gilt einmal und läuft nach 14 Tagen ab.',
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
          'Achte jederzeit auf deine Umgebung. Nutze tuur im Straßenverkehr nur so, dass du weiterhin Verkehrsgeräusche hörst und sicher unterwegs bist. Folge Routenvorschlägen nicht, wenn sie dich in Gefahr bringen oder gesperrte oder nicht zugängliche Bereiche betreffen. Die Nutzung während der Fahrt in Kraftfahrzeugen ist nicht vorgesehen.',
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
          `These terms apply to the use of the tuur app provided by ${v(o.name)}, ${v(o.address)} (provider). tuur is an AI-assisted audio city guide for pedestrians and cyclists.`,
        ],
      },
      {
        heading: '2. Services',
        paragraphs: [
          'The first (shortest) standard tour of a place is free. You unlock further standard tours permanently with a tour credit. The modes "planned route", "crossroads" and "roam" work for 24 hours at the respective place after a credit is redeemed. A subscription unlocks all tours and modes without ads.',
          'Free users can earn a credit for one standard tour by watching a rewarded ad (limited per day). These credits do not apply to the modes with 24-hour unlock.',
          'You can gift a purchased standard tour twice with an invite link. Tours received as a gift or earned through ads cannot be gifted again. An invite link works once and expires after 14 days.',
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
          'Stay aware of your surroundings at all times. In traffic use tuur only in a way that lets you hear traffic and stay safe. Do not follow route suggestions that put you at risk or lead into closed or inaccessible areas. Use while driving a motor vehicle is not intended.',
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
