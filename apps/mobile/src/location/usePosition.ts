import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { currentPosition, getPermissionState, requestForeground, type PermissionState } from './real';
import { useSettings } from '../state/settings';
import { config } from '../config';
import { REGION_FIXTURES } from '@tuur/shared';

/** Foreground position for the home screen plus the permission state; refreshes when the app returns. */
export function usePosition() {
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const simulator = useSettings((s) => s.simulator);

  const refresh = useCallback(async () => {
    if (config.backend === 'demo') {
      // Demo/preview: pretend to be in Berlin so the whole flow works without device GPS.
      setPermission('foreground');
      setPosition(REGION_FIXTURES[0]!.center);
      return;
    }
    try {
      const p = await getPermissionState();
      setPermission(p);
      setPosition(p === 'foreground' || p === 'background' ? await currentPosition() : null);
    } catch {
      setPosition(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [refresh, simulator]);

  const request = useCallback(async () => {
    const p = await requestForeground();
    setPermission(p);
    setPosition(p !== 'denied' ? await currentPosition() : null);
    return p;
  }, []);

  return { permission, position, request, refresh, setPosition };
}
