import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ActiveSession } from '../guide/session';
import { useEndTour } from '../hooks/use-end-tour';
import { haptics } from '../motion';
import { metrics, sys } from '../theme';
import { IconButton } from './Button';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/**
 * Compact player for a running tour while the listener is elsewhere in the app (like a music app): what is playing
 * or where the walk goes, play/pause, and a tap to reopen the full player.
 */
export function MiniPlayer({
  session,
  title,
  onOpen,
}: {
  session: ActiveSession;
  title: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { confirmFinish } = useEndTour();
  const ui = useSyncExternalStore(
    session.runtime.subscribe,
    session.runtime.getSnapshot,
    session.runtime.getSnapshot,
  );
  const paused = ui.phase === 'paused';
  const line =
    ui.narration && ui.phase === 'narrating'
      ? ui.narration.title
      : ui.target
        ? t('player.walkingTo', { name: ui.target.name })
        : title;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 8,
        paddingLeft: 10,
        minHeight: 60,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        backgroundColor: sys.elevated,
      }}
    >
      <PressableScale
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${line}`}
        accessibilityHint={t('home.continueTour')}
        onPress={onOpen}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: sys.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="headphones" size={20} color={sys.onAccent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="subheadline" numberOfLines={1} style={{ fontWeight: '600', color: sys.label }}>
            {title}
          </Text>
          <Text variant="footnote" numberOfLines={1}>
            {line}
          </Text>
        </View>
      </PressableScale>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {paused ? (
          <IconButton icon="stop" size={36} label={t('player.endTour')} onPress={confirmFinish} />
        ) : null}
        <IconButton
          icon={paused ? 'play' : 'pause'}
          label={paused ? t('player.play') : t('player.pause')}
          onPress={() => {
            haptics.tap();
            if (paused) session.runtime.resume();
            else session.runtime.pause();
          }}
        />
      </View>
    </View>
  );
}
