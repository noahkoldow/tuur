import {
  PoiSchema,
  budgetDecision,
  hasMarkup,
  sourceText,
  sourceLangsFor,
  unsupportedNumbers,
} from '@tuur/shared';
import { z } from 'zod';
import { loadAiConfig } from '../util/aiConfig';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';
import { logUsage, spentToday } from '../util/usage';
import { NarrationError, type NarrationDeps } from './service';

export const GetTeaserRequestSchema = z.object({
  poiId: z.string().min(1).max(120),
  lang: z.string().regex(/^[a-z]{2,3}$/),
  access: z
    .object({
      tourId: z.string().max(200).optional(),
      mode: z.enum(['tour', 'planned', 'fork', 'roam']).optional(),
    })
    .optional(),
});

/**
 * One-sentence teaser for crossroads cards (spec 5.3): lite model, only from the place's sources, guarded by the
 * same deterministic checks as narrations (no invented numbers, no markup) and cached per place and language.
 */
export async function getTeaser(
  deps: NarrationDeps,
  uid: string,
  raw: unknown,
): Promise<{ text: string; cached: boolean }> {
  const parsed = GetTeaserRequestSchema.safeParse(raw);
  if (!parsed.success) throw new NarrationError('invalid-argument', 'Invalid request');
  const { poiId, lang, access } = parsed.data;
  const cfg = await (deps.config ?? (() => loadAiConfig(deps.db, deps.now())))();
  const snap = await deps.db.collection('pois').doc(poiId).get();
  if (!snap.exists || snap.get('hidden')) throw new NarrationError('not-found', 'POI not found');
  const poi = PoiSchema.parse(snap.data());
  await deps.authorize?.(uid, poi, access);
  const ref = deps.db
    .collection('teasers')
    .doc(`${poiId}__${lang}__${cfg.promptVersion}`.replace(/[^A-Za-z0-9_-]/g, '_'));
  const hit = await ref.get();
  if (hit.exists) return { text: String(hit.get('text')), cached: true };

  try {
    await consumeRateLimit(deps.db, `teaser_user_${uid}`, 120, 3600_000, deps.now());
  } catch (e) {
    if (e instanceof RateLimitError)
      throw new NarrationError('resource-exhausted', 'Too many requests', { retryAfterMs: e.retryAfterMs });
    throw e;
  }
  const budget = budgetDecision(cfg, await spentToday(deps.db, poi.tile, deps.now()));
  if (!budget.allowed)
    throw new NarrationError('unavailable', 'Generation is paused', { reason: budget.reason });

  const bundle = await deps.sources.gather(poi, [lang, ...sourceLangsFor('XX')]);
  const sources = sourceText(bundle);
  const t = await deps.llm.teaser({ model: cfg.models.lite, lang, name: poi.name, sources });
  await logUsage(
    deps.db,
    cfg.pricing,
    { kind: 'teaser', model: cfg.models.lite, usage: t.usage, tile: poi.tile, ok: true },
    deps.now(),
  );
  const text = t.text.trim();
  if (
    !text ||
    hasMarkup(text) ||
    unsupportedNumbers(text, sources).length > 0 ||
    text.split(/\s+/).length > 40
  ) {
    throw new NarrationError('failed-precondition', 'No verifiable teaser', { reason: 'unverifiable' });
  }
  await ref.set({ text, poiId, lang, promptVersion: cfg.promptVersion, createdAt: deps.now() });
  return { text, cached: false };
}
