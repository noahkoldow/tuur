'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Button, Card, Field, Input, Notice } from '@/components/ui';

export function LoginForm() {
  const { signIn, signUp, resetPassword } = useAuth();
  const { t } = useT();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | undefined>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(undefined);
    try {
      if (mode === 'in') await signIn(email, password);
      else await signUp(email, password);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setMsg({
        tone: 'error',
        text: code.includes('weak-password')
          ? t('auth.weak')
          : code.includes('email-already-in-use')
            ? t('auth.exists')
            : t('auth.invalid'),
      });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email) return;
    await resetPassword(email).catch(() => undefined);
    setMsg({ tone: 'success', text: t('auth.resetSent') });
  };

  return (
    <div className="narrow">
      <h1>{t('auth.title')}</h1>
      <p className="muted">{t('auth.subtitle')}</p>
      <Card>
        <form onSubmit={(e) => void submit(e)} className="stack">
          <Field label={t('auth.email')}>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label={t('auth.password')}>
            <Input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          <Button type="submit" busy={busy}>
            {mode === 'in' ? t('auth.signIn') : t('auth.signUp')}
          </Button>
          <div className="row between">
            <Button type="button" variant="ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
              {mode === 'in' ? t('auth.toSignUp') : t('auth.toSignIn')}
            </Button>
            {mode === 'in' ? (
              <Button type="button" variant="ghost" onClick={() => void reset()}>
                {t('auth.forgot')}
              </Button>
            ) : null}
          </div>
        </form>
      </Card>
    </div>
  );
}
