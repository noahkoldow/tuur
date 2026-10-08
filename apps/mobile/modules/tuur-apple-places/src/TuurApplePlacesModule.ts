import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { ApplePlacesNativeModule } from './TuurApplePlaces.types';

// OTA updates can reach an older binary or Expo Go without this local module.
const nativeModule =
  Platform.OS === 'ios' ? requireOptionalNativeModule<ApplePlacesNativeModule>('TuurApplePlaces') : null;

export default nativeModule;
