import type { AiConfig } from '../config';

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  liteInputTokens?: number;
  liteOutputTokens?: number;
  ttsChars?: number;
  groundingQueries?: number;
  routingCalls?: number;
}

/** Estimated USD cost of one operation from config prices (used for `usageLogs` and budgets). */
export function estimateCostUsd(u: Usage, p: AiConfig['pricing']): number {
  const c =
    ((u.inputTokens ?? 0) / 1e6) * p.inputPerMTokUsd +
    ((u.outputTokens ?? 0) / 1e6) * p.outputPerMTokUsd +
    ((u.liteInputTokens ?? 0) / 1e6) * p.liteInputPerMTokUsd +
    ((u.liteOutputTokens ?? 0) / 1e6) * p.liteOutputPerMTokUsd +
    ((u.ttsChars ?? 0) / 1e6) * p.ttsPerMCharsUsd +
    ((u.groundingQueries ?? 0) / 1000) * p.groundingPer1kQueriesUsd +
    ((u.routingCalls ?? 0) / 1000) * p.routingPer1kCallsUsd;
  return Math.round(c * 1e6) / 1e6;
}

export type BudgetDecision =
  { allowed: true } | { allowed: false; reason: 'kill_switch' | 'daily_budget' | 'area_budget' };

/** Gate for *new* generation; cache hits are always served (they cost nothing). */
export function budgetDecision(
  cfg: Pick<AiConfig, 'killSwitch' | 'dailyBudgetUsd' | 'areaDailyBudgetUsd'>,
  spent: { globalToday: number; areaToday: number },
): BudgetDecision {
  if (cfg.killSwitch) return { allowed: false, reason: 'kill_switch' };
  if (spent.globalToday >= cfg.dailyBudgetUsd) return { allowed: false, reason: 'daily_budget' };
  if (spent.areaToday >= cfg.areaDailyBudgetUsd) return { allowed: false, reason: 'area_budget' };
  return { allowed: true };
}
