import { describe, expect, it } from 'vitest';
import { createTourScript, narrationContextFor, TourScriptSchema } from './script';
import { narrationKey } from './key';
import { localObservation } from './localObservation';
import { userPrompt, type SourceBundle } from './prompt';
import { GetNarrationRequestSchema } from './types';

const script = createTourScript({ lang: 'de', interests: ['history'] });
const route = [
  { id: 'a', name: 'Markt' },
  { id: 'b', name: 'Kirchgasse' },
  { id: 'end', name: 'Start', navigationOnly: true },
];
const bundle: SourceBundle = {
  poiName: 'Kirchgasse',
  wikipedia: [],
  facts: [],
  adminFacts: [],
  osmTags: { name: 'Kirchgasse', highway: 'residential' },
};

describe('persistent tour script', () => {
  it('keeps its question as the route grows and does not close an open walk', () => {
    const first = narrationContextFor(script, route.slice(0, 1), 'a', true);
    const later = narrationContextFor(script, route, 'b', true);
    expect(later.script).toEqual(first.script);
    expect(later.chapter).toBe(2);
    expect(later.chapters).toBeUndefined();
    expect(later.nextPoiName).toBeUndefined();
    expect(TourScriptSchema.parse(JSON.parse(JSON.stringify(script)))).toEqual(script);
  });

  it('excludes skipped stops and navigation destinations from chapter numbering', () => {
    const context = narrationContextFor(script, route, 'b', false, ['a']);
    expect(context).toMatchObject({ chapter: 1, chapters: 1 });
    expect(context.previousPoiName).toBeUndefined();
  });

  it('separates every editorial context in the cache and canonicalizes input object order', () => {
    const base = { poiId: 'b', lang: 'de', lengthTier: 'short' as const };
    const context = narrationContextFor(script, route, 'b');
    const key = narrationKey({ ...base, context }, 'v1');
    expect(key).not.toBe(narrationKey(base, 'v1'));
    expect(key).not.toBe(
      narrationKey(
        {
          ...base,
          context: { ...context, script: { ...script, question: 'Welche kleinen Dinge Ã¼bersehen wir?' } },
        },
        'v1',
      ),
    );
    expect(key).not.toBe(narrationKey({ ...base, context: { ...context, previousPoiName: 'Park' } }, 'v1'));
    expect(key).toBe(
      narrationKey(
        GetNarrationRequestSchema.parse({
          ...base,
          context: {
            chapters: context.chapters,
            chapter: context.chapter,
            tourTitle: context.tourTitle,
            script,
            previousPoiName: 'Markt',
          },
        }),
        'v1',
      ),
    );
  });

  it('sends the same editorial brief to the model without treating it as factual source material', () => {
    const prompt = userPrompt({
      bundle,
      lang: 'de',
      tier: 'short',
      interest: 'history',
      context: narrationContextFor(script, route, 'b'),
    });
    expect(prompt).toContain(script.question);
    expect(prompt).toContain('not factual sources');
    expect(prompt).toContain('not proof that anything was visited or heard');
    expect(prompt).toContain('Never invent relationships');
    expect(prompt.split('SOURCES\n')[1]).not.toContain(script.question);
  });
});

describe('small observations from sparse local sources', () => {
  it('supports a real named street without fabricating the origin of its name', () => {
    const out = localObservation(bundle, 'de', narrationContextFor(script, route, 'b', true))!;
    expect(out.narration).toContain('Kirchgasse');
    expect(out.narration).toContain('aus dem Namen allein');
    expect(out.keyFacts).toEqual([]);
    expect(out.sourcesUsed).toEqual(['osm']);
    expect(out.narration).not.toContain(script.closing);
    expect(out.narration).not.toContain(script.opening);
  });

  it.each(['de', 'en', 'fr', 'es', 'it', 'ja', 'pt', 'nl'])('has a short local observation in %s', (lang) => {
    expect(localObservation(bundle, lang)?.narration.length).toBeGreaterThan(bundle.poiName.length);
  });

  it('leaves factual sources with the source-checked model and rejects unsupported feature types', () => {
    expect(
      localObservation(
        { ...bundle, wikipedia: [{ lang: 'de', title: 'StraÃŸe', extract: 'A documented story.' }] },
        'de',
      ),
    ).toBeUndefined();
    expect(localObservation({ ...bundle, osmTags: { amenity: 'parking' } }, 'de')).toBeUndefined();
    expect(localObservation({ ...bundle, poiName: '' }, 'de')).toBeUndefined();
  });
});

it('does not send internal identifiers or future private context fields to the AI prompt', () => {
  const context = {
    ...narrationContextFor(
      { ...script, id: 'private-story-id', instanceId: 'private-instance-id' },
      route,
      'b',
    ),
    uid: 'private-user-id',
    email: 'private@example.invalid',
  };
  const prompt = userPrompt({ bundle, lang: 'de', tier: 'short', interest: 'history', context });
  expect(prompt).toContain(script.question);
  for (const secret of [
    'private-story-id',
    'private-instance-id',
    'private-user-id',
    'private@example.invalid',
  ])
    expect(prompt).not.toContain(secret);
});
