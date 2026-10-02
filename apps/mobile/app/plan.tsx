import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INTERESTS, planCustomRoute, type Interest, type Poi, type RoutingProfile } from '@tuur/shared';
import { BackendError, useBackend } from '../src/backend';
import { useSessionGate } from '../src/billing/useSessionGate';
import { Banner } from '../src/components/Banner';
import { Button, IconButton, Row } from '../src/components/Button';
import { Chip } from '../src/components/Chip';
import { Segmented } from '../src/components/Segmented';
import { FloatingAction } from '../src/components/FloatingAction';
import { ChoiceRows, ListGroup } from '../src/components/ListGroup';
import { TuuSays } from '../src/components/TuuSays';
import { interestOf } from '../src/components/StopCards';
import { Text } from '../src/components/Text';
import { TuurMap } from '../src/components/TuurMap';
import { usePoiPool } from '../src/hooks/usePoiPool';
import { startTourSession } from '../src/guide/session';
import { formatDurationShort, formatKm } from '../src/format';
import { roundPosition } from '../src/location/privacy';
import { usePosition } from '../src/location/usePosition';
import { haptics } from '../src/motion';
import { useSettings } from '../src/state/settings';
import { metrics, sys } from '../src/theme';

const TIMES = [30, 60, 90, 120, 180];

/**
 * Your route (spec 5.2, live preview per UX audit D49): the map shows the curated route while you change time,
 * travel mode, interests or destination; one button starts it. Destinations are picked on the map or in the list.
 */
export default function Plan() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backend = useBackend();
  const { language, interests: savedInterests, simulator } = useSettings();
  const { position } = usePosition();
  const gate = useSessionGate('planned', position);
  const [minutes, setMinutes] = useState(60);
  const [profile, setProfile] = useState<RoutingProfile>('foot-walking');
  const [interests, setInterests] = useState<Interest[]>(savedInterests);
  const [destination, setDestination] = useState<Poi | undefined>();
  const [pickDest, setPickDest] = useState(false);
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { pool, ready } = usePoiPool(position, minutes >= 120 ? 2 : 1);
  const top = useMemo(
    () =>
      ready
        ? [...pool.all()]
            .filter((p) => p.accessible && !p.hidden)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
        : [],
    [ready, pool],
  );

  // pure and fast: recomputed on every change instead of a separate "calculate" step
  const preview = useMemo(
    () =>
      ready && position
        ? planCustomRoute({
            start: position,
            ...(destination ? { end: destination.location } : {}),
            budgetMinutes: minutes,
            profile,
            interests,
            pois: pool.all(),
          })
        : undefined,
    [ready, position, destination, minutes, profile, interests, pool],
  );

  const start = async () => {
    if (!preview || !position || !gate.require()) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await backend.composePlannedRoute({
        stops: preview.stops.map((s) => s.id),
        start: roundPosition(position),
        ...(destination ? { end: destination.location } : {}),
        roundTrip: !destination,
        budgetMinutes: minutes,
        profile,
        lang: language,
        interests,
      });
      await startTourSession({
        tour: res.tour,
        lang: language,
        ...(interests[0] ? { interest: interests[0] } : {}),
        simulate: simulator,
        planned: true,
      });
      haptics.start();
      router.replace('/play');
    } catch (e) {
      haptics.warning();
      setError(
        e instanceof BackendError && e.code === 'network' ? t('errors.network') : t('errors.startFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  const routePoints = preview
    ? [
        ...(position ? [position] : []),
        ...preview.stops.map((s) => s.location),
        ...(destination ? [destination.location] : position ? [position] : []),
      ]
    : [];
  const mapStops = pickDest
    ? top.map((p, i) => ({
        id: p.id,
        location: p.location,
        number: i + 1,
        state: p.id === destination?.id ? ('current' as const) : ('upcoming' as const),
        ...(interestOf(p) ? { interest: interestOf(p)! } : {}),
      }))
    : (preview?.stops ?? []).map((s, i) => ({
        id: s.id,
        location: s.location,
        number: i + 1,
        state: 'upcoming' as const,
        partner: Boolean(s.partnerId),
        ...(interestOf(s) ? { interest: interestOf(s)! } : {}),
      }));
  const cta = preview
    ? `${t('plan.startRoute')} · ${t('common.minutes', { count: Math.round(preview.totalMinutes) })} · ${formatKm(preview.distanceMeters, language)} km`
    : t('plan.startRoute');

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <View style={{ height: '46%' }}>
        <TuurMap
          center={position ?? { lat: 52.52, lng: 13.405 }}
          zoom={15}
          {...(position ? { user: position } : {})}
          route={pickDest ? [] : routePoints}
          {...(routePoints.length > 1 && !pickDest ? { fit: routePoints } : {})}
          stops={mapStops}
          locateButton={false}
          onStopPress={(id) => {
            if (!pickDest) return;
            const p = top.find((x) => x.id === id);
            if (!p) return;
            haptics.select();
            setDestination(p);
            setPickDest(false);
          }}
        />
        <View style={{ position: 'absolute', top: insets.top + 8, left: metrics.margin }}>
          <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} onMap />
        </View>
      </View>

      <ScrollView
        style={{
          marginTop: -28,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderCurve: 'continuous',
          backgroundColor: sys.background,
        }}
        contentContainerStyle={{ padding: 20, paddingTop: 24, gap: 24, paddingBottom: insets.bottom + 160 }}
      >
        <View style={{ gap: 12 }}>
          <Text variant="title" accessibilityRole="header">
            {t('plan.title')}
          </Text>
          {busy ? (
            <TuuSays pose="think" size={56} text={t('plan.tuuBuilding')} />
          ) : ready ? (
            <TuuSays pose="map" size={56} tipId="plan.intro" text={t('tuu.planIntro')} />
          ) : null}
        </View>
        <Section title={t('plan.timeTitle')}>
          <Segmented
            label={t('plan.timeTitle')}
            segments={TIMES.map((m) => ({ value: m, label: formatDurationShort(m, language) }))}
            value={minutes}
            onChange={setMinutes}
          />
        </Section>
        <Section title={t('plan.modeTitle')}>
          <Segmented
            label={t('plan.modeTitle')}
            segments={[
              { value: 'foot-walking', label: t('plan.walking') },
              { value: 'cycling-regular', label: t('plan.cycling') },
            ]}
            value={profile}
            onChange={setProfile}
          />
        </Section>
        <ListGroup>
          <ChoiceRows
            icon="heart"
            label={t('settings.interests')}
            multiple
            choices={INTERESTS.map((i) => ({ id: i, label: t(`interests.${i}`) }))}
            selected={interests}
            onChange={(next) => setInterests(next as Interest[])}
            open={interestsOpen}
            onToggle={() => setInterestsOpen((o) => !o)}
          />
        </ListGroup>
        <Section title={t('plan.destinationTitle')}>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <Chip
              label={t('plan.roundTrip')}
              selected={!destination && !pickDest}
              onPress={() => {
                setDestination(undefined);
                setPickDest(false);
              }}
            />
            <Chip
              label={destination ? destination.name : t('plan.pickDestination')}
              selected={Boolean(destination) || pickDest}
              onPress={() => setPickDest(true)}
            />
          </Row>
          {pickDest ? (
            <View style={{ gap: 8 }}>
              <Text variant="caption">{t('plan.destinationHint')}</Text>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {top.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    selected={destination?.id === p.id}
                    onPress={() => {
                      setDestination(p);
                      setPickDest(false);
                    }}
                  />
                ))}
              </Row>
            </View>
          ) : null}
        </Section>
        {ready && position && !preview ? <Banner tone="warning" text={t('plan.noRoute')} /> : null}
        {error ? <Banner tone="warning" text={error} /> : null}
        <Text variant="caption">{t('plan.privacy')}</Text>
      </ScrollView>

      <FloatingAction>
        {!preview && !busy ? (
          <Text variant="footnote" align="center" style={{ paddingTop: 6 }}>
            {t('plan.waitArea')}
          </Text>
        ) : null}
        <Button label={cta} icon="play" loading={busy} disabled={!preview} onPress={() => void start()} />
      </FloatingAction>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}
