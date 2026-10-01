import { useMemo, useRef, useState } from 'react';
import { Image, Platform, ScrollView, Share, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { CITY_BADGES, decodePolyline, earnedBadges, summarizeWalk, type LatLng } from '@tuur/shared';
import { palette } from '@tuur/ui';
import { Button, IconButton, Row } from '../../src/components/Button';
import { FloatingAction } from '../../src/components/FloatingAction';
import { Icon } from '../../src/components/Icon';
import { ListGroup, ListRow } from '../../src/components/ListGroup';
import { Mascot } from '../../src/components/Mascot';
import { Text } from '../../src/components/Text';
import { TuurMap } from '../../src/components/TuurMap';
import { formatKm } from '../../src/format';
import { goHome } from '../../src/navigation';
import { useHistory, type TourRecord } from '../../src/state/history';
import { useSettings } from '../../src/state/settings';
import { metrics, sys } from '../../src/theme';
import wordmark from '../../assets/wordmark-red.png';

const formatDuration = (ms: number, lang: string) => {
  const min = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}:${String(m).padStart(2, '0')} h` : new Intl.NumberFormat(lang).format(m) + ' min';
};

/**
 * Tour summary (owner request 2026-10-01, Strava-like): map of the walked line, the numbers, the stops and a new
 * badge if one was earned. "Share" renders a picture card of the walk (line drawing, no map tiles, no exact
 * address), so nothing leaves the device unless the listener shares it.
 */
export default function Summary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lang = useSettings((s) => s.language);
  const records = useHistory((s) => s.records);
  const record = records.find((r) => r.id === id);
  const card = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const stats = useMemo(
    () =>
      record ? summarizeWalk(record.track, record.stopsVisited, record.startedAt, record.endedAt) : undefined,
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
    setSharing(true);
    try {
      const message = t('summary.shareText', {
        title,
        km: formatKm(stats.distanceM, lang),
        stops: stats.stops,
      });
      if (Platform.OS !== 'web' && card.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(card, { format: 'png', quality: 1, width: 1080 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: message, UTI: 'public.png' });
      } else {
        await Share.share({ message });
      }
    } catch {
      // the share sheet was dismissed or capturing failed; nothing to recover
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: sys.grouped }}>
      <View style={{ height: 300 }}>
        <TuurMap
          center={line[0] ?? record.center}
          route={line}
          fit={[...line, ...record.stops.map((s) => s.location)]}
          bottomInset={0}
          locateButton={false}
          stops={record.stops.map((s, i) => ({
            id: s.id,
            location: s.location,
            number: i + 1,
            state: 'visited',
          }))}
        />
        <View style={{ position: 'absolute', top: insets.top + 8, left: metrics.margin }}>
          <IconButton icon="x" label={t('common.close')} onPress={() => goHome(router)} onMap />
        </View>
      </View>
      <ScrollView
        style={{
          marginTop: -28,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderCurve: 'continuous',
          backgroundColor: sys.grouped,
        }}
        contentContainerStyle={{
          padding: metrics.margin,
          paddingTop: 24,
          gap: 20,
          paddingBottom: insets.bottom + 140,
        }}
      >
        <View style={{ gap: 2 }}>
          <Text variant="footnote">{date}</Text>
          <Text variant="title1" accessibilityRole="header">
            {title}
          </Text>
        </View>
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
              <ListRow key={s.id} label={`${i + 1}. ${s.name}`} />
            ))}
          </ListGroup>
        ) : null}

        {/* the picture that is shared (also visible, so people see what they share) */}
        <Text variant="footnote" style={{ textTransform: 'uppercase', paddingHorizontal: metrics.margin }}>
          {t('summary.cardTitle')}
        </Text>
        <View collapsable={false} ref={card}>
          <ShareCard record={record} line={line} title={title} date={date} facts={facts} />
        </View>
      </ScrollView>
      <FloatingAction>
        <Button label={t('summary.share')} icon="share" loading={sharing} onPress={() => void share()} />
      </FloatingAction>
    </View>
  );
}

function ShareCard({
  record,
  line,
  title,
  date,
  facts,
}: {
  record: TourRecord;
  line: LatLng[];
  title: string;
  date: string;
  facts: { label: string; value: string }[];
}) {
  const pts = [...line, ...record.stops.map((s) => s.location)];
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  // keep the aspect ratio of the walk (longitude shrinks with latitude)
  const kx = Math.cos(((s + n) / 2) * (Math.PI / 180));
  const spanX = Math.max((e - w) * kx, 1e-6);
  const spanY = Math.max(n - s, 1e-6);
  const scale = 88 / Math.max(spanX, spanY);
  const ox = (100 - spanX * scale) / 2;
  const oy = (100 - spanY * scale) / 2;
  const project = (p: LatLng) => `${ox + (p.lng - w) * kx * scale},${oy + (n - p.lat) * scale}`;
  return (
    <View
      style={{
        aspectRatio: 4 / 5,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        padding: 20,
        backgroundColor: palette.light.background,
        gap: 12,
      }}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Image
          source={wordmark}
          style={{ width: 70, height: 26 }}
          resizeMode="contain"
          accessibilityLabel="tuur"
        />
        <Text variant="footnote" color={palette.light.labelSecondary}>
          {date}
        </Text>
      </Row>
      <View style={{ flex: 1 }}>
        {pts.length > 1 ? (
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Polyline
              points={line.map(project).join(' ')}
              fill="none"
              stroke={palette.light.accent}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {record.stops.map((st) => {
              const [x, y] = project(st.location).split(',').map(Number);
              return (
                <Circle
                  key={st.id}
                  cx={x}
                  cy={y}
                  r={2.2}
                  fill="#FFFFFF"
                  stroke={palette.light.accent}
                  strokeWidth={1.4}
                />
              );
            })}
          </Svg>
        ) : null}
      </View>
      <Text variant="title1" numberOfLines={2} color={palette.light.label}>
        {title}
      </Text>
      <Row style={{ justifyContent: 'space-between' }}>
        {facts.map((f) => (
          <View key={f.label} style={{ gap: 2 }}>
            <Text variant="headline" color={palette.light.label}>
              {f.value}
            </Text>
            <Text variant="caption" color={palette.light.labelSecondary}>
              {f.label}
            </Text>
          </View>
        ))}
      </Row>
    </View>
  );
}
