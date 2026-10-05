import { requireOptionalNativeModule } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/** Keep the widget runtime out of Expo Go and installed binaries built before the extension was added. */
export function loadTourActivity() {
  if (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    process.env.EXPO_PUBLIC_EXPO_GO === '1' ||
    !requireOptionalNativeModule('ExpoWidgets')
  )
    return undefined;
  return (require('./TourActivity.ios') as typeof import('./TourActivity.ios')).default;
}
