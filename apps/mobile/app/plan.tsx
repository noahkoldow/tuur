import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { INTERESTS, planCustomRoute, type Interest, type Poi, type RoutingProfile } from '@tuur/shared';
import { useBackend } from '../src/backend';
import { useSessionGate } from '../src/billing/useSessionGate';
import { Banner } from '../src/components/Banner';
import { Button, IconButton, Row } from '../src/components/Button';
import { Chip } from '../src/components/Chip';
import { Screen } from '../src/components/Screen';
import { SpinningMark } from '../src/components/SpinningMark';
import { Text } from '../src/components/Text';
import { TuurMap } from '../src/components/TuurMap';
import { usePoiPool } from '../src/hooks/usePoiPool';
import { startTourSession } from '../src/guide/session';
import { formatKm } from '../src/format';
import { roundPosition } from '../src/location/privacy';
import { usePosition } from '../src/location/usePosition';
import { useSettings } from '../src/state/settings';
import { colors, radii } from '../src/theme';

const TIMES = [30, 60, 90, 120, 180];

/** Planned route (spec 5.2): time, profile, interests, optional destination -> curated route with preview -> start. */
export default function Plan() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const { language, interests: savedInterests, simulator } = useSettings();
  const { position } = usePosition();
  const gate = useSessionGate('planned', position);
  const [minutes, setMinutes] = useState(60);
  const [profile, setProfile] = useState<RoutingProfile>('foot-walking');
  const [interests, setInterests] = useState<Interest[]>(savedInterests);
  const [destination, setDestination] = useState<Poi | undefined>();
  const [pickDest, setPickDest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [preview, setPreview] = useState<ReturnType<typeof planCustomRoute>>();
  const { pool, ready } = usePoiPool(position, minutes >= 120 ? 2 : 1);
  const top = ready
    ? [...pool.all()]
        .filter((p) => p.accessible && !p.hidden)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
    : [];

  const calculate = () => {
    if (!position) return;
    const route = planCustomRoute({
      start: position,
      ...(destination ? { end: destination.location } : {}),
      budgetMinutes: minutes,
      profile,
      interests,
      pois: pool.all(),
    });
    setError(route ? undefined : t('plan.noRoute'));
    setPreview(route);
    setNote(undefined);
  };

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
      if (res.dropped.length) setNote(t('plan.adjusted'));
      await startTourSession({
        tour: res.tour,
        lang: language,
        ...(interests[0] ? { interest: interests[0] } : {}),
        simulate: simulator,
        planned: true,
      });
      router.replace('/play');
    } catch (e) {
      setError((e as Error).message || t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padded={false}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
        <IconButton
          icon="arrow-left"
          label={t('common.back')}
          onPress={() => (preview ? setPreview(undefined) : router.back())}
          size={44}
        />
        <Text variant="title" accessibilityRole="header">
          {preview ? t('plan.preview') : t('plan.title')}
        </Text>
        <View style={{ width: 44 }} />
      </Row>

      {!preview ? (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 140 }}>
          <Section title={t('plan.timeTitle')}>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {TIMES.map((m) => (
                <Chip
                  key={m}
                  label={m >= 60 ? `${m / 60} h` : `${m} min`}
                  selected={minutes === m}
                  onPress={() => setMinutes(m)}
                />
              ))}
            </Row>
          </Section>
          <Section title={t('plan.modeTitle')}>
            <Row gap={8}>
              <Chip
                label={t('plan.walking')}
                selected={profile === 'foot-walking'}
                onPress={() => setProfile('foot-walking')}
              />
              <Chip
                label={t('plan.cycling')}
                selected={profile === 'cycling-regular'}
                onPress={() => setProfile('cycling-regular')}
              />
            </Row>
          </Section>
          <Section title={t('settings.interests')}>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {INTERESTS.map((i) => (
                <Chip
                  key={i}
                  label={t(`interests.${i}`)}
                  selected={interests.includes(i)}
                  onPress={() =>
                    setInterests((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))
                  }
                />
              ))}
            </Row>
          </Section>
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
              </View>
            ) : null}
          </Section>
          {!ready ? (
            <Row gap={12}>
              <SpinningMark size={36} label={t('plan.waitArea')} />
              <Text variant="caption">{t('plan.waitArea')}</Text>
            </Row>
          ) : null}
          {error ? <Banner tone="warning" text={error} /> : null}
          <Text variant="caption">{t('plan.privacy')}</Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 140 }}>
          <View style={{ height: 260 }}>
            <TuurMap
              center={preview.stops[0]!.location}
              {...(position ? { user: position } : {})}
              route={[...(position ? [position] : []), ...preview.stops.map((s) => s.location)]}
              fit={[...(position ? [position] : []), ...preview.stops.map((s) => s.location)]}
              stops={preview.stops.map((s, i) => ({
                id: s.id,
                location: s.location,
                number: i + 1,
                state: 'upcoming',
                partner: Boolean(s.partnerId),
              }))}
            />
          </View>
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            <Row gap={10} style={{ flexWrap: 'wrap' }}>
              <Fact
                label={t('tour.duration')}
                value={t('common.minutes', { count: Math.round(preview.totalMinutes) })}
              />
              <Fact
                label={t('tour.distance')}
                value={t('common.km', { value: formatKm(preview.distanceMeters, language) })}
              />
              <Fact label={t('tour.stopsTitle')} value={String(preview.stops.length)} />
            </Row>
            {note ? <Banner text={note} /> : null}
            {error ? <Banner tone="warning" text={error} /> : null}
            {preview.stops.map((s, i) => (
              <Row key={s.id} gap={12}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: colors.brand.redTint,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="label" color={colors.brand.redPressed}>
                    {i + 1}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{s.name}</Text>
                  <Text variant="caption">
                    {t('tour.walkFromPrev', { minutes: Math.round(preview.legMinutes[i] ?? 0) })}
                  </Text>
                </View>
              </Row>
            ))}
          </View>
        </ScrollView>
      )}

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 24,
          backgroundColor: colors.surface.base,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        {!preview ? (
          <Button
            label={t('plan.calculate')}
            icon="edit-3"
            disabled={!ready || !position}
            onPress={calculate}
          />
        ) : (
          <Button label={t('plan.startRoute')} icon="play" loading={busy} onPress={() => void start()} />
        )}
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: radii.md,
        backgroundColor: colors.surface.subtle,
      }}
    >
      <Text variant="caption">{label}</Text>
      <Text variant="heading">{value}</Text>
    </View>
  );
}
