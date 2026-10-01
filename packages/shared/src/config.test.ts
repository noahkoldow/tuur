import { describe, expect, it } from 'vitest';
import { AiConfigSchema, DEFAULT_AI_CONFIG, INTERESTS, LENGTH_TIER_SECONDS } from './index';

describe('shared config', () => {
  it('default AI config validates and has grounding off', () => {
    const parsed = AiConfigSchema.parse(DEFAULT_AI_CONFIG);
    expect(parsed.groundingEnabled).toBe(false);
    expect(parsed.killSwitch).toBe(false);
    expect(parsed.dailyBudgetUsd).toBe(3);
  });

  it('rejects a daily AI budget above the owner-approved cap', () => {
    const overBudget = { ...DEFAULT_AI_CONFIG, dailyBudgetUsd: 3.01 };
    expect(AiConfigSchema.safeParse(overBudget).success).toBe(false);
  });

  it('rejects empty model names', () => {
    const bad = { ...DEFAULT_AI_CONFIG, models: { ...DEFAULT_AI_CONFIG.models, narration: '' } };
    expect(AiConfigSchema.safeParse(bad).success).toBe(false);
  });

  it('defines all eight interests and increasing tier durations', () => {
    expect(INTERESTS).toHaveLength(8);
    expect(LENGTH_TIER_SECONDS.short).toBeLessThan(LENGTH_TIER_SECONDS.medium);
    expect(LENGTH_TIER_SECONDS.medium).toBeLessThan(LENGTH_TIER_SECONDS.long);
  });
});
