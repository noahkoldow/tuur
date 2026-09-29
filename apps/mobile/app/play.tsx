import { useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, FlatList, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AiBadge } from '../src/components/AiBadge';
import { Banner } from '../src/components/Banner';
import { Button, IconButton, Row } from '../src/components/Button';
import { ProgressBar } from '../src/components/ProgressBar';
import { Sheet } from '../src/components/Sheet';
import { Text } from '../src/components/Text';
import { TuurMap } from '../src/components/TuurMap';
import { useBackend } from '../src/backend';
import { endSession, tourPath, useActiveSession } from '../src/guide/session';
import { useSettings } from '../src/state/settings';
import { colors, radii } from '../src/theme';

/** Tour screen (spec 11): map on top, player sheet below (title, image carousel, red progress, transcript). */
export default function Play() {
  const session = useActiveSession();
  if (!session) return <Redirect href="/home" />;
  return <PlayInner />;
}

function PlayInner() {
  const session = useActiveSession()!;
  const { runtime, tour, simulator } = session;
  const ui = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const lang = useSettings((s) => s.language);
  const [showText, setShowText] = useState(false);
  const [sheet, setSheet] = useState(1);
  const [reported, setReported] = useState(false);
  const path = useMemo(() => tourPath(tour), [tour]);
  const text = tour.texts[lang] ?? tour.texts['en'] ?? Object.values(tour.texts)[0];
  const n = ui.narration;
  const progress =
    n && n.kind === 'stop'
      ? ui.positionMs /
        Math.max(
          1,
          n.paragraphs[n.paragraphs.length - 1]
            ? n.paragraphs[n.paragraphs.length - 1]!.startMs +
                n.paragraphs[n.paragraphs.length - 1]!.durationMs
            : 1,
        )
      : 0;
  const title =
    ui.phase === 'finished'
      ? t('player.finished')
      : n && ui.phase === 'narrating'
        ? n.title
        : ui.target
          ? t('player.walkingTo', { name: ui.target.name })
          : (text?.title ?? '');

  const exit = () =>
    Alert.alert(t('player.exit'), t('player.exitConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('player.exit'),
        style: 'destructive',
        onPress: () => void endSession().then(() => router.replace('/home')),
      },
    ]);

  const report = async () => {
    if (!n) return;
    await backend.reportNarration({ narrationKey: n.key, reason: 'wrong_fact' }).catch(() => undefined);
    setReported(true);
  };

  const noticeText =
    ui.notice === 'vehicle_paused'
      ? t('player.vehiclePaused')
      : ui.notice === 'vehicle_resumed'
        ? t('player.vehicleResumed')
        : ui.notice === 'unavailable'
          ? t('player.unavailable')
          : ui.notice === 'generation_paused'
            ? t('errors.paused')
            : ui.notice === 'rate_limited'
              ? t('errors.rateLimited')
              : ui.notice === 'offline'
                ? t('errors.network')
                : undefined;

  const header = (
    <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}>
      <Text variant="title" numberOfLines={2} accessibilityRole="header" accessibilityLiveRegion="polite">
        {title}
      </Text>
      {ui.target?.distanceM !== undefined && ui.phase !== 'finished' ? (
        <Text variant="caption">{`${ui.target.distanceM} m`}</Text>
      ) : null}
      <ProgressBar value={progress} />
      <Row gap={16} style={{ justifyContent: 'center' }}>
        <IconButton icon="skip-back" label={t('player.previous')} onPress={runtime.previous} />
        <IconButton
          icon={ui.phase === 'paused' ? 'play' : 'pause'}
          label={ui.phase === 'paused' ? t('player.play') : t('player.pause')}
          onPress={ui.phase === 'paused' ? runtime.resume : runtime.pause}
          size={72}
          primary
        />
        <IconButton icon="skip-forward" label={t('player.next')} onPress={runtime.skip} />
      </Row>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <TuurMap
        center={tour.stops[0]!.location}
        route={path}
        user={ui.user}
        follow={Boolean(ui.user)}
        fit={ui.user ? undefined : path}
        bottomInset={360}
        stops={ui.stops.map((s, i) => ({
          id: s.id,
          location: s.location,
          number: i + 1,
          state:
            s.state === 'visited' || s.state === 'skipped'
              ? 'visited'
              : s.state === 'current'
                ? 'current'
                : 'upcoming',
          partner: tour.stops[i]?.partner ?? false,
        }))}
      />
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          right: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <IconButton icon="x" label={t('player.exit')} onPress={exit} size={44} />
        {simulator ? (
          <Button
            variant="secondary"
            label={t('player.simulateJump')}
            onPress={() => simulator.jumpTo(simulator.progressMeters + 120)}
            style={{ minHeight: 44 }}
          />
        ) : null}
      </View>

      <Sheet
        snapPoints={[300, 470, 720]}
        index={sheet}
        onIndexChange={setSheet}
        handleLabel={t('player.transcript')}
        header={header}
      >
        <View style={{ gap: 14 }}>
          {noticeText ? (
            <Banner
              tone={ui.notice === 'vehicle_paused' ? 'warning' : 'info'}
              text={noticeText}
              icon={ui.notice === 'vehicle_paused' ? 'truck' : undefined}
            />
          ) : null}
          {ui.offerMore ? (
            <Button label={t('player.more')} icon="plus-circle" onPress={runtime.more} />
          ) : null}

          {n && n.images.length ? (
            <View>
              <FlatList
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                data={n.images}
                keyExtractor={(i) => i.url}
                renderItem={({ item }) => (
                  <View style={{ width: width - 40, marginRight: 8 }}>
                    <Image
                      source={{ uri: item.url }}
                      style={{ height: 180, borderRadius: radii.md }}
                      contentFit="cover"
                      accessibilityIgnoresInvertColors
                      accessibilityLabel={n.title}
                    />
                    <Text variant="caption" style={{ marginTop: 4 }}>
                      {t('player.imageBy', {
                        author: item.author ?? 'Wikimedia Commons',
                        license: item.license,
                      })}
                    </Text>
                  </View>
                )}
              />
            </View>
          ) : null}

          {n ? (
            <>
              <Button
                variant="secondary"
                icon={showText ? 'chevron-up' : 'file-text'}
                label={showText ? t('player.hideTranscript') : t('player.transcript')}
                onPress={() => setShowText((v) => !v)}
              />
              {showText ? (
                <View style={{ gap: 12 }} accessibilityLabel={t('player.transcript')}>
                  {n.paragraphs.map((p, i) => (
                    <Text
                      key={i}
                      variant="body"
                      style={{
                        opacity: i === ui.paragraphIndex ? 1 : 0.6,
                        fontFamily:
                          i === ui.paragraphIndex ? 'PlusJakartaSans_700Bold' : 'PlusJakartaSans_500Medium',
                      }}
                    >
                      {p.text}
                    </Text>
                  ))}
                </View>
              ) : null}
              {n.grounding?.searchEntryPointHtml ? <Text variant="caption">Google Search</Text> : null}
              <AiBadge />
              <Button
                variant="ghost"
                icon="flag"
                label={reported ? t('player.reported') : t('player.reportIssue')}
                disabled={reported}
                onPress={() => void report()}
              />
            </>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
