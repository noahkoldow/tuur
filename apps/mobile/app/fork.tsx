import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { type RoutingProfile } from '@tuur/shared';
import { useBackend } from '../src/backend';
import { useSessionGate } from '../src/billing/useSessionGate';
import { Banner } from '../src/components/Banner';
import { Button, IconButton, Row } from '../src/components/Button';
import { Chip } from '../src/components/Chip';
import { OptionCard } from '../src/components/OptionCard';
import { Screen } from '../src/components/Screen';
import { SpinningMark } from '../src/components/SpinningMark';
import { Text } from '../src/components/Text';
import { ForkController, type ForkChoice } from '../src/guide/modes';
import { startForkSession } from '../src/guide/session';
import { usePoiPool } from '../src/hooks/usePoiPool';
import { usePosition } from '../src/location/usePosition';
import { useSettings } from '../src/state/settings';

const TIMES = [60, 90, 120];

/** Crossroads (spec 5.3): choose your time, then pick the first of two suggestions; more forks follow on the way. */
export default function Fork() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const { language, interests, simulator } = useSettings();
  const { position } = usePosition();
  const gate = useSessionGate('fork', position);
  const [minutes, setMinutes] = useState(90);
  const profile: RoutingProfile = 'foot-walking';
  const { pool, ready } = usePoiPool(position, 1);
  const [options, setOptions] = useState<ForkChoice[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !position || !gate.unlocked) return;
    let cancelled = false;
    // A throw-away controller only for computing the first options (runtime is created on start).
    const tmp = new ForkController({
      runtime: {
        getSnapshot: () => ({ user: position }),
        getState: () => ({ route: [], visited: [], skipped: [] }),
      } as never,
      backend,
      pool,
      lang: language,
      interests,
      profile,
      budgetMinutes: minutes,
      access: { mode: 'fork' },
    });
    void tmp.compute(position).then((o) => !cancelled && setOptions(o));
    return () => {
      cancelled = true;
    };
  }, [ready, position, minutes, backend, pool, language, interests, gate.unlocked]);

  const start = async (c: ForkChoice) => {
    if (!position) return;
    setBusy(true);
    try {
      await startForkSession({
        lang: language,
        first: c.poi,
        start: position,
        pool,
        profile,
        budgetMinutes: minutes,
        interests,
        simulate: simulator,
        ...(interests[0] ? { interest: interests[0] } : {}),
      });
      router.replace('/play');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
        <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} size={44} />
        <Text variant="title" accessibilityRole="header">
          {t('fork.title')}
        </Text>
        <View style={{ width: 44 }} />
      </Row>
      <ScrollView contentContainerStyle={{ gap: 18, paddingVertical: 12 }}>
        <Text variant="bodySecondary">{t('fork.intro')}</Text>
        <Text variant="heading">{t('fork.timeTitle')}</Text>
        <Row gap={8}>
          {TIMES.map((m) => (
            <Chip
              key={m}
              label={`${m / 60 >= 1 ? (m / 60).toFixed(m % 60 ? 1 : 0) + ' h' : m + ' min'}`}
              selected={minutes === m}
              onPress={() => setMinutes(m)}
            />
          ))}
        </Row>
        {!ready ? (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
            <SpinningMark size={64} label={t('plan.waitArea')} />
            <Text variant="caption">{t('plan.waitArea')}</Text>
          </View>
        ) : !gate.unlocked ? (
          <View style={{ gap: 12 }}>
            <Banner icon="lock" text={t('paywall.subtitleSession')} />
            <Button label={t('paywall.titleSession')} icon="lock" onPress={() => void gate.require()} />
          </View>
        ) : options.length === 0 ? (
          <Banner text={t('fork.none')} />
        ) : (
          <View style={{ gap: 12 }}>
            <Text variant="heading" accessibilityRole="header">
              {t('fork.choose')}
            </Text>
            <Row gap={12} style={{ alignItems: 'stretch' }}>
              {options.map((o) => (
                <OptionCard
                  key={o.poi.id}
                  poi={o.poi}
                  walkMinutes={o.walkMinutes}
                  teaser={o.teaser}
                  onPress={() => void start(o)}
                />
              ))}
            </Row>
            {busy ? <Button label={t('common.loading')} onPress={() => undefined} loading /> : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
