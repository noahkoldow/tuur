import { describe, expect, it, vi } from 'vitest';
import {
  AI_CONSENT_VERSION,
  buildPois,
  createTourScript,
  DEFAULT_AI_CONFIG,
  GroupSchema,
  REGION_FIXTURES,
  type SourceBundle,
} from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { MockLlmProvider } from '../providers/llm';
import { getNarration, type NarrationDeps } from './service';
import { getTransition } from './transition';
import { seedGroupRecordings } from '../groups/recordings';
import { updateTourTime } from '../billing/timeBudget';

vi.mock('../util/usage', async (original) => ({
  ...(await original<typeof import('../util/usage')>()),
  spentToday: async () => ({ globalToday: 0, areaToday: 0 }),
  withBudget: async (
    _db: unknown,
    _cfg: unknown,
    _entry: unknown,
    _max: unknown,
    run: () => Promise<unknown>,
  ) => run(),
  logUsage: async () => 0,
}));

function setup(local = false) {
  const { db, docs } = memoryFirestore();
  for (const uid of ['host', 'guest', 'u', 'u1', 'u2', 'owner', 'another-owner', 'other-owner'])
    docs.set(`users/${uid}/consents/ai`, { granted: true, version: AI_CONSENT_VERSION, updatedAt: 1 });
  const originalCollection = db.collection.bind(db);
  db.collection = ((path: string) => {
    const collection = originalCollection(path);
    const doc = collection.doc.bind(collection);
    collection.doc = ((id?: string) => {
      const ref = id ? doc(id) : doc();
      ref.delete = async () => {
        docs.delete(ref.path);
        return {} as never;
      };
      return ref;
    }) as typeof collection.doc;
    return collection;
  }) as typeof db.collection;
  const poi = buildPois(REGION_FIXTURES[0]!.raw, { now: 1000 }).pois[0]!;
  if (local) {
    poi.name = 'Kirchgasse';
    poi.osmTags = { name: poi.name, highway: 'residential' };
    poi.rawScore = 20;
    poi.sources.sitelinks = 0;
  }
  docs.set(`pois/${poi.id}`, poi);
  const llm = new MockLlmProvider();
  const generate = vi.spyOn(llm, 'generateNarration');
  const bundle: SourceBundle = {
    poiName: poi.name,
    wikipedia: local
      ? []
      : [{ lang: 'en', title: poi.name, extract: 'This place is part of the city. '.repeat(30) }],
    facts: [],
    adminFacts: [],
    osmTags: poi.osmTags,
  };
  const deps: NarrationDeps = {
    db,
    llm,
    sources: { gather: async () => bundle },
    tts: {
      synthesize: async ({ text }: { text: string }) => ({ pcm: new Uint8Array(4800), chars: text.length }),
    },
    encoder: { encode: () => ({ data: Buffer.from('audio'), ext: 'mp3', mimeType: 'audio/mpeg' }) },
    store: { put: async () => {}, delete: async () => {} },
    now: () => 1_800_000_000_000,
    config: async () => DEFAULT_AI_CONFIG,
  };
  const synthesize = vi.spyOn(deps.tts, 'synthesize');
  return { poi, deps, generate, synthesize, bundle, docs };
}

function setupGroup() {
  const fixture = setup();
  const { poi, deps, docs } = fixture;
  const next = { ...poi, id: 'group-next-stop', name: 'The next stop' };
  docs.set(`pois/${next.id}`, next);
  const script = createTourScript({ lang: 'en', instanceId: 'shared-host-walk' });
  const group = GroupSchema.parse({
    id: 'sharedGroup1234',
    hostUid: 'host',
    members: ['host', 'guest', 'friend'],
    mode: 'tour',
    hostSubscriber: false,
    extraSeats: 0,
    inviteHash: 'secret-hash',
    status: 'live',
    createdAt: deps.now(),
    expiresAt: deps.now() + 3600_000,
    sessionId: 'host-time-session',
    audio: { script, lang: 'en', voice: DEFAULT_AI_CONFIG.defaultVoiceId },
    tour: {
      id: 'shared-tour',
      placeId: 'place',
      source: 'auto',
      version: 1,
      template: 'highlights',
      profile: 'foot-walking',
      themes: [],
      stops: [poi, next].map((p, order) => ({
        poiId: p.id,
        name: p.name,
        location: p.location,
        order,
        dwellMinutes: 5,
        walkMinutesFromPrev: order * 4,
        partner: false,
      })),
      path: '',
      durationMinutes: 45,
      walkMinutes: 25,
      distanceMeters: 1500,
      bbox: { south: 0, north: 1, west: 0, east: 1 },
      createdAt: deps.now(),
      updatedAt: deps.now(),
    },
  });
  docs.set(`groups/${group.id}`, group);
  docs.set(`tours/${group.tour.id}`, group.tour);
  docs.set(`users/host/entitlements/tour_${group.tour.id}`, {
    type: 'tour',
    tourId: group.tour.id,
    source: 'credit',
    grantedAt: deps.now(),
    expiresAt: null,
  });
  const request = {
    poiId: poi.id,
    lang: 'en',
    lengthTier: 'short',
    context: { script },
    access: { groupId: group.id, tourId: group.tour.id, mode: 'tour' },
  };
  return { ...fixture, group, next, request };
}

describe('one recording for a live group', () => {
  it('rejects a prepaid download identity used to generate a different personal script', async () => {
    const { deps, request, generate } = setupGroup();
    await expect(
      getNarration(deps, 'host', { ...request, access: { downloadId: 'another-script' } }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      getTransition(deps, 'host', {
        fromPoiId: request.poiId,
        toPoiId: request.poiId,
        lang: 'en',
        walkMinutes: 4,
        scriptInstanceId: request.context.script.instanceId,
        access: { downloadId: 'another-script' },
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('never lets guests generate and serves the exact host audio despite other voice/language/tier choices', async () => {
    const { deps, request, generate, synthesize } = setupGroup();
    await expect(getNarration(deps, 'guest', request)).rejects.toMatchObject({
      code: 'unavailable',
      details: { reason: 'group_audio_pending' },
    });
    expect(generate).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
    const host = await getNarration(deps, 'host', request);
    const generated = generate.mock.calls.length;
    const audioCalls = synthesize.mock.calls.length;
    const guest = await getNarration(deps, 'guest', {
      ...request,
      lang: 'de',
      voice: 'other-voice',
      lengthTier: 'long',
      context: { script: { ...request.context.script, instanceId: 'guest-private-walk' } },
    });
    expect(guest.key).toBe(host.key);
    expect(guest.audioPath).toBe(host.audioPath);
    expect(guest.paragraphs).toEqual(host.paragraphs);
    expect(guest.text).toBe(host.text);
    expect(generate).toHaveBeenCalledTimes(generated);
    expect(synthesize).toHaveBeenCalledTimes(audioCalls);
  });

  it('checks membership, group expiry, route stops and download prohibition before returning a recording', async () => {
    const { deps, request, docs, group } = setupGroup();
    await getNarration(deps, 'host', request);
    await expect(getNarration(deps, 'outsider', request)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(getNarration(deps, 'guest', { ...request, download: true })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(getNarration(deps, 'guest', { ...request, poiId: 'unrelated' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    docs.set(`groups/${group.id}`, { ...group, expiresAt: deps.now() });
    await expect(getNarration(deps, 'guest', request)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('waits for a paused host and resumes the same audio when their time lease resumes', async () => {
    const { deps, request, docs, group } = setupGroup();
    await getNarration(deps, 'host', request);
    docs.delete(`users/host/entitlements/tour_${group.tour.id}`);
    docs.set('users/host/entitlements/subscription', {
      type: 'subscription',
      active: true,
      productId: 'tuur_sub_monthly',
      expiresAt: deps.now() + 10000,
      updatedAt: deps.now(),
    });
    await expect(getNarration(deps, 'guest', request)).rejects.toMatchObject({
      details: { reason: 'group_audio_pending' },
    });
    await updateTourTime(deps, 'host', {
      sessionId: group.sessionId,
      sequence: 1,
      mode: 'tour',
      tourId: group.tour.id,
      state: 'active',
    });
    expect((await getNarration(deps, 'guest', request)).audioDurationMs).toBeGreaterThan(0);
    await updateTourTime(deps, 'host', {
      sessionId: group.sessionId,
      sequence: 2,
      mode: 'tour',
      tourId: group.tour.id,
      state: 'paused',
    });
    await expect(getNarration(deps, 'guest', request)).rejects.toMatchObject({
      details: { reason: 'group_audio_pending' },
    });
    docs.delete('users/host/entitlements/subscription');
    await expect(getNarration(deps, 'guest', request)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('publishes an existing host chapter at invitation and rejects a forged recording from another owner', async () => {
    const { deps, request, group, generate } = setupGroup();
    const personalRequest = { ...request, access: { tourId: group.tour.id, mode: 'tour' } };
    const privateGuest = await getNarration(deps, 'guest', personalRequest);
    await seedGroupRecordings(
      deps,
      group,
      [{ kind: 'narration', key: privateGuest.key, poiId: request.poiId }],
      DEFAULT_AI_CONFIG.defaultVoiceId,
    );
    await expect(getNarration(deps, 'guest', request)).rejects.toMatchObject({
      details: { reason: 'group_audio_pending' },
    });
    const host = await getNarration(deps, 'host', personalRequest);
    const count = generate.mock.calls.length;
    await seedGroupRecordings(
      deps,
      group,
      [{ kind: 'narration', key: host.key, poiId: request.poiId }],
      DEFAULT_AI_CONFIG.defaultVoiceId,
    );
    expect((await getNarration(deps, 'guest', request)).audioPath).toBe(host.audioPath);
    expect(generate).toHaveBeenCalledTimes(count);
  });

  it('does not serve blocked source audio or make the guest regenerate it', async () => {
    const { deps, request, docs, generate } = setupGroup();
    const host = await getNarration(deps, 'host', request);
    const count = generate.mock.calls.length;
    docs.set(`narrations/${host.key}`, { ...docs.get(`narrations/${host.key}`), status: 'blocked' });
    await expect(getNarration(deps, 'guest', request)).rejects.toMatchObject({
      details: { reason: 'group_audio_pending' },
    });
    expect(generate).toHaveBeenCalledTimes(count);
  });

  it('recovers a host request finishing after the invitation without another host fetch or generation', async () => {
    const { deps, request, group, generate, synthesize } = setupGroup();
    const host = await getNarration(deps, 'host', {
      ...request,
      access: { tourId: group.tour.id, mode: 'tour' },
    });
    const counts = [generate.mock.calls.length, synthesize.mock.calls.length];
    const guest = await getNarration(deps, 'guest', request);
    expect(guest.audioPath).toBe(host.audioPath);
    expect([generate.mock.calls.length, synthesize.mock.calls.length]).toEqual(counts);
  });

  it('recovers grounded host audio with its attribution intact', async () => {
    const { deps, request, group, docs } = setupGroup();
    const host = await getNarration(deps, 'host', {
      ...request,
      access: { tourId: group.tour.id, mode: 'tour' },
    });
    const grounding = {
      queries: 1,
      searchEntryPointHtml: '<div>Sources</div>',
      sources: [{ uri: 'https://example.org/source' }],
    };
    const doc = {
      ...docs.get(`narrations/${host.key}`),
      grounded: true,
      groundedExpiresAt: deps.now() + 3600_000,
      grounding,
      audioPath: `narrations-grounded/host/${host.key}.mp3`,
    };
    docs.delete(`narrations/${host.key}`);
    docs.set(`users/host/groundedNarrations/${host.key}`, doc);
    const guest = await getNarration(deps, 'guest', request);
    expect(guest.grounding).toEqual(grounding);
    expect(guest.audioPath).toBe(doc.audioPath);
  });

  it('deduplicates simultaneous host transitions and shares their exact result with all guests', async () => {
    const { deps, request, next, synthesize } = setupGroup();
    let started!: () => void;
    let release!: () => void;
    const beginning = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transition = vi.spyOn(deps.llm, 'transition').mockImplementation(async () => {
      started();
      await gate;
      return { text: 'We continue together to our next stop.', usage: {} };
    });
    const hop = {
      fromPoiId: request.poiId,
      toPoiId: next.id,
      lang: 'en',
      walkMinutes: 4,
      scriptInstanceId: request.context.script.instanceId,
      access: request.access,
    };
    const first = getTransition(deps, 'host', hop);
    await beginning;
    await expect(getTransition(deps, 'host', hop)).rejects.toMatchObject({
      details: { reason: 'group_audio_pending' },
    });
    await expect(getTransition(deps, 'guest', hop)).rejects.toMatchObject({
      details: { reason: 'group_audio_pending' },
    });
    release();
    const host = await first;
    const guest = await getTransition(deps, 'guest', {
      ...hop,
      lang: 'de',
      walkMinutes: 20,
      voice: 'other-voice',
    });
    expect(guest).toEqual(host);
    expect(transition).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(1);
  });
});

describe('tour-specific narration', () => {
  it('rewrites copied research into a recording script and sends only its checked spoken paragraphs to TTS', async () => {
    const { poi, deps, generate, synthesize, bundle } = setup();
    const raw = bundle.wikipedia[0]!.extract;
    const spoken =
      'Letâ€™s pause here for a moment. This place is part of the city. What catches your eye as you look around?';
    const output = (text: string) => ({
      output: {
        title: poi.name,
        narration: text,
        paragraphs: [text],
        keyFacts: ['This place is part of the city.'],
        sourcesUsed: ['wikipedia:en'],
      },
      usage: {},
    });
    generate.mockResolvedValueOnce(output(raw)).mockResolvedValueOnce(output(spoken));
    const result = await getNarration(deps, 'u', { poiId: poi.id, lang: 'en', lengthTier: 'short' });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0].user).toContain('Develop a new conversational recording script');
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize.mock.calls[0]![0]).toMatchObject({ text: spoken });
    expect(result.text).toBe(spoken);
    expect(result.text).not.toBe(raw);
  });

  it('never voices or caches research text when both script attempts copy it unchanged', async () => {
    const { poi, deps, generate, synthesize, bundle } = setup();
    const raw = bundle.wikipedia[0]!.extract;
    generate.mockResolvedValue({
      output: {
        title: poi.name,
        narration: raw,
        paragraphs: [raw],
        keyFacts: ['This place is part of the city.'],
        sourcesUsed: ['wikipedia:en'],
      },
      usage: {},
    });
    await expect(
      getNarration(deps, 'u', { poiId: poi.id, lang: 'en', lengthTier: 'short' }),
    ).rejects.toMatchObject({ details: { reason: 'raw_source_text' } });
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('actually passes the persistent script to generation and never returns another tour context from cache', async () => {
    const { poi, deps, generate } = setup();
    const script = createTourScript({ lang: 'en', interests: ['history'], instanceId: 'personal-walk-one' });
    const req = {
      poiId: poi.id,
      lang: 'en',
      lengthTier: 'short',
      context: { script, chapter: 1, chapters: 2 },
    };
    const one = await getNarration(deps, 'u1', req);
    expect(generate.mock.calls[0]![0].user).toContain(script.question);
    expect((await getNarration(deps, 'u1', req)).cached).toBe(true);
    const two = await getNarration(deps, 'u2', {
      ...req,
      context: { ...req.context, script: { ...script, id: 'another', title: 'A different walk' } },
    });
    expect(two.key).not.toBe(one.key);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('never reuses the recording across owners or independent personal walks with the same brief', async () => {
    const { poi, deps, generate, synthesize, docs } = setup();
    const script = createTourScript({ lang: 'en', interests: ['history'], instanceId: 'walk-one' });
    const req = { poiId: poi.id, lang: 'en', lengthTier: 'short', context: { script, chapter: 1 } };
    const first = await getNarration(deps, 'owner', req);
    expect((await getNarration(deps, 'owner', req)).cached).toBe(true);
    const ttsCalls = synthesize.mock.calls.length;
    const otherUser = await getNarration(deps, 'another-owner', req);
    const anotherWalk = await getNarration(deps, 'owner', {
      ...req,
      context: { ...req.context, script: { ...script, instanceId: 'walk-two' } },
    });
    expect(new Set([first.key, otherUser.key, anotherWalk.key]).size).toBe(3);
    expect(new Set([first.audioPath, otherUser.audioPath, anotherWalk.audioPath]).size).toBe(3);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(synthesize.mock.calls.length).toBe(ttsCalls * 3);
    expect(docs.get(`narrations/${first.key}`)).toMatchObject({
      ownerUid: 'owner',
      scriptInstanceId: 'walk-one',
    });
  });

  it('does not fall back to a reusable global recording for old clients without a personal identity', async () => {
    const { poi, deps, generate } = setup();
    const req = { poiId: poi.id, lang: 'en', lengthTier: 'short' };
    const first = await getNarration(deps, 'owner', req);
    const second = await getNarration(deps, 'owner', req);
    expect(second.key).not.toBe(first.key);
    expect(second.cached).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('rejects mismatched stored owner metadata even when a document exists at the computed key', async () => {
    const { poi, deps, docs, generate } = setup();
    const script = createTourScript({ lang: 'en', instanceId: 'walk-one' });
    const req = { poiId: poi.id, lang: 'en', lengthTier: 'short', context: { script } };
    const first = await getNarration(deps, 'owner', req);
    docs.set(`narrations/${first.key}`, {
      ...docs.get(`narrations/${first.key}`),
      ownerUid: 'other-owner',
      text: 'Foreign private chapter',
    });
    const replacement = await getNarration(deps, 'owner', req);
    expect(replacement.cached).toBe(false);
    expect(replacement.text).not.toBe('Foreign private chapter');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('isolates spoken transitions by both authenticated owner and personal script instance', async () => {
    const { poi, deps } = setup();
    vi.spyOn(deps.llm, 'transition').mockResolvedValue({
      text: 'Our walk continues at the next stop.',
      usage: {},
    });
    const req = {
      fromPoiId: poi.id,
      toPoiId: poi.id,
      lang: 'en',
      walkMinutes: 4,
      scriptInstanceId: 'walk-one',
    };
    const first = await getTransition(deps, 'owner', req);
    expect((await getTransition(deps, 'owner', req)).cached).toBe(true);
    const otherOwner = await getTransition(deps, 'other-owner', req);
    const otherWalk = await getTransition(deps, 'owner', { ...req, scriptInstanceId: 'walk-two' });
    expect(new Set([first.key, otherOwner.key, otherWalk.key]).size).toBe(3);
  });

  it('renders a sourced small observation even when the normal narration richness threshold rejects it', async () => {
    const { poi, deps, generate } = setup(true);
    const script = createTourScript({ lang: 'de', interests: ['history'] });
    const result = await getNarration(deps, 'u', {
      poiId: poi.id,
      lang: 'de',
      lengthTier: 'long',
      context: {
        chapter: 1,
        script: { ...script, opening: 'An unsourced battle happened here in 1620.' },
      },
    });
    expect(result.text).toContain('Kirchgasse');
    expect(result.text).toContain('aus dem Namen allein');
    expect(result.text).not.toContain('1620');
    expect(result.text).toContain(script.opening);
    expect(result.keyFacts).toEqual([]);
    expect(result.audioDurationMs).toBeGreaterThan(0);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('personal generation consent boundary', () => {
  it('does not send a generated story for fact checking or speech when consent is withdrawn during generation', async () => {
    const { deps, poi, docs, generate, synthesize } = setup();
    const checkFacts = vi.spyOn(deps.llm, 'checkFacts');
    generate.mockImplementation(async (request) => {
      const result = await new MockLlmProvider().generateNarration(request);
      docs.delete('users/u/consents/ai');
      return result;
    });
    await expect(
      getNarration(deps, 'u', { poiId: poi.id, lang: 'en', lengthTier: 'short' }),
    ).rejects.toMatchObject({ details: { reason: 'ai_consent_required' } });
    expect(checkFacts).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
  });
  it('denies a new narration without invoking LLM or TTS, but retains an existing paid recording after withdrawal', async () => {
    const { deps, poi, docs, generate, synthesize } = setup();
    const request = {
      poiId: poi.id,
      lang: 'en',
      lengthTier: 'short',
      context: { script: createTourScript({ lang: 'en', instanceId: 'consented-walk' }) },
    };
    docs.delete('users/u/consents/ai');
    await expect(getNarration(deps, 'u', request)).rejects.toMatchObject({
      details: { reason: 'ai_consent_required' },
    });
    expect(generate).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
    docs.set('users/u/consents/ai', { granted: true, version: AI_CONSENT_VERSION, updatedAt: 1 });
    const recording = await getNarration(deps, 'u', request);
    docs.delete('users/u/consents/ai');
    generate.mockClear();
    synthesize.mockClear();
    expect((await getNarration(deps, 'u', request)).audioPath).toBe(recording.audioPath);
    expect(generate).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
    await expect(getNarration(deps, 'u', { ...request, voice: 'jonas' })).rejects.toMatchObject({
      details: { reason: 'ai_consent_required' },
    });
    expect(synthesize).not.toHaveBeenCalled();
  });
});
