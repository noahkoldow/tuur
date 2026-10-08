import { Alert } from 'react-native';
import { AI_CONSENT_COPY, AI_CONSENT_VERSION } from '@tuur/shared';
import { useSettings } from '../state/settings';
import type { Backend } from '../backend/types';
import { BackendError } from '../backend/types';

export function askAiConsent(): Promise<boolean> {
  const copy = AI_CONSENT_COPY[useSettings.getState().language === 'de' ? 'de' : 'en'];
  return new Promise((resolve) => {
    Alert.alert(
      copy.title,
      copy.body,
      [
        { text: copy.decline, style: 'cancel', onPress: () => resolve(false) },
        { text: copy.allow, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** The server gates new generation; existing/offline recordings never need renewed consent. */
export function withAiConsent(
  base: Backend,
  ask: () => Promise<boolean> = askAiConsent,
  onDecline: () => Promise<void> = async () => {
    const { continueSessionAsText } = await import('../guide/session');
    await continueSessionAsText();
  },
  beforePrompt: () => Promise<boolean> = async () => {
    const { pauseSessionForAiConsent } = await import('../guide/session');
    return pauseSessionForAiConsent();
  },
): Backend {
  let pending: { uid: string; choice: Promise<'declined' | 'retry' | 'paused'> } | undefined;
  const declined = new Set<string>();
  const run = async <T>(request: () => Promise<T>): Promise<T> => {
    try {
      return await request();
    } catch (error) {
      if (!(error instanceof BackendError) || error.reason !== 'ai_consent_required') throw error;
      const uid = base.auth.current()?.uid;
      if (!uid || declined.has(uid)) throw error;
      if (!pending || pending.uid !== uid) {
        const choice = (async () => {
          let paused: boolean;
          try {
            paused = await beforePrompt();
          } catch {
            throw new BackendError(
              'network',
              'Could not pause tour billing. Retry when connected.',
              undefined,
              'ai_consent_pause_failed',
            );
          }
          const stored = await base.getAiConsent();
          if (base.auth.current()?.uid !== uid) return 'declined' as const;
          if (!stored.granted && stored.version === AI_CONSENT_VERSION) {
            declined.add(uid);
            await onDecline();
            return 'declined' as const;
          }
          const allowed = await ask();
          if (base.auth.current()?.uid !== uid) return 'declined' as const;
          await base.updateAiConsent(allowed);
          if (!allowed) {
            declined.add(uid);
            await onDecline();
          }
          return allowed ? (paused ? ('paused' as const) : ('retry' as const)) : ('declined' as const);
        })();
        pending = { uid, choice };
        void choice
          .finally(() => {
            if (pending?.choice === choice) pending = undefined;
          })
          .catch(() => undefined);
      }
      const outcome = await pending.choice;
      if (outcome === 'declined' || base.auth.current()?.uid !== uid) throw error;
      if (outcome === 'paused')
        throw new BackendError(
          'unavailable',
          'AI choice saved. Resume the tour when ready.',
          undefined,
          'ai_consent_updated',
        );
      return request();
    }
  };
  return {
    ...base,
    getNarration: (request) => run(() => base.getNarration(request)),
    getTransition: (request) => run(() => base.getTransition(request)),
    async updateAiConsent(granted) {
      const uid = base.auth.current()?.uid;
      const state = await base.updateAiConsent(granted);
      if (uid && base.auth.current()?.uid === uid) {
        if (state.granted) declined.delete(uid);
        else declined.add(uid);
      }
      return state;
    },
  };
}
