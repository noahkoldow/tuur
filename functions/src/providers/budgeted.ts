import type { Firestore } from 'firebase-admin/firestore';
import type { Usage } from '@tuur/shared';
import { BudgetError, withBudget, type BudgetConfig, type UsageKind } from '../util/usage';
import type { LlmProvider } from './llm';
import type { RoutingProvider } from './routing';
import { LLM_OUTPUT_LIMITS, MAX_LLM_REQUEST_BYTES } from './limits';

export function budgetedLlm(
  inner: LlmProvider,
  db: Firestore,
  cfg: BudgetConfig,
  now: () => number,
  attribution: { tile: string; key?: string },
): LlmProvider {
  const call = <T extends { usage: Usage }>(
    method: keyof LlmProvider,
    kind: UsageKind,
    model: string,
    args: unknown,
    lite: boolean,
    run: () => Promise<T>,
  ) => {
    const bytes = Buffer.byteLength(JSON.stringify(args), 'utf8');
    if (bytes > MAX_LLM_REQUEST_BYTES) throw new BudgetError('input_too_large');
    // UTF-8 bytes conservatively bound text tokens; allowance covers instructions/schema and escaping.
    const input = bytes * 2 + 4096;
    const output = LLM_OUTPUT_LIMITS[method];
    const maximum: Usage = lite
      ? { liteInputTokens: input, liteOutputTokens: output }
      : { inputTokens: input, outputTokens: output };
    return withBudget(db, cfg, { ...attribution, kind, model }, maximum, run, now);
  };
  return {
    generateNarration(req) {
      // Search tool calls have no enforced query bound in this integration; do not make unreserved calls.
      if (req.grounding) throw new BudgetError('grounding_budget_unsupported');
      return call('generateNarration', 'narration', req.model, req, false, () =>
        inner.generateNarration(req),
      );
    },
    checkFacts: (req) => call('checkFacts', 'factcheck', req.model, req, true, () => inner.checkFacts(req)),
    classifyInterests: (items, model) =>
      call('classifyInterests', 'classify', model, items, true, () => inner.classifyInterests(items, model)),
    generateTourConcept: (req) =>
      call('generateTourConcept', 'narration', req.model, req, false, () => inner.generateTourConcept(req)),
    teaser: (req) => call('teaser', 'teaser', req.model, req, true, () => inner.teaser(req)),
    transition: (req) => call('transition', 'transition', req.model, req, true, () => inner.transition(req)),
    selectNearby: (req) =>
      call('selectNearby', 'classify', req.model, req, true, () => inner.selectNearby(req)),
  };
}

/** Install inside the routing cache: cache hits are free; each upstream attempt is metered. */
export function budgetedRouting(
  inner: RoutingProvider,
  db: Firestore,
  cfg: BudgetConfig,
  now: () => number,
  tile: string,
): RoutingProvider {
  const call = async <T>(run: () => Promise<T>): Promise<T> => {
    const result = await withBudget(
      db,
      cfg,
      { kind: 'routing', tile },
      { routingCalls: 1 },
      async () => ({ value: await run(), usage: { routingCalls: 1 } }),
      now,
    );
    return result.value;
  };
  return {
    source: inner.source,
    matrix: (points, profile) => call(() => inner.matrix(points, profile)),
    directions: (points, profile) => call(() => inner.directions(points, profile)),
  };
}
