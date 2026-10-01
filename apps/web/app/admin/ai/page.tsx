'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { AiConfigSchema, DEFAULT_AI_CONFIG, type AiConfig } from '@tuur/shared';
import { callFn, fb } from '@/lib/firebase';
import { useT } from '@/lib/i18n';
import { Button, Card, Field, Input, Loading, Notice } from '@/components/ui';

export default function AiPage() {
  const { t } = useT();
  const [cfg, setCfg] = useState<AiConfig | undefined>();
  const [draft, setDraft] = useState<AiConfig | undefined>();
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      onSnapshot(doc(fb().db, 'config', 'ai'), (s) => {
        const p = AiConfigSchema.safeParse({
          ...DEFAULT_AI_CONFIG,
          ...s.data(),
          models: { ...DEFAULT_AI_CONFIG.models, ...s.data()?.['models'] },
          pricing: { ...DEFAULT_AI_CONFIG.pricing, ...s.data()?.['pricing'] },
          rateLimits: { ...DEFAULT_AI_CONFIG.rateLimits, ...s.data()?.['rateLimits'] },
        });
        const next = p.success ? p.data : DEFAULT_AI_CONFIG;
        setCfg(next);
        setDraft((d) => d ?? next);
      }),
    [],
  );

  if (!cfg || !draft) return <Loading label={t('common.loading')} />;
  const num = (v: string) => (v === '' ? 0 : Number(v));

  const save = async () => {
    setBusy(true);
    setMsg(undefined);
    try {
      await callFn('adminSaveAiConfig', {
        models: draft.models,
        promptVersion: draft.promptVersion,
        groundingEnabled: draft.groundingEnabled,
        killSwitch: draft.killSwitch,
        dailyBudgetUsd: draft.dailyBudgetUsd,
        areaDailyBudgetUsd: draft.areaDailyBudgetUsd,
        rateLimits: draft.rateLimits,
        pricing: draft.pricing,
      });
      setMsg({ tone: 'success', text: t('admin.ai.saved') });
    } catch {
      setMsg({ tone: 'error', text: t('common.error') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h1>{t('admin.ai.title')}</h1>
      <p className="muted">{t('admin.ai.hint')}</p>
      <Notice tone="warning">{t('admin.ai.verify')}</Notice>
      <Card title={t('admin.ai.models')}>
        {(['narration', 'lite', 'tts'] as const).map((k) => (
          <Field key={k} label={t(`admin.ai.${k}`)}>
            <Input
              value={draft.models[k]}
              onChange={(e) => setDraft({ ...draft, models: { ...draft.models, [k]: e.target.value } })}
              spellCheck={false}
            />
          </Field>
        ))}
        <Field label={t('admin.ai.promptVersion')}>
          <Input
            value={draft.promptVersion}
            maxLength={40}
            onChange={(e) => setDraft({ ...draft, promptVersion: e.target.value })}
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.groundingEnabled}
            onChange={(e) => setDraft({ ...draft, groundingEnabled: e.target.checked })}
          />
          <span>{t('admin.ai.grounding')}</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.killSwitch}
            onChange={(e) => setDraft({ ...draft, killSwitch: e.target.checked })}
          />
          <span>{t('admin.ai.kill')}</span>
        </label>
      </Card>
      <Card title={t('admin.ai.budgets')}>
        <div className="grid2">
          <Field label={t('admin.ai.daily')}>
            <Input
              type="number"
              min={0}
              step={1}
              value={draft.dailyBudgetUsd}
              onChange={(e) => setDraft({ ...draft, dailyBudgetUsd: num(e.target.value) })}
            />
          </Field>
          <Field label={t('admin.ai.area')}>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={draft.areaDailyBudgetUsd}
              onChange={(e) => setDraft({ ...draft, areaDailyBudgetUsd: num(e.target.value) })}
            />
          </Field>
        </div>
        <h3>{t('admin.ai.limits')}</h3>
        <div className="grid3">
          {(
            [
              ['perUserPerHour', 'admin.ai.perUser'],
              ['perAreaPerHour', 'admin.ai.perArea'],
              ['downloadPerUserPerHour', 'admin.ai.download'],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={t(label)}>
              <Input
                type="number"
                min={1}
                value={draft.rateLimits[k]}
                onChange={(e) =>
                  setDraft({ ...draft, rateLimits: { ...draft.rateLimits, [k]: num(e.target.value) } })
                }
              />
            </Field>
          ))}
        </div>
      </Card>
      <Card title={t('admin.ai.pricing')}>
        <div className="grid2">
          {(Object.keys(draft.pricing) as (keyof AiConfig['pricing'])[]).map((k) => {
            // per-provider maps (e.g. ttsPerMCharsUsdByProvider) are not editable here and are saved unchanged
            const v = draft.pricing[k];
            if (typeof v !== 'number') return null;
            return (
              <Field key={k} label={t(`admin.ai.price.${k}`)}>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={v}
                  onChange={(e) =>
                    setDraft({ ...draft, pricing: { ...draft.pricing, [k]: num(e.target.value) } })
                  }
                />
              </Field>
            );
          })}
        </div>
      </Card>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <div className="row">
        <Button busy={busy} onClick={() => void save()}>
          {t('common.save')}
        </Button>
        <Button variant="ghost" onClick={() => setDraft(cfg)}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
