import { describe, expect, it } from 'vitest';
import type { Area } from '../schemas';
import { DEFAULT_CLAIM_POLICY as P, decideClaim } from './claim';
import { DEFAULT_QUALITY, statusForIngest } from './quality';

const base: Area = {
  geohash: 'u33dc0',
  status: 'ready',
  createdAt: 0,
  updatedAt: 0,
  ingestAttempts: 0,
  poiCount: 0,
  qualityPoiCount: 0,
  locked: false,
};
const NOW = 10_000_000_000;

describe('decideClaim', () => {
  it('claims unknown and empty areas', () => {
    expect(decideClaim(undefined, NOW)).toBe('claim');
    expect(decideClaim({ ...base, status: 'empty' }, NOW)).toBe('claim');
  });

  it('skips a fresh ingesting area but re-claims a stale one', () => {
    expect(decideClaim({ ...base, status: 'ingesting', ingestStartedAt: NOW - 1000 }, NOW)).toBe('skip');
    expect(
      decideClaim({ ...base, status: 'ingesting', ingestStartedAt: NOW - P.staleIngestMs - 1 }, NOW),
    ).toBe('claim');
  });

  it('retries failed areas with backoff and stops after max attempts', () => {
    const failed: Area = { ...base, status: 'failed', ingestAttempts: 2, updatedAt: NOW - 1000 };
    expect(decideClaim(failed, NOW)).toBe('skip');
    expect(decideClaim({ ...failed, updatedAt: NOW - P.retryBackoffMs * 2 }, NOW)).toBe('claim');
    expect(decideClaim({ ...failed, ingestAttempts: P.maxAttempts, updatedAt: 0 }, NOW)).toBe('skip');
  });

  it('refreshes ready / low_content only after expiry', () => {
    expect(decideClaim({ ...base, expiresAt: NOW + 1 }, NOW)).toBe('skip');
    expect(decideClaim({ ...base, expiresAt: NOW }, NOW)).toBe('claim');
    expect(decideClaim({ ...base, status: 'low_content', expiresAt: NOW - 1 }, NOW)).toBe('claim');
  });

  it('waits for a provider quota deadline and then retries without the hard-failure backoff', () => {
    const deferred: Area = {
      ...base,
      status: 'failed',
      ingestAttempts: 0,
      updatedAt: NOW,
      ingestRetryAt: NOW + 60_000,
    };
    expect(decideClaim(deferred, NOW + 59_999)).toBe('skip');
    expect(decideClaim(deferred, NOW + 60_000)).toBe('claim');
    expect(decideClaim({ ...deferred, locked: true }, NOW + 60_000)).toBe('skip');
  });

  it('never claims locked areas', () => {
    expect(decideClaim({ ...base, status: 'empty', locked: true }, NOW)).toBe('skip');
  });

  it('exactly one of many sequential transactions wins', () => {
    let area: Area | undefined;
    let winners = 0;
    for (let i = 0; i < 20; i++) {
      if (decideClaim(area, NOW) === 'claim') {
        winners++;
        area = { ...base, status: 'ingesting', ingestStartedAt: NOW };
      }
    }
    expect(winners).toBe(1);
  });
});

describe('statusForIngest', () => {
  it('needs enough quality pois', () => {
    expect(statusForIngest([])).toBe('low_content');
    expect(DEFAULT_QUALITY.minQualityPois).toBe(3);
  });
});
