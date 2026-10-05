import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_CONFIG } from '@tuur/shared';
import { clearFirestore, testDb } from './helpers';
import { reserveBudget, settleBudget, spentToday } from '../src/util/usage';

const db = testDb();
const now = Date.UTC(2026, 9, 4, 12);
const cfg = {
  ...DEFAULT_AI_CONFIG,
  dailyBudgetUsd: 1,
  areaDailyBudgetUsd: 1,
  pricing: { ...DEFAULT_AI_CONFIG.pricing, ttsPerMCharsUsd: 1_000_000 },
};
beforeEach(async () => clearFirestore());

describe('Firestore budget contention', () => {
  it('never allocates the same remaining global or area budget to competing workers', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => reserveBudget(db, cfg, { ttsChars: 0.2 }, 'tile', now)),
    );
    const admitted = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    // Firestore may exhaust retry attempts under contention, but can never admit more than five workers.
    expect(admitted.length).toBeGreaterThan(0);
    expect(admitted.length).toBeLessThanOrEqual(5);
    expect((await spentToday(db, 'tile', now)).globalToday).toBeCloseTo(admitted.length * 0.2);
    await Promise.all(
      admitted.flatMap((reservation) =>
        [1, 2].map(() =>
          settleBudget(
            db,
            cfg,
            reservation,
            { kind: 'tts', tile: 'tile', usage: { ttsChars: 0.1 }, ok: true },
            now,
          ),
        ),
      ),
    );
    const spent = await spentToday(db, 'tile', now);
    expect(spent.globalToday).toBeCloseTo(admitted.length * 0.1);
    expect(spent.areaToday).toBeCloseTo(spent.globalToday);
  });
});
