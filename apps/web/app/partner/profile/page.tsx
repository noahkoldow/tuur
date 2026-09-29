'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { PARTNER_CATEGORIES, PoiSchema, type LatLng, type Poi } from '@tuur/shared';
import { callFn, fb, type CallError } from '@/lib/firebase';
import { useT } from '@/lib/i18n';
import { geocodeAddress, nearbyPois, searchTiles, type GeocodeHit } from '@/lib/nearby';
import { usePartner } from '@/lib/partnerData';
import { Button, Card, Field, Input, Loading, Notice, Select, TextArea } from '@/components/ui';

type Link = { poiId: string } | { newPoi: { name: string; location: LatLng } } | undefined;

export default function ProfilePage() {
  const { t } = useT();
  const partner = usePartner();
  const [form, setForm] = useState({
    name: '',
    category: 'cafe',
    address: '',
    countryCode: 'DE',
    openingHours: '',
    description: '',
    website: '',
  });
  const [terms, setTerms] = useState(false);
  const [link, setLink] = useState<Link>();
  const [linkedName, setLinkedName] = useState<string | undefined>();
  const [hits, setHits] = useState<GeocodeHit[] | undefined>();
  const [center, setCenter] = useState<
    { hit: GeocodeHit; pois: ReturnType<typeof nearbyPois> } | undefined
  >();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | undefined>();

  // fill the form once from the stored profile
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (partner === undefined || filled) return;
    setFilled(true);
    if (!partner) return;
    setForm({
      name: partner.name,
      category: partner.category,
      address: partner.address,
      countryCode: partner.countryCode,
      openingHours: partner.openingHours,
      description: partner.description,
      website: partner.website ?? '',
    });
    setTerms(Boolean(partner.termsAcceptedAt));
    if (partner.poiProposal) setLinkedName(partner.poiProposal.name);
  }, [partner, filled]);

  useEffect(() => {
    if (!partner?.poiId) return;
    let cancelled = false;
    void getDoc(doc(fb().db, 'pois', partner.poiId)).then((s) => {
      const p = s.exists() ? PoiSchema.safeParse(s.data()) : undefined;
      if (!cancelled && p?.success) setLinkedName(p.data.name);
    });
    return () => {
      cancelled = true;
    };
  }, [partner?.poiId]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const search = async () => {
    setCenter(undefined);
    setHits(await geocodeAddress(form.address).catch(() => []));
  };

  const pick = async (hit: GeocodeHit) => {
    const tiles = searchTiles(hit.location);
    const pois: Poi[] = [];
    const snap = await getDocs(
      query(collection(fb().db, 'pois'), where('tile', 'in', tiles), where('hidden', '==', false)),
    );
    for (const d of snap.docs) {
      const p = PoiSchema.safeParse(d.data());
      if (p.success) pois.push(p.data);
    }
    setCenter({ hit, pois: nearbyPois(pois, hit.location, 350, partner?.id) });
    setHits(undefined);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!partner && !terms) return setMsg({ tone: 'error', text: t('profile.needTerms') });
    if (!partner && !link) return setMsg({ tone: 'error', text: t('profile.needPoi') });
    setBusy(true);
    setMsg(undefined);
    try {
      await callFn('savePartnerProfile', {
        ...form,
        website: form.website || undefined,
        imageUrls: [],
        ...(link ? { link } : {}),
        ...(terms ? { acceptTerms: true } : {}),
      });
      setMsg({ tone: 'success', text: t('common.saved') });
    } catch (err) {
      const c = err as CallError;
      setMsg({ tone: 'error', text: c.reason === 'terms' ? t('profile.needTerms') : t('common.error') });
    } finally {
      setBusy(false);
    }
  };

  if (partner === undefined) return <Loading label={t('common.loading')} />;

  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <h1>{t('profile.title')}</h1>
      <Notice>{t('partner.contentNote')}</Notice>
      <Card>
        <div className="grid2">
          <Field label={t('profile.name')}>
            <Input required maxLength={80} value={form.name} onChange={set('name')} />
          </Field>
          <Field label={t('profile.category')}>
            <Select value={form.category} onChange={set('category')}>
              {PARTNER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`profile.cat.${c}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('profile.address')}>
            <Input required maxLength={200} value={form.address} onChange={set('address')} />
          </Field>
          <Field label={t('profile.country')}>
            <Input
              required
              minLength={2}
              maxLength={2}
              value={form.countryCode}
              onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value.toUpperCase() }))}
            />
          </Field>
        </div>
        <Field label={t('profile.hours')}>
          <Input maxLength={300} value={form.openingHours} onChange={set('openingHours')} />
        </Field>
        <Field label={t('profile.description')} hint={t('profile.descriptionHint')}>
          <TextArea required maxLength={600} value={form.description} onChange={set('description')} />
        </Field>
        <Field label={t('profile.website')}>
          <Input type="url" maxLength={200} value={form.website} onChange={set('website')} />
        </Field>
      </Card>

      <Card title={t('profile.poiTitle')}>
        <p className="muted">{t('profile.poiHint')}</p>
        {linkedName && !link ? (
          <Notice tone="success">
            {partner?.poiId
              ? t('profile.linked', { name: linkedName })
              : t('profile.proposal', { name: linkedName })}
          </Notice>
        ) : null}
        {link ? (
          <Notice tone="success">
            {'poiId' in link
              ? t('profile.linked', { name: linkedName ?? link.poiId })
              : t('profile.proposal', { name: link.newPoi.name })}
          </Notice>
        ) : null}
        <div className="row">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void search()}
            disabled={form.address.length < 3}
          >
            {t('profile.search')}
          </Button>
        </div>
        {hits ? (
          hits.length === 0 ? (
            <p className="muted">{t('profile.noResults')}</p>
          ) : (
            <ul className="list">
              {hits.map((h) => (
                <li key={h.label}>
                  <span>{h.label}</span>
                  <Button type="button" variant="ghost" onClick={() => void pick(h)}>
                    {t('profile.pick')}
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {center ? (
          <div className="stack">
            <h3>{t('profile.nearby')}</h3>
            <ul className="list">
              {center.pois.map(({ poi, distanceM }) => (
                <li key={poi.id}>
                  <span>
                    {poi.name} <span className="muted">· {distanceM} m</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setLink({ poiId: poi.id });
                      setLinkedName(poi.name);
                    }}
                  >
                    {t('profile.pick')}
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLink({
                  newPoi: {
                    name: form.name || center.hit.label.split(',')[0]!,
                    location: center.hit.location,
                  },
                });
                setLinkedName(undefined);
              }}
            >
              {t('profile.createHere')}
            </Button>
          </div>
        ) : null}
      </Card>

      {!partner ? (
        <label className="check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>{t('profile.terms')}</span>
        </label>
      ) : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <div>
        <Button type="submit" busy={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  );
}
