import { Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme';
import { Text } from './Text';

/** Attribution for a Commons image (CC licenses require author, license and a link to the license and the source). */
export function ImageCredit({
  image,
  style,
  compact = false,
}: {
  image: {
    author?: string | undefined;
    license: string;
    licenseUrl?: string | undefined;
    sourceUrl?: string | undefined;
  };
  style?: object;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const link = (label: string, url?: string) =>
    url ? (
      <Text
        variant="caption"
        accessibilityRole="link"
        color={colors.brand.redPressed}
        style={{ textDecorationLine: 'underline', paddingVertical: compact ? 4 : 10 }}
        onPress={(event) => {
          event.stopPropagation();
          void Linking.openURL(url).catch(() => undefined);
        }}
      >
        {label}
      </Text>
    ) : (
      <Text variant="caption">{label}</Text>
    );
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 }, style]}>
      {link(
        t('player.imageBy', { author: image.author ?? 'Wikimedia Commons', license: '' }).replace(
          /,\s*$/,
          '',
        ),
        image.sourceUrl,
      )}
      {link(image.license, image.licenseUrl)}
      {!compact && image.sourceUrl ? link(t('player.imageSource'), image.sourceUrl) : null}
    </View>
  );
}
