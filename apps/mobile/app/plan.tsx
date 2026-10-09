import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, TextInput, View } from 'react-native';
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
import { ChoiceRows, ListGroup, ListRow } from '../src/components/ListGroup';
import { CurationProgress } from '../src/components/curation-progress';
import { TuuSays } from '../src/components/TuuSays';
import { interestOf } from '../src/components/StopCards';
import { Text } from '../src/components/Text';
import { TuurMap } from '../src/components/TuurMap';
import { usePoiPool } from '../src/hooks/usePoiPool';
import { formatDurationShort } from '../src/format';
import { roundPosition } from '../src/location/privacy';
import { usePosition } from '../src/location/usePosition';
import { haptics } from '../src/motion';
import { useSettings } from '../src/state/settings';
import { metrics, sys } from '../src/theme';

const TIMES = [30, 60, 90, 120, 180];

/**
 * Your route (spec 5.2, live preview per UX audit D49): the map shows the curated route while you change time,
 * travel mode, interests or destination. Curation confirms the street route before review, start or download.
 */
export default function Plan() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backend = useBackend();
  const { language, interests: savedInterests } = useSettings();
  const { position, request } = usePosition();
  const gate = useSessionGate('planned', position);
  const [minutes, setMinutes] = useState(60);
  const [profile, setProfile] = useState<RoutingProfile>('foot-walking');
  const [interests, setInterests] = useState<Interest[]>(savedInterests);
  const [destination, setDestination] = useState<Poi | undefined>();
  const [pickDest, setPickDest] = useState(false);
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [requiredStopIds, setRequiredStopIds] = useState<string[]>([]);
  const [excludedStopIds, setExcludedStopIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const activeRequest = useRef(0);
  const inFlight = useRef(false);
  const scroll = useRef<ScrollView>(null);
  useEffect(
    () => () => {
      activeRequest.current++;
    },
    [],
  );
  const {
    pool,
    ready,
    revision,
    error: areaError,
    reload: reloadArea,
  } = usePoiPool(position, minutes >= 120 ? 2 : 1);
  const pois = useMemo(() => {
    // The pool is mutable; its revision publishes each refreshed snapshot.
    void revision;
    return pool.all();
  }, [pool, revision]);
  const top = useMemo(
    () =>
      ready
        ? [...pois]
            .filter((p) => p.accessible && !p.hidden)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
        : [],
    [ready, pois],
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
            pois,
            requiredStopIds,
            excludedStopIds,
            maxCandidates: 25,
          })
        : undefined,
    [ready, position, destination, minutes, profile, interests, pois, requiredStopIds, excludedStopIds],
  );

  const curate = async () => {
    if (inFlight.current || !preview || !position || !gate.require()) return;
    inFlight.current = true;
    const requestId = ++activeRequest.current;
    setBusy(true);
    scroll.current?.scrollTo({ y: 0, animated: false });
    setPickDest(false);
    setError(undefined);
    try {
      const res = await backend.composePlannedRoute({
        stops: preview.stops.map((s) => s.id),
        ...(preview.candidateIds ? { candidateIds: preview.candidateIds } : {}),
        requiredStopIds,
        start: roundPosition(position),
        ...(destination ? { end: destination.location } : {}),
        roundTrip: !destination,
        budgetMinutes: minutes,
        profile,
        lang: language,
        interests,
      });
      if (requestId !== activeRequest.current) return;
      haptics.select();
      router.push({
        pathname: '/tour/[id]',
        params: { id: res.tour.id, curated: '1', adjusted: String(res.dropped.length) },
      });
    } catch (e) {
      if (requestId !== activeRequest.current) return;
      haptics.warning();
      setError(
        e instanceof BackendError && e.code === 'network' ? t('errors.network') : t('curation.failed'),
      );
    } finally {
      if (requestId === activeRequest.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };

  const routePoints = preview
    ? [
        ...(position ? [position] : []),
        ...preview.stops.map((s) => s.location),
        ...(destination ? [destination.location] : position ? [position] : []),
      ]
    : [];
  const visibleStops = preview?.stops ?? pois.filter((p) => requiredStopIds.includes(p.id));
  const additions = ready
    ? pois
        .filter(
          (p) =>
            p.accessible &&
            !p.hidden &&
            !visibleStops.some((s) => s.id === p.id) &&
            p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
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
  const cta = t('plan.curateRoute');

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1, backgroundColor: sys.grouped }}>
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
            if (busy || !pickDest) return;
            const p = top.find((x) => x.id === id);
            if (!p) return;
            haptics.select();
            setDestination(p);
            setPickDest(false);
          }}
        />
        <View style={{ position: 'absolute', top: insets.top + 8, left: metrics.margin }}>
          <IconButton
            icon="arrow-left"
            label={t('common.back')}
            onPress={() => {
              activeRequest.current++;
              router.back();
            }}
            onMap
          />
        </View>
      </View>

      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{
          marginTop: -28,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderCurve: 'continuous',
          backgroundColor: sys.background,
        }}
        contentContainerStyle={{ padding: 20, paddingTop: 24, gap: 24, paddingBottom: insets.bottom + 160 }}
      >
        {busy ? (
          <CurationProgress
            title={t('curation.title')}
            detail={t('curation.connectingDetail')}
            stages={[
              { id: 'places', label: t('curation.placesSelected'), state: 'complete' },
              { id: 'route', label: t('curation.connecting'), state: 'active' },
              { id: 'ready', label: t('curation.review'), state: 'pending' },
            ]}
          />
        ) : (
          <>
            <View style={{ gap: 12 }}>
              <Text variant="title" accessibilityRole="header">
                {t('plan.title')}
              </Text>
              {ready ? <TuuSays pose="map" size={56} tipId="plan.intro" text={t('tuu.planIntro')} /> : null}
            </View>
            {!position ? (
              <Button
                variant="tinted"
                icon="map-pin"
                label={t('home.enableLocation')}
                onPress={() => void request()}
              />
            ) : null}
            {position && !ready ? (
              <CurationProgress
                title={t('curation.finding')}
                detail={t('curation.findingDetail')}
                stages={[
                  { id: 'places', label: t('curation.finding'), state: 'active' },
                  { id: 'picks', label: t('curation.makeItYours'), state: 'pending' },
                ]}
              />
            ) : null}
            {areaError && !preview ? (
              <View style={{ gap: 12 }}>
                <Banner tone="warning" text={t('curation.areaFailed')} />
                <Button variant="tinted" label={t('common.retry')} onPress={reloadArea} />
              </View>
            ) : null}
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
                choices={INTERESTS.map((i) => ({ id: i, label: t(`interests.${i}`), interest: i }))}
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
            <Section title={t('plan.stopsTitle')}>
              <Text variant="subheadline">{t('plan.editHint')}</Text>
              {visibleStops.length ? (
                <ListGroup>
                  {visibleStops.map((p, i) => (
                    <ListRow
                      key={p.id}
                      icon="minus-circle"
                      label={`${i + 1}. ${p.name}`}
                      interest={interestOf(p)}
                      hint={requiredStopIds.includes(p.id) ? t('plan.yourPick') : undefined}
                      onPress={() => {
                        setRequiredStopIds((ids) => ids.filter((id) => id !== p.id));
                        setExcludedStopIds((ids) => [...ids, p.id]);
                      }}
                    />
                  ))}
                </ListGroup>
              ) : null}
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('plan.addStop')}
                accessibilityLabel={t('plan.addStop')}
                placeholderTextColor={sys.labelSecondary}
                style={{
                  minHeight: 48,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: sys.fill,
                  color: sys.label,
                  fontSize: 17,
                }}
              />
              {additions.length ? (
                <ListGroup>
                  {additions.map((p) => (
                    <ListRow
                      key={p.id}
                      icon="plus-circle"
                      label={p.name}
                      onPress={() => {
                        setRequiredStopIds((ids) => [...new Set([...ids, p.id])]);
                        setExcludedStopIds((ids) => ids.filter((id) => id !== p.id));
                        setSearch('');
                        haptics.select();
                      }}
                    />
                  ))}
                </ListGroup>
              ) : ready ? (
                <Text variant="footnote">{t('plan.noMatches')}</Text>
              ) : null}
              {requiredStopIds.length > 0 && !preview ? (
                <Banner tone="warning" text={t('plan.picksOverBudget')} />
              ) : null}
              <Text variant="footnote">{t('plan.exploreHint')}</Text>
            </Section>
            {ready && position && !preview ? <Banner tone="warning" text={t('plan.noRoute')} /> : null}
            {error ? <Banner tone="warning" text={error} /> : null}
            <Text variant="caption">{t('plan.privacy')}</Text>
          </>
        )}
      </ScrollView>

      <FloatingAction>
        {preview && !busy ? (
          <Text variant="footnote" align="center" style={{ paddingTop: 6 }}>
            {t('plan.estimate')}
          </Text>
        ) : !busy && position && !ready ? (
          <Text variant="footnote" align="center" style={{ paddingTop: 6 }}>
            {t('plan.waitArea')}
          </Text>
        ) : null}
        <Button
          label={busy ? t('curation.title') : cta}
          icon="map"
          loading={busy}
          disabled={!preview}
          onPress={() => void curate()}
        />
      </FloatingAction>
    </KeyboardAvoidingView>
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
