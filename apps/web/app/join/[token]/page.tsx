import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SpinningMark } from '@/components/SpinningMark';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'tuur – Gruppen-Tour', robots: { index: false, follow: false } };

const IOS_URL = process.env['NEXT_PUBLIC_APP_STORE_URL'];
const ANDROID_URL =
  process.env['NEXT_PUBLIC_PLAY_STORE_URL'] ?? 'https://play.google.com/store/apps/details?id=app.tuur.guide';

const COPY = {
  de: {
    title: 'Du bist zu einer Gruppen-Tour eingeladen',
    body: 'Ihr hört gemeinsam dieselbe tuur-Tour, jeder auf seinem eigenen Handy. Für Gäste kostenlos, solange die Gruppe läuft.',
    open: 'In der App öffnen',
    ios: 'Im App Store laden',
    android: 'Bei Google Play laden',
    hint: 'Hast du tuur schon installiert, öffnet sich die App direkt. Gruppen-Touren brauchen eine Internetverbindung.',
  },
  en: {
    title: 'You are invited to a group tour',
    body: 'You listen to the same tuur tour together, each on your own phone. Free for guests while the group is live.',
    open: 'Open in the app',
    ios: 'Get it on the App Store',
    android: 'Get it on Google Play',
    hint: 'With tuur installed the app opens directly. Group tours need an internet connection.',
  },
} as const;

/**
 * Landing page of a live group link (D47). With the app installed the universal/app link opens the app; otherwise
 * the visitor gets the app first. The token is only passed on to the app, never resolved or logged here.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const accept = (await headers()).get('accept-language') ?? '';
  const lang = accept.toLowerCase().startsWith('de') ? 'de' : 'en';
  const c = COPY[lang];
  const valid = /^[A-Za-z0-9]{10,40}\.[A-Za-z0-9_-]{32,64}$/.test(token);
  return (
    <main className="hero" lang={lang}>
      <SpinningMark size={72} label="tuur" />
      <img src="/brand/tuur-wordmark-red.svg" alt="tuur" width={160} />
      <h1>{c.title}</h1>
      <p>{c.body}</p>
      <div className="stores">
        {valid ? (
          <a className="pill" href={`tuur://join/${encodeURIComponent(token)}`}>
            {c.open}
          </a>
        ) : null}
        {IOS_URL ? (
          <a className="pill" href={IOS_URL}>
            {c.ios}
          </a>
        ) : null}
        <a className="pill" href={ANDROID_URL}>
          {c.android}
        </a>
      </div>
      <p className="small">{c.hint}</p>
    </main>
  );
}
