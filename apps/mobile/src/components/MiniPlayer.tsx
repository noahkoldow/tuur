import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ActiveSession } from '../guide/session';
import { haptics } from '../motion';
import { colors, radii } from '../theme';
import { IconButton } from './Button';
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
    <PressableScale
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      accessibilityHint={t('home.continueTour')}
      onPress={onOpen}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 8,
        paddingLeft: 10,
        borderRadius: radii.lg,
        backgroundColor: colors.surface.subtle,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.brand.red,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="headphones" size={20} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {line}
        </Text>
      </View>
      <IconButton
        icon={paused ? 'play' : 'pause'}
        label={paused ? t('player.play') : t('player.pause')}
        size={44}
        onPress={() => {
          haptics.tap();
          if (paused) session.runtime.resume();
          else session.runtime.pause();
        }}
      />
    </PressableScale>
  );
}
