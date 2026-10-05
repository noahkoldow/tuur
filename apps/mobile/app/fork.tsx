import { useEffect, useReducer, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { type RoutingProfile } from '@tuur/shared';
import { useBackend } from '../src/backend';
import { useSessionGate } from '../src/billing/useSessionGate';
import { Banner } from '../src/components/Banner';
import { Button, Row } from '../src/components/Button';
import { Segmented } from '../src/components/Segmented';
import { Mascot } from '../src/components/Mascot';
import { TuuSays } from '../src/components/TuuSays';
import { OptionCard } from '../src/components/OptionCard';
import { OptionCards } from '../src/components/OptionCards';
import { ScrollScreen } from '../src/components/Screen';
import { SpinningMark } from '../src/components/SpinningMark';
import { Text } from '../src/components/Text';
import { ForkController, type ForkChoice } from '../src/guide/modes';
import { startForkSession } from '../src/guide/session';
import { usePoiPool } from '../src/hooks/usePoiPool';
import { usePosition } from '../src/location/usePosition';
import { requestBackground } from '../src/location/real';
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
  const { pool, ready, revision, error: areaError, reload } = usePoiPool(position, 1);
  const [attempt, retryAttempt] = useReducer((n: number) => n + 1, 0);
  const requestKey = `${position?.lat}:${position?.lng}:${minutes}:${language}:${interests.join(',')}:${attempt}`;
  const [choices, setChoices] = useState<{
    key: string;
    phase: 'loading' | 'ready' | 'error';
    options: ForkChoice[];
  }>({ key: '', phase: 'loading', options: [] });
  const options = choices.key === requestKey ? choices.options : [];
  const choicesLoading = choices.key !== requestKey || choices.phase === 'loading';
  const choicesError = choices.key === requestKey && choices.phase === 'error';
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [locationError, setLocationError] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [waitingFailed, setWaitingFailed] = useState(false);
  const [startError, setStartError] = useState<false | 'denied' | 'failed'>(false);

  useEffect(() => {
    setWaitingFailed(false);
    if (!position || (ready && (gate.unlocked || gate.placeId))) return;
    const timer = setTimeout(() => setWaitingFailed(true), 45_000);
    return () => clearTimeout(timer);
  }, [position, ready, gate.unlocked, gate.placeId, attempt]);

  useEffect(() => {
    if (!ready || !position || !gate.unlocked) return;
    let cancelled = false;
    setChoices((current) => ({
      key: requestKey,
      phase: 'loading',
      options: current.key === requestKey ? current.options : [],
    }));
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
    // Display the places as soon as they exist; the optional teasers may take longer.
    const unsubscribe = tmp.subscribe(() => {
      if (cancelled) return;
      const snapshot = tmp.getSnapshot();
      setChoices({
        key: requestKey,
        phase: snapshot.loading ? 'loading' : 'ready',
        options: snapshot.options,
      });
    });
    const timer = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      unsubscribe();
      setChoices((current) => ({ ...current, phase: current.options.length ? 'ready' : 'error' }));
    }, 45_000);
    void tmp
      .compute(position)
      .then((o) => {
        if (!cancelled) setChoices({ key: requestKey, phase: 'ready', options: o });
      })
      .catch(() => {
        if (!cancelled) setChoices((current) => ({ ...current, phase: 'error' }));
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [ready, position, minutes, backend, pool, revision, language, interests, gate.unlocked, requestKey]);

  const retry = () => {
    retryAttempt();
    reload();
    gate.reload();
  };
  const enableLocation = async () => {
    setLocationBusy(true);
    setLocationError(false);
    try {
      if (permission === 'denied') await Linking.openSettings();
      else await request();
    } catch {
      setLocationError(true);
    } finally {
      setLocationBusy(false);
    }
  };

  const start = async (c: ForkChoice) => {
    if (!position || inFlight.current || !gate.require()) return;
    inFlight.current = true;
    setBusy(true);
    setStartError(false);
    try {
      let foregroundOnly = false;
      if (!simulator && backend.kind === 'firebase') {
        const permission = await requestBackground();
        if (permission === 'denied') return setStartError('denied');
        foregroundOnly = permission === 'foreground';
      }
      await startForkSession({
        lang: language,
        first: c.poi,
        start: position,
        pool,
        profile,
        budgetMinutes: minutes,
        interests,
        simulate: simulator,
        ...(foregroundOnly ? { foregroundOnly } : {}),
        ...(interests[0] ? { interest: interests[0] } : {}),
      });
      router.replace('/play');
    } catch {
      setStartError('failed');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('fork.title'),
          headerTransparent: false,
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
        {startError ? (
          <Banner
            tone="error"
            text={t(startError === 'denied' ? 'errors.locationDenied' : 'errors.startFailed')}
          />
        ) : null}
        {!position ? (
          <View style={{ gap: 12 }}>
            <Banner
              icon="map-pin"
              text={permission === 'denied' ? t('permissions.locationDenied') : t('home.noLocation')}
            />
            {locationError ? <Banner tone="error" text={t('errors.locationUnavailable')} /> : null}
            <Button
              variant="tinted"
              label={t(permission === 'denied' ? 'common.settings' : 'home.enableLocation')}
              loading={locationBusy}
              onPress={() => void enableLocation()}
            />
          </View>
        ) : (areaError && options.length === 0) || gate.error || waitingFailed ? (
          <View style={{ gap: 12 }}>
            <Banner tone="error" text={t('curation.areaFailed')} />
            <Button variant="tinted" label={t('common.retry')} onPress={retry} />
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
            <Button
              label={t('paywall.titleSession')}
              icon="lock"
              disabled={!gate.placeId}
              onPress={() => void gate.require()}
            />
          </View>
        ) : choicesError && options.length === 0 ? (
          <View style={{ gap: 12 }}>
            <Banner tone="error" text={t('fork.loadFailed')} />
            <Button variant="tinted" label={t('common.retry')} onPress={retry} />
          </View>
        ) : choicesLoading && options.length === 0 ? (
          <Row gap={10}>
            <SpinningMark size={28} label={t('fork.loadingChoices')} />
            <Text variant="subheadline">{t('fork.loadingChoices')}</Text>
          </Row>
        ) : options.length === 0 ? (
          <View style={{ gap: 12 }}>
            <Banner text={t('fork.none')} />
            <Button variant="tinted" label={t('common.retry')} onPress={retry} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {choicesError || areaError ? (
              <>
                <Banner tone="warning" text={t('fork.loadFailed')} />
                <Button variant="tinted" label={t('common.retry')} onPress={retry} />
              </>
            ) : null}
            <TuuSays pose="point" size={56} tipId="fork.intro" text={t('tuu.forkIntro')} />
            <Text variant="title3" accessibilityRole="header">
              {t('fork.choose')}
            </Text>
            {choicesLoading ? <Text variant="footnote">{t('fork.loadingTeasers')}</Text> : null}
            <OptionCards>
              {options.map((o) => (
                <OptionCard
                  key={o.poi.id}
                  poi={o.poi}
                  walkMinutes={o.walkMinutes}
                  teaser={o.teaser}
                  disabled={busy}
                  onPress={() => void start(o)}
                />
              ))}
            </OptionCards>
            {busy ? <Button label={t('common.loading')} onPress={() => undefined} loading /> : null}
          </View>
        )}
      </ScrollScreen>
    </>
  );
}
