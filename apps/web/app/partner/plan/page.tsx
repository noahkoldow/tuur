'use client';

import { useState } from 'react';
import { callFn, type CallError } from '@/lib/firebase';
import { useT } from '@/lib/i18n';
import { usePartner } from '@/lib/partnerData';
import { Badge, Button, Card, Loading, Notice } from '@/components/ui';

export default function PlanPage() {
  const { t } = useT();
  const partner = usePartner();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  if (partner === undefined) return <Loading label={t('common.loading')} />;
  const approved = partner?.status === 'approved';

  const go = async (
    name: 'createCheckoutSession' | 'createBillingPortalSession',
    data: object,
    id: string,
  ) => {
    setBusy(id);
    setError(undefined);
    try {
      const { url } = await callFn<object, { url: string }>(name, data);
      window.location.assign(url);
    } catch (e) {
      setError((e as CallError).code === 'unavailable' ? t('plan.unavailable') : t('common.error'));
      setBusy(undefined);
    }
  };

  const tier = partner?.plan.active ? partner.plan.tier : 'none';
  return (
    <div className="stack">
      <h1>{t('plan.title')}</h1>
      {!approved ? <Notice tone="warning">{t('plan.needApproval')}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="grid2">
        {(['visibility', 'offers'] as const).map((k) => (
          <Card key={k} title={t(`plan.${k}`)}>
            <p>{t(k === 'visibility' ? 'plan.visibilityText' : 'plan.offersText')}</p>
            {tier === k ? (
              <Badge tone="ok">{t('plan.current')}</Badge>
            ) : (
              <Button
                disabled={!approved || tier !== 'none'}
                busy={busy === k}
                onClick={() => void go('createCheckoutSession', { tier: k }, k)}
              >
                {t('plan.choose')}
              </Button>
            )}
          </Card>
        ))}
      </div>
      {partner?.plan.stripeCustomerId ? (
        <div>
          <Button
            variant="secondary"
            busy={busy === 'portal'}
            onClick={() => void go('createBillingPortalSession', {}, 'portal')}
          >
            {t('plan.manage')}
          </Button>
        </div>
      ) : null}
      <p className="muted">{t('plan.priceNote')}</p>
    </div>
  );
}
