import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haversineMatrix, rankRoamStarts, type Poi } from '@tuur/shared';
import { Banner } from '../src/components/Banner';
import { Button, IconButton } from '../src/components/Button';
import { Mascot } from '../src/components/Mascot';
import { interestOf } from '../src/components/StopCards';
import { INTEREST_ICON } from '../src/components/icons';
import { SpinningMark } from '../src/components/SpinningMark';
import { Text } from '../src/components/Text';
import { TuurMap } from '../src/components/TuurMap';
import { startRoamSession } from '../src/guide/session';
import { usePoiPool } from '../src/hooks/usePoiPool';
import { usePosition } from '../src/location/usePosition';
import { requestBackground } from '../src/location/real';
import { useBackend } from '../src/backend';
import { useSessionGate } from '../src/billing/useSessionGate';
import { haptics } from '../src/motion';
import { useSettings } from '../src/state/settings';
import { colors, radii, shadow } from '../src/theme';

/**
 * Roam (spec 5.4), the easiest way in: one question - go straight away (tuur guides to the best spot nearby and
 * starts there) or pick the starting point - then tuur keeps telling about what lies ahead.
 */
export default function Roam() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backend = useBackend();
  const { language, interests, frequency, simulator } = useSettings();
  const { position } = usePosition();
  const gate = useSessionGate('roam', position);
  const { pool, ready } = usePoiPool(position, 1);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [startError, setStartError] = useState<false | 'denied' | 'failed'>(false);
  const starts = useMemo(
    () => (ready && position ? rankRoamStarts(position, pool.all(), interests) : []),
    [ready, position, pool, interests],
  );
  const best = starts[0];
  // Coming from the explore map ("take me there"): start right away with that spot as the first stop.
  const { start: startParam } = useLocalSearchParams<{ start?: string }>();
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!startParam || autoStarted.current || !ready || !position) return;
    const poi = pool.all().find((p) => p.id === startParam);
    if (!poi) return;
    autoStarted.current = true;
    void start(poi, poi.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startParam, ready, position, pool]);

  const start = async (first: Poi | undefined, key: string) => {
    if (!position || !gate.require()) return;
    setBusy(key);
    setStartError(false);
    try {
      let foregroundOnly = false;
      if (!simulator && backend.kind === 'firebase') {
        const perm = await requestBackground();
        if (perm === 'denied') return setStartError('denied');
        foregroundOnly = perm === 'foreground';
      }
      await startRoamSession({
        lang: language,
        start: position,
        frequency,
        interests,
        simulate: simulator,
        ...(first ? { first } : {}),
        ...(foregroundOnly ? { foregroundOnly } : {}),
        ...(interests[0] ? { interest: interests[0] } : {}),
      });
      haptics.start();
      router.replace('/play');
    } catch {
      setStartError('failed');
    } finally {
      setBusy(undefined);
    }
  };

  const minutesTo = (p: Poi) =>
    position
      ? Math.max(1, Math.round(haversineMatrix([position, p.location], 'foot-walking').minutes[0]![1]!))
      : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.subtle }}>
      <TuurMap
        center={position ?? { lat: 52.52, lng: 13.405 }}
        zoom={15}
        user={position ?? undefined}
        bottomInset={picking ? 520 : 380}
        stops={starts.map((p, i) => ({
          id: p.id,
          location: p.location,
          number: i + 1,
          state: p.id === (selected ?? best?.id) ? 'current' : 'upcoming',
          ...(interestOf(p) ? { interest: interestOf(p)! } : {}),
        }))}
        // a pin only selects (starting is a deliberate second tap in the list)
        onStopPress={(id) => {
          haptics.select();
          setSelected(id);
          setPicking(true);
        }}
      />
      <View style={{ position: 'absolute', top: insets.top + 8, left: 16 }}>
        <IconButton
          icon="arrow-left"
          label={t('common.back')}
          onPress={() => router.back()}
          size={44}
          onMap
        />
      </View>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '72%',
          paddingTop: 20,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          backgroundColor: colors.surface.base,
          gap: 14,
          ...shadow.card,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            {t('roam.startTitle')}
          </Text>
          <Mascot pose={picking ? 'point' : 'walk'} size={56} style={{ marginVertical: -8 }} />
        </View>
        {startError ? (
          <Banner
            tone="error"
            text={startError === 'denied' ? t('errors.locationDenied') : t('errors.startFailed')}
          />
        ) : null}
        {ready && !best ? <Banner icon="compass" text={t('roam.noStarts')} /> : null}

        {!picking ? (
          <>
            <ChoiceCard
              icon="navigation-variant"
              title={t('roam.startNow')}
              body={
                !ready
                  ? t('roam.findingStart')
                  : best
                    ? `${best.name} · ${t('common.minutes', { count: minutesTo(best) })}`
                    : t('roam.startNowHint')
              }
              hint={t('roam.startNowHint')}
              primary
              busy={busy === 'now' || !ready}
              disabled={!ready || !position}
              onPress={() => void start(best, 'now')}
            />
            <ChoiceCard
              icon="map-marker-radius"
              title={t('roam.pickStart')}
              body={t('roam.pickStartHint')}
              disabled={starts.length === 0}
              onPress={() => setPicking(true)}
            />
          </>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
            {starts.map((p) => (
              <StartRow
                key={p.id}
                poi={p}
                minutes={minutesTo(p)}
                busy={busy === p.id}
                selected={p.id === selected}
                onPress={() => void start(p, p.id)}
              />
            ))}
            <Button variant="ghost" label={t('common.back')} onPress={() => setPicking(false)} />
          </ScrollView>
        )}
        {!picking ? (
          <Button
            variant="ghost"
            icon="compass"
            label={t('roam.walkFree')}
            loading={busy === 'free'}
            disabled={!position}
            onPress={() => void start(undefined, 'free')}
          />
        ) : null}
      </View>
    </View>
  );
}

function ChoiceCard({
  icon,
  title,
  body,
  hint,
  primary,
  busy,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  body: string;
  hint?: string;
  primary?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      {...(hint ? { accessibilityHint: hint } : {})}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: radii.lg,
        backgroundColor: primary
          ? pressed
            ? colors.brand.redPressed
            : colors.brand.red
          : pressed
            ? colors.surface.subtle
            : colors.surface.base,
        borderWidth: primary ? 0 : 1.5,
        borderColor: colors.border,
        opacity: disabled && !primary ? 0.5 : 1,
      })}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? 'rgba(255,255,255,0.18)' : colors.brand.redTint,
        }}
      >
        {busy ? (
          <SpinningMark size={28} label={title} color={primary ? '#FFFFFF' : colors.brand.red} />
        ) : (
          <MaterialCommunityIcons
            name={icon}
            size={26}
            color={primary ? '#FFFFFF' : colors.brand.redPressed}
          />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading" style={{ color: primary ? '#FFFFFF' : colors.ink.primary, fontSize: 19 }}>
          {title}
        </Text>
        <Text variant="bodySecondary" numberOfLines={2} style={primary ? { color: '#FFFFFF' } : null}>
          {body}
        </Text>
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={24}
        color={primary ? '#FFFFFF' : colors.ink.tertiary}
      />
    </Pressable>
  );
}

function StartRow({
  poi,
  minutes,
  busy,
  selected,
  onPress,
}: {
  poi: Poi;
  minutes: number;
  busy: boolean;
  selected?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const interest = interestOf(poi);
  const img = poi.imageRefs[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${poi.name}, ${t('common.minutes', { count: minutes })}`}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        borderRadius: radii.md,
        backgroundColor: pressed ? colors.surface.subtle : colors.surface.base,
        borderWidth: 1,
        borderColor: selected ? colors.brand.red : colors.border,
      })}
    >
      {img ? (
        <Image
          source={{ uri: img.thumbUrl ?? img.url }}
          style={{ width: 56, height: 56, borderRadius: radii.sm }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radii.sm,
            backgroundColor: colors.brand.redTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons
            name={interest ? INTEREST_ICON[interest] : 'map-marker-radius'}
            size={26}
            color={colors.brand.redPressed}
          />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading" numberOfLines={1}>
          {poi.name}
        </Text>
        <Text variant="caption">
          {[interest ? t(`interests.${interest}`) : undefined, t('common.minutes', { count: minutes })]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {busy ? (
        <SpinningMark size={24} label={poi.name} />
      ) : (
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.ink.tertiary} />
      )}
    </Pressable>
  );
}
