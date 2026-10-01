import { useMemo, useRef, useState } from 'react';
import { Image, Platform, ScrollView, Share, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { CITY_BADGES, decodePolyline, earnedBadges, summarizeWalk, type LatLng } from '@tuur/shared';
import { Button, IconButton, Row } from '../../src/components/Button';
import { Mascot } from '../../src/components/Mascot';
import { Text } from '../../src/components/Text';
import { TuurMap } from '../../src/components/TuurMap';
import { formatKm } from '../../src/format';
import { goHome } from '../../src/navigation';
import { useHistory, type TourRecord } from '../../src/state/history';
import { useSettings } from '../../src/state/settings';
import { colors, radii, shadow } from '../../src/theme';
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
    <View style={{ flex: 1, backgroundColor: colors.surface.subtle }}>
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
        <View style={{ position: 'absolute', top: insets.top + 8, left: 16 }}>
          <IconButton icon="x" label={t('common.close')} onPress={() => goHome(router)} size={48} onMap />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 120 }}>
        <View style={{ gap: 2 }}>
          <Text variant="caption">{date}</Text>
          <Text variant="title" accessibilityRole="header">
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
                borderRadius: radii.lg,
                backgroundColor: colors.surface.base,
              }}
            >
              <MaterialCommunityIcons name={f.icon} size={20} color={colors.brand.redPressed} />
              <Text variant="title">{f.value}</Text>
              <Text variant="caption">{f.label}</Text>
            </View>
          ))}
        </View>

        {newBadge ? (
          <Row gap={12} style={{ padding: 14, borderRadius: radii.lg, backgroundColor: colors.surface.base }}>
            <Mascot pose="celebrate" size={72} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" style={{ color: colors.brand.redPressed }}>
                {t('summary.newBadge')}
              </Text>
              <Text variant="heading">{lang === 'de' ? newBadge.city.names.de : newBadge.city.names.en}</Text>
              <Text variant="caption">
                {t(`profile.tier${newBadge.tier[0]!.toUpperCase()}${newBadge.tier.slice(1)}`)}
              </Text>
            </View>
          </Row>
        ) : null}

        {record.stops.length ? (
          <View style={{ gap: 8 }}>
            <Text variant="heading">{t('summary.stopsTitle')}</Text>
            {record.stops.map((s, i) => (
              <Row key={s.id} gap={12}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.brand.redTint,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="label" color={colors.brand.redPressed}>
                    {i + 1}
                  </Text>
                </View>
                <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                  {s.name}
                </Text>
              </Row>
            ))}
          </View>
        ) : null}

        {/* the picture that is shared (also visible, so people see what they share) */}
        <Text variant="heading">{t('summary.cardTitle')}</Text>
        <View collapsable={false} ref={card}>
          <ShareCard record={record} line={line} title={title} date={date} facts={facts} />
        </View>
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          paddingBottom: insets.bottom + 16,
          gap: 8,
          backgroundColor: colors.surface.base,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Button label={t('summary.share')} icon="share" loading={sharing} onPress={() => void share()} />
        <Button variant="ghost" label={t('player.backHome')} onPress={() => goHome(router)} />
      </View>
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
        borderRadius: radii.lg,
        padding: 20,
        backgroundColor: colors.surface.base,
        gap: 12,
        ...shadow.card,
      }}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Image
          source={wordmark}
          style={{ width: 70, height: 26 }}
          resizeMode="contain"
          accessibilityLabel="tuur"
        />
        <Text variant="caption">{date}</Text>
      </Row>
      <View style={{ flex: 1 }}>
        {pts.length > 1 ? (
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Polyline
              points={line.map(project).join(' ')}
              fill="none"
              stroke={colors.brand.red}
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
                  stroke={colors.brand.red}
                  strokeWidth={1.4}
                />
              );
            })}
          </Svg>
        ) : null}
      </View>
      <Text variant="title" numberOfLines={2}>
        {title}
      </Text>
      <Row style={{ justifyContent: 'space-between' }}>
        {facts.map((f) => (
          <View key={f.label} style={{ gap: 2 }}>
            <Text variant="heading">{f.value}</Text>
            <Text variant="caption" style={{ fontSize: 11, lineHeight: 14 }}>
              {f.label}
            </Text>
          </View>
        ))}
      </Row>
    </View>
  );
}
