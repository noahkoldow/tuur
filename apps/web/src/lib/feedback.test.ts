import { describe, expect, it } from 'vitest';
import { feedbackNarrationKeys, parseFeedback } from './feedback';

describe('mixed moderation reports', () => {
  it('keeps old narration reports readable and only queries real, unique narration keys', () => {
    const reports = [
      parseFeedback('n1', { narrationKey: 'chapter', reason: 'wrong_fact', createdAt: 1 })!,
      parseFeedback('n2', { narrationKey: 'chapter', reason: 'audio_issue', createdAt: 2 })!,
      parseFeedback('ad', { kind: 'ad', reason: 'age_inappropriate', text: 'Description', createdAt: 3 })!,
      parseFeedback('offer', { kind: 'offer', offerId: 'discount', partnerId: 'cafe', reason: 'misleading', createdAt: 4 })!,
    ];
    expect(feedbackNarrationKeys(reports)).toEqual(['chapter']);
    expect(reports[2]).toMatchObject({ kind: 'ad', reason: 'age_inappropriate', text: 'Description' });
    expect(reports[3]).toMatchObject({ kind: 'offer', offerId: 'discount', partnerId: 'cafe' });
    expect(reports[3]!.narrationKey).toBeUndefined();
  });

  it('disables the narration query when only ad or offer reports exist', () => {
    expect(feedbackNarrationKeys([parseFeedback('ad', { kind: 'ad', createdAt: 1 })!])).toEqual([]);
    expect(feedbackNarrationKeys(undefined)).toEqual([]);
    expect(parseFeedback('invalid', { narrationKey: undefined, createdAt: 1 })).toBeUndefined();
  });

  it('does not trust a stray narration key on an advertising report', () => {
    const report = parseFeedback('ad', { kind: 'ad', narrationKey: 'unrelated', createdAt: 1 })!;
    expect(report.narrationKey).toBeUndefined();
    expect(report.reason).toBe('other');
  });
});
