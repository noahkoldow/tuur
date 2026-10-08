import type { Firestore } from 'firebase-admin/firestore';
import {
  GetNarrationRequestSchema,
  NarrationDocSchema,
  PoiSchema,
  budgetDecision,
  effectiveTier,
  evaluateFactCheck,
  layoutParagraphs,
  localObservation,
  isLocalContextPoi,
  isUnadaptedSourceText,
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
  parseVoiceSpec,
  pickVoiceSpec,
  resolvePersona,
  type VoicePersona,
} from '@tuur/shared';
import { z } from 'zod';
import type { LlmProvider, GroundingInfo } from '../providers/llm';
import type { NarrationSourceProvider } from '../providers/narrationSources';
import { RoutedTtsProvider, type AudioEncoder, type TtsProvider } from '../providers/tts';
import { loadAiConfig } from '../util/aiConfig';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';
import { BudgetError, logUsage, spentToday, withBudget } from '../util/usage';
import { budgetedLlm } from '../providers/budgeted';
import { MAX_TTS_TEXT_CHARS } from '../providers/limits';
import { loadPartner } from '../partners/service';
import { personalAudioPrefix, personalNarrationScope } from './personalScope';
import { bindDownloadRecording } from '../billing/timeBudget';
import { authorizedGroup } from '../groups/service';
import { GroupAudioPendingError, recordingFromResponse, sharedGroupRecording } from '../groups/recordings';
import { consentBoundLlm, requireAiConsent } from '../privacy/aiConsent';

export interface ObjectStore {
  put(path: string, data: Buffer, mimeType: string): Promise<void>;
  delete(path: string): Promise<void>;
  /** Short-lived read URL for a private object (production: V4 signed URL). */
  signedUrl?(path: string, ttlMs: number): Promise<string>;
}

export const AUDIO_URL_TTL_MS = 6 * 60 * 60_000;

export async function withAudioUrl<T extends { audioPath: string }>(
  store: ObjectStore,
  r: T,
): Promise<T & { audioUrl?: string }> {
  if (!store.signedUrl) return r;
  return { ...r, audioUrl: await store.signedUrl(r.audioPath, AUDIO_URL_TTL_MS) };
}

export interface NarrationDeps {
  db: Firestore;
  llm: LlmProvider;
  /** A routed provider (live) or a single provider used for every voice (tests, mock). */
  tts: TtsProvider | RoutedTtsProvider;
  encoder: AudioEncoder;
  sources: NarrationSourceProvider;
  store: ObjectStore;
  now: () => number;
  /** Hook for entitlement checks (Phase 9); throws to deny. */
  authorize?: (
    uid: string,
    poi: Poi,
    access:
      | {
          tourId?: string | undefined;
          mode?: 'tour' | 'planned' | 'fork' | 'roam' | undefined;
          groupId?: string | undefined;
          sessionId?: string | undefined;
          downloadId?: string | undefined;
        }
      | undefined,
    opts?: { download?: boolean },
  ) => Promise<void>;
  /** Overrides config loading in tests. */
  config?: () => Promise<AiConfig>;
  /** Request-scoped provider boundary; rechecked before every external AI request. */
  beforeAiRequest?: () => Promise<void>;
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

/** A paused host is a waiting state for guests, while ended membership is a permanent denial. */
export async function groupForAudio(
  deps: Pick<NarrationDeps, 'db' | 'now'>,
  uid: string,
  groupId: string,
  poiIds: string[],
  download = false,
) {
  try {
    return await authorizedGroup(deps, uid, groupId, { poiIds, download, waitForHost: true });
  } catch (error) {
    if (error instanceof GroupAudioPendingError)
      throw new NarrationError(error.code, error.message, error.details);
    throw error;
  }
}

/** Partner content that may be spoken for a POI (only while the partner is live), plus its revision for the cache key. */
interface PartnerContext {
  rev: number;
  facts: string[];
}

async function partnerContext(
  db: Firestore,
  poi: Poi,
  now: number,
  uid: string,
): Promise<PartnerContext | undefined> {
  if (!poi.partnerId) return undefined;
  if ((await db.collection('users').doc(uid).collection('blockedPartners').doc(poi.partnerId).get()).exists)
    return undefined;
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

export const REPORTS_TO_BLOCK = 3;

const LOCK_TTL_MS = 6 * 60_000;
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
    ...((grounding ?? doc.grounding) ? { grounding: grounding ?? doc.grounding } : {}),
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
  if (req.access?.downloadId && req.access.downloadId !== req.context?.script?.instanceId)
    throw new NarrationError('permission-denied', 'Download recording identity does not match');
  if (req.access?.groupId) {
    const group = await groupForAudio(deps, uid, req.access.groupId, [req.poiId], Boolean(req.download));
    if (!group)
      throw new NarrationError('permission-denied', 'Group access has ended', { reason: 'group_ended' });
    if (!group.audio)
      throw new NarrationError('failed-precondition', 'The host must create a new group', {
        reason: 'group_audio_unavailable',
      });
    const poi = await loadPoi(deps.db, req.poiId);
    if (
      poi.partnerId &&
      (await deps.db.collection('users').doc(uid).collection('blockedPartners').doc(poi.partnerId).get())
        .exists
    )
      throw new NarrationError('permission-denied', 'This partner is hidden', { reason: 'partner_blocked' });
    try {
      const recording = await sharedGroupRecording(deps, group, uid, { poiId: req.poiId }, async () => {
        const result = await getNarrationChecked(deps, uid, {
          ...req,
          lang: group.audio!.lang,
          voice: group.audio!.voice,
          primaryInterest: group.audio!.primaryInterest ?? req.primaryInterest,
          context: { ...req.context, script: group.audio!.script },
          access: { ...req.access, tourId: group.tour.id, mode: group.mode, sessionId: group.sessionId },
        });
        return recordingFromResponse(deps, group, result);
      });
      // Do not issue a fresh signed URL after the host ends or pauses the walk during generation.
      if (!(await groupForAudio(deps, uid, group.id, [poi.id])))
        throw new NarrationError('permission-denied', 'Group access has ended', { reason: 'group_ended' });
      return withAudioUrl(deps.store, toResponse(recording.doc, poi, true, recording.grounding));
    } catch (error) {
      if (error instanceof GroupAudioPendingError)
        throw new NarrationError(error.code, error.message, error.details);
      throw error;
    }
  }
  return withAudioUrl(deps.store, await getNarrationChecked(deps, uid, rawReq));
}

async function getNarrationChecked(deps: NarrationDeps, uid: string, rawReq: unknown) {
  const parsed = GetNarrationRequestSchema.safeParse(rawReq);
  if (!parsed.success) throw new NarrationError('invalid-argument', 'Invalid request');
  const req = parsed.data;
  if (
    req.download &&
    (!req.access?.tourId || (req.access.mode && !['tour', 'planned'].includes(req.access.mode)))
  )
    throw new NarrationError('permission-denied', 'Only fixed itineraries can be downloaded', {
      reason: 'download_not_supported',
    });
  const beforeAiRequest = () => requireAiConsent(deps.db, uid);
  deps = { ...deps, beforeAiRequest, llm: consentBoundLlm(deps.llm, beforeAiRequest) };
  const cfg = await (deps.config ?? (() => loadAiConfig(deps.db, deps.now())))();
  const poi = await loadPoi(deps.db, req.poiId);
  await deps.authorize?.(uid, poi, req.access, { download: Boolean(req.download) });
  if (req.download && req.access?.downloadId)
    await bindDownloadRecording(deps, uid, {
      downloadId: req.access.downloadId,
      slot: { poiId: req.poiId, lengthTier: req.lengthTier },
      identity: JSON.stringify({
        lang: req.lang,
        voice: req.voice,
        primaryInterest: req.primaryInterest,
        context: req.context,
      }),
    });

  const partner = await partnerContext(deps.db, poi, deps.now(), uid);
  const scope = personalNarrationScope(uid, req.context?.script?.instanceId);
  const key = scope.key(
    narrationKey(
      { ...req, primaryInterest: req.primaryInterest ?? poi.primaryInterest },
      partner ? `${cfg.promptVersion}-p${partner.rev}` : cfg.promptVersion,
    ),
  );
  const ref = deps.db.collection('narrations').doc(key);

  const persona = resolvePersona(cfg.voiceCast, cfg.defaultVoiceId, req.voice);
  const hit = await ref.get();
  if (hit.exists) {
    const doc = NarrationDocSchema.parse(hit.data());
    if (
      doc.status === 'ok' &&
      !doc.grounded &&
      doc.ownerUid === uid &&
      doc.scriptInstanceId === scope.scriptInstanceId
    )
      return toResponse(await inVoice(deps, cfg, doc, ref, persona, poi), poi, true);
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
      if (
        doc.ownerUid === uid &&
        doc.scriptInstanceId === scope.scriptInstanceId &&
        doc.groundedExpiresAt &&
        doc.groundedExpiresAt > deps.now()
      )
        return toResponse(await inVoice(deps, cfg, doc, cacheRef, persona, poi), poi, true);
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
    tx.set(lockRef, { at: deps.now(), expireAt: new Date(deps.now() + 3600_000) });
    return true;
  });
  if (!gotLock) {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const s = await cacheRef.get();
      if (s.exists) {
        const doc = NarrationDocSchema.parse(s.data());
        if (doc.status === 'ok' && doc.ownerUid === uid && doc.scriptInstanceId === scope.scriptInstanceId)
          return toResponse(doc, poi, true);
      }
    }
    throw new NarrationError('unavailable', 'Generation in progress, try again shortly');
  }

  try {
    // Re-check after taking the lock: another request may have finished between our cache miss and the lock.
    const late = await cacheRef.get();
    if (late.exists) {
      const doc = NarrationDocSchema.parse(late.data());
      if (
        doc.status === 'ok' &&
        doc.ownerUid === uid &&
        doc.scriptInstanceId === scope.scriptInstanceId &&
        (!grounded || (doc.groundedExpiresAt ?? 0) > deps.now())
      )
        return toResponse(doc, poi, true);
    }
    return await generate(deps, cfg, poi, req, key, cacheRef, grounded, persona, scope, partner);
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
  persona: VoicePersona,
  scope: ReturnType<typeof personalNarrationScope>,
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

  const observation = isLocalContextPoi(poi) ? localObservation(bundle, req.lang, req.context) : undefined;
  const tierDecision = effectiveTier(req.lengthTier, sourceRichness(bundle));
  if (!tierDecision.ok && !observation)
    throw new NarrationError('failed-precondition', 'Not enough verified source material', {
      reason: 'insufficient_sources',
    });
  const tier = tierDecision.ok ? tierDecision.tier : 'short';
  const interest = req.primaryInterest ?? poi.primaryInterest;
  const sources = sourceText(bundle);

  let accepted:
    { output: Awaited<ReturnType<LlmProvider['generateNarration']>>; check: FactCheckResult } | undefined;
  // This fixed observation contains only the source's place name and open questions. It makes no
  // historical claims, so scarce local data never needs to be padded to satisfy a model word count.
  if (observation)
    accepted = { output: { output: observation, usage: {} }, check: { ok: true, unsupported: [] } };
  let lastCheck: FactCheckResult | undefined;
  const llm = budgetedLlm(deps.llm, deps.db, cfg, deps.now, { tile: poi.tile, key });
  for (let attempt = 0; attempt < 2 && !accepted; attempt++) {
    const retryNote = lastCheck
      ? lastCheck.reason === 'raw_source_text'
        ? '\n\nYour previous attempt copied the raw source text. Develop a new conversational recording script from its verified facts, with your own phrasing and a connection to the tour. Do not return the source document.'
        : `\n\nYour previous attempt was rejected because these claims are not supported by the sources: ${JSON.stringify(lastCheck.unsupported)}. Remove them and use only the sources.`
      : '';
    const gen = await llm.generateNarration({
      model: cfg.models.narration,
      system: systemPrompt(req.lang),
      user: userPrompt({ bundle, lang: req.lang, tier, interest, context: req.context }) + retryNote,
      grounding: grounded,
      bundle,
      lang: req.lang,
      tier,
    });
    if (isUnadaptedSourceText(gen.output.paragraphs, bundle)) {
      lastCheck = { ok: false, unsupported: [], reason: 'raw_source_text' };
      continue;
    }
    const fc = await llm.checkFacts({ model: cfg.models.lite, facts: gen.output.keyFacts, sources });
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
    : `${personalAudioPrefix(scope.ownerUid)}${key}`;
  // Partner content is announced before it is spoken (UWG, spec 7.3); the label is added here, never left to the model.
  // The source bundle and fact-check metadata never enter TTS: only the accepted recording script.
  const spoken = partner
    ? [`${partnerIntro(req.lang)} ${output.paragraphs[0]!}`, ...output.paragraphs.slice(1)]
    : output.paragraphs;
  const audio = await renderAudio(deps, cfg, spoken, req.lang, audioBase, { tile: poi.tile, key }, persona);
  const { layout, enc, audioPath } = audio;

  const doc: NarrationDoc = NarrationDocSchema.parse({
    key,
    ownerUid: scope.ownerUid,
    scriptInstanceId: scope.scriptInstanceId,
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
    voiceId: persona.id,
    audioDurationMs: layout.length
      ? layout[layout.length - 1]!.startMs + layout[layout.length - 1]!.durationMs
      : 0,
    grounded,
    ...(grounding ? { grounding } : {}),
    ...(grounded ? { groundedExpiresAt: deps.now() + 30 * 24 * 3600_000 } : {}),
    status: 'ok',
    models: { text: cfg.models.narration, tts: cfg.models.tts },
    createdAt: deps.now(),
  });
  await cacheRef.set(doc);
  return toResponse(doc, poi, false, grounding);
}

const VoiceVariantSchema = z.object({
  voiceId: z.string(),
  audioPath: z.string(),
  audioMimeType: z.string(),
  paragraphs: NarrationDocSchema.shape.paragraphs,
  audioDurationMs: z.number().nonnegative(),
  createdAt: z.number(),
});

/**
 * The personal narration in the listener's voice. Text is reused only inside this owner's script instance;
 * other voices only render audio, stored in `voices/{personaId}` under the narration (timings differ per voice).
 */
export async function inVoice(
  deps: Pick<NarrationDeps, 'db' | 'tts' | 'encoder' | 'store' | 'now' | 'beforeAiRequest'>,
  cfg: AiConfig,
  doc: NarrationDoc,
  ref: FirebaseFirestore.DocumentReference,
  persona: VoicePersona,
  poi: Poi,
): Promise<NarrationDoc> {
  if ((doc.voiceId ?? cfg.defaultVoiceId) === persona.id) return doc;
  const vref = ref.collection('voices').doc(persona.id);
  const have = await vref.get();
  const cached = have.exists ? VoiceVariantSchema.safeParse(have.data()) : undefined;
  if (cached?.success) return { ...doc, ...cached.data };
  const budget = budgetDecision(cfg, await spentToday(deps.db, poi.tile, deps.now()));
  // Over budget: serve the stored voice rather than failing the stop.
  if (!budget.allowed) return doc;
  const base = doc.audioPath.replace(/\.[a-z0-9]+$/i, '');
  const audio = await renderAudio(
    deps,
    cfg,
    doc.paragraphs.map((p) => p.text),
    doc.lang,
    `${base}__${persona.id}`,
    { tile: poi.tile, key: doc.key },
    persona,
  ).catch((error: unknown) => {
    if (error instanceof BudgetError) return undefined;
    throw error;
  });
  if (!audio) return doc;
  const last = audio.layout[audio.layout.length - 1];
  const variant = VoiceVariantSchema.parse({
    voiceId: persona.id,
    audioPath: audio.audioPath,
    audioMimeType: audio.enc.mimeType,
    paragraphs: audio.layout,
    audioDurationMs: last ? last.startMs + last.durationMs : 0,
    createdAt: deps.now(),
  });
  await vref.set(variant);
  return { ...doc, ...variant };
}

/** TTS per paragraph (exact timings), joined with pauses, MP3-encoded and stored. Shared by narrations and transitions. */
export async function renderAudio(
  deps: Pick<NarrationDeps, 'db' | 'tts' | 'encoder' | 'store' | 'now' | 'beforeAiRequest'>,
  cfg: AiConfig,
  paragraphs: string[],
  lang: string,
  pathBase: string,
  attribution: { tile: string; key: string },
  persona: VoicePersona = resolvePersona(cfg.voiceCast, cfg.defaultVoiceId),
) {
  const tts =
    deps.tts instanceof RoutedTtsProvider
      ? deps.tts
      : new RoutedTtsProvider({ gemini: deps.tts, openai: deps.tts });
  const spec = pickVoiceSpec(persona, tts.available);
  // No provider for this persona: the legacy per-language Gemini voice keeps narration working.
  const { provider, name } = spec
    ? parseVoiceSpec(spec)
    : { provider: 'gemini' as const, name: cfg.voices[lang] ?? cfg.voices['default'] ?? 'Kore' };
  const model = cfg.ttsModels[provider] ?? cfg.models.tts;
  const pcms: { text: string; pcm: Uint8Array }[] = [];
  for (const text of paragraphs) {
    if (text.length > MAX_TTS_TEXT_CHARS) throw new BudgetError('input_too_large');
    const r = await withBudget(
      deps.db,
      cfg,
      { kind: 'tts', model, ...attribution },
      { ttsChars: text.length, ttsProvider: provider },
      async () => {
        await deps.beforeAiRequest?.();
        const result = await tts.synthesize(provider, {
          text,
          lang,
          voice: name,
          model,
          style: persona.style,
        });
        return { ...result, usage: { ttsChars: result.chars, ttsProvider: provider } };
      },
      deps.now,
    );
    pcms.push({ text, pcm: r.pcm });
  }
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
  // only reports about narrations that exist count (no probing of arbitrary keys)
  const target = await deps.db.collection('narrations').doc(input.narrationKey).get();
  if (!target.exists) return { id: dupe.id };
  const ownerUid = target.get('ownerUid') as string | undefined;
  if (ownerUid && ownerUid !== uid) return { id: dupe.id };
  await dupe.set({
    narrationKey: input.narrationKey,
    uid,
    reason: input.reason,
    ...(input.text ? { text: input.text.slice(0, 1000) } : {}),
    status: 'open',
    createdAt: deps.now(),
  });
  // A shared narration (and its audio) is only pulled after several distinct reporters agree; one account
  // (or a few throw-away accounts) cannot knock out content and force paid regeneration on its own.
  if (input.reason === 'wrong_fact' || input.reason === 'offensive') {
    if (ownerUid === uid) {
      // Only this owner can hear the personal chapter; their report is sufficient to regenerate it.
      await blockNarration(deps, input.narrationKey, 'pending_review');
      return { id: dupe.id };
    }
    const same = await deps.db
      .collection('feedback')
      .where('narrationKey', '==', input.narrationKey)
      .where('reason', 'in', ['wrong_fact', 'offensive'])
      .limit(REPORTS_TO_BLOCK)
      .get();
    if (new Set(same.docs.map((d) => d.get('uid'))).size >= REPORTS_TO_BLOCK)
      await blockNarration(deps, input.narrationKey, 'pending_review');
  }
  return { id: dupe.id };
}
