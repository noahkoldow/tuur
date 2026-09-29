'use client';

import { useEffect, useState } from 'react';
import { callFn } from '@/lib/firebase';
import { useT } from '@/lib/i18n';
import { usePartner } from '@/lib/partnerData';
import { Card, Loading } from '@/components/ui';

interface Stats {
  days: { day: string; impressions: number; visits: number; redemptions: number }[];
  totals: { impressions: number; visits: number; redemptions: number };
}

export default function StatsPage() {
  const { t } = useT();
  const partner = usePartner();
  const [stats, setStats] = useState<Stats | null | undefined>();

  useEffect(() => {
    if (!partner) return;
    void callFn<{ days: number }, Stats>('partnerStats', { days: 30 })
      .then(setStats)
      .catch(() => setStats(null));
  }, [partner]);

  if (partner === undefined || (partner && stats === undefined))
    return <Loading label={t('common.loading')} />;
  const max = Math.max(1, ...(stats?.days ?? []).map((d) => d.impressions + d.visits + d.redemptions));
  return (
    <div className="stack">
      <h1>{t('stats.title')}</h1>
      <p className="muted">{t('stats.hint')}</p>
      <div className="grid3">
        {(['impressions', 'visits', 'redemptions'] as const).map((k) => (
          <Card key={k} title={t(`stats.${k}`)}>
            <p className="big">{stats?.totals[k] ?? 0}</p>
          </Card>
        ))}
      </div>
      {stats && stats.days.length ? (
        <Card>
          <table className="table">
            <thead>
              <tr>
                <th>{t('stats.day')}</th>
                <th>{t('stats.impressions')}</th>
                <th>{t('stats.visits')}</th>
                <th>{t('stats.redemptions')}</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {stats.days.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td>{d.impressions}</td>
                  <td>{d.visits}</td>
                  <td>{d.redemptions}</td>
                  <td aria-hidden>
                    <span
                      className="bar"
                      style={{ width: `${((d.impressions + d.visits + d.redemptions) / max) * 100}%` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <p className="muted">{t('stats.empty')}</p>
      )}
    </div>
  );
}
