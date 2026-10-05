'use client';

import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/lib/auth';
import { CallError, callFn, fb } from '@/lib/firebase';
import { useT, type TKey } from '@/lib/i18n';
import { Button, Card, Notice } from '@/components/ui';

function errorMessageKey(error: unknown): TKey {
  if (error instanceof CallError) {
    if (error.reason === 'app_check_unconfigured') return 'common.verificationUnavailable';
    if (error.reason === 'app_check_failed') return 'common.verificationFailed';
  }
  return 'common.error';
}

/** GDPR self-service for partners: export and deletion of the account. */
export default function AccountPage() {
  const { t } = useT();
  const { user } = useAuth();
  const [busy, setBusy] = useState<'export' | 'delete' | undefined>();
  const [error, setError] = useState<TKey>();

  const exportData = async () => {
    setBusy('export');
    setError(undefined);
    try {
      const data = await callFn<object, unknown>('exportMyData', {});
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tuur-data.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(errorMessageKey(error));
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async () => {
    if (!confirm(t('account.confirm'))) return;
    setBusy('delete');
    setError(undefined);
    try {
      await callFn('deleteAccount', {});
      await signOut(fb().auth).catch(() => undefined);
    } catch (error) {
      setError(errorMessageKey(error));
      setBusy(undefined);
    }
  };

  return (
    <div className="stack">
      <h1>{t('account.title')}</h1>
      {user?.email ? <p className="muted">{t('account.email', { email: user.email })}</p> : null}
      {error ? <Notice tone="error">{t(error)}</Notice> : null}
      <Card title={t('account.export')}>
        <p>{t('account.exportHint')}</p>
        <div>
          <Button variant="secondary" busy={busy === 'export'} onClick={() => void exportData()}>
            {t('account.export')}
          </Button>
        </div>
      </Card>
      <Card title={t('account.delete')}>
        <p>{t('account.deleteHint')}</p>
        <div>
          <Button variant="danger" busy={busy === 'delete'} onClick={() => void remove()}>
            {t('account.delete')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
