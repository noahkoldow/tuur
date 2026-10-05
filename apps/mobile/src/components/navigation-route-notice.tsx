import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NavigationRouteState } from '../guide/navigation-route';
import { Banner } from './Banner';
import { Button } from './Button';

export function NavigationRouteNotice({
  navigation,
  onRetry,
}: {
  navigation: NavigationRouteState;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  if (navigation.status === 'idle' || navigation.status === 'ready') return null;
  const key =
    navigation.status === 'waiting_location'
      ? 'player.routeLocation'
      : navigation.status === 'loading'
        ? 'player.routeLoading'
        : navigation.error === 'network'
          ? 'player.routeOffline'
          : navigation.error === 'rate_limited'
            ? 'player.routeRateLimited'
            : navigation.error === 'outside_area'
              ? 'player.routeOutsideArea'
              : 'player.routeUnavailable';
  return (
    <View style={{ gap: 8 }}>
      <Banner
        icon="navigation-variant"
        text={t(key)}
        tone={navigation.status === 'error' ? 'warning' : 'info'}
      />
      {navigation.status === 'error' && onRetry ? (
        <Button variant="tinted" icon="refresh-cw" label={t('player.routeRetry')} onPress={onRetry} />
      ) : null}
    </View>
  );
}
