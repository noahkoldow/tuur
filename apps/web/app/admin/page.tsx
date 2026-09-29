'use client';

import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { callFn, fb } from '@/lib/firebase';
import { usd, useLive } from '@/lib/adminData';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, Loading, Notice } from '@/components/ui';
import { AiConfigSchema, DEFAULT_AI_CONFIG, type AiConfig } from '@tuur/shared';

interface Day {
  day: string;
  costUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  ttsChars: number;
  groundingQueries: number;
  byKind: Record<string, number>;
}

export default function AdminDashboard() {
  const { t } = useT();
  const [cfg, setCfg] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(
    () =>
      onSnapshot(doc(fb().db, 'config', 'ai'), (s) => {
        const p = AiConfigSchema.safeParse({ ...DEFAULT_AI_CONFIG, ...s.data() });
        setCfg(p.success ? p.data : DEFAULT_AI_CONFIG);
      }),
    [],
  );

  const days = useLive<Day>(
    () => query(collection(fb().db, 'usageDaily'), orderBy('day', 'desc'), limit(8)),
    (_id, d) => ({
      day: String(d['day']),
      costUsd: Number(d['costUsd'] ?? 0),
      calls: Number(d['calls'] ?? 0),
      inputTokens: Number(d['inputTokens'] ?? 0),
      outputTokens: Number(d['outputTokens'] ?? 0),
      ttsChars: Number(d['ttsChars'] ?? 0),
      groundingQueries: Number(d['groundingQueries'] ?? 0),
      byKind: (d['byKind'] as Record<string, number> | undefined) ?? {},
    }),
    [],
  );
  const today = new Date().toISOString().slice(0, 10);
  const areaCosts = useLive<{ tile: string; costUsd: number }>(
    () => query(collection(fb().db, 'usageDailyAreas'), where('day', '==', today)),
    (_id, d) => ({ tile: String(d['tile']), costUsd: Number(d['costUsd'] ?? 0) }),
    [today],
  );
  const areas = useLive<string>(
    () => query(collection(fb().db, 'areas'), limit(3000)),
    (_id, d) => String(d['status']),
    [],
  );
  const feedback = useLive<string>(
    () => query(collection(fb().db, 'feedback'), where('status', '==', 'open'), limit(200)),
    (id) => id,
    [],
  );
  const pending = useLive<string>(
    () => query(collection(fb().db, 'partners'), where('status', '==', 'pending'), limit(200)),
    (id) => id,
    [],
  );
  const audit = useLive<{ id: string; ts: number; actor: string; action: string; target: string }>(
    () => query(collection(fb().db, 'adminAudit'), orderBy('ts', 'desc'), limit(8)),
    (id, d) => ({
      id,
      ts: Number(d['ts']),
      actor: String(d['actor']),
      action: String(d['action']),
      target: String(d['target']),
    }),
    [],
  );

  const toggleKill = async () => {
    if (!confirm(t('admin.dash.killConfirm'))) return;
    setBusy(true);
    setError(false);
    try {
      await callFn('adminSaveAiConfig', { killSwitch: !cfg.killSwitch });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (!days || !areas) return <Loading label={t('common.loading')} />;
  const todayRow = days.find((d) => d.day === today);
  const week = days.slice(0, 7).reduce((s, d) => s + d.costUsd, 0);
  const byStatus = areas.reduce<Record<string, number>>((m, s) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {});
  const max = Math.max(0.01, ...days.map((d) => d.costUsd));
  const top = [...(areaCosts ?? [])].sort((a, b) => b.costUsd - a.costUsd).slice(0, 5);

  return (
    <div className="stack">
      <h1>{t('admin.nav.dashboard')}</h1>
      {error ? <Notice tone="error">{t('common.error')}</Notice> : null}
      <Notice tone={cfg.killSwitch ? 'error' : 'success'}>
        <div className="row between">
          <span>{cfg.killSwitch ? t('admin.dash.killOn') : t('admin.dash.killOff')}</span>
          <Button
            variant={cfg.killSwitch ? 'primary' : 'danger'}
            busy={busy}
            onClick={() => void toggleKill()}
          >
            {cfg.killSwitch ? t('admin.dash.killDisable') : t('admin.dash.killEnable')}
          </Button>
        </div>
      </Notice>
      <div className="grid3">
        <Card title={t('admin.dash.costToday')}>
          <p className="big">{usd(todayRow?.costUsd ?? 0)}</p>
          <p className="muted">
            {t('admin.dash.budget')}: {usd(cfg.dailyBudgetUsd)}
          </p>
        </Card>
        <Card title={t('admin.dash.costWeek')}>
          <p className="big">{usd(week)}</p>
        </Card>
        <Card title={t('admin.dash.openFeedback')}>
          <p className="big">{feedback?.length ?? 0}</p>
          <p className="muted">
            {t('admin.dash.pendingPartners')}: {pending?.length ?? 0}
          </p>
        </Card>
      </div>
      <div className="grid2">
        <Card title={t('admin.dash.areas')}>
          <p className="row">
            {(['ready', 'ingesting', 'failed', 'low_content', 'empty'] as const).map((s) => (
              <Badge
                key={s}
                tone={s === 'ready' ? 'ok' : s === 'failed' ? 'bad' : s === 'ingesting' ? 'wait' : 'off'}
              >
                {t(`admin.areas.status.${s}`)}: {byStatus[s] ?? 0}
              </Badge>
            ))}
          </p>
        </Card>
        <Card title={t('admin.dash.topAreas')}>
          {top.length ? (
            <ul className="list">
              {top.map((a) => (
                <li key={a.tile}>
                  <span>{a.tile}</span>
                  <strong>{usd(a.costUsd)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">–</p>
          )}
        </Card>
      </div>
      <Card title={t('admin.dash.byKind')}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('admin.dash.day')}</th>
              <th>USD</th>
              <th>{t('admin.dash.calls')}</th>
              <th>{t('admin.dash.tokens')}</th>
              <th>{t('admin.dash.tts')}</th>
              <th>{t('admin.dash.grounding')}</th>
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{usd(d.costUsd)}</td>
                <td>{d.calls}</td>
                <td>
                  {d.inputTokens} / {d.outputTokens}
                </td>
                <td>{d.ttsChars}</td>
                <td>{d.groundingQueries}</td>
                <td aria-hidden>
                  <span className="bar" style={{ width: `${(d.costUsd / max) * 100}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {todayRow ? (
          <p className="muted">
            {Object.entries(todayRow.byKind)
              .map(([k, v]) => `${k}: ${usd(v)}`)
              .join(' · ')}
          </p>
        ) : null}
      </Card>
      <Card title={t('admin.dash.audit')}>
        <ul className="list">
          {(audit ?? []).map((a) => (
            <li key={a.id}>
              <span>
                {new Date(a.ts).toLocaleString()} · {a.action} · {a.target}
              </span>
              <span className="muted">{a.actor.slice(0, 8)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
