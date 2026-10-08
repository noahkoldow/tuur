import { describe, expect, it, vi } from 'vitest';
import { AI_CONSENT_VERSION, DEFAULT_AI_CONFIG, PoiSchema, encodeGeohash, type Poi } from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { MockLlmProvider } from '../providers/llm';
import { NarrationError } from '../narration/service';
import { selectNearby, type SelectNearbyDeps } from './service';

const time = Date.UTC(2026, 9, 5, 12);
const tile = encodeGeohash(52.5163, 13.3777, 6);
const request = { candidateIds: ['a', 'b'], lang: 'de', interests: ['history'] };
const place = (id: string, changes: Partial<Poi> = {}): Poi =>
  PoiSchema.parse({
    id,
    name: `Place ${id}`,
    location: { lat: 52.5163, lng: 13.3777 },
    geohash: encodeGeohash(52.5163, 13.3777, 9),
    tile,
    interests: ['history'],
    score: 50,
    baseScore: 50,
    rawScore: 50,
    sources: {},
    updatedAt: time,
    ...changes,
  });

function setup(places: Poi[] = [place('a'), place('b')]) {
  const { db, docs } = memoryFirestore();
  docs.set('users/visitor/consents/ai', { granted: true, version: AI_CONSENT_VERSION, updatedAt: time });
  places.forEach((poi) => docs.set(`pois/${poi.id}`, poi));
  const llm = new MockLlmProvider();
  const select = vi.spyOn(llm, 'selectNearby').mockResolvedValue({
    poiIds: ['b', 'a'],
    source: 'gemini',
    usage: { liteInputTokens: 100, liteOutputTokens: 20 },
  });
  const deps: SelectNearbyDeps = {
    db,
    llm,
    now: () => time,
    config: async () => DEFAULT_AI_CONFIG,
    authorize: vi.fn(async () => undefined),
  };
  return { deps, docs, select };
}

describe('nearby Gemini curation', () => {
  it('keeps local candidate order without sending a route or interests to AI after refusal', async () => {
    const { deps, select, docs } = setup();
    docs.set('users/visitor/consents/ai', { granted: false, version: AI_CONSENT_VERSION, updatedAt: time });
    expect(await selectNearby(deps, 'visitor', request)).toEqual({ poiIds: ['a', 'b'], source: 'fallback' });
    expect(select).not.toHaveBeenCalled();
  });
  it('curates only server place facts and passes the stable thread and interests to the lite model', async () => {
    const { deps, select, docs } = setup();
    const result = await selectNearby(deps, 'visitor', {
      ...request,
      candidateIds: ['a', 'b', 'a'],
      thread: 'How this neighborhood changed',
      previousPoiName: 'The market square',
      access: { mode: 'roam' },
      candidates: [{ id: 'a', name: 'Untrusted invented client name' }],
    });
    expect(result).toEqual({ poiIds: ['b', 'a'], source: 'gemini' });
    expect(select).toHaveBeenCalledWith({
      model: DEFAULT_AI_CONFIG.models.lite,
      lang: 'de',
      interests: ['history'],
      thread: 'How this neighborhood changed',
      previousPoiName: 'The market square',
      candidates: [
        { id: 'a', name: 'Place a', interests: ['history'], kind: '', sourceHint: '' },
        { id: 'b', name: 'Place b', interests: ['history'], kind: '', sourceHint: '' },
      ],
    });
    expect(deps.authorize).toHaveBeenCalledTimes(2);
    expect(docs.get('usageDaily/2026-10-05')?.['costUsd']).toBeGreaterThan(0);
  });

  it('excludes hidden, inaccessible, missing, remote, and unauthorized places before invoking Gemini', async () => {
    const { deps, select } = setup([
      place('a'),
      place('b'),
      place('hidden', { hidden: true }),
      place('private', { accessible: false }),
      place('remote', { tile: encodeGeohash(48.8566, 2.3522, 6) }),
      place('locked'),
    ]);
    deps.authorize = async (_uid, poi) => {
      if (poi.id === 'locked') throw new NarrationError('permission-denied', 'Locked');
    };
    const result = await selectNearby(deps, 'visitor', {
      ...request,
      candidateIds: ['a', 'hidden', 'private', 'missing', 'remote', 'locked', 'b'],
    });
    expect(result).toEqual({ poiIds: ['b', 'a'], source: 'gemini' });
    expect(select.mock.calls[0]?.[0].candidates.map((poi) => poi.id)).toEqual(['a', 'b']);
  });

  it('rejects invented IDs, removes repetitions, and appends omitted allowed candidates', async () => {
    const { deps, select } = setup([place('a'), place('b'), place('c')]);
    select.mockResolvedValue({ poiIds: ['b', 'invented', 'b'], source: 'gemini', usage: {} });
    expect(await selectNearby(deps, 'visitor', { ...request, candidateIds: ['a', 'b', 'c'] })).toEqual({
      poiIds: ['b', 'a', 'c'],
      source: 'gemini',
    });
    select.mockResolvedValue({ poiIds: ['invented'], source: 'gemini', usage: {} });
    expect(await selectNearby(deps, 'visitor', request)).toEqual({ poiIds: ['a', 'b'], source: 'fallback' });
  });

  it('keeps usable deterministic candidates when the model fails or generation is paused', async () => {
    const { deps, select } = setup();
    select.mockRejectedValue(new Error('Provider offline'));
    expect(await selectNearby(deps, 'visitor', request)).toEqual({ poiIds: ['a', 'b'], source: 'fallback' });
    select.mockClear();
    deps.config = async () => ({ ...DEFAULT_AI_CONFIG, killSwitch: true });
    expect(await selectNearby(deps, 'visitor', request)).toEqual({ poiIds: ['a', 'b'], source: 'fallback' });
    expect(select).not.toHaveBeenCalled();
  });

  it('honestly labels mock selection as fallback', async () => {
    const { deps, select } = setup();
    select.mockRestore();
    expect(await selectNearby(deps, 'visitor', request)).toEqual({ poiIds: ['a', 'b'], source: 'fallback' });
  });

  it('does not use Gemini when there is only one available candidate', async () => {
    const { deps, select } = setup([place('a')]);
    expect(await selectNearby(deps, 'visitor', request)).toEqual({ poiIds: ['a'], source: 'fallback' });
    expect(select).not.toHaveBeenCalled();
  });

  it('bounds client input and limits every user to 60 curation requests per hour', async () => {
    const { deps, select } = setup([place('a')]);
    await expect(
      selectNearby(deps, 'visitor', { ...request, candidateIds: Array.from({ length: 13 }, () => 'a') }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      selectNearby(deps, 'visitor', { ...request, candidateIds: ['collection/document'] }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      selectNearby(deps, 'visitor', { ...request, thread: 'x'.repeat(601) }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    for (let index = 0; index < 60; index++) await selectNearby(deps, 'visitor', request);
    await expect(selectNearby(deps, 'visitor', request)).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { retryAfterMs: 3600_000 },
    });
    expect(select).not.toHaveBeenCalled();
  });
});
