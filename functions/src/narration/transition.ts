import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  NarrationLangSchema,
  NarrationDocSchema,
  PoiSchema,
  budgetDecision,
  type NarrationDoc,
  resolvePersona,
  storyFingerprint,
  sanitizeForPrompt,
} from '@tuur/shared';
import { loadAiConfig } from '../util/aiConfig';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';
import { spentToday } from '../util/usage';
import { budgetedLlm } from '../providers/budgeted';
import { NarrationError, groupForAudio, renderAudio, withAudioUrl, type NarrationDeps } from './service';
import { personalAudioPrefix, personalNarrationScope } from './personalScope';
import { bindDownloadRecording } from '../billing/timeBudget';
import { GroupAudioPendingError, recordingFromResponse, sharedGroupRecording } from '../groups/recordings';
import { consentBoundLlm, requireAiConsent } from '../privacy/aiConsent';

export const GetTransitionRequestSchema = z.object({
  fromPoiId: z.string().min(1).max(120),
  toPoiId: z.string().min(1).max(120),
  lang: NarrationLangSchema,
  /** Rounded so retries of an equal hop within this personal script can reuse their recording. */
  walkMinutes: z.number().min(1).max(240),
  tourTitle: z.string().max(200).optional(),
  scriptInstanceId: z.string().min(1).max(120).optional(),
  download: z.boolean().optional(),
  voice: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,30}$/)
    .optional(),
  access: z
    .object({
      tourId: z.string().max(200).optional(),
      mode: z.enum(['tour', 'planned', 'fork', 'roam']).optional(),
      groupId: z.string().max(60).optional(),
      sessionId: z.string().min(1).max(120).optional(),
      downloadId: z.string().min(1).max(120).optional(),
    })
    .optional(),
});

/** Short optional hand-over between two stops (lite model, cached like narrations, spec 4.4.7). */
export async function getTransition(deps: NarrationDeps, uid: string, raw: unknown) {
  const parsed = GetTransitionRequestSchema.safeParse(raw);
  if (!parsed.success) throw new NarrationError('invalid-argument', 'Invalid request');
  const req = parsed.data;
  if (req.access?.downloadId && req.access.downloadId !== req.scriptInstanceId)
    throw new NarrationError('permission-denied', 'Download recording identity does not match');
  if (req.access?.groupId) {
    const poiIds = [req.fromPoiId, req.toPoiId];
    const group = await groupForAudio(deps, uid, req.access.groupId, poiIds, Boolean(req.download));
    if (!group)
      throw new NarrationError('permission-denied', 'Group access has ended', { reason: 'group_ended' });
    if (!group.audio)
      throw new NarrationError('failed-precondition', 'The host must create a new group', {
        reason: 'group_audio_unavailable',
      });
    try {
      const recording = await sharedGroupRecording(
        deps,
        group,
        uid,
        {
          poiId: req.toPoiId,
          fromPoiId: req.fromPoiId,
        },
        async () => {
          const result = await getTransitionChecked(deps, uid, {
            ...req,
            lang: group.audio!.lang,
            voice: group.audio!.voice,
            scriptInstanceId: group.audio!.script.instanceId,
            access: { ...req.access, tourId: group.tour.id, mode: group.mode, sessionId: group.sessionId },
          });
          return recordingFromResponse(deps, group, result);
        },
      );
      if (!(await groupForAudio(deps, uid, group.id, poiIds)))
        throw new NarrationError('permission-denied', 'Group access has ended', { reason: 'group_ended' });
      const d = recording.doc;
      return withAudioUrl(deps.store, {
        key: d.key,
        title: d.title,
        text: d.text,
        paragraphs: d.paragraphs,
        audioPath: d.audioPath,
        audioDurationMs: d.audioDurationMs,
        cached: true,
        aiGenerated: true as const,
      });
    } catch (error) {
      if (error instanceof GroupAudioPendingError)
        throw new NarrationError(error.code, error.message, error.details);
      throw error;
    }
  }
  return withAudioUrl(deps.store, await getTransitionChecked(deps, uid, raw));
}

async function getTransitionChecked(deps: NarrationDeps, uid: string, raw: unknown) {
  const parsed = GetTransitionRequestSchema.safeParse(raw);
  if (!parsed.success) throw new NarrationError('invalid-argument', 'Invalid request');
  const r = parsed.data;
  if (r.download && (!r.access?.tourId || (r.access.mode && !['tour', 'planned'].includes(r.access.mode))))
    throw new NarrationError('permission-denied', 'Only fixed itineraries can be downloaded', {
      reason: 'download_not_supported',
    });
  const beforeAiRequest = () => requireAiConsent(deps.db, uid);
  deps = { ...deps, beforeAiRequest, llm: consentBoundLlm(deps.llm, beforeAiRequest) };
  const cfg = await (deps.config ?? (() => loadAiConfig(deps.db, deps.now())))();
  const [from, to] = await Promise.all(
    [r.fromPoiId, r.toPoiId].map(async (id) => {
      const s = await deps.db.collection('pois').doc(id).get();
      if (!s.exists || s.get('hidden')) throw new NarrationError('not-found', 'POI not found');
      return PoiSchema.parse(s.data());
    }),
  );
  await deps.authorize?.(uid, to!, r.access, { download: Boolean(r.download) });
  await deps.authorize?.(uid, from!, r.access, { download: Boolean(r.download) });
  const minutes = Math.max(1, Math.round(r.walkMinutes / 2) * 2);
  const persona = resolvePersona(cfg.voiceCast, cfg.defaultVoiceId, r.voice);
  const voicePart = persona.id === cfg.defaultVoiceId ? '' : `__${persona.id}`;
  const title = r.tourTitle ? sanitizeForPrompt(r.tourTitle, 200) : undefined;
  if (r.download && r.access?.downloadId)
    await bindDownloadRecording(deps, uid, {
      downloadId: r.access.downloadId,
      slot: { poiId: r.toPoiId, fromPoiId: r.fromPoiId },
      identity: JSON.stringify({
        lang: r.lang,
        voice: r.voice,
        walkMinutes: minutes,
        tourTitle: title,
        scriptInstanceId: r.scriptInstanceId,
      }),
    });
  const storyPart = title ? `__story_${storyFingerprint(title)}` : '';
  const scope = personalNarrationScope(uid, r.scriptInstanceId);
  const key = scope.key(
    `tr__${from!.id}__${to!.id}__${r.lang}__${minutes}__${cfg.promptVersion}${voicePart}${storyPart}`.replace(
      /[^A-Za-z0-9_-]/g,
      '_',
    ),
  );
  const ref = deps.db.collection('narrations').doc(key);
  const hit = await ref.get();
  const pick = (d: NarrationDoc, cached: boolean) => ({
    key,
    title: d.title,
    text: d.text,
    paragraphs: d.paragraphs,
    audioPath: d.audioPath,
    audioDurationMs: d.audioDurationMs,
    cached,
    aiGenerated: true as const,
  });
  if (hit.exists) {
    const d = NarrationDocSchema.parse(hit.data());
    if (d.status === 'ok' && d.ownerUid === uid && d.scriptInstanceId === scope.scriptInstanceId) {
      if (!d.transitionFromPoiId)
        await ref.set({ transitionFromPoiId: from!.id, voiceId: persona.id }, { merge: true });
      return pick(d, true);
    }
  }
  const lockRef = deps.db.collection('narrationLocks').doc(key);
  const lease = randomUUID();
  const acquired = await deps.db.runTransaction(async (tx) => {
    const snapshot = await tx.get(lockRef);
    if (Number(snapshot.get('expiresAt') ?? 0) > deps.now()) return false;
    tx.set(lockRef, { lease, expiresAt: deps.now() + 6 * 60_000, expireAt: new Date(deps.now() + 3600_000) });
    return true;
  });
  if (!acquired)
    throw new NarrationError('unavailable', 'Transition generation in progress', { retryAfterMs: 1500 });
  try {
    const late = await ref.get();
    const existing = late.exists ? NarrationDocSchema.safeParse(late.data()) : undefined;
    if (
      existing?.success &&
      existing.data.status === 'ok' &&
      existing.data.ownerUid === uid &&
      existing.data.scriptInstanceId === scope.scriptInstanceId
    )
      return pick(existing.data, true);
    try {
      await consumeRateLimit(
        deps.db,
        `narr_user_${uid}`,
        cfg.rateLimits.perUserPerHour,
        3600_000,
        deps.now(),
      );
    } catch (e) {
      if (e instanceof RateLimitError)
        throw new NarrationError('resource-exhausted', 'Too many requests', { retryAfterMs: e.retryAfterMs });
      throw e;
    }
    const budget = budgetDecision(cfg, await spentToday(deps.db, to!.tile, deps.now()));
    if (!budget.allowed)
      throw new NarrationError('unavailable', 'Generation is paused', { reason: budget.reason });

    const t = await budgetedLlm(deps.llm, deps.db, cfg, deps.now, { tile: to!.tile, key }).transition({
      model: cfg.models.lite,
      lang: r.lang,
      from: from!.name,
      to: to!.name,
      walkMinutes: minutes,
      ...(title ? { tourTitle: title } : {}),
    });
    const text = t.text.replace(/\s+/g, ' ').trim();
    if (!text || /[*#_`]|https?:\/\/|\(/.test(text))
      throw new NarrationError('failed-precondition', 'Transition rejected', { reason: 'markup' });
    const audio = await renderAudio(
      deps,
      cfg,
      [text],
      r.lang,
      `${personalAudioPrefix(uid)}${key}`,
      { tile: to!.tile, key },
      persona,
    );
    const doc = NarrationDocSchema.parse({
      key,
      ownerUid: uid,
      scriptInstanceId: scope.scriptInstanceId,
      poiId: to!.id,
      transitionFromPoiId: from!.id,
      lang: r.lang,
      lengthTier: 'short',
      primaryInterest: 'transition',
      promptVersion: cfg.promptVersion,
      title: to!.name,
      text,
      paragraphs: audio.layout,
      keyFacts: [],
      sourcesUsed: [],
      audioPath: audio.audioPath,
      audioMimeType: audio.enc.mimeType,
      audioDurationMs: audio.layout[0] ? audio.layout[0].startMs + audio.layout[0].durationMs : 0,
      voiceId: persona.id,
      grounded: false,
      status: 'ok',
      models: { text: cfg.models.lite, tts: cfg.models.tts },
      createdAt: deps.now(),
    });
    await ref.set(doc);
    return pick(doc, false);
  } finally {
    await deps.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(lockRef);
      if (snapshot.get('lease') === lease) tx.set(lockRef, { expiresAt: 0 }, { merge: true });
    });
  }
}
