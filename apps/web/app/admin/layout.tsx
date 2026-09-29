import type { Metadata } from 'next';
import { AdminShell } from '@/components/AdminShell';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = { title: 'tuur – Admin', robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AdminShell>{children}</AdminShell>
    </Providers>
  );
}
