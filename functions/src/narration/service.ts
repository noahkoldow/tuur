import type { Firestore } from 'firebase-admin/firestore';
import {
  GetNarrationRequestSchema,
  NarrationDocSchema,
  PoiSchema,
  budgetDecision,
  effectiveTier,
  evaluateFactCheck,
  layoutParagraphs,
  narrationKey,
  isPartnerLive,
  partnerIntro,
  silencePcm,
  PARAGRAPH_GAP_MS,
  sourceRichness,
  sourceText,
  sourceLangsFor,
  systemPrompt,
  userPrompt,
  type AiConfig,
  type FactCheckResult,
  type NarrationDoc,
  type NarrationResponse,
  type Poi,
  type SourceBundle,
} from '@tuur/shared';
import type { LlmProvider, GroundingInfo } from '../providers/llm';
import type { NarrationSourceProvider } from '../providers/narrationSources';
import type { AudioEncoder, TtsProvider } from '../providers/tts';
import { loadAiConfig } from '../util/aiConfig';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';
import { logUsage, spentToday } from '../util/usage';
import { loadPartner } from '../partners/service';

export interface ObjectStore {
  put(path: string, data: Buffer, mimeType: string): Promise<void>;
  delete(path: string): Promise<void>;
}

export interface NarrationDeps {
  db: Firestore;
  llm: LlmProvider;
  tts: TtsProvider;
  encoder: AudioEncoder;
  sources: NarrationSourceProvider;
  store: ObjectStore;
  now: () => number;
  /** Hook for entitlement checks (Phase 9); throws to deny. */
  authorize?: (
    uid: string,
    poi: Poi,
    access:
      { tourId?: string | undefined; mode?: 'tour' | 'planned' | 'fork' | 'roam' | undefined } | undefined,
  ) => Promise<void>;
  /** Overrides config loading in tests. */
  config?: () => Promise<AiConfig>;
}

export class NarrationError extends Error {
  constructor(
    readonly code:
      | 'not-found'
      | 'permission-denied'
      | 'resource-exhausted'
      | 'failed-precondition'
      | 'unavailable'
      | 'invalid-argument',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Partner content that may be spoken for a POI (only while the partner is live), plus its revision for the cache key. */
interface PartnerContext {
  rev: number;
  facts: string[];
}

async function partnerContext(db: Firestore, poi: Poi, now: number): Promise<PartnerContext | undefined> {
  if (!poi.partnerId) return undefined;
  const p = await loadPartner(db, poi.partnerId);
  if (!p || !isPartnerLive(p, now)) return undefined;
  return {
    rev: p.contentRev,
    facts: [
      `${p.name} (${p.category}): ${p.description}`,
      ...(p.openingHours ? [`Opening hours: ${p.openingHours}`] : []),
    ],
  };
}

const LOCK_TTL_MS = 3 * 60_000;
const MAX_FAILURES_PER_DAY = 3;

function toResponse(
  doc: NarrationDoc,
  poi: Poi,
  cached: boolean,
  grounding?: GroundingInfo,
): NarrationResponse {
  return {
    key: doc.key,
    title: doc.title,
    text: doc.text,
    paragraphs: doc.paragraphs,
    keyFacts: doc.keyFacts,
    audioPath: doc.audioPath,
    audioDurationMs: doc.audioDurationMs,
    ...(doc.sponsored ? { sponsored: true } : {}),
    images: poi.imageRefs.map((i) => ({
      url: i.url,
      ...(i.thumbUrl ? { thumbUrl: i.thumbUrl } : {}),
      ...(i.author ? { author: i.author } : {}),
      license: i.license,
      ...(i.licenseUrl ? { licenseUrl: i.licenseUrl } : {}),
      sourceUrl: i.sourceUrl,
    })),
    cached,
    aiGenerated: true,
    ...(grounding ? { grounding } : {}),
  };
}

async function loadPoi(db: Firestore, poiId: string): Promise<Poi> {
  const snap = await db.collection('pois').doc(poiId).get();
  if (!snap.exists) throw new NarrationError('not-found', 'POI not found');
  const poi = PoiSchema.parse(snap.data());
  if (poi.hidden) throw new NarrationError('not-found', 'POI not available');
  return poi;
}

/**
 * getNarration (spec 4.4): cache -> sources -> Gemini -> fact check -> TTS -> storage.
 * Cache hits are free and never rate limited; only generation is gated by rate limits and budgets.
 */
export async function getNarration(deps: NarrationDeps, uid: string, rawReq: unknown) {
  const parsed = GetNarrationRequestSchema.safeParse(rawReq);
  if (!parsed.success) throw new NarrationError('invalid-argument', 'Invalid request');
  const req = parsed.data;
  const cfg = await (deps.config ?? (() => loadAiConfig(deps.db, deps.now())))();
  const poi = await loadPoi(deps.db, req.poiId);
  await deps.authorize?.(uid, poi, req.access);

  const partner = await partnerContext(deps.db, poi, deps.now());
  const key = narrationKey(
    { ...req, primaryInterest: req.primaryInterest ?? poi.primaryInterest },
    partner ? `${cfg.promptVersion}-p${partner.rev}` : cfg.promptVersion,
  );
  const ref = deps.db.collection('narrations').doc(key);

  const hit = await ref.get();
  if (hit.exists) {
    const doc = NarrationDocSchema.parse(hit.data());
    if (doc.status === 'ok' && !doc.grounded) return toResponse(doc, poi, true);
  }

  // Grounded output must not be shared between users (D16): it is generated and stored per user.
  const grounded = cfg.groundingEnabled;
  const cacheRef = grounded
    ? deps.db.collection('users').doc(uid).collection('groundedNarrations').doc(key)
    : ref;
  if (grounded) {
    const own = await cacheRef.get();
    if (own.exists) {
      const doc = NarrationDocSchema.parse(own.data());
      if (doc.groundedExpiresAt && doc.groundedExpiresAt > deps.now()) return toResponse(doc, poi, true);
    }
  }

  const failRef = deps.db.collection('narrationFailures').doc(key);
  const fail = await failRef.get();
  if (
    fail.exists &&
    Number(fail.get('count')) >= MAX_FAILURES_PER_DAY &&
    deps.now() - Number(fail.get('lastAt')) < 24 * 3600_000
  ) {
    throw new NarrationError('failed-precondition', 'No verifiable narration available for this place', {
      reason: 'unverifiable',
    });
  }

  try {
    if (req.download)
      await consumeRateLimit(
        deps.db,
        `narr_dl_${uid}`,
        cfg.rateLimits.downloadPerUserPerHour,
        3600_000,
        deps.now(),
      );
    else
      await consumeRateLimit(
        deps.db,
        `narr_user_${uid}`,
        cfg.rateLimits.perUserPerHour,
        3600_000,
        deps.now(),
      );
    await consumeRateLimit(
      deps.db,
      `narr_area_${poi.tile}`,
      cfg.rateLimits.perAreaPerHour,
      3600_000,
      deps.now(),
    );
  } catch (e) {
    if (e instanceof RateLimitError)
      throw new NarrationError('resource-exhausted', 'Too many requests', { retryAfterMs: e.retryAfterMs });
    throw e;
  }
  const budget = budgetDecision(cfg, await spentToday(deps.db, poi.tile, deps.now()));
  if (!budget.allowed)
    throw new NarrationError('unavailable', 'Generation is paused', { reason: budget.reason });

  // Single-flight: only one generation per key; others wait for the result.
  const lockRef = deps.db.collection('narrationLocks').doc(grounded ? `${uid}__${key}` : key);
  const gotLock = await deps.db.runTransaction(async (tx) => {
    const s = await tx.get(lockRef);
    if (s.exists && deps.now() - Number(s.get('at')) < LOCK_TTL_MS) return false;
    tx.set(lockRef, { at: deps.now() });
    return true;
  });
  if (!gotLock) {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const s = await cacheRef.get();
      if (s.exists) {
        const doc = NarrationDocSchema.parse(s.data());
        if (doc.status === 'ok') return toResponse(doc, poi, true);
      }
    }
    throw new NarrationError('unavailable', 'Generation in progress, try again shortly');
  }

  try {
    // Re-check after taking the lock: another request may have finished between our cache miss and the lock.
    const late = await cacheRef.get();
    if (late.exists) {
      const doc = NarrationDocSchema.parse(late.data());
      if (doc.status === 'ok' && (!grounded || (doc.groundedExpiresAt ?? 0) > deps.now()))
        return toResponse(doc, poi, true);
    }
    return await generate(deps, cfg, poi, req, key, cacheRef, grounded, partner);
  } catch (e) {
    if (
      e instanceof NarrationError &&
      e.code === 'failed-precondition' &&
      e.details?.['reason'] !== 'insufficient_sources'
    ) {
      await failRef.set({ count: Number(fail.get('count') ?? 0) + 1, lastAt: deps.now() }, { merge: true });
    }
    throw e;
  } finally {
    await lockRef.delete().catch(() => undefined);
  }
}

async function generate(
  deps: NarrationDeps,
  cfg: AiConfig,
  poi: Poi,
  req: ReturnType<typeof GetNarrationRequestSchema.parse>,
  key: string,
  cacheRef: FirebaseFirestore.DocumentReference,
  grounded: boolean,
  partner?: PartnerContext,
) {
  const langs = [req.lang, ...sourceLangsFor('XX')].filter((l, i, a) => a.indexOf(l) === i);
  // Local-language sources first (richest), narration in the user's language.
  const placeLangs = await areaLangs(deps.db, poi);
  const gathered: SourceBundle = await deps.sources.gather(
    poi,
    [...placeLangs, ...langs].filter((l, i, a) => a.indexOf(l) === i),
  );
  const bundle: SourceBundle = partner ? { ...gathered, partnerFacts: partner.facts } : gathered;

  const tierDecision = effectiveTier(req.lengthTier, sourceRichness(bundle));
  if (!tierDecision.ok)
    throw new NarrationError('failed-precondition', 'Not enough verified source material', {
      reason: tierDecision.reason,
    });
  const tier = tierDecision.tier;
  const interest = req.primaryInterest ?? poi.primaryInterest;
  const sources = sourceText(bundle);

  let accepted:
    { output: Awaited<ReturnType<LlmProvider['generateNarration']>>; check: FactCheckResult } | undefined;
  let lastCheck: FactCheckResult | undefined;
  for (let attempt = 0; attempt < 2 && !accepted; attempt++) {
    const retryNote = lastCheck
      ? `\n\nYour previous attempt was rejected because these claims are not supported by the sources: ${JSON.stringify(lastCheck.unsupported)}. Remove them and use only the sources.`
      : '';
    const gen = await deps.llm.generateNarration({
      model: cfg.models.narration,
      system: systemPrompt(req.lang),
      user: userPrompt({ bundle, lang: req.lang, tier, interest, context: req.context }) + retryNote,
      grounding: grounded,
      bundle,
      lang: req.lang,
      tier,
    });
    await logUsage(
      deps.db,
      cfg.pricing,
      {
        kind: 'narration',
        model: cfg.models.narration,
        usage: { ...gen.usage, groundingQueries: gen.grounding?.queries ?? 0 },
        tile: poi.tile,
        key,
        ok: true,
      },
      deps.now(),
    );

    const fc = await deps.llm.checkFacts({ model: cfg.models.lite, facts: gen.output.keyFacts, sources });
    await logUsage(
      deps.db,
      cfg.pricing,
      { kind: 'factcheck', model: cfg.models.lite, usage: fc.usage, tile: poi.tile, key, ok: true },
      deps.now(),
    );
    const check = evaluateFactCheck(gen.output, sources, fc.verdicts);
    if (check.ok) accepted = { output: gen, check };
    else {
      lastCheck = check;
      await logUsage(
        deps.db,
        cfg.pricing,
        {
          kind: 'narration',
          model: cfg.models.narration,
          usage: {},
          tile: poi.tile,
          key,
          ok: false,
          note: `discarded:${check.reason}`,
        },
        deps.now(),
      );
    }
  }
  if (!accepted)
    throw new NarrationError('failed-precondition', 'Narration could not be verified against sources', {
      reason: lastCheck?.reason ?? 'unverifiable',
    });

  const { output, grounding } = accepted.output;
  const audioBase = grounded
    ? `narrations-grounded/${cacheRef.parent.parent?.id ?? 'u'}/${key}`
    : `narrations/${key}`;
  // Partner content is announced before it is spoken (UWG, spec 7.3); the label is added here, never left to the model.
  const spoken = partner
    ? [`${partnerIntro(req.lang)} ${output.paragraphs[0]!}`, ...output.paragraphs.slice(1)]
    : output.paragraphs;
  const audio = await renderAudio(deps, cfg, spoken, req.lang, audioBase, { tile: poi.tile, key });
  const { layout, enc, audioPath } = audio;

  const doc: NarrationDoc = NarrationDocSchema.parse({
    key,
    poiId: poi.id,
    lang: req.lang,
    lengthTier: req.lengthTier,
    primaryInterest: interest ?? 'balanced',
    promptVersion: cfg.promptVersion,
    sponsored: Boolean(partner),
    title: output.title,
    text: layout.map((l) => l.text).join('\n\n'),
    paragraphs: layout,
    keyFacts: output.keyFacts,
    sourcesUsed: output.sourcesUsed,
    audioPath,
    audioMimeType: enc.mimeType,
    audioDurationMs: layout.length
      ? layout[layout.length - 1]!.startMs + layout[layout.length - 1]!.durationMs
      : 0,
    grounded,
    ...(grounded ? { groundedExpiresAt: deps.now() + 30 * 24 * 3600_000 } : {}),
    status: 'ok',
    models: { text: cfg.models.narration, tts: cfg.models.tts },
    createdAt: deps.now(),
  });
  await cacheRef.set(doc);
  return toResponse(doc, poi, false, grounding);
}

/** TTS per paragraph (exact timings), joined with pauses, MP3-encoded and stored. Shared by narrations and transitions. */
export async function renderAudio(
  deps: Pick<NarrationDeps, 'db' | 'tts' | 'encoder' | 'store' | 'now'>,
  cfg: AiConfig,
  paragraphs: string[],
  lang: string,
  pathBase: string,
  attribution: { tile: string; key: string },
) {
  const voice = cfg.voices[lang] ?? cfg.voices['default'] ?? 'Kore';
  const pcms: { text: string; pcm: Uint8Array }[] = [];
  let ttsChars = 0;
  for (const text of paragraphs) {
    const r = await deps.tts.synthesize({ text, lang, voice, model: cfg.models.tts });
    pcms.push({ text, pcm: r.pcm });
    ttsChars += r.chars;
  }
  await logUsage(
    deps.db,
    cfg.pricing,
    {
      kind: 'tts',
      model: cfg.models.tts,
      usage: { ttsChars },
      tile: attribution.tile,
      key: attribution.key,
      ok: true,
    },
    deps.now(),
  );
  const layout = layoutParagraphs(
    pcms.map((p) => ({ text: p.text, pcmBytes: p.pcm.byteLength })),
    PARAGRAPH_GAP_MS,
  );
  const gap = silencePcm(PARAGRAPH_GAP_MS);
  const total = pcms.reduce(
    (n, p, i) => n + p.pcm.byteLength + (i < pcms.length - 1 ? gap.byteLength : 0),
    0,
  );
  const all = new Uint8Array(total);
  let off = 0;
  pcms.forEach((p, i) => {
    all.set(p.pcm, off);
    off += p.pcm.byteLength;
    if (i < pcms.length - 1) {
      all.set(gap, off);
      off += gap.byteLength;
    }
  });
  const enc = deps.encoder.encode(all);
  const audioPath = `${pathBase}.${enc.ext}`;
  await deps.store.put(audioPath, enc.data, enc.mimeType);
  return { layout, enc, audioPath };
}

async function areaLangs(db: Firestore, poi: Poi): Promise<string[]> {
  const area = await db.collection('areas').doc(poi.tile).get();
  const placeId = area.get('placeId') as string | undefined;
  if (!placeId) return [];
  const place = await db.collection('places').doc(placeId).get();
  return (place.get('sourceLangs') as string[] | undefined) ?? [];
}

/** Blocks a narration pending review (user report or admin action) and removes its audio from public reach. */
export async function blockNarration(
  deps: Pick<NarrationDeps, 'db' | 'store' | 'now'>,
  key: string,
  status: 'blocked' | 'pending_review',
): Promise<void> {
  const ref = deps.db.collection('narrations').doc(key);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.update({ status, statusAt: deps.now() });
  const audioPath = snap.get('audioPath') as string | undefined;
  if (audioPath) await deps.store.delete(audioPath).catch(() => undefined);
}

export interface FeedbackInput {
  narrationKey: string;
  reason: 'wrong_fact' | 'offensive' | 'audio_issue' | 'other';
  text?: string;
}

/** Stores a user report and blocks the narration until reviewed; next request regenerates it (spec 4.4.8). */
export async function reportNarrationIssue(
  deps: Pick<NarrationDeps, 'db' | 'store' | 'now'>,
  uid: string,
  input: FeedbackInput,
): Promise<{ id: string }> {
  await consumeRateLimit(deps.db, `feedback_${uid}`, 20, 24 * 3600_000, deps.now());
  const dupe = deps.db.collection('feedback').doc(`${uid}__${input.narrationKey}`.slice(0, 400));
  const s = await dupe.get();
  if (s.exists) return { id: dupe.id };
  await dupe.set({
    narrationKey: input.narrationKey,
    uid,
    reason: input.reason,
    ...(input.text ? { text: input.text.slice(0, 1000) } : {}),
    status: 'open',
    createdAt: deps.now(),
  });
  if (input.reason === 'wrong_fact' || input.reason === 'offensive')
    await blockNarration(deps, input.narrationKey, 'pending_review');
  return { id: dupe.id };
}
