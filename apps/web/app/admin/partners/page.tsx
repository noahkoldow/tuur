'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, limit, orderBy, query } from 'firebase/firestore';
import { DEFAULT_PARTNER_CONFIG, PartnerSchema, PartnerPricingSchema, type Partner } from '@tuur/shared';
import { callFn, fb } from '@/lib/firebase';
import { useLive } from '@/lib/adminData';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, Field, Input, Loading, Notice, TextArea } from '@/components/ui';

export default function AdminPartners() {
  const { t } = useT();
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | undefined>();
  const partners = useLive<Partner>(
    () => query(collection(fb().db, 'partners'), orderBy('updatedAt', 'desc'), limit(200)),
    (id, d) => {
      const p = PartnerSchema.safeParse({ ...d, id });
      return p.success ? p.data : undefined;
    },
    [],
  );

  const setStatus = async (partnerId: string, status: 'approved' | 'suspended' | 'pending') => {
    setMsg(undefined);
    try {
      await callFn('setPartnerStatus', { partnerId, status });
    } catch (e) {
      const reason = (e as { code?: string }).code;
      setMsg({
        tone: 'error',
        text: reason === 'failed-precondition' ? t('profile.needPoi') : t('common.error'),
      });
    }
  };

  if (!partners) return <Loading label={t('common.loading')} />;
  const order = { pending: 0, suspended: 1, approved: 2 } as const;
  const sorted = [...partners].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <div className="stack">
      <h1>{t('admin.partners.title')}</h1>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {sorted.length === 0 ? <p className="muted">{t('admin.partners.none')}</p> : null}
      {sorted.map((p) => (
        <Card key={p.id}>
          <div className="row between">
            <h3>
              {p.name}{' '}
              <span className="muted">
                · {p.category} · {p.countryCode}
              </span>
            </h3>
            <Badge tone={p.status === 'approved' ? 'ok' : p.status === 'pending' ? 'wait' : 'bad'}>
              {t(`admin.partners.status.${p.status}`)}
            </Badge>
          </div>
          <p className="muted">{p.address}</p>
          <p>{p.description}</p>
          <p className="muted">
            {t('admin.partners.plan')}: {p.plan.active ? p.plan.tier : '–'}
            {p.poiId ? ` · ${t('admin.partners.poi')}: ${p.poiId}` : ''}
            {p.poiProposal
              ? ` · ${t('admin.partners.proposal')}: ${p.poiProposal.name} (${p.poiProposal.location.lat.toFixed(4)}, ${p.poiProposal.location.lng.toFixed(4)})`
              : ''}
          </p>
          <div className="row">
            {p.status !== 'approved' ? (
              <Button onClick={() => void setStatus(p.id, 'approved')}>{t('admin.partners.approve')}</Button>
            ) : null}
            {p.status !== 'suspended' ? (
              <Button variant="danger" onClick={() => void setStatus(p.id, 'suspended')}>
                {t('admin.partners.suspend')}
              </Button>
            ) : null}
            {p.status === 'approved' ? (
              <Button variant="ghost" onClick={() => void setStatus(p.id, 'pending')}>
                {t('admin.partners.review')}
              </Button>
            ) : null}
          </div>
        </Card>
      ))}
      <PartnerConfig />
    </div>
  );
}

const linesOfPrices = (prices: Record<'visibility' | 'offers', Record<string, string>>) =>
  (['visibility', 'offers'] as const)
    .flatMap((tier) => Object.entries(prices[tier]).map(([cur, id]) => `${tier}:${cur}=${id}`))
    .join('\n');

function PartnerConfig() {
  const { t } = useT();
  const [f, setF] = useState({
    visibility: String(DEFAULT_PARTNER_CONFIG.boost.visibility),
    offers: String(DEFAULT_PARTNER_CONFIG.boost.offers),
    cap: String(DEFAULT_PARTNER_CONFIG.boostCap),
    ttl: String(DEFAULT_PARTNER_CONFIG.tokenTtlMs / 60_000),
    dist: String(DEFAULT_PARTNER_CONFIG.maxRedeemDistanceM),
    prices: '',
    countries: 'CH=CHF, GB=GBP, US=USD',
    currency: 'EUR',
  });
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | undefined>();

  useEffect(() => {
    void getDoc(doc(fb().db, 'config', 'partners')).then((s) => {
      const d = s.data();
      if (!d) return;
      setF((cur) => ({
        visibility: String(d['boost']?.visibility ?? cur.visibility),
        offers: String(d['boost']?.offers ?? cur.offers),
        cap: String(d['boostCap'] ?? cur.cap),
        ttl: d['tokenTtlMs'] ? String(Number(d['tokenTtlMs']) / 60_000) : cur.ttl,
        dist: String(d['maxRedeemDistanceM'] ?? cur.dist),
        prices: d['pricing']?.prices ? linesOfPrices(d['pricing'].prices) : cur.prices,
        countries: d['pricing']?.currencyByCountry
          ? Object.entries(d['pricing'].currencyByCountry as Record<string, string>)
              .map(([c, v]) => `${c}=${v}`)
              .join(', ')
          : cur.countries,
        currency: d['pricing']?.defaultCurrency ?? cur.currency,
      }));
    });
  }, []);

  const save = async () => {
    setMsg(undefined);
    const prices: Record<'visibility' | 'offers', Record<string, string>> = { visibility: {}, offers: {} };
    for (const line of f.prices
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)) {
      const m = /^(visibility|offers):([A-Z]{3})=(price_[A-Za-z0-9_]+)$/.exec(line);
      if (!m) return setMsg({ tone: 'error', text: t('admin.partners.invalidPrices') });
      prices[m[1] as 'visibility' | 'offers'][m[2]!] = m[3]!;
    }
    const currencyByCountry = Object.fromEntries(
      f.countries
        .split(',')
        .map((p) => p.trim().split('='))
        .filter((p) => p.length === 2 && p[0] && p[1]) as [string, string][],
    );
    const pricing = { prices, currencyByCountry, defaultCurrency: f.currency };
    if (!PartnerPricingSchema.safeParse(pricing).success)
      return setMsg({ tone: 'error', text: t('admin.partners.invalidPrices') });
    try {
      await callFn('adminSavePartnerConfig', {
        boost: { visibility: Number(f.visibility), offers: Number(f.offers) },
        boostCap: Number(f.cap),
        tokenTtlMs: Number(f.ttl) * 60_000,
        maxRedeemDistanceM: Number(f.dist),
        pricing,
      });
      setMsg({ tone: 'success', text: t('admin.partners.saved') });
    } catch {
      setMsg({ tone: 'error', text: t('common.error') });
    }
  };

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((c) => ({ ...c, [k]: e.target.value }));
  return (
    <Card title={t('admin.partners.config')}>
      <div className="grid2">
        <Field label={t('admin.partners.boostVisibility')}>
          <Input type="number" min={0} max={30} value={f.visibility} onChange={set('visibility')} />
        </Field>
        <Field label={t('admin.partners.boostOffers')}>
          <Input type="number" min={0} max={30} value={f.offers} onChange={set('offers')} />
        </Field>
        <Field label={t('admin.partners.boostCap')}>
          <Input type="number" min={0} max={30} value={f.cap} onChange={set('cap')} />
        </Field>
        <Field label={t('admin.partners.tokenTtl')}>
          <Input type="number" min={1} max={60} value={f.ttl} onChange={set('ttl')} />
        </Field>
        <Field label={t('admin.partners.distance')}>
          <Input type="number" min={20} max={1000} value={f.dist} onChange={set('dist')} />
        </Field>
        <Field label={t('admin.partners.defaultCurrency')}>
          <Input
            maxLength={3}
            value={f.currency}
            onChange={(e) => setF((c) => ({ ...c, currency: e.target.value.toUpperCase() }))}
          />
        </Field>
      </div>
      <Field label={t('admin.partners.prices')} hint={t('admin.partners.priceHint')}>
        <TextArea value={f.prices} onChange={set('prices')} spellCheck={false} />
      </Field>
      <Field label={t('admin.partners.countries')}>
        <Input value={f.countries} onChange={set('countries')} />
      </Field>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <div>
        <Button onClick={() => void save()}>{t('common.save')}</Button>
      </div>
    </Card>
  );
}
