import { AI_CONSENT_VERSION, type AiConsentState } from '@tuur/shared';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { LlmProvider } from '../providers/llm';

export class AiConsentError extends Error {
  readonly code = 'failed-precondition' as const;
  readonly details = { reason: 'ai_consent_required' };
  constructor() {
    super('Explicit consent is required before sharing personalized tour context with AI providers');
  }
}

export const AiConsentChoiceSchema = z
  .object({ granted: z.boolean(), version: z.literal(AI_CONSENT_VERSION) })
  .strict();

export async function getAiConsent(db: Firestore, uid: string): Promise<AiConsentState> {
  const doc = await db.collection('users').doc(uid).collection('consents').doc('ai').get();
  return {
    granted: doc.get('granted') === true && doc.get('version') === AI_CONSENT_VERSION,
    version: typeof doc.get('version') === 'string' ? doc.get('version') : null,
    updatedAt: typeof doc.get('updatedAt') === 'number' ? doc.get('updatedAt') : null,
  };
}

export async function setAiConsent(
  db: Firestore,
  uid: string,
  raw: unknown,
  now: number,
): Promise<AiConsentState> {
  const input = AiConsentChoiceSchema.parse(raw);
  const state = { ...input, updatedAt: now };
  await db.collection('users').doc(uid).collection('consents').doc('ai').set(state);
  return state;
}

/** Never cache this authorization: withdrawal must prevent the next provider request. */
export async function requireAiConsent(db: Firestore, uid: string): Promise<void> {
  if (!(await getAiConsent(db, uid)).granted) throw new AiConsentError();
}

/** Check before each provider call, including retries/fact checks after an in-flight withdrawal. */
export function consentBoundLlm(inner: LlmProvider, check: () => Promise<void>): LlmProvider {
  return new Proxy(inner, {
    get(target, property) {
      const method = Reflect.get(target, property) as unknown;
      return typeof method === 'function'
        ? async (...args: unknown[]) => {
            await check();
            return Reflect.apply(method, target, args) as unknown;
          }
        : method;
    },
  });
}
