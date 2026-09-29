'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { AreaSchema, type Area } from '@tuur/shared';
import { callFn, fb } from '@/lib/firebase';
import { usd, useLive } from '@/lib/adminData';
import { useT } from '@/lib/i18n';
import { AreaMap } from '@/components/AreaMap';
import { Badge, Button, Card, Loading, Notice } from '@/components/ui';

const COLORS: Record<string, string> = {
  ready: '#1b7f3b',
  ingesting: '#b26a00',
  failed: '#b00020',
  low_content: '#6b7280',
  empty: '#c7c7c7',
};

export default function AreasPage() {
  const { t } = useT();
  const [selected, setSelected] = useState<string | undefined>();
  const [filter, setFilter] = useState<string>('all');
  const [msg, setMsg] = useState<{ tone: 'success' | 'warning' | 'error'; text: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const areas = useLive<Area>(
    () => query(collection(fb().db, 'areas'), orderBy('updatedAt', 'desc'), limit(1500)),
    (_id, d) => {
      const p = AreaSchema.safeParse(d);
      return p.success ? p.data : undefined;
    },
    [],
  );
  const costs = useLive<{ tile: string; costUsd: number }>(
    () => query(collection(fb().db, 'usageDailyAreas'), where('day', '==', today)),
    (_id, d) => ({ tile: String(d['tile']), costUsd: Number(d['costUsd'] ?? 0) }),
    [today],
  );
  const costOf = useMemo(() => new Map((costs ?? []).map((c) => [c.tile, c.costUsd])), [costs]);
  const shown = useMemo(
    () => (areas ?? []).filter((a) => filter === 'all' || a.status === filter),
    [areas, filter],
  );
  const sel = areas?.find((a) => a.geohash === selected);

  const act = async (name: 'adminRetryIngest' | 'adminSetAreaLock', data: object) => {
    setBusy(true);
    setMsg(undefined);
    try {
      const r = await callFn<object, { started?: boolean }>(name, data);
      if (name === 'adminRetryIngest')
        setMsg(
          r.started
            ? { tone: 'success', text: t('admin.areas.started') }
            : { tone: 'warning', text: t('admin.areas.notStarted') },
        );
    } catch {
      setMsg({ tone: 'error', text: t('common.error') });
    } finally {
      setBusy(false);
    }
  };

  if (!areas) return <Loading label={t('common.loading')} />;
  return (
    <div className="stack">
      <h1>{t('admin.areas.title')}</h1>
      <p className="muted">{t('admin.areas.hint')}</p>
      <div className="legend">
        {Object.entries(COLORS).map(([s, c]) => (
          <span key={s}>
            <i style={{ background: c }} />
            {t(`admin.areas.status.${s as 'ready'}`)}
          </span>
        ))}
        <span>
          <i style={{ background: '#fff', border: '2px solid #111' }} />
          {t('admin.areas.locked')}
        </span>
      </div>
      <AreaMap areas={areas} selected={selected} onSelect={setSelected} label={t('admin.areas.title')} />
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {sel ? (
        <Card title={`${t('admin.areas.selected')}: ${sel.geohash}`}>
          <p className="row">
            <Badge
              tone={
                sel.status === 'ready'
                  ? 'ok'
                  : sel.status === 'failed'
                    ? 'bad'
                    : sel.status === 'ingesting'
                      ? 'wait'
                      : 'off'
              }
            >
              {t(`admin.areas.status.${sel.status}`)}
            </Badge>
            {sel.locked ? <Badge tone="bad">{t('admin.areas.locked')}</Badge> : null}
          </p>
          <p className="muted">
            {t('admin.areas.pois')}: {sel.poiCount} · {t('admin.areas.attempts')}: {sel.ingestAttempts} ·{' '}
            {t('admin.areas.cost')}: {usd(costOf.get(sel.geohash) ?? 0)}
            {sel.placeId ? ` · ${t('admin.areas.place')}: ${sel.placeId}` : ''}
          </p>
          {sel.error ? (
            <Notice tone="error">
              {t('admin.areas.error')}: {sel.error}
            </Notice>
          ) : null}
          <div className="row">
            <Button
              busy={busy}
              disabled={sel.locked}
              onClick={() => void act('adminRetryIngest', { geohash: sel.geohash })}
            >
              {t('admin.areas.retry')}
            </Button>
            <Button
              variant="secondary"
              busy={busy}
              onClick={() => void act('adminSetAreaLock', { geohash: sel.geohash, locked: !sel.locked })}
            >
              {sel.locked ? t('admin.areas.unlock') : t('admin.areas.lock')}
            </Button>
            <Link className="btn btn-ghost" href={`/admin/content?tile=${sel.geohash}`}>
              {t('admin.areas.openContent')}
            </Link>
          </div>
        </Card>
      ) : null}
      <div className="row">
        <label className="row">
          <span>{t('admin.areas.filter')}</span>
          <select
            className="input"
            style={{ width: 'auto' }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">{t('admin.areas.all')}</option>
            {Object.keys(COLORS).map((s) => (
              <option key={s} value={s}>
                {t(`admin.areas.status.${s as 'ready'}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="muted">{t('admin.areas.none')}</p>
      ) : (
        <ul className="list">
          {shown.slice(0, 200).map((a) => (
            <li key={a.geohash}>
              <button
                className="linkbtn"
                onClick={() => setSelected(a.geohash)}
                aria-pressed={a.geohash === selected}
              >
                <strong>{a.geohash}</strong> · {t(`admin.areas.status.${a.status}`)} · {a.poiCount}{' '}
                {t('admin.areas.pois')}
                {a.locked ? ` · ${t('admin.areas.locked')}` : ''}
              </button>
              <span className="muted">{new Date(a.updatedAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
