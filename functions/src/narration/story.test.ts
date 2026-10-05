import { describe, expect, it, vi } from 'vitest';
import {
  buildPois,
  createTourScript,
  DEFAULT_AI_CONFIG,
  REGION_FIXTURES,
  type SourceBundle,
} from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { MockLlmProvider } from '../providers/llm';
import { getNarration, type NarrationDeps } from './service';
import { getTransition } from './transition';

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

describe('tour-specific narration', () => {
  it('rewrites copied research into a recording script and sends only its checked spoken paragraphs to TTS', async () => {
    const { poi, deps, generate, synthesize, bundle } = setup();
    const raw = bundle.wikipedia[0]!.extract;
    const spoken =
      'Let’s pause here for a moment. This place is part of the city. What catches your eye as you look around?';
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
