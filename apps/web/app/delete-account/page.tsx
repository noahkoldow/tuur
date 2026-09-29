import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { pickLang } from '@/lib/copy';
import { operatorFromEnv } from '@/lib/operator';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'tuur – Delete account / Konto löschen' };

const COPY = {
  de: {
    title: 'Konto und Daten löschen',
    app: 'In der App: Einstellungen → Konto & Datenschutz → „Konto löschen“. Dabei werden dein Konto, Guthaben, Freischaltungen, Meldungen, Einladungen und gespeicherte Routen gelöscht. Abonnements und Käufe beim App Store bzw. bei Google Play musst du dort selbst beenden.',
    partner: 'Partner: Im Partnerportal unter „Konto“ kannst du Daten exportieren und dein Konto löschen.',
    mail: 'Ohne App-Zugang: Schreibe uns von der E-Mail-Adresse deines Kontos an',
    kept: 'Rechnungsdaten von Zahlungsdienstleistern unterliegen gesetzlichen Aufbewahrungspflichten und werden dort nach den geltenden Fristen gelöscht.',
    privacy: 'Datenschutzerklärung',
  },
  en: {
    title: 'Delete your account and data',
    app: 'In the app: Settings → Account & privacy → "Delete account". This deletes your account, credits, unlocks, reports, invites and stored routes. Subscriptions and purchases in the App Store or Google Play have to be ended there.',
    partner:
      'Partners: in the partner portal under "Account" you can export your data and delete your account.',
    mail: 'Without app access: write to us from the email address of your account at',
    kept: 'Invoice data held by payment providers is subject to statutory retention duties and is deleted there after the applicable periods.',
    privacy: 'Privacy policy',
  },
} as const;

export default async function DeleteAccountPage() {
  const lang = pickLang((await headers()).get('accept-language'));
  const c = COPY[lang];
  const op = operatorFromEnv();
  const mail = op.privacyEmail ?? op.email;
  return (
    <main className="legal" lang={lang}>
      <nav className="legal-nav">
        <Link href="/">
          <img src="/brand/tuur-wordmark-red.svg" alt="tuur" height={26} />
        </Link>
      </nav>
      <article>
        <h1>{c.title}</h1>
        <p>{c.app}</p>
        <p>{c.partner}</p>
        <p>
          {c.mail} {mail ? <a href={`mailto:${mail}`}>{mail}</a> : '⟦operator data missing⟧'}.
        </p>
        <p className="muted">{c.kept}</p>
        <p>
          <Link href={`/legal/privacy?lang=${lang}`}>{c.privacy}</Link>
        </p>
      </article>
    </main>
  );
}
