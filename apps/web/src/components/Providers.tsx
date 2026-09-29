'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { LangProvider } from '@/lib/i18n';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <AuthProvider>{children}</AuthProvider>
    </LangProvider>
  );
}
