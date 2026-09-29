'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useT } from '@/lib/i18n';
import { formatDate, usePartner } from '@/lib/partnerData';
import { Badge, Card, Loading, Notice } from '@/components/ui';

function Dashboard() {
  const { t, lang } = useT();
  const partner = usePartner();
  const checkout = useSearchParams().get('checkout');
  if (partner === undefined) return <Loading label={t('common.loading')} />;

  const status = !partner
    ? { tone: 'off' as const, label: t('partner.statusNone'), hint: t('partner.contentNote') }
    : partner.status === 'approved'
      ? { tone: 'ok' as const, label: t('partner.statusApproved'), hint: t('partner.statusHintApproved') }
      : partner.status === 'pending'
        ? { tone: 'wait' as const, label: t('partner.statusPending'), hint: t('partner.statusHintPending') }
        : {
            tone: 'bad' as const,
            label: t('partner.statusSuspended'),
            hint: t('partner.statusHintSuspended'),
          };
  const plan = partner?.plan;
  const planName =
    plan?.active && plan.tier === 'offers'
      ? t('partner.planOffers')
      : plan?.active && plan.tier === 'visibility'
        ? t('partner.planVisibility')
        : t('partner.planNone');

  return (
    <div className="stack">
      <h1>{t('partner.welcome')}</h1>
      {checkout === 'success' ? <Notice tone="success">{t('plan.success')}</Notice> : null}
      {checkout === 'cancelled' ? <Notice tone="warning">{t('plan.cancelled')}</Notice> : null}
      <div className="grid2">
        <Card title={t('partner.status')}>
          <p>
            <Badge tone={status.tone}>{status.label}</Badge>
          </p>
          <p className="muted">{status.hint}</p>
        </Card>
        <Card title={t('partner.planLabel')}>
          <p>
            <Badge tone={plan?.active ? 'ok' : 'off'}>{planName}</Badge>
          </p>
          {plan?.active && plan.currentPeriodEnd ? (
            <p className="muted">
              {t(plan.cancelAtPeriodEnd ? 'partner.planEnds' : 'partner.planRenews', {
                date: formatDate(plan.currentPeriodEnd, lang),
              })}
            </p>
          ) : null}
        </Card>
      </div>
      <Card title={t('partner.steps')}>
        <ol className="steps">
          <li>
            <Link href="/partner/profile">{t('partner.step1')}</Link>
          </li>
          <li>{t('partner.step2')}</li>
          <li>
            <Link href="/partner/plan">{t('partner.step3')}</Link>
          </li>
          <li>
            <Link href="/partner/offers">{t('partner.step4')}</Link>
          </li>
        </ol>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
