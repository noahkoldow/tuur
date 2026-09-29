'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useT, type TKey } from '@/lib/i18n';
import { Button, Loading } from './ui';

const NAV: { href: string; key: TKey }[] = [
  { href: '/partner', key: 'nav.dashboard' },
  { href: '/partner/profile', key: 'nav.profile' },
  { href: '/partner/offers', key: 'nav.offers' },
  { href: '/partner/plan', key: 'nav.plan' },
  { href: '/partner/stats', key: 'nav.stats' },
  { href: '/partner/scanner', key: 'nav.scanner' },
];

export function LangSwitch() {
  const { lang, setLang, t } = useT();
  return (
    <div className="lang" role="group" aria-label={t('common.language')}>
      {(['de', 'en'] as const).map((l) => (
        <button
          key={l}
          className={l === lang ? 'on' : ''}
          aria-pressed={l === lang}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** Frame of the partner portal: brand header, navigation, language switch and the sign-in gate. */
export function PartnerShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { t } = useT();
  const path = usePathname();
  const router = useRouter();
  const isLogin = path === '/partner/login';

  useEffect(() => {
    if (!loading && !user && !isLogin) router.replace('/partner/login');
    if (!loading && user && isLogin) router.replace('/partner');
  }, [loading, user, isLogin, router]);

  if (loading || (!user && !isLogin) || (user && isLogin)) return <Loading label={t('common.loading')} />;

  return (
    <div className="shell">
      <header className="top">
        <Link href="/partner" aria-label="tuur">
          <img src="/brand/tuur-wordmark-red.svg" alt="tuur" height={28} />
        </Link>
        <span className="top-title">{t('auth.title')}</span>
        <span className="spacer" />
        <LangSwitch />
        {user ? (
          <Button variant="ghost" onClick={() => void signOut()}>
            {t('common.signOut')}
          </Button>
        ) : null}
      </header>
      {user ? (
        <nav className="nav" aria-label={t('auth.title')}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? 'page' : undefined}>
              {t(n.key)}
            </Link>
          ))}
        </nav>
      ) : null}
      <main className="content">{children}</main>
      <footer className="foot">
        <Link href="/legal/partner-terms">{t('common.terms')}</Link>
        <Link href="/legal/privacy">{t('common.privacy')}</Link>
        <Link href="/legal/imprint">{t('common.imprint')}</Link>
      </footer>
    </div>
  );
}
