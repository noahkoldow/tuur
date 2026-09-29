import { Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme';
import { Text } from './Text';

/** Attribution for a Commons image (CC licenses require author, license and a link to the license and the source). */
export function ImageCredit({
  image,
  style,
}: {
  image: {
    author?: string | undefined;
    license: string;
    licenseUrl?: string | undefined;
    sourceUrl?: string | undefined;
  };
  style?: object;
}) {
  const { t } = useTranslation();
  const link = (label: string, url?: string) =>
    url ? (
      <Text
        variant="caption"
        accessibilityRole="link"
        color={colors.brand.redPressed}
        style={{ textDecorationLine: 'underline', paddingVertical: 10 }}
        onPress={() => void Linking.openURL(url)}
      >
        {label}
      </Text>
    ) : (
      <Text variant="caption">{label}</Text>
    );
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 }, style]}>
      <Text variant="caption">
        {t('player.imageBy', { author: image.author ?? 'Wikimedia Commons', license: '' }).replace(
          /,\s*$/,
          '',
        )}
      </Text>
      {link(image.license, image.licenseUrl)}
      {image.sourceUrl ? link(t('player.imageSource'), image.sourceUrl) : null}
    </View>
  );
}
