import { describe, expect, it } from 'vitest';
import { memoryFirestore } from '../../test/memoryFirestore';
import { reportContent } from './reports';
import { moderateOffer } from './offers';

const report = {
  requestId: '93fcd207-fb01-47bf-b819-d78bcad30af3',
  kind: 'offer',
  offerId: 'offer1',
  reason: 'misleading',
  text: 'The advertised price is different.',
  blockPartner: true,
};

describe('content safety', () => {
  it('stores a report and blocks the actual owner, without trusting a client partner id', async () => {
    const { db, docs } = memoryFirestore();
    docs.set('offers/offer1', { partnerId: 'partner1' });
    const result = await reportContent(db, 'listener', report, 100);
    expect(docs.get(`feedback/${result.id}`)).toMatchObject({
      uid: 'listener',
      partnerId: 'partner1',
      status: 'open',
      text: report.text,
    });
    expect(docs.has('users/listener/blockedPartners/partner1')).toBe(true);
    await expect(
      reportContent(db, 'listener', { ...report, partnerId: 'forged' }, 101),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('retries the same report once and scopes request ids to each account', async () => {
    const { db, docs } = memoryFirestore();
    const ad = { ...report, kind: 'ad', offerId: undefined, blockPartner: false };
    const results = await Promise.all([reportContent(db, 'a', ad, 100), reportContent(db, 'a', ad, 101)]);
    expect(results[0]).toEqual(results[1]);
    const other = await reportContent(db, 'b', ad, 102);
    expect(other).not.toEqual(results[0]);
    expect([...docs.keys()].filter((key) => key.startsWith('feedback/'))).toHaveLength(2);
  });
  it('rejects missing offers without a report or a block', async () => {
    const { db, docs } = memoryFirestore();
    await expect(reportContent(db, 'a', report, 100)).rejects.toMatchObject({ code: 'not-found' });
    expect([...docs.keys()].filter((key) => /^(feedback|users)\//.test(key))).toHaveLength(0);
  });
  it('does not approve a different text revision than the moderator saw', async () => {
    const { db, docs } = memoryFirestore();
    docs.set('offers/offer1', { reviewRevision: 'new', moderationStatus: 'pending' });
    await expect(
      moderateOffer(db, 'admin', { offerId: 'offer1', revision: 'old', status: 'approved' }, 100),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(docs.get('offers/offer1')?.moderationStatus).toBe('pending');
    await moderateOffer(db, 'admin', { offerId: 'offer1', revision: 'new', status: 'approved' }, 100);
    expect(docs.get('offers/offer1')?.moderationStatus).toBe('approved');
    expect([...docs.keys()].some((key) => key.startsWith('adminAudit/'))).toBe(true);
  });
});
