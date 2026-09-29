'use client';

import { useState } from 'react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { callFn, fb } from '@/lib/firebase';
import { useLive } from '@/lib/adminData';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, Loading, Notice } from '@/components/ui';

interface Feedback {
  id: string;
  narrationKey: string;
  reason: 'wrong_fact' | 'offensive' | 'audio_issue' | 'other';
  text?: string;
  createdAt: number;
}
interface Narr {
  key: string;
  title: string;
  text: string;
  keyFacts: string[];
  status: 'ok' | 'blocked' | 'pending_review';
  sponsored: boolean;
  models?: { text: string; tts: string };
}

export default function QualityPage() {
  const { t } = useT();
  const [tab, setTab] = useState<'feedback' | 'narrations'>('feedback');
  const [open, setOpen] = useState<string | undefined>();
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | undefined>();

  const feedback = useLive<Feedback>(
    () =>
      tab === 'feedback'
        ? query(
            collection(fb().db, 'feedback'),
            where('status', '==', 'open'),
            orderBy('createdAt', 'desc'),
            limit(100),
          )
        : null,
    (id, d) => ({
      id,
      narrationKey: String(d['narrationKey']),
      reason: d['reason'] as Feedback['reason'],
      ...(d['text'] ? { text: String(d['text']) } : {}),
      createdAt: Number(d['createdAt']),
    }),
    [tab],
  );
  const narrations = useLive<Narr>(
    () =>
      tab === 'narrations'
        ? query(collection(fb().db, 'narrations'), orderBy('createdAt', 'desc'), limit(50))
        : null,
    (_id, d) => ({
      key: String(d['key']),
      title: String(d['title'] ?? ''),
      text: String(d['text'] ?? ''),
      keyFacts: (d['keyFacts'] as string[] | undefined) ?? [],
      status: (d['status'] as Narr['status'] | undefined) ?? 'ok',
      sponsored: d['sponsored'] === true,
      ...(d['models'] ? { models: d['models'] as { text: string; tts: string } } : {}),
    }),
    [tab],
  );
  // narration text for the feedback entries that are open
  const forFeedback = useLive<Narr>(
    () =>
      tab === 'feedback' && feedback?.length
        ? query(
            collection(fb().db, 'narrations'),
            where(
              'key',
              'in',
              feedback.slice(0, 30).map((f) => f.narrationKey),
            ),
          )
        : null,
    (_id, d) => ({
      key: String(d['key']),
      title: String(d['title'] ?? ''),
      text: String(d['text'] ?? ''),
      keyFacts: (d['keyFacts'] as string[] | undefined) ?? [],
      status: (d['status'] as Narr['status'] | undefined) ?? 'ok',
      sponsored: d['sponsored'] === true,
    }),
    [tab, feedback?.map((f) => f.narrationKey).join('|')],
  );

  const run = async (name: string, data: object) => {
    setMsg(undefined);
    try {
      await callFn(name, data);
      setMsg({ tone: 'success', text: t('admin.content.saved') });
    } catch {
      setMsg({ tone: 'error', text: t('common.error') });
    }
  };

  return (
    <div className="stack">
      <h1>{t('admin.quality.title')}</h1>
      <div className="tabs" role="tablist">
        {(['feedback', 'narrations'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`admin.quality.${k}`)}
          </button>
        ))}
      </div>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      {tab === 'feedback' ? (
        feedback === undefined ? (
          <Loading label={t('common.loading')} />
        ) : feedback.length === 0 ? (
          <p className="muted">{t('admin.quality.none')}</p>
        ) : (
          feedback.map((f) => {
            const n = forFeedback?.find((x) => x.key === f.narrationKey);
            return (
              <Card key={f.id}>
                <div className="row between">
                  <h3>{n?.title ?? f.narrationKey}</h3>
                  <Badge tone={f.reason === 'offensive' || f.reason === 'wrong_fact' ? 'bad' : 'wait'}>
                    {t(`admin.quality.reason.${f.reason}`)}
                  </Badge>
                </div>
                {f.text ? <p>“{f.text}”</p> : null}
                <p className="muted">{new Date(f.createdAt).toLocaleString()}</p>
                {n ? (
                  <>
                    <Button variant="ghost" onClick={() => setOpen(open === f.id ? undefined : f.id)}>
                      {t('admin.quality.text')}
                    </Button>
                    {open === f.id ? <NarrationBody n={n} /> : null}
                  </>
                ) : null}
                <div className="row">
                  <Button onClick={() => void run('adminResolveFeedback', { id: f.id, resolution: 'fixed' })}>
                    {t('admin.quality.fixed')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void run('adminResolveFeedback', { id: f.id, resolution: 'dismissed' })}
                  >
                    {t('admin.quality.dismiss')}
                  </Button>
                </div>
              </Card>
            );
          })
        )
      ) : narrations === undefined ? (
        <Loading label={t('common.loading')} />
      ) : (
        narrations.map((n) => (
          <Card key={n.key}>
            <div className="row between">
              <h3>{n.title}</h3>
              <span className="row">
                {n.sponsored ? <Badge tone="wait">{t('admin.quality.sponsored')}</Badge> : null}
                <Badge tone={n.status === 'ok' ? 'ok' : n.status === 'blocked' ? 'off' : 'bad'}>
                  {t(`admin.quality.status.${n.status}`)}
                </Badge>
              </span>
            </div>
            <p className="muted">{n.key}</p>
            <div className="row">
              <Button variant="ghost" onClick={() => setOpen(open === n.key ? undefined : n.key)}>
                {t('admin.quality.text')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void run('adminRegenerateNarration', { key: n.key })}
              >
                {t('admin.quality.regenerate')}
              </Button>
            </div>
            {open === n.key ? <NarrationBody n={n} /> : null}
          </Card>
        ))
      )}
    </div>
  );
}

function NarrationBody({ n }: { n: Narr }) {
  const { t } = useT();
  return (
    <div className="stack">
      <pre className="pre">{n.text}</pre>
      {n.keyFacts.length ? (
        <>
          <strong>{t('admin.quality.keyFacts')}</strong>
          <ul>
            {n.keyFacts.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </>
      ) : null}
      {n.models ? (
        <p className="muted">
          {t('admin.quality.model')}: {n.models.text} / {n.models.tts}
        </p>
      ) : null}
    </div>
  );
}
