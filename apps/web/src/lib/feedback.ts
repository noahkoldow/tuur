export interface Feedback {
  id: string;
  kind: 'narration' | 'ad' | 'offer';
  narrationKey?: string;
  offerId?: string;
  partnerId?: string;
  reason: 'wrong_fact' | 'offensive' | 'audio_issue' | 'age_inappropriate' | 'misleading' | 'other';
  text?: string;
  createdAt: number;
}

const nonempty = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined;
const reasons = new Set<Feedback['reason']>([
  'wrong_fact', 'offensive', 'audio_issue', 'age_inappropriate', 'misleading', 'other',
]);

/** Legacy narration reports have no kind. Advertising reports must never become an "undefined" narration key. */
export function parseFeedback(id: string, data: Record<string, unknown>): Feedback | undefined {
  const narrationKey = nonempty(data.narrationKey);
  const kind = data.kind === 'ad' || data.kind === 'offer' ? data.kind : narrationKey ? 'narration' : undefined;
  if (!kind) return undefined;
  const offerId = nonempty(data.offerId);
  const partnerId = nonempty(data.partnerId);
  const text = nonempty(data.text);
  const reason = reasons.has(data.reason as Feedback['reason']) ? data.reason as Feedback['reason'] : 'other';
  return {
    id, kind, reason, createdAt: Number(data.createdAt),
    ...(kind === 'narration' && narrationKey ? { narrationKey } : {}),
    ...(offerId ? { offerId } : {}),
    ...(partnerId ? { partnerId } : {}),
    ...(text ? { text } : {}),
  };
}

export function feedbackNarrationKeys(feedback: Feedback[] | undefined): string[] {
  return [...new Set(feedback?.flatMap((f) => f.kind === 'narration' && f.narrationKey ? [f.narrationKey] : []) ?? [])]
    .slice(0, 30);
}
