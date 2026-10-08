import { DEFAULT_VOICE_ID } from '@tuur/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackend } from '../backend';
import { clearSavedSession, endSession } from '../guide/session';
import { getDownloadManager } from '../offline';
import { useHistory } from '../state/history';
import { useSettings } from '../state/settings';
import { setCrashReporting } from '../telemetry';
import { BackendError } from '../backend/types';
import { forgetGroupSeatAccount } from '../billing/groupSeatCheckout';

/** Called only after server deletion succeeds; failure remains retryable from the deletion screen. */
export async function clearDeletedAccountData(deletedUid: string): Promise<void> {
  const checkAccount = () => {
    const current = getBackend().auth.current();
    if (current && current.uid !== deletedUid)
      throw new BackendError('unauthenticated', 'Account changed before local cleanup');
  };
  checkAccount();
  await endSession();
  checkAccount();
  await clearSavedSession();
  checkAccount();
  await getDownloadManager().clearAll();
  checkAccount();
  forgetGroupSeatAccount(deletedUid);
  await AsyncStorage.removeItem(`tuur.group-seat.v1.${deletedUid}`);
  checkAccount();
  useHistory.getState().clear();
  useSettings.getState().set({
    onboarded: false,
    interests: [],
    analyticsConsent: false,
    frequency: 'normal',
    voiceId: DEFAULT_VOICE_ID,
    simulator: false,
    highlightWords: true,
    seenTips: [],
    tipsEnabled: true,
  });
  await setCrashReporting(false);
}
