import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { endSession } from '../guide/session';
import { endTourAndShowSummary, isEndingTour } from '../navigation';

/** All stop controls confirm first, then share the existing history and group cleanup. */
export function useEndTour() {
  const router = useRouter();
  const { t } = useTranslation();
  const finish = async () => {
    if (isEndingTour()) return;
    await endTourAndShowSummary(router, endSession);
  };
  const confirmFinish = () => {
    if (isEndingTour()) return;
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(t('player.exitConfirm'))) void finish();
      return;
    }
    Alert.alert(t('player.endTour'), t('player.exitConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('player.endTour'), style: 'destructive', onPress: () => void finish() },
    ]);
  };
  return { finish, confirmFinish };
}
