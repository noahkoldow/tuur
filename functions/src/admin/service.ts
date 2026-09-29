import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  AiConfigSchema,
  DEFAULT_AI_CONFIG,
  PartnerPricingSchema,
  TourTextSchema,
  DEFAULT_CLAIM_POLICY,
  scoreWithPartner,
  type AiConfig,
} from '@tuur/shared';
import { claimArea, markAreaFailed } from '../area/store';
import { blockNarration, type ObjectStore } from '../narration/service';
import { loadPartnerConfig } from '../partners/service';
import { resetAiConfigCache } from '../util/aiConfig';

export class AdminError extends Error {
  constructor(
    readonly code: 'invalid-argument' | 'not-found' | 'failed-precondition',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface AdminDeps {
  db: Firestore;
  now: () => number;
  store: ObjectStore;
  enqueueIngest: (geohash: string) => Promise<void>;
}

const bad = (m: string): never => {
  throw new AdminError('invalid-argument', m);
};

/** Every admin write leaves a trace: who did what to which object (no personal data of end users). */
export async function writeAudit(
  db: Firestore,
  now: number,
  actor: string,
  action: string,
  target: string,
  summary?: unknown,
) {
  await db.collection('adminAudit').add({
    ts: now,
    actor,
    action,
    target,
    ...(summary !== undefined ? { summary: JSON.stringify(summary).slice(0, 1000) } : {}),
  });
}

const audit = (deps: AdminDeps, actor: string, action: string, target: string, summary?: unknown) =>
  writeAudit(deps.db, deps.now(), actor, action, target, summary);

const geohash = z.string().regex(/^[0-9bcdefghjkmnpqrstuvwxyz]{4,8}$/);

/** Triggers (or repeats) the ingest of a tile immediately, ignoring retry backoff and attempt limits. */
export async function retryIngest(deps: AdminDeps, actor: string, raw: unknown) {
  const p = z.object({ geohash }).safeParse(raw);
  if (!p.success) return bad('Invalid geohash');
  const gh = p.data!.geohash;
  const ref = deps.db.collection('areas').doc(gh);
  const snap = await ref.get();
  if (snap.get('locked') === true) throw new AdminError('failed-precondition', 'Area is locked');
  const now = deps.now();
  if (snap.exists) await ref.update({ status: 'empty', ingestAttempts: 0, updatedAt: now });
  const claimed = await claimArea(deps.db, gh, now, DEFAULT_CLAIM_POLICY);
  if (!claimed) return { started: false };
  try {
    await deps.enqueueIngest(gh);
  } catch (e) {
    await markAreaFailed(deps.db, gh, `enqueue failed: ${(e as Error).message}`, now);
    throw e;
  }
  await audit(deps, actor, 'retryIngest', gh);
  return { started: true };
}

export async function setAreaLock(deps: AdminDeps, actor: string, raw: unknown) {
  const p = z.object({ geohash, locked: z.boolean() }).safeParse(raw);
  if (!p.success) return bad('Invalid request');
  const ref = deps.db.collection('areas').doc(p.data!.geohash);
  if (!(await ref.get()).exists) throw new AdminError('not-found', 'Area not found');
  await ref.update({ locked: p.data!.locked, updatedAt: deps.now() });
  await audit(deps, actor, p.data!.locked ? 'lockArea' : 'unlockArea', p.data!.geohash);
}

/** Existing narrations of a POI are sent back for regeneration (audio removed, next request regenerates). */
async function invalidateNarrations(deps: AdminDeps, poiId: string): Promise<number> {
  const snap = await deps.db.collection('narrations').where('poiId', '==', poiId).get();
  for (const d of snap.docs) await blockNarration(deps, d.id, 'blocked');
  return snap.size;
}

const PoiModerationSchema = z.object({
  poiId: z.string().min(1).max(120),
  hidden: z.boolean().optional(),
  adminWeight: z.number().min(0).max(2).optional(),
  /** Additional verified facts (an extra source for narrations, spec 8). */
  adminFacts: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
});

export async function moderatePoi(deps: AdminDeps, actor: string, raw: unknown) {
  const p = PoiModerationSchema.safeParse(raw);
  if (!p.success) return bad('Invalid request');
  const { poiId, hidden, adminWeight, adminFacts } = p.data!;
  const ref = deps.db.collection('pois').doc(poiId);
  const snap = await ref.get();
  if (!snap.exists) throw new AdminError('not-found', 'POI not found');
  const { cfg } = await loadPartnerConfig(deps.db);
  const weight = adminWeight ?? Number(snap.get('adminWeight') ?? 1);
  const patch: Record<string, unknown> = {
    ...(hidden !== undefined ? { hidden } : {}),
    ...(adminWeight !== undefined ? { adminWeight } : {}),
    ...(adminFacts !== undefined ? { adminFacts } : {}),
    // recompute with the (capped) partner boost so moderation and boost never overwrite each other
    score: scoreWithPartner(
      Number(snap.get('baseScore')),
      weight,
      Number(snap.get('partnerBoost') ?? 0),
      cfg,
    ),
    updatedAt: deps.now(),
  };
  await ref.update(patch);
  const invalidated = adminFacts !== undefined ? await invalidateNarrations(deps, poiId) : 0;
  await audit(deps, actor, 'moderatePoi', poiId, { hidden, adminWeight, facts: adminFacts?.length });
  return { invalidated };
}

const TourModerationSchema = z.object({
  tourId: z.string().min(1).max(200),
  locked: z.boolean().optional(),
  pinned: z.boolean().optional(),
  /** Replaces the text of one language; the tour then counts as edited and is never overwritten by regeneration. */
  texts: z.record(TourTextSchema).optional(),
});

export async function moderateTour(deps: AdminDeps, actor: string, raw: unknown) {
  const p = TourModerationSchema.safeParse(raw);
  if (!p.success) return bad('Invalid request');
  const { tourId, locked, pinned, texts } = p.data!;
  const ref = deps.db.collection('tours').doc(tourId);
  const snap = await ref.get();
  if (!snap.exists) throw new AdminError('not-found', 'Tour not found');
  if (snap.get('source') === 'planned')
    throw new AdminError('failed-precondition', 'Planned routes are private');
  const patch: Record<string, unknown> = {
    ...(locked !== undefined ? { locked } : {}),
    ...(pinned !== undefined ? { pinned } : {}),
    updatedAt: deps.now(),
  };
  if (texts) {
    for (const [lang, t] of Object.entries(texts)) patch[`texts.${lang}`] = t;
    patch['source'] = 'edited';
  }
  await ref.update(patch);
  await audit(deps, actor, 'moderateTour', tourId, {
    locked,
    pinned,
    texts: texts ? Object.keys(texts) : undefined,
  });
}

export async function regenerateNarration(deps: AdminDeps, actor: string, raw: unknown) {
  const p = z.object({ key: z.string().min(1).max(400) }).safeParse(raw);
  if (!p.success) return bad('Invalid request');
  const snap = await deps.db.collection('narrations').doc(p.data!.key).get();
  if (!snap.exists) throw new AdminError('not-found', 'Narration not found');
  await blockNarration(deps, p.data!.key, 'blocked');
  await audit(deps, actor, 'regenerateNarration', p.data!.key);
}

export async function resolveFeedback(deps: AdminDeps, actor: string, raw: unknown) {
  const p = z
    .object({ id: z.string().min(1).max(400), resolution: z.enum(['fixed', 'dismissed']) })
    .safeParse(raw);
  if (!p.success) return bad('Invalid request');
  const ref = deps.db.collection('feedback').doc(p.data!.id);
  const snap = await ref.get();
  if (!snap.exists) throw new AdminError('not-found', 'Feedback not found');
  await ref.update({ status: p.data!.resolution, resolvedAt: deps.now(), resolvedBy: actor });
  // a "fixed" report sends the narration back to regeneration if it is still waiting for review
  const key = snap.get('narrationKey') as string | undefined;
  if (p.data!.resolution === 'fixed' && key) {
    const n = await deps.db.collection('narrations').doc(key).get();
    if (n.exists && n.get('status') === 'pending_review') await blockNarration(deps, key, 'blocked');
  }
  await audit(deps, actor, 'resolveFeedback', p.data!.id, { resolution: p.data!.resolution });
}

/** Deep-partial update of `config/ai`; the merged result must validate, otherwise nothing is written. */
export async function saveAiConfig(deps: AdminDeps, actor: string, raw: unknown) {
  const Partial = z
    .object({
      models: AiConfigSchema.shape.models.partial(),
      voices: z.record(z.string().min(1)),
      promptVersion: z.string().min(1).max(40),
      groundingEnabled: z.boolean(),
      dailyBudgetUsd: z.number().nonnegative().max(100000),
      areaDailyBudgetUsd: z.number().nonnegative().max(100000),
      killSwitch: z.boolean(),
      pricing: AiConfigSchema.shape.pricing.partial(),
      rateLimits: AiConfigSchema.shape.rateLimits.partial(),
    })
    .partial()
    .strict();
  const p = Partial.safeParse(raw);
  if (!p.success) return bad('Invalid AI configuration');
  const ref = deps.db.collection('config').doc('ai');
  const cur = ((await ref.get()).data() ?? {}) as Partial<AiConfig>;
  const d = p.data!;
  const merged = {
    ...DEFAULT_AI_CONFIG,
    ...cur,
    ...d,
    models: { ...DEFAULT_AI_CONFIG.models, ...cur.models, ...d.models },
    voices: { ...DEFAULT_AI_CONFIG.voices, ...cur.voices, ...d.voices },
    pricing: { ...DEFAULT_AI_CONFIG.pricing, ...cur.pricing, ...d.pricing },
    rateLimits: { ...DEFAULT_AI_CONFIG.rateLimits, ...cur.rateLimits, ...d.rateLimits },
  };
  const parsed = AiConfigSchema.safeParse(merged);
  if (!parsed.success) return bad('Invalid AI configuration');
  await ref.set(parsed.data);
  resetAiConfigCache();
  await audit(deps, actor, 'saveAiConfig', 'config/ai', d);
  return parsed.data;
}

export const PartnerConfigInputSchema = z
  .object({
    boost: z.object({ visibility: z.number().min(0).max(30), offers: z.number().min(0).max(30) }).partial(),
    /** Hard product limit: a boost can never add more than 30 points, whatever is configured here. */
    boostCap: z.number().min(0).max(30),
    tokenTtlMs: z.number().int().min(60_000).max(3600_000),
    maxRedeemDistanceM: z.number().min(20).max(1000),
    pricing: PartnerPricingSchema.partial(),
  })
  .partial()
  .strict();

export async function savePartnerConfig(deps: AdminDeps, actor: string, raw: unknown) {
  const p = PartnerConfigInputSchema.safeParse(raw);
  if (!p.success) return bad('Invalid partner configuration');
  const ref = deps.db.collection('config').doc('partners');
  const cur = ((await ref.get()).data() ?? {}) as Record<string, unknown>;
  const d = p.data!;
  const next = {
    ...cur,
    ...d,
    ...(d.boost ? { boost: { ...(cur['boost'] as object | undefined), ...d.boost } } : {}),
    ...(d.pricing ? { pricing: { ...(cur['pricing'] as object | undefined), ...d.pricing } } : {}),
  };
  await ref.set(next);
  await audit(deps, actor, 'savePartnerConfig', 'config/partners', d);
  return next;
}
