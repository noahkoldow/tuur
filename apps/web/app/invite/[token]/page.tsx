import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SpinningMark } from '@/components/SpinningMark';
import { inviteCopy, pickLang } from '@/lib/copy';
import { fetchInvitePreview } from '@/lib/invite';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'tuur – Einladung', robots: { index: false, follow: false } };

const IOS_URL = process.env['NEXT_PUBLIC_APP_STORE_URL'];
const ANDROID_URL =
  process.env['NEXT_PUBLIC_PLAY_STORE_URL'] ?? 'https://play.google.com/store/apps/details?id=app.tuur.guide';

/**
 * Landing page of an invite link. With the app installed the universal/app link opens the app directly and never
 * reaches this page; otherwise the visitor sees what was gifted and where to get the app.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lang = pickLang((await headers()).get('accept-language'));
  const c = inviteCopy[lang];
  const preview = await fetchInvitePreview(token);
  return (
    <main className="hero" lang={lang}>
      <SpinningMark size={72} label="tuur" />
      <img src="/brand/tuur-wordmark-red.svg" alt="tuur" width={160} />
      {preview.valid ? (
        <>
          <h1>{c.title}</h1>
          <p>{preview.tourTitle ? c.withTour(preview.tourTitle) : c.generic}</p>
          <div className="stores">
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
        </>
      ) : (
        <>
          <h1>{c.title}</h1>
          <p role="alert">{c.invalid}</p>
        </>
      )}
    </main>
  );
}
