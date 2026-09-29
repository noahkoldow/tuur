'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { PoiSchema, TourSchema, type Poi, type Tour, type TourText } from '@tuur/shared';
import { callFn, fb } from '@/lib/firebase';
import { useLive } from '@/lib/adminData';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, Field, Input, Loading, Notice, TextArea } from '@/components/ui';

type Tab = 'tours' | 'pois';

function Content() {
  const { t } = useT();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tile') ? 'pois' : 'tours');
  const [tile, setTile] = useState(params.get('tile') ?? '');
  const [place, setPlace] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | undefined>();

  const tours = useLive<Tour>(
    () =>
      tab !== 'tours'
        ? null
        : place
          ? query(
              collection(fb().db, 'tours'),
              where('placeId', '==', place),
              orderBy('updatedAt', 'desc'),
              limit(50),
            )
          : query(collection(fb().db, 'tours'), orderBy('updatedAt', 'desc'), limit(50)),
    (_id, d) => {
      const p = TourSchema.safeParse(d);
      return p.success ? p.data : undefined;
    },
    [tab, place],
  );
  const pois = useLive<Poi>(
    () =>
      tab !== 'pois' || tile.length < 4
        ? null
        : query(collection(fb().db, 'pois'), where('tile', '==', tile), limit(300)),
    (_id, d) => {
      const p = PoiSchema.safeParse(d);
      return p.success ? p.data : undefined;
    },
    [tab, tile],
  );

  const run = async (name: string, data: object, ok?: (r: Record<string, unknown>) => string) => {
    setMsg(undefined);
    try {
      const r = await callFn<object, Record<string, unknown>>(name, data);
      setMsg({ tone: 'success', text: ok ? ok(r) : t('admin.content.saved') });
    } catch {
      setMsg({ tone: 'error', text: t('common.error') });
    }
  };

  return (
    <div className="stack">
      <h1>{t('admin.content.title')}</h1>
      <div className="tabs" role="tablist">
        {(['tours', 'pois'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {t(`admin.content.${k}`)}
          </button>
        ))}
      </div>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      {tab === 'tours' ? (
        <div className="stack">
          <Field label={t('admin.content.place')}>
            <Input value={place} onChange={(e) => setPlace(e.target.value.trim())} placeholder="DE_berlin" />
          </Field>
          {tours === undefined ? (
            <Loading label={t('common.loading')} />
          ) : tours.length === 0 ? (
            <p className="muted">{t('admin.content.none')}</p>
          ) : (
            tours.map((tour) => <TourCard key={tour.id} tour={tour} run={run} />)
          )}
        </div>
      ) : (
        <div className="stack">
          <Field label={t('admin.content.tile')}>
            <Input
              value={tile}
              onChange={(e) => setTile(e.target.value.trim().toLowerCase())}
              placeholder="u33dc0"
              maxLength={8}
            />
          </Field>
          {tile.length < 4 ? (
            <p className="muted">{t('admin.content.needFilter')}</p>
          ) : pois === undefined ? (
            <Loading label={t('common.loading')} />
          ) : pois.length === 0 ? (
            <p className="muted">{t('admin.content.none')}</p>
          ) : (
            [...pois].sort((a, b) => b.score - a.score).map((p) => <PoiCard key={p.id} poi={p} run={run} />)
          )}
        </div>
      )}
    </div>
  );
}

type Run = (name: string, data: object, ok?: (r: Record<string, unknown>) => string) => Promise<void>;

function TourCard({ tour, run }: { tour: Tour; run: Run }) {
  const { t } = useT();
  const langs = Object.keys(tour.texts);
  const [editing, setEditing] = useState(false);
  const [lang, setLang] = useState(langs[0] ?? 'de');
  const [draft, setDraft] = useState<TourText | undefined>(tour.texts[lang]);
  const title = tour.texts[langs[0] ?? '']?.title ?? tour.template;
  const set = (k: keyof TourText) => (e: { target: { value: string } }) =>
    setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  return (
    <Card>
      <div className="row between">
        <h3>
          {title} <span className="muted">· {tour.placeName}</span>
        </h3>
        <span className="row">
          {tour.free ? <Badge tone="ok">{t('admin.content.free')}</Badge> : null}
          {tour.pinned ? <Badge tone="wait">📌</Badge> : null}
          {tour.locked ? <Badge tone="bad">{t('admin.areas.locked')}</Badge> : null}
          {tour.hasPartner ? <Badge tone="off">{t('admin.content.partner')}</Badge> : null}
        </span>
      </div>
      <p className="muted">
        {t('admin.content.source')}: {tour.source} · {Math.round(tour.durationMinutes)} min ·{' '}
        {tour.stops.length} {t('admin.content.stops')} · {tour.id}
      </p>
      <div className="row">
        <Button
          variant="secondary"
          onClick={() => void run('adminModerateTour', { tourId: tour.id, locked: !tour.locked })}
        >
          {tour.locked ? t('admin.content.unlock') : t('admin.content.lock')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void run('adminModerateTour', { tourId: tour.id, pinned: !tour.pinned })}
        >
          {tour.pinned ? t('admin.content.unpin') : t('admin.content.pin')}
        </Button>
        {langs.length ? (
          <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
            {t('admin.content.edit')}
          </Button>
        ) : null}
      </div>
      {editing && draft ? (
        <div className="stack">
          <Notice>{t('admin.content.editedNote')}</Notice>
          <Field label={t('admin.content.textLang')}>
            <select
              className="input"
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
                setDraft(tour.texts[e.target.value]);
              }}
            >
              {langs.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('admin.content.titleField')}>
            <Input value={draft.title} onChange={set('title')} />
          </Field>
          <Field label={t('admin.content.teaser')}>
            <Input value={draft.teaser} onChange={set('teaser')} />
          </Field>
          <Field label={t('admin.content.description')}>
            <TextArea value={draft.description} onChange={set('description')} />
          </Field>
          <Field label={t('admin.content.intro')}>
            <TextArea value={draft.intro} onChange={set('intro')} />
          </Field>
          <Field label={t('admin.content.outro')} hint={t('admin.content.transitionsKept')}>
            <TextArea value={draft.outro} onChange={set('outro')} />
          </Field>
          <div>
            <Button
              onClick={() =>
                void run('adminModerateTour', { tourId: tour.id, texts: { [lang]: draft } }).then(() =>
                  setEditing(false),
                )
              }
            >
              {t('admin.content.save')}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function PoiCard({ poi, run }: { poi: Poi; run: Run }) {
  const { t } = useT();
  const [weight, setWeight] = useState(String(poi.adminWeight));
  const [facts, setFacts] = useState(poi.adminFacts.join('\n'));
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="row between">
        <h3>
          {poi.name} <span className="muted">· {poi.interests.join(', ')}</span>
        </h3>
        <span className="row">
          <Badge tone="off">
            {t('admin.content.score')} {poi.score}
          </Badge>
          {poi.partnerId ? <Badge tone="wait">{t('admin.content.partner')}</Badge> : null}
          {poi.hidden ? <Badge tone="bad">{t('admin.content.hidden')}</Badge> : null}
        </span>
      </div>
      <div className="row">
        <Button
          variant="secondary"
          onClick={() => void run('adminModeratePoi', { poiId: poi.id, hidden: !poi.hidden })}
        >
          {poi.hidden ? t('admin.content.unhide') : t('admin.content.hide')}
        </Button>
        <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
          {t('admin.content.edit')}
        </Button>
      </div>
      {open ? (
        <div className="stack">
          <Field label={t('admin.content.weight')}>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </Field>
          <Field label={t('admin.content.facts')} hint={t('admin.content.factsNote')}>
            <TextArea value={facts} onChange={(e) => setFacts(e.target.value)} />
          </Field>
          <div>
            <Button
              onClick={() =>
                void run(
                  'adminModeratePoi',
                  {
                    poiId: poi.id,
                    adminWeight: Number(weight),
                    adminFacts: facts
                      .split('\n')
                      .map((l) => l.trim())
                      .filter(Boolean),
                  },
                  (r) =>
                    Number(r['invalidated']) > 0
                      ? t('admin.content.invalidated', { count: Number(r['invalidated']) })
                      : t('admin.content.saved'),
                )
              }
            >
              {t('admin.content.save')}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export default function ContentPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
