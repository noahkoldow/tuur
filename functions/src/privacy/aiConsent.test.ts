import { describe, expect, it, vi } from 'vitest';
import { AI_CONSENT_VERSION } from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { MockLlmProvider } from '../providers/llm';
import { consentBoundLlm, getAiConsent, requireAiConsent, setAiConsent } from './aiConsent';

describe('explicit revocable AI consent', () => {
  it('fails closed when absent or outdated; scopes consent to the account and current disclosure', async () => {
    const { db, docs } = memoryFirestore();
    await expect(requireAiConsent(db, 'a')).rejects.toMatchObject({
      details: { reason: 'ai_consent_required' },
    });
    docs.set('users/a/consents/ai', { granted: true, version: 'old', updatedAt: 1 });
    await expect(requireAiConsent(db, 'a')).rejects.toThrow();
    await setAiConsent(db, 'a', { granted: true, version: AI_CONSENT_VERSION }, 10);
    await expect(requireAiConsent(db, 'a')).resolves.toBeUndefined();
    await expect(requireAiConsent(db, 'b')).rejects.toThrow();
    expect(await getAiConsent(db, 'a')).toEqual({
      granted: true,
      version: AI_CONSENT_VERSION,
      updatedAt: 10,
    });
  });
  it('does not call a provider after withdrawal, even through a previously created wrapper', async () => {
    const { db } = memoryFirestore();
    const inner = new MockLlmProvider();
    const generate = vi.spyOn(inner, 'teaser');
    const llm = consentBoundLlm(inner, () => requireAiConsent(db, 'a'));
    const req = { model: 'mock', lang: 'en', name: 'Public place', sources: 'Public source' };
    await expect(llm.teaser(req)).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
    await setAiConsent(db, 'a', { granted: true, version: AI_CONSENT_VERSION }, 10);
    await llm.teaser(req);
    await setAiConsent(db, 'a', { granted: false, version: AI_CONSENT_VERSION }, 11);
    await expect(llm.teaser(req)).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('rejects implied or unversioned consent', async () => {
    const { db } = memoryFirestore();
    await expect(setAiConsent(db, 'a', { granted: 'yes', version: AI_CONSENT_VERSION }, 1)).rejects.toThrow();
    await expect(setAiConsent(db, 'a', { granted: true }, 1)).rejects.toThrow();
    expect((await getAiConsent(db, 'a')).granted).toBe(false);
  });
});
