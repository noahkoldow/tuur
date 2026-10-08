import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Text } from './Text';

export interface PlaceTextStatusProps {
  loading: boolean;
  error: boolean;
  retry: () => void;
}

export function PlaceTextStatus({ loading, error, retry }: PlaceTextStatusProps) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 8 }}>
      <Text variant="body" accessibilityLiveRegion="polite">
        {t(loading ? 'stopInfo.loading' : error ? 'stopInfo.loadError' : 'stopInfo.unavailable')}
      </Text>
      {!loading ? <Button label={t('common.retry')} onPress={retry} variant="ghost" size="regular" /> : null}
    </View>
  );
}
