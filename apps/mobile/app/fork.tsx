import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { type RoutingProfile } from '@tuur/shared';
import { useBackend } from '../src/backend';
import { useSessionGate } from '../src/billing/useSessionGate';
import { Banner } from '../src/components/Banner';
import { Button, Row } from '../src/components/Button';
import { Segmented } from '../src/components/Segmented';
import { Mascot } from '../src/components/Mascot';
import { OptionCard } from '../src/components/OptionCard';
import { ScrollScreen } from '../src/components/Screen';
import { SpinningMark } from '../src/components/SpinningMark';
import { Text } from '../src/components/Text';
import { ForkController, type ForkChoice } from '../src/guide/modes';
import { startForkSession } from '../src/guide/session';
import { usePoiPool } from '../src/hooks/usePoiPool';
import { usePosition } from '../src/location/usePosition';
import { formatDurationShort } from '../src/format';
import { useSettings } from '../src/state/settings';
import { sys } from '../src/theme';

const TIMES = [60, 90, 120];

/** Crossroads (spec 5.3): choose your time, then pick the first of two suggestions; more forks follow on the way. */
export default function Fork() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const { language, interests, simulator } = useSettings();
  const { permission, position, request } = usePosition();
  const gate = useSessionGate('fork', position);
  const [minutes, setMinutes] = useState(90);
  const profile: RoutingProfile = 'foot-walking';
  const { pool, ready } = usePoiPool(position, 1);
  const [options, setOptions] = useState<ForkChoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<false | 'denied' | 'failed'>(false);

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
    setStartError(false);
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
    } catch {
      setStartError('failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('fork.title'),
          headerTransparent: true,
          headerShadowVisible: false,
        }}
      />
      <ScrollScreen>
        <Text variant="body" color={sys.labelSecondary}>
          {t('fork.intro')}
        </Text>
        <View style={{ gap: 10 }}>
          <Text variant="headline" accessibilityRole="header">
            {t('fork.timeTitle')}
          </Text>
          <Segmented
            label={t('fork.timeTitle')}
            segments={TIMES.map((m) => ({ value: m, label: formatDurationShort(m, language) }))}
            value={minutes}
            onChange={setMinutes}
          />
        </View>
        {startError ? <Banner tone="error" text={t('errors.startFailed')} /> : null}
        {!position ? (
          <View style={{ gap: 12 }}>
            <Banner
              icon="map-pin"
              text={permission === 'denied' ? t('permissions.locationDenied') : t('home.noLocation')}
            />
            <Button variant="tinted" label={t('home.enableLocation')} onPress={() => void request()} />
          </View>
        ) : !ready ? (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
            <Mascot pose="think" size={112} />
            <Row gap={10}>
              <SpinningMark size={28} label={t('plan.waitArea')} />
              <Text variant="subheadline">{t('plan.waitArea')}</Text>
            </Row>
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
            <Row gap={10}>
              <Mascot pose="point" size={48} />
              <Text variant="title3" accessibilityRole="header" style={{ flex: 1 }}>
                {t('fork.choose')}
              </Text>
            </Row>
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
      </ScrollScreen>
    </>
  );
}
