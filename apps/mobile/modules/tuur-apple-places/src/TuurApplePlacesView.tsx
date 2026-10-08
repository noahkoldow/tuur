import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import nativeModule from './TuurApplePlacesModule';
import type { ApplePlacesMapViewProps } from './TuurApplePlaces.types';

// Avoid requesting a native view manager on Android or a binary without the module.
const NativeView: ComponentType<ApplePlacesMapViewProps> | null = nativeModule
  ? requireNativeView<ApplePlacesMapViewProps>('TuurApplePlaces')
  : null;

export default function ApplePlacesMapView(props: ApplePlacesMapViewProps) {
  return NativeView ? <NativeView {...props} /> : null;
}
