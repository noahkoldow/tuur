import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CITY_BADGES, earnedBadges, type BadgeTier, type CityBadgeDef } from '@tuur/shared';
import { useBackend } from '../src/backend';
import { IconButton, Row } from '../src/components/Button';
import { ListGroup, ListRow } from '../src/components/ListGroup';
import { Mascot, MascotTip } from '../src/components/Mascot';
import { Text } from '../src/components/Text';
import { useHistory, type TourRecord } from '../src/state/history';
import { useSettings } from '../src/state/settings';
import { colors, radii, shadow } from '../src/theme';

const TIER_COLOR: Record<BadgeTier, string> = { bronze: '#A0612B', silver: '#7D8791', gold: '#B58A00' };
const MODE_ICON: Record<TourRecord['mode'], React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  tour: 'map-outline',
  planned: 'pencil-outline',
  fork: 'source-fork',
  roam: 'compass-outline',
};

/**
 * Profile: account status, a few numbers, collected city badges and the walked tours (all kept on the device), plus
 * the way into settings, privacy and legal texts. Deliberately low-key: tuur is about walking, not scores.
 */
export default function Profile() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backend = useBackend();
  const lang = useSettings((s) => s.language);
  const records = useHistory((s) => s.records);
  const [user, setUser] = useState(backend.auth.current());
  useEffect(() => backend.auth.onChange(setUser), [backend]);

  const badges = useMemo(() => earnedBadges(records, CITY_BADGES), [records]);
  const byId = useMemo(() => new Map(CITY_BADGES.map((c) => [c.id, c])), []);
  const stops = records.reduce((s, r) => s + r.stopsVisited, 0);
  const cityName = (c: CityBadgeDef) => (lang === 'de' ? c.names.de : c.names.en);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.subtle, paddingTop: insets.top }}>
      <Row style={{ justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 16 }}>
        <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} size={44} />
        <Text variant="title" accessibilityRole="header">
          {t('profile.title')}
        </Text>
        <IconButton
          icon="settings"
          label={t('settings.title')}
          onPress={() => router.push('/settings')}
          size={44}
        />
      </Row>
      <ScrollView contentContainerStyle={{ gap: 24, padding: 16, paddingBottom: insets.bottom + 32 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 16,
            borderRadius: radii.lg,
            backgroundColor: colors.surface.base,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.brand.redTint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name="account-outline" size={30} color={colors.brand.redPressed} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={1}>
              {user?.email ?? user?.phoneNumber ?? t('profile.anonymous')}
            </Text>
            <Text variant="caption">{t('profile.historyLocal')}</Text>
          </View>
          <Mascot pose="idle" size={60} style={{ marginVertical: -6 }} />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat value={records.length} label={t('profile.stats_tours')} />
          <Stat value={stops} label={t('profile.stats_stops')} />
          <Stat value={badges.length} label={t('profile.stats_cities')} />
        </View>

        <View style={{ gap: 10 }}>
          <Row gap={8}>
            <Text variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
              {t('profile.badges')}
            </Text>
            {badges.length ? <Mascot pose="celebrate" size={44} style={{ marginVertical: -8 }} /> : null}
          </Row>
          {badges.length ? (
            <Text variant="caption">{t('profile.badgesHint')}</Text>
          ) : (
            <MascotTip pose="present" text={t('profile.badgesNone')} bubble={colors.surface.base} />
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {badges.map((b) => {
              const c = byId.get(b.cityId);
              if (!c) return null;
              return (
                <View
                  key={b.cityId}
                  accessible
                  accessibilityLabel={`${cityName(c)}, ${t(`profile.tier${b.tier[0]!.toUpperCase()}${b.tier.slice(1)}`)}, ${t('profile.tours', { count: b.tours })}`}
                  style={{
                    width: '31%',
                    flexGrow: 1,
                    alignItems: 'center',
                    gap: 6,
                    padding: 12,
                    borderRadius: radii.lg,
                    backgroundColor: colors.surface.base,
                    ...shadow.card,
                  }}
                >
                  <View
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 30,
                      borderWidth: 3,
                      borderColor: TIER_COLOR[b.tier],
                      backgroundColor: colors.brand.redTint,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MaterialCommunityIcons name={c.icon} size={30} color={colors.brand.redPressed} />
                  </View>
                  <Text variant="label" align="center" numberOfLines={1}>
                    {cityName(c)}
                  </Text>
                  <Text variant="caption" align="center" style={{ color: TIER_COLOR[b.tier], fontSize: 12 }}>
                    {`${t(`profile.tier${b.tier[0]!.toUpperCase()}${b.tier.slice(1)}`)} · ${t('profile.tours', { count: b.tours })}`}
                  </Text>
                  {b.toNext ? (
                    <Text variant="caption" align="center" style={{ fontSize: 11, lineHeight: 14 }}>
                      {t('profile.toNext', { count: b.toNext })}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        <ListGroup title={t('profile.history')} footer={t('profile.historyLocal')}>
          {records.length === 0 ? <ListRow icon="map" label={t('profile.historyNone')} /> : null}
          {records.slice(0, 50).map((r) => (
            <HistoryRow
              key={r.id}
              record={r}
              lang={lang}
              onPress={() => router.push({ pathname: '/summary/[id]', params: { id: r.id } })}
            />
          ))}
        </ListGroup>

        <ListGroup>
          <ListRow icon="settings" label={t('profile.settings')} onPress={() => router.push('/settings')} />
        </ListGroup>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={{ flex: 1, padding: 14, borderRadius: radii.lg, backgroundColor: colors.surface.base, gap: 2 }}
    >
      <Text variant="title">{String(value)}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

function HistoryRow({ record, lang, onPress }: { record: TourRecord; lang: string; onPress: () => void }) {
  const { t } = useTranslation();
  const title =
    record.title ??
    (record.mode === 'roam' ? t('roam.title') : record.mode === 'fork' ? t('fork.title') : t('plan.title'));
  const date = new Date(record.startedAt).toLocaleDateString(lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surface.subtle : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: colors.brand.redTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name={MODE_ICON[record.mode]} size={18} color={colors.brand.redPressed} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {`${date} · ${t('profile.stops', { count: record.stopsVisited })} · ${record.stops
            .slice(0, 3)
            .map((s) => s.name)
            .join(', ')}`}
        </Text>
      </View>
    </Pressable>
  );
}
