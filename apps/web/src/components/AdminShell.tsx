'use client';

import type { ReactNode } from 'react';
import type { TKey } from '@/lib/i18n';
import { AppShell } from './PartnerShell';

const NAV: { href: string; key: TKey }[] = [
  { href: '/admin', key: 'admin.nav.dashboard' },
  { href: '/admin/areas', key: 'admin.nav.areas' },
  { href: '/admin/content', key: 'admin.nav.content' },
  { href: '/admin/quality', key: 'admin.nav.quality' },
  { href: '/admin/partners', key: 'admin.nav.partners' },
  { href: '/admin/ai', key: 'admin.nav.ai' },
];

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AppShell nav={NAV} home="/admin" titleKey="admin.title" adminOnly>
      {children}
    </AppShell>
  );
}
