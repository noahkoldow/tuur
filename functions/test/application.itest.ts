import { beforeEach, describe, expect, it } from 'vitest';
import { APPLICATIONS_PER_DAY, submitPartnerApplication } from '../src/partners/application';
import { clearFirestore, testDb } from './helpers';

const db = testDb();
const deps = () => ({ db, now: () => 1_800_000_000_000 });
const app = {
  placeName: 'Café Linde',
  category: 'cafe',
  address: 'Lindenstraße 1, 10969 Berlin',
  contactEmail: 'hallo@cafe-linde.de',
  pitch: 'Kleines Café mit eigener Rösterei seit 1928.',
  acceptedTerms: true,
};

describe('submitPartnerApplication', () => {
  beforeEach(clearFirestore);

  it('stores a pending application for review and rate-limits spam', async () => {
    const { id } = await submitPartnerApplication(deps(), 'u1', app);
    const doc = (await db.collection('partnerApplications').doc(id).get()).data()!;
    expect(doc).toMatchObject({
      uid: 'u1',
      status: 'pending',
      pricingModel: 'traction',
      placeName: 'Café Linde',
    });
    for (let i = 1; i < APPLICATIONS_PER_DAY; i++) await submitPartnerApplication(deps(), 'u1', app);
    await expect(submitPartnerApplication(deps(), 'u1', app)).rejects.toThrow('rate_limited');
  });

  it('rejects applications without the explicit consent', async () => {
    await expect(submitPartnerApplication(deps(), 'u1', { ...app, acceptedTerms: false })).rejects.toThrow();
  });
});
