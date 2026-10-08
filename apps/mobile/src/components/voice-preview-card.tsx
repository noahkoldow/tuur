import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useVoicePreview } from '../audio/useVoicePreview';
import { TuuPromo } from './tuu-promo';
import { Text } from './Text';
import { useVoicePromoPalette } from './voice-promo-theme';

export function VoicePreviewCard({
  active = true,
  beforePlay,
}: {
  active?: boolean;
  beforePlay?: () => void;
}) {
  const { t } = useTranslation();
  const palette = useVoicePromoPalette();
  const preview = useVoicePreview({ active, beforePlay });
  return (
    <View
      testID="voice-preview-card"
      style={{
        padding: 20,
        gap: 14,
        borderRadius: 28,
        borderCurve: 'continuous',
        backgroundColor: palette.background,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <TuuPromo preview={preview} active={active} compact />
      <Text variant="caption" color={palette.subtle} align="center" style={{ fontSize: 11, lineHeight: 16 }}>
        {t('tuuPromo.footer')}
      </Text>
    </View>
  );
}
