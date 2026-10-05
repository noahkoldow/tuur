import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, Share, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { CITY_BADGES, decodePolyline, earnedBadges, summarizeWalk } from '@tuur/shared';
import { Button, IconButton, Row } from '../../src/components/Button';
import { FloatingAction } from '../../src/components/FloatingAction';
import { Icon } from '../../src/components/Icon';
import { ListGroup, ListRow } from '../../src/components/ListGroup';
import { Mascot } from '../../src/components/Mascot';
import { TuuSays } from '../../src/components/TuuSays';
import { Text } from '../../src/components/Text';
import { TuurMap } from '../../src/components/TuurMap';
import { StopInfoSheet } from '../../src/components/stop-info-sheet';
import { formatKm } from '../../src/format';
import { goHome } from '../../src/navigation';
import { useHistory } from '../../src/state/history';
import { useSettings } from '../../src/state/settings';
import { metrics, sys } from '../../src/theme';
import { ActivityShareCard } from '../../src/sharing/ActivityShareCard';
import { useActivityPhotos } from '../../src/sharing/use-activity-photos';

const formatDuration = (ms: number, lang: string) => {
  const min = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}:${String(m).padStart(2, '0')} h` : new Intl.NumberFormat(lang).format(m) + ' min';
};

/**
 * Tour summary (owner request 2026-10-01, Strava-like): map of the walked line, the numbers, the stops and a new
 * badge if one was earned. "Share" renders the visible route/stats card, optionally with activity photos
 * after explicit opt-in. Photo selections are local to this screen; only the exported card is shared.
 */
export default function Summary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SummaryContent key={id} id={id} />;
}

function SummaryContent({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lang = useSettings((s) => s.language);
  const records = useHistory((s) => s.records);
  const record = records.find((r) => r.id === id);
  const card = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<'shareError' | 'photoSettingsError'>();
  const shareInFlight = useRef(false);
  const shareGeneration = useRef(0);
  const { state: photos, selection, canShare } = useActivityPhotos(record);
  useEffect(
    () => () => {
      shareGeneration.current++;
    },
    [record?.id],
  );
  const [selectedStopId, setSelectedStopId] = useState<string>();
  const selectedStop = record?.stops.find((stop) => stop.id === selectedStopId);

  const stats = useMemo(
    () =>
      record
        ? summarizeWalk(
            record.track,
            record.stopsVisited,
            record.startedAt,
            record.endedAt,
            record.trackTotals,
          )
        : undefined,
    [record],
  );
  // a badge is new when this tour created it or moved it up a tier
  const newBadge = useMemo(() => {
    if (!record) return undefined;
    const before = new Map(
      earnedBadges(
        records.filter((r) => r.id !== record.id),
        CITY_BADGES,
      ).map((b) => [b.cityId, b]),
    );
    const after = earnedBadges(records, CITY_BADGES);
    const b = after.find((x) => before.get(x.cityId)?.tier !== x.tier);
    const city = b ? CITY_BADGES.find((c) => c.id === b.cityId) : undefined;
    return b && city ? { ...b, city } : undefined;
  }, [record, records]);

  if (!record || !stats) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <Mascot pose="relax" size={120} />
        <Text variant="heading" align="center">
          {t('summary.missing')}
        </Text>
        <Button label={t('player.backHome')} onPress={() => goHome(router)} />
      </View>
    );
  }

  const line =
    record.track.length > 1
      ? record.track
      : record.path
        ? decodePolyline(record.path).map(([lat, lng]) => ({ lat, lng }))
        : [];
  const title = record.title ?? t(`summary.mode_${record.mode}`);
  const date = new Date(record.startedAt).toLocaleDateString(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const facts = [
    {
      icon: 'map-marker-distance' as const,
      label: t('summary.distance'),
      value: `${formatKm(stats.distanceM, lang)} km`,
    },
    {
      icon: 'timer-outline' as const,
      label: t('summary.duration'),
      value: formatDuration(stats.durationMs, lang),
    },
    {
      icon: 'speedometer' as const,
      label: t('summary.pace'),
      value: stats.paceMinPerKm
        ? `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(stats.paceMinPerKm)} min/km`
        : '–',
    },
    { icon: 'map-marker-check-outline' as const, label: t('summary.stops'), value: String(stats.stops) },
  ];

  const share = async () => {
    if (shareInFlight.current || !canShare) return;
    shareInFlight.current = true;
    const generation = shareGeneration.current;
    const current = () =>
      generation === shareGeneration.current && useHistory.getState().records.some((r) => r.id === record.id);
    setSharing(true);
    setShareError(undefined);
    let capture: string | undefined;
    let shared = false;
    try {
      const message = t('summary.shareText', {
        title,
        km: formatKm(stats.distanceM, lang),
        stops: stats.stops,
      });
      if (Platform.OS !== 'web' && card.current && (await Sharing.isAvailableAsync())) {
        if (!(await selection.revalidate()) || !current() || !selection.canShare()) return;
        const capturedPhotos = selection.getSnapshot().photos;
        // Let the latest image/layout changes commit before taking the visible preview's snapshot.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        if (!current() || !selection.canShare() || selection.getSnapshot().photos !== capturedPhotos) return;
        capture = await captureRef(card, { format: 'png', quality: 1, width: 1080 });
        if (!current() || !selection.canShare() || selection.getSnapshot().photos !== capturedPhotos) return;
        await Sharing.shareAsync(capture, { mimeType: 'image/png', dialogTitle: message, UTI: 'public.png' });
        shared = true;
      } else {
        if (!current()) return;
        if (photos.photos.length) throw new Error('Image sharing unavailable');
        await Share.share({ message });
      }
    } catch {
      if (current()) setShareError('shareError');
    } finally {
      // Android recipients may still read the temporary file after the chooser closes.
      if (capture && (!shared || Platform.OS !== 'android')) releaseCapture(capture);
      shareInFlight.current = false;
      if (current()) setSharing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerBackVisible: false,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: sys.grouped },
          headerLeft: () => <IconButton icon="x" label={t('common.close')} onPress={() => goHome(router)} />,
        }}
      />
      <ScrollView
        testID="activity-summary-scroll"
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        removeClippedSubviews={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        {/* A single scroll surface lets the map leave the viewport along with the summary header. */}
        <View testID="activity-summary-map" style={{ height: 300 }}>
          <TuurMap
            center={line[0] ?? record.center}
            route={line}
            fit={[...line, ...record.stops.map((s) => s.location)]}
            bottomInset={0}
            locateButton={false}
            scrollEnabled={false}
            onStopPress={setSelectedStopId}
            stops={record.stops.map((s, i) => ({
              id: s.id,
              location: s.location,
              number: i + 1,
              state: 'visited',
            }))}
          />
        </View>
        <View
          style={{
            marginTop: -28,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderCurve: 'continuous',
            backgroundColor: sys.grouped,
            padding: metrics.margin,
            paddingTop: 24,
            gap: 20,
          }}
        >
          <View style={{ gap: 2 }}>
            <Text variant="footnote">{date}</Text>
            <Text variant="title1" accessibilityRole="header">
              {title}
            </Text>
          </View>
          {/* the badge card below already has Tuu celebrating; otherwise Tuu cheers here */}
          {newBadge ? null : <TuuSays pose="celebrate" size={64} text={t('tuu.summary')} />}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {facts.map((f) => (
              <View
                key={f.label}
                accessible
                accessibilityLabel={`${f.label}: ${f.value}`}
                style={{
                  flexBasis: '47%',
                  flexGrow: 1,
                  padding: 14,
                  gap: 4,
                  borderRadius: metrics.radius.card,
                  borderCurve: 'continuous',
                  backgroundColor: sys.elevated,
                }}
              >
                <Icon name={f.icon} size={20} color={sys.labelSecondary} />
                <Text variant="title2">{f.value}</Text>
                <Text variant="footnote">{f.label}</Text>
              </View>
            ))}
          </View>

          {newBadge ? (
            <Row
              gap={12}
              style={{
                padding: 14,
                borderRadius: metrics.radius.card,
                borderCurve: 'continuous',
                backgroundColor: sys.elevated,
              }}
            >
              <Mascot pose="celebrate" size={72} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subheadline" style={{ color: sys.accentText, fontWeight: '600' }}>
                  {t('summary.newBadge')}
                </Text>
                <Text variant="headline">
                  {lang === 'de' ? newBadge.city.names.de : newBadge.city.names.en}
                </Text>
                <Text variant="footnote">
                  {t(`profile.tier${newBadge.tier[0]!.toUpperCase()}${newBadge.tier.slice(1)}`)}
                </Text>
              </View>
            </Row>
          ) : null}

          {record.stops.length ? (
            <ListGroup title={t('summary.stopsTitle')}>
              {record.stops.map((s, i) => (
                <ListRow key={s.id} label={`${i + 1}. ${s.name}`} onPress={() => setSelectedStopId(s.id)} />
              ))}
            </ListGroup>
          ) : null}

          {/* the picture that is shared (also visible, so people see what they share) */}
          <Text variant="footnote" style={{ textTransform: 'uppercase', paddingHorizontal: metrics.margin }}>
            {t('summary.cardTitle')}
          </Text>
          {Platform.OS !== 'web' && record.endedAt != null ? (
            <View style={{ gap: 10 }}>
              <Text variant="footnote">{t('summary.photosHint')}</Text>
              <Button
                label={t(photos.photos.length ? 'summary.refreshPhotos' : 'summary.addPhotos')}
                icon="image"
                variant="secondary"
                loading={photos.status === 'loading'}
                disabled={sharing || photos.checking}
                onPress={() => void selection.load()}
              />
              {photos.status === 'loading' || photos.photos.length ? (
                <Button
                  label={t('summary.withoutPhotos')}
                  variant="ghost"
                  disabled={sharing}
                  onPress={selection.clear}
                />
              ) : null}
              {photos.status === 'empty' ||
              photos.status === 'denied' ||
              photos.status === 'error' ||
              photos.status === 'unavailable' ? (
                <Text variant="footnote" selectable accessibilityLiveRegion="polite">
                  {t(`summary.photos_${photos.status}`)}
                </Text>
              ) : null}
              {photos.limited ? <Text variant="footnote">{t('summary.photosLimited')}</Text> : null}
              {(photos.status === 'denied' && !photos.canAskAgain) || photos.limited ? (
                <Button
                  label={t('summary.photoSettings')}
                  variant="ghost"
                  disabled={sharing}
                  onPress={() => void Linking.openSettings().catch(() => setShareError('photoSettingsError'))}
                />
              ) : null}
              {photos.failed ? (
                <Text variant="footnote" selectable accessibilityLiveRegion="polite">
                  {t('summary.photosFailed')}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View collapsable={false} ref={card}>
            <ActivityShareCard
              record={record}
              line={line}
              title={title}
              date={date}
              facts={facts}
              photos={photos.photos}
              onPhotoLoad={(photoId) => {
                const photo = photos.photos.find((item) => item.id === photoId);
                if (photo && selection.getSnapshot().photos.includes(photo)) selection.displayed(photoId);
              }}
              onPhotoError={(photoId) => {
                const photo = photos.photos.find((item) => item.id === photoId);
                if (photo && selection.getSnapshot().photos.includes(photo)) selection.remove(photoId, true);
              }}
            />
          </View>
          {photos.photos.length ? (
            <View style={{ gap: 6 }}>
              <Text variant="footnote">{t('summary.photosReview')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {photos.photos.map((photo, index) => (
                  <Button
                    key={photo.id}
                    label={t('summary.removePhoto', { number: index + 1 })}
                    icon="x"
                    variant="secondary"
                    size="regular"
                    disabled={sharing}
                    onPress={() => selection.remove(photo.id)}
                  />
                ))}
              </View>
              {!canShare ? (
                <Text variant="footnote" accessibilityLiveRegion="polite">
                  {t('summary.photosPreparing')}
                </Text>
              ) : null}
            </View>
          ) : null}
          {shareError ? (
            <Text variant="footnote" selectable accessibilityLiveRegion="polite">
              {t(`summary.${shareError}`)}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      <FloatingAction>
        <Button
          label={t('summary.share')}
          icon="share"
          loading={sharing}
          disabled={!canShare}
          onPress={() => void share()}
        />
      </FloatingAction>
      <StopInfoSheet stop={selectedStop} onDismiss={() => setSelectedStopId(undefined)} />
    </View>
  );
}
