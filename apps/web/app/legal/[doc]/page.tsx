import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { LEGAL_DOCS, getLegalDocument, type LegalDocId } from '@tuur/shared';
import { pickLang } from '@/lib/copy';
import { operatorFromEnv } from '@/lib/operator';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'tuur – Rechtliches' };

const NAMES: Record<LegalDocId, { de: string; en: string }> = {
  imprint: { de: 'Impressum', en: 'Imprint' },
  privacy: { de: 'Datenschutz', en: 'Privacy' },
  terms: { de: 'AGB', en: 'Terms' },
  'partner-terms': { de: 'Partnerbedingungen', en: 'Partner terms' },
};

export default async function LegalPage({
  params,
  searchParams,
}: {
  params: Promise<{ doc: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { doc } = await params;
  const q = await searchParams;
  if (!LEGAL_DOCS.includes(doc as LegalDocId)) notFound();
  const id = doc as LegalDocId;
  const lang =
    q.lang === 'en' || q.lang === 'de' ? q.lang : pickLang((await headers()).get('accept-language'));
  const d = getLegalDocument(id, lang, operatorFromEnv());
  return (
    <main className="legal" lang={lang}>
      <nav className="legal-nav" aria-label="Legal">
        <Link href="/">
          <img src="/brand/tuur-wordmark-red.svg" alt="tuur" height={26} />
        </Link>
        <span className="spacer" />
        {LEGAL_DOCS.map((k) => (
          <Link key={k} href={`/legal/${k}?lang=${lang}`} aria-current={k === id ? 'page' : undefined}>
            {NAMES[k][lang]}
          </Link>
        ))}
        <span className="lang">
          {(['de', 'en'] as const).map((l) => (
            <Link key={l} href={`/legal/${id}?lang=${l}`} className={l === lang ? 'on' : ''}>
              {l.toUpperCase()}
            </Link>
          ))}
        </span>
      </nav>
      <article>
        <h1>{d.title}</h1>
        <p className="muted">
          {lang === 'de' ? 'Stand' : 'Version'}: {d.version}
        </p>
        {d.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}
