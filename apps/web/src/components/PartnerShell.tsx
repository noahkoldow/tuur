'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useT, type TKey } from '@/lib/i18n';
import { Button, Loading, Notice } from './ui';

export const PARTNER_NAV: { href: string; key: TKey }[] = [
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

interface ShellProps {
  children: ReactNode;
  nav: { href: string; key: TKey }[];
  home: string;
  titleKey: TKey;
  /** Admin frame: signed-in users without the admin claim see a notice instead of the pages. */
  adminOnly?: boolean;
}

/** Frame of the partner portal / admin area: brand header, navigation, language switch and the sign-in gate. */
export function AppShell({ children, nav, home, titleKey, adminOnly }: ShellProps) {
  const { user, loading, signOut, isAdmin } = useAuth();
  const { t } = useT();
  const path = usePathname();
  const router = useRouter();
  const loginPath = `${home}/login`;
  const isLogin = path === loginPath;

  useEffect(() => {
    if (!loading && !user && !isLogin) router.replace(loginPath);
    if (!loading && user && isLogin) router.replace(home);
  }, [loading, user, isLogin, router, loginPath, home]);

  if (loading || (!user && !isLogin) || (user && isLogin)) return <Loading label={t('common.loading')} />;

  return (
    <div className="shell">
      <header className="top">
        <Link href={home} aria-label="tuur">
          <img src="/brand/tuur-wordmark-red.svg" alt="tuur" height={28} />
        </Link>
        <span className="top-title">{t(titleKey)}</span>
        <span className="spacer" />
        <LangSwitch />
        {user ? (
          <Button variant="ghost" onClick={() => void signOut()}>
            {t('common.signOut')}
          </Button>
        ) : null}
      </header>
      {user ? (
        <nav className="nav" aria-label={t(titleKey)}>
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={(n.href === home ? path === home : path.startsWith(n.href)) ? 'page' : undefined}
            >
              {t(n.key)}
            </Link>
          ))}
        </nav>
      ) : null}
      <main className="content">
        {adminOnly && user && !isAdmin ? <Notice tone="error">{t('admin.forbidden')}</Notice> : children}
      </main>
      <footer className="foot">
        <Link href="/legal/partner-terms">{t('common.terms')}</Link>
        <Link href="/legal/privacy">{t('common.privacy')}</Link>
        <Link href="/legal/imprint">{t('common.imprint')}</Link>
      </footer>
    </div>
  );
}

export function PartnerShell({ children }: { children: ReactNode }) {
  return (
    <AppShell nav={PARTNER_NAV} home="/partner" titleKey="auth.title">
      {children}
    </AppShell>
  );
}
