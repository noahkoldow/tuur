import type { Metadata } from 'next';
import { PartnerShell } from '@/components/PartnerShell';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'tuur – Partnerportal',
  manifest: '/partner-manifest.webmanifest',
  robots: { index: false, follow: false },
};

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <PartnerShell>{children}</PartnerShell>
    </Providers>
  );
}
