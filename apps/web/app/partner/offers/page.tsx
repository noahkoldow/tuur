'use client';

import { useState, type FormEvent } from 'react';
import { canHaveOffers, type Offer } from '@tuur/shared';
import { callFn } from '@/lib/firebase';
import { useT } from '@/lib/i18n';
import { formatDate, fromLocalInput, toLocalInput, useOffers, usePartner } from '@/lib/partnerData';
import { Badge, Button, Card, Field, Input, Loading, Notice, TextArea } from '@/components/ui';

interface Draft {
  offerId?: string;
  title: string;
  description: string;
  terms: string;
  validFrom: string;
  validUntil: string;
  dailyLimit: string;
  active: boolean;
}

const blank = (): Draft => ({
  title: '',
  description: '',
  terms: '',
  validFrom: toLocalInput(Date.now()),
  validUntil: toLocalInput(Date.now() + 30 * 86_400_000),
  dailyLimit: '',
  active: true,
});

export default function OffersPage() {
  const { t, lang } = useT();
  const partner = usePartner();
  const offers = useOffers();
  const [draft, setDraft] = useState<Draft | undefined>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | undefined>();

  if (partner === undefined || offers === undefined) return <Loading label={t('common.loading')} />;
  const allowed = Boolean(partner) && canHaveOffers(partner!, Date.now());

  const edit = (o: Offer) =>
    setDraft({
      offerId: o.id,
      title: o.title,
      description: o.description,
      terms: o.terms,
      validFrom: toLocalInput(o.validFrom),
      validUntil: toLocalInput(o.validUntil),
      dailyLimit: o.dailyLimit ? String(o.dailyLimit) : '',
      active: o.active,
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const validFrom = fromLocalInput(draft.validFrom);
    const validUntil = fromLocalInput(draft.validUntil);
    if (!(validUntil > validFrom)) return setMsg({ tone: 'error', text: t('offers.dates') });
    setBusy(true);
    setMsg(undefined);
    try {
      await callFn('saveOffer', {
        ...(draft.offerId ? { offerId: draft.offerId } : {}),
        title: draft.title,
        description: draft.description,
        terms: draft.terms,
        validFrom,
        validUntil,
        ...(draft.dailyLimit ? { dailyLimit: Number(draft.dailyLimit) } : {}),
        active: draft.active,
      });
      setDraft(undefined);
    } catch {
      setMsg({ tone: 'error', text: t('common.error') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (o: Offer) => {
    if (!confirm(t('offers.confirmDelete'))) return;
    await callFn('deleteOffer', { offerId: o.id }).catch(() =>
      setMsg({ tone: 'error', text: t('common.error') }),
    );
  };

  return (
    <div className="stack">
      <div className="row between">
        <h1>{t('offers.title')}</h1>
        {allowed && !draft ? <Button onClick={() => setDraft(blank())}>{t('offers.add')}</Button> : null}
      </div>
      {!allowed ? <Notice tone="warning">{t('offers.needPlan')}</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      {draft ? (
        <Card>
          <form className="stack" onSubmit={(e) => void submit(e)}>
            <Field label={t('offers.titleField')}>
              <Input
                required
                maxLength={80}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label={t('offers.description')}>
              <TextArea
                required
                maxLength={400}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <Field label={t('offers.terms')}>
              <Input
                maxLength={400}
                value={draft.terms}
                onChange={(e) => setDraft({ ...draft, terms: e.target.value })}
              />
            </Field>
            <div className="grid2">
              <Field label={t('offers.validFrom')}>
                <Input
                  type="datetime-local"
                  required
                  value={draft.validFrom}
                  onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })}
                />
              </Field>
              <Field label={t('offers.validUntil')}>
                <Input
                  type="datetime-local"
                  required
                  value={draft.validUntil}
                  onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t('offers.dailyLimit')}>
              <Input
                type="number"
                min={1}
                max={1000}
                value={draft.dailyLimit}
                onChange={(e) => setDraft({ ...draft, dailyLimit: e.target.value })}
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              <span>{t('offers.active')}</span>
            </label>
            <div className="row">
              <Button type="submit" busy={busy}>
                {t('common.save')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(undefined)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {offers.length === 0 && !draft ? <p className="muted">{t('offers.none')}</p> : null}
      <ul className="cards">
        {offers.map((o) => (
          <li key={o.id} className="card">
            <div className="row between">
              <h3>{o.title}</h3>
              <Badge tone={o.active ? 'ok' : 'off'}>
                {o.active ? t('common.active') : t('common.inactive')}
              </Badge>
            </div>
            <p>{o.description}</p>
            <p className="muted">
              {formatDate(o.validFrom, lang)} – {formatDate(o.validUntil, lang)}
              {o.dailyLimit ? ` · ${t('offers.perDay', { count: o.dailyLimit })}` : ''}
            </p>
            <div className="row">
              <Button variant="secondary" onClick={() => edit(o)}>
                {t('offers.edit')}
              </Button>
              <Button variant="ghost" onClick={() => void remove(o)}>
                {t('common.delete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
