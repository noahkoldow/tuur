import { describe, expect, it, vi } from 'vitest';
import { AI_CONSENT_VERSION } from '@tuur/shared';
import { BackendError, type Backend } from '../backend/types';
import { withAiConsent } from './aiConsent';

vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }));
vi.mock('../state/settings', () => ({ useSettings: { getState: () => ({ language: 'en' }) } }));

const required = () => new BackendError('locked', 'AI consent needed', undefined, 'ai_consent_required');
function setup() {
  let uid = 'one';
  const getNarration = vi.fn().mockRejectedValue(required());
  const updateAiConsent = vi.fn(async (granted: boolean) => ({
    granted,
    version: AI_CONSENT_VERSION,
    updatedAt: 1,
  }));
  const getAiConsent = vi.fn(async () => ({
    granted: false,
    version: null as string | null,
    updatedAt: null as number | null,
  }));
  const base = {
    auth: { current: () => ({ uid }) },
    getAiConsent,
    getNarration,
    getTransition: getNarration,
    updateAiConsent,
  } as unknown as Backend;
  const ask = vi.fn(async () => true);
  const fallback = vi.fn(async () => {});
  return {
    base,
    ask,
    fallback,
    getAiConsent,
    getNarration,
    updateAiConsent,
    changeAccount: () => {
      uid = 'two';
    },
  };
}
describe('AI consent client boundary', () => {
  it('awaits paused billing before showing consent and never resumes or retries an active tour automatically', async () => {
    const s = setup();
    let confirm!: (paused: boolean) => void;
    const paused = new Promise<boolean>((resolve) => {
      confirm = resolve;
    });
    const result = withAiConsent(s.base, s.ask, s.fallback, () => paused).getNarration({
      poiId: 'p',
      lang: 'en',
      lengthTier: 'short',
    });
    const rejected = expect(result).rejects.toMatchObject({ reason: 'ai_consent_updated' });
    await Promise.resolve();
    expect(s.ask).not.toHaveBeenCalled();
    confirm(true);
    await rejected;
    expect(s.ask).toHaveBeenCalledTimes(1);
    expect(s.getNarration).toHaveBeenCalledTimes(1);
    expect(s.updateAiConsent).toHaveBeenCalledWith(true);
  });
  it('does not request consent or retry generation when billing cannot be paused', async () => {
    const s = setup();
    await expect(
      withAiConsent(s.base, s.ask, s.fallback, async () => {
        throw new Error('offline');
      }).getNarration({ poiId: 'p', lang: 'en', lengthTier: 'short' }),
    ).rejects.toMatchObject({ reason: 'ai_consent_pause_failed' });
    expect(s.ask).not.toHaveBeenCalled();
    expect(s.updateAiConsent).not.toHaveBeenCalled();
  });
  it('respects a persisted refusal after a restart without another consent prompt', async () => {
    const s = setup();
    s.getAiConsent.mockResolvedValue({ granted: false, version: AI_CONSENT_VERSION, updatedAt: 1 });
    await expect(
      withAiConsent(s.base, s.ask, s.fallback, async () => false).getNarration({
        poiId: 'p',
        lang: 'en',
        lengthTier: 'short',
      }),
    ).rejects.toThrow();
    expect(s.ask).not.toHaveBeenCalled();
    expect(s.fallback).toHaveBeenCalledTimes(1);
  });
  it('keeps cached audio available without prompting and retries only after explicit stored consent', async () => {
    const s = setup();
    const backend = withAiConsent(s.base, s.ask, s.fallback, async () => false);
    s.getNarration.mockResolvedValueOnce({ key: 'cached' });
    await backend.getNarration({ poiId: 'p', lang: 'en', lengthTier: 'short' });
    expect(s.ask).not.toHaveBeenCalled();
    s.getNarration.mockRejectedValueOnce(required()).mockResolvedValueOnce({ key: 'new' });
    await backend.getNarration({ poiId: 'p', lang: 'en', lengthTier: 'short' });
    expect(s.updateAiConsent).toHaveBeenCalledWith(true);
  });
  it('stores refusal, switches to text, and does not repeatedly prompt or retry generation', async () => {
    const s = setup();
    s.ask.mockResolvedValue(false);
    const backend = withAiConsent(s.base, s.ask, s.fallback, async () => false);
    const req = { poiId: 'p', lang: 'en', lengthTier: 'short' as const };
    await expect(backend.getNarration(req)).rejects.toMatchObject({ reason: 'ai_consent_required' });
    await expect(backend.getNarration(req)).rejects.toThrow();
    expect(s.ask).toHaveBeenCalledTimes(1);
    expect(s.getNarration).toHaveBeenCalledTimes(2);
    expect(s.updateAiConsent).toHaveBeenCalledWith(false);
    expect(s.fallback).toHaveBeenCalledTimes(1);
  });
  it('does not save a decision to another account after an account change during the prompt', async () => {
    const s = setup();
    s.ask.mockImplementation(async () => {
      s.changeAccount();
      return true;
    });
    await expect(
      withAiConsent(s.base, s.ask, s.fallback, async () => false).getNarration({
        poiId: 'p',
        lang: 'en',
        lengthTier: 'short',
      }),
    ).rejects.toThrow();
    expect(s.updateAiConsent).not.toHaveBeenCalled();
  });
  it('does not apply a completed settings update to a different signed-in account', async () => {
    const s = setup();
    s.updateAiConsent.mockImplementationOnce(async (granted: boolean) => {
      s.changeAccount();
      return { granted, version: AI_CONSENT_VERSION, updatedAt: 1 };
    });
    const backend = withAiConsent(s.base, s.ask, s.fallback, async () => false);
    await backend.updateAiConsent(false);
    s.getNarration.mockRejectedValueOnce(required()).mockResolvedValueOnce({ key: 'new' });
    await backend.getNarration({ poiId: 'p', lang: 'en', lengthTier: 'short' });
    expect(s.ask).toHaveBeenCalledTimes(1);
    expect(s.updateAiConsent).toHaveBeenLastCalledWith(true);
  });
});
