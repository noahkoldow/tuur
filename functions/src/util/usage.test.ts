import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_CONFIG, type AiConfig } from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { BudgetError, dayKey, reserveBudget, settleBudget, spentToday, withBudget } from './usage';
import { budgetedLlm } from '../providers/budgeted';
import { MockLlmProvider } from '../providers/llm';
import { renderAudio } from '../narration/service';

const time = Date.UTC(2026, 9, 4, 23, 59, 59);
const cfg: AiConfig = {
  ...DEFAULT_AI_CONFIG,
  dailyBudgetUsd: 1,
  areaDailyBudgetUsd: 1,
  pricing: { ...DEFAULT_AI_CONFIG.pricing, ttsPerMCharsUsd: 1_000_000 },
};

describe('atomic estimated spending reservations', () => {
  it('admits only the affordable calls when many requests race before providers finish', async () => {
    const { db, docs } = memoryFirestore();
    let finish!: () => void;
    const providerPending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const run = vi.fn(async () => {
      await providerPending;
      return { usage: { ttsChars: 0.15 } };
    });
    const promises = Array.from({ length: 30 }, () =>
      withBudget(db, cfg, { kind: 'tts', tile: 'area' }, { ttsChars: 0.2 }, run, () => time),
    );
    const outcome = Promise.allSettled(promises);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(5));
    expect((await spentToday(db, 'area', time)).globalToday).toBeCloseTo(1);
    finish();
    const results = await outcome;
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(25);
    expect((await spentToday(db, 'area', time)).globalToday).toBeCloseTo(0.75);
    expect(docs.get(`usageDaily/${dayKey(time)}`)?.['reservedUsd']).toBeCloseTo(0);
    await expect(reserveBudget(db, cfg, { ttsChars: 0.3 }, 'area', time)).rejects.toBeInstanceOf(BudgetError);
  });

  it('enforces per-area budgets independently and the global budget across areas', async () => {
    const { db } = memoryFirestore();
    const limited = { ...cfg, areaDailyBudgetUsd: 0.6 };
    await reserveBudget(db, limited, { ttsChars: 0.6 }, 'a', time);
    await expect(reserveBudget(db, limited, { ttsChars: 0.1 }, 'a', time)).rejects.toMatchObject({
      details: { reason: 'area_budget' },
    });
    await reserveBudget(db, limited, { ttsChars: 0.4 }, 'b', time);
    await expect(reserveBudget(db, limited, { ttsChars: 0.1 }, 'c', time)).rejects.toMatchObject({
      details: { reason: 'daily_budget' },
    });
  });

  it('keeps uncertain provider failures charged and never silently releases a crashed worker reservation', async () => {
    const { db } = memoryFirestore();
    await expect(
      withBudget(
        db,
        cfg,
        { kind: 'tts' },
        { ttsChars: 0.7 },
        async () => {
          throw new Error('timeout');
        },
        () => time,
      ),
    ).rejects.toThrow('timeout');
    await reserveBudget(db, cfg, { ttsChars: 0.2 }, undefined, time);
    await expect(reserveBudget(db, cfg, { ttsChars: 0.2 }, undefined, time)).rejects.toBeInstanceOf(
      BudgetError,
    );
    expect((await spentToday(db, undefined, time)).globalToday).toBeCloseTo(0.9);
  });

  it('settles once against the reserved UTC day even after midnight', async () => {
    const { db, docs } = memoryFirestore();
    const reservation = await reserveBudget(db, cfg, { ttsChars: 0.5 }, 'a', time);
    const entry = { kind: 'tts' as const, usage: { ttsChars: 0.2 }, tile: 'a', ok: true };
    await Promise.all(
      Array.from({ length: 5 }, () => settleBudget(db, cfg, reservation, entry, time + 5000)),
    );
    expect((await spentToday(db, 'a', time)).globalToday).toBeCloseTo(0.2);
    expect((await spentToday(db, 'a', time + 5000)).globalToday).toBe(0);
    expect(docs.get(`usageDaily/${dayKey(time)}`)?.['calls']).toBe(1);
  });

  it('does not call providers when killed, prompts are oversized, or grounding costs are unbounded', async () => {
    const { db } = memoryFirestore();
    const inner = new MockLlmProvider();
    const teaser = vi.spyOn(inner, 'teaser');
    const llm = budgetedLlm(inner, db, { ...cfg, killSwitch: true }, () => time, { tile: 'a' });
    await expect(
      llm.teaser({ model: 'lite', lang: 'en', name: 'place', sources: 'source' }),
    ).rejects.toBeInstanceOf(BudgetError);
    expect(() =>
      llm.teaser({ model: 'lite', lang: 'en', name: 'place', sources: 'x'.repeat(260_000) }),
    ).toThrow(BudgetError);
    expect(() => llm.generateNarration({ grounding: true } as never)).toThrow(BudgetError);
    expect(teaser).not.toHaveBeenCalled();
  });

  it('accounts for each TTS paragraph before the next and retains partial failure costs', async () => {
    const { db } = memoryFirestore();
    const audioCfg = {
      ...cfg,
      dailyBudgetUsd: 3,
      areaDailyBudgetUsd: 3,
      pricing: { ...cfg.pricing, ttsPerMCharsUsdByProvider: { gemini: 1_000_000, openai: 1_000_000 } },
    };
    const synthesize = vi.fn(async ({ text }: { text: string }) => {
      if (text === 'bb') throw new Error('audio timeout');
      return { pcm: new Uint8Array(4), chars: text.length };
    });
    const put = vi.fn();
    await expect(
      renderAudio(
        {
          db,
          tts: { synthesize },
          now: () => time,
          encoder: { encode: () => ({ data: Buffer.alloc(4), mimeType: 'audio/mpeg', ext: 'mp3' }) },
          store: { put, delete: vi.fn() },
        },
        audioCfg,
        ['a', 'bb', 'c'],
        'en',
        'audio',
        { tile: 'a', key: 'voice' },
      ),
    ).rejects.toThrow('audio timeout');
    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(put).not.toHaveBeenCalled();
    expect((await spentToday(db, 'a', time)).globalToday).toBe(3);
    await expect(reserveBudget(db, audioCfg, { ttsChars: 1 }, 'a', time)).rejects.toBeInstanceOf(BudgetError);
  });
});
