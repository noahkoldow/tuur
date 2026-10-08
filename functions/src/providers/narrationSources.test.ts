import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPois, REGION_FIXTURES } from '@tuur/shared';
import { HttpNarrationSources } from './narrationSources';

afterEach(() => vi.unstubAllGlobals());

describe('bounded public text source fetch', () => {
  it('uses only valid canonical Wikipedia language hosts, plain extracts and no Wikidata in text-only mode', async () => {
    const poi = buildPois(REGION_FIXTURES[0]!.raw, { now: 1 }).pois[0]!;
    poi.sources.wikipedia = [
      { lang: 'de', title: 'Trusted title', length: 1, url: 'https://untrusted.invalid/not-a-fetch-target' },
      { lang: 'evil.example/', title: 'Ignored', length: 1 },
    ];
    poi.sources.wikidataId = 'Q82425';
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            query: { pages: { '1': { title: 'Trusted title', extract: 'Verified plain source text.' } } },
          }),
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    const result = await new HttpNarrationSources({ timeoutMs: 8000, retries: 0 }, true).gather(poi, [
      'de',
      'en',
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = new URL((fetcher.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin).toBe('https://de.wikipedia.org');
    expect(url.searchParams.get('titles')).toBe('Trusted title');
    expect(url.searchParams.get('explaintext')).toBe('1');
    expect(url.searchParams.get('exchars')).toBe('1200');
    expect(result.wikipedia).toMatchObject([
      { lang: 'de', title: 'Trusted title', extract: 'Verified plain source text.' },
    ]);
    expect(result.facts).toEqual([]);
  });

  it('does not retry failed text source fetches', async () => {
    const poi = buildPois(REGION_FIXTURES[0]!.raw, { now: 1 }).pois[0]!;
    poi.sources.wikipedia = [{ lang: 'de', title: 'Trusted title', length: 1 }];
    const fetcher = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    expect(
      (await new HttpNarrationSources({ timeoutMs: 8000, retries: 0 }, true).gather(poi, ['de'])).wikipedia,
    ).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
