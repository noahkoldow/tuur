import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CITY_BADGES, earnedBadges, type BadgeTier, type CityBadgeDef } from '@tuur/shared';
import { useBackend } from '../../../src/backend';
import { SettingsButton } from '../../../src/components/HeaderButton';
import { Icon } from '../../../src/components/Icon';
import { ListGroup, ListRow } from '../../../src/components/ListGroup';
import { Mascot, MascotTip } from '../../../src/components/Mascot';
import { RunningTour } from '../../../src/components/RunningTour';
import { ScrollScreen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useHistory, type TourRecord } from '../../../src/state/history';
import { useSettings } from '../../../src/state/settings';
import { metrics, sys } from '../../../src/theme';

/** Medal ring colors are decoration; the tier is always also written out, so no text relies on them. */
const TIER_RING: Record<BadgeTier, string> = { bronze: '#B87333', silver: '#9AA3AD', gold: '#D4A017' };
const MODE_ICON: Record<TourRecord['mode'], string> = {
  tour: 'map',
  planned: 'edit-3',
  fork: 'git-branch',
  roam: 'compass',
};

/**
 * Profile: who is signed in, a few numbers, collected city badges and the walked tours (kept on the device), plus the
 * way into settings. Deliberately low-key: tuur is about walking, not scores.
 */
export default function Profile() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const lang = useSettings((s) => s.language);
  const records = useHistory((s) => s.records);
  const [user, setUser] = useState(backend.auth.current());
  useEffect(() => backend.auth.onChange(setUser), [backend]);

  const badges = useMemo(() => earnedBadges(records, CITY_BADGES), [records]);
  const byId = useMemo(() => new Map(CITY_BADGES.map((c) => [c.id, c])), []);
  const stops = records.reduce((s, r) => s + r.stopsVisited, 0);
  const cityName = (c: CityBadgeDef) => (lang === 'de' ? c.names.de : c.names.en);
  const tierName = (tier: BadgeTier) => t(`profile.tier${tier[0]!.toUpperCase()}${tier.slice(1)}`);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <SettingsButton label={t('settings.title')} onPress={() => router.push('/profile/settings')} />
          ),
        }}
      />
      <ScrollScreen>
        <RunningTour />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: metrics.margin,
            borderRadius: metrics.radius.card,
            borderCurve: 'continuous',
            backgroundColor: sys.elevated,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="headline" numberOfLines={2}>
              {user?.email ?? user?.phoneNumber ?? t('profile.anonymous')}
            </Text>
            <Text variant="footnote">{t('profile.historyLocal')}</Text>
          </View>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: sys.fill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="user" size={24} color={sys.labelSecondary} />
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            borderRadius: metrics.radius.card,
            borderCurve: 'continuous',
            backgroundColor: sys.elevated,
          }}
        >
          <Stat value={records.length} label={t('profile.stats_tours')} />
          <View style={{ width: 0.5, backgroundColor: sys.separator, marginVertical: 12 }} />
          <Stat value={stops} label={t('profile.stats_stops')} />
          <View style={{ width: 0.5, backgroundColor: sys.separator, marginVertical: 12 }} />
          <Stat value={badges.length} label={t('profile.stats_cities')} />
        </View>

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="title2" accessibilityRole="header" style={{ flex: 1 }}>
              {t('profile.badges')}
            </Text>
            {badges.length ? <Mascot pose="celebrate" size={44} style={{ marginVertical: -8 }} /> : null}
          </View>
          {badges.length ? (
            <Text variant="footnote">{t('profile.badgesHint')}</Text>
          ) : (
            <MascotTip pose="present" text={t('profile.badgesNone')} bubble={sys.elevated} />
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {badges.map((b) => {
              const c = byId.get(b.cityId);
              if (!c) return null;
              return (
                <View
                  key={b.cityId}
                  accessible
                  accessibilityLabel={`${cityName(c)}, ${tierName(b.tier)}, ${t('profile.tours', { count: b.tours })}`}
                  style={{
                    flexBasis: '31%',
                    flexGrow: 1,
                    alignItems: 'center',
                    gap: 6,
                    padding: 12,
                    borderRadius: metrics.radius.card,
                    borderCurve: 'continuous',
                    backgroundColor: sys.elevated,
                  }}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      borderWidth: 3,
                      borderColor: TIER_RING[b.tier],
                      backgroundColor: sys.accentTint,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MaterialCommunityIcons name={c.icon} size={28} color={sys.accentText as string} />
                  </View>
                  <Text variant="subheadline" style={{ fontWeight: '600', color: sys.label }} align="center">
                    {cityName(c)}
                  </Text>
                  <Text variant="caption" align="center">
                    {`${tierName(b.tier)} · ${t('profile.tours', { count: b.tours })}`}
                  </Text>
                  {b.toNext ? (
                    <Text variant="caption" align="center">
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
      </ScrollScreen>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={{ flex: 1, padding: 14, gap: 2, alignItems: 'center' }}
    >
      <Text variant="title2">{String(value)}</Text>
      <Text variant="footnote" align="center">
        {label}
      </Text>
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
  const detail = `${date} · ${t('profile.stops', { count: record.stopsVisited })} · ${record.stops
    .slice(0, 3)
    .map((s) => s.name)
    .join(', ')}`;
  return <ListRow icon={MODE_ICON[record.mode]} label={title} hint={detail} onPress={onPress} />;
}
