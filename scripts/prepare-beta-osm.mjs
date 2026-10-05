// Build a reviewable, local Firestore seed from real OSM candidates. Never authenticates or writes to Firebase.
// Usage: node scripts/prepare-beta-osm.mjs <candidates.json> <selection.json> [output.json]
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { build } = requireFunctions('esbuild');
const [candidateFile, selectionFile, outputFile = '.firebase/beta-osm/seed.json'] = process.argv.slice(2);
if (!candidateFile || !selectionFile)
  throw new Error('Provide candidates.json and a reviewed selection.json');
const dir = resolve('.firebase/beta-osm');
await mkdir(dir, { recursive: true });
const compiled = resolve(dir, 'shared.cjs');
await build({
  entryPoints: [resolve('packages/shared/src/index.ts')],
  outfile: compiled,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'silent',
});
const shared = (await import(pathToFileURL(compiled).href)).default;
const {
  AreaSchema,
  PlaceSchema,
  PoiSchema,
  buildPois,
  buildCommonsQuery,
  countQualityPois,
  DEFAULT_TEMPLATES,
  isPubliclyAccessible,
  normalizeCommonsFile,
  parseCommonsImages,
  parseOverpass,
  prepareTour,
  statusForIngest,
} = shared;
const candidate = JSON.parse(await readFile(candidateFile, 'utf8'));
const selection = JSON.parse(await readFile(selectionFile, 'utf8'));
if (!Array.isArray(selection.osmIds) || selection.osmIds.length < 15 || selection.osmIds.length > 25)
  throw new Error('The beta selection must contain 15–25 reviewed OSM object IDs');
if (new Set(selection.osmIds).size !== selection.osmIds.length) throw new Error('Duplicate selected OSM ID');
const elements = selection.osmIds.map((id) => {
  const item = candidate.elements.find((element) => `${element.type}/${element.id}` === id);
  if (!item) throw new Error(`Selected OSM object missing from extract: ${id}`);
  if (
    !isPubliclyAccessible(item.tags) ||
    ['yes', 'designated'].includes(item.tags.indoor) ||
    item.tags.fee === 'yes'
  )
    throw new Error(`Selected OSM object is not an outdoor, public, free beta stop: ${id}`);
  return item;
});
const cacheDir = resolve(dir, 'source-cache');
await mkdir(cacheDir, { recursive: true });
const sourceRequests = [];
async function sourceJson(url) {
  const cache = resolve(cacheDir, `${createHash('sha256').update(url).digest('hex')}.json`);
  try {
    const cached = JSON.parse(await readFile(cache, 'utf8'));
    sourceRequests.push({ url, fetchedAt: cached.fetchedAt, sha256: cached.sha256, cached: true });
    return cached.json;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'tuur-beta-data-preparation/1.0 (bitsapp.admin@gmail.com)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}: ${new URL(url).host}`);
  const text = await response.text();
  const json = JSON.parse(text);
  if (json.error) throw new Error(`Source API error: ${json.error.code}`);
  const record = {
    fetchedAt: new Date().toISOString(),
    sha256: createHash('sha256').update(text).digest('hex'),
    json,
  };
  await writeFile(cache, JSON.stringify(record));
  sourceRequests.push({ url, fetchedAt: record.fetchedAt, sha256: record.sha256, cached: false });
  return json;
}
const apiUrl = (host, parameters) =>
  `https://${host}/w/api.php?${new URLSearchParams({ format: 'json', ...parameters })}`;
const raw = parseOverpass({ elements });
const qids = [...new Set(raw.map((item) => item.wikidataId).filter(Boolean))];
const entities = qids.length
  ? (
      await sourceJson(
        apiUrl('www.wikidata.org', {
          action: 'wbgetentities',
          ids: qids.join('|'),
          props: 'labels|sitelinks|claims',
          languages: 'de|en',
        }),
      )
    ).entities
  : {};
for (const item of raw) {
  const entity = entities[item.wikidataId];
  if (!entity || entity.missing !== undefined) continue;
  item.sitelinks = Object.keys(entity.sitelinks ?? {}).length;
  item.names = {
    ...item.names,
    ...Object.fromEntries(Object.entries(entity.labels ?? {}).map(([lang, label]) => [lang, label.value])),
  };
  const refs = new Map((item.wikipedia ?? []).map((ref) => [ref.lang, ref]));
  for (const lang of ['de', 'en']) {
    const link = entity.sitelinks?.[`${lang}wiki`];
    if (link) refs.set(lang, { lang, title: link.title, length: 0 });
  }
  item.wikipedia = [...refs.values()];
  const image = entity.claims?.P18?.find(
    (claim) => claim.rank !== 'deprecated' && typeof claim.mainsnak?.datavalue?.value === 'string',
  );
  if (!item.imageFile && image) item.imageFile = normalizeCommonsFile(image.mainsnak.datavalue.value);
}
// A small batched metadata lookup, never geographical discovery or a Wikimedia scrape.
for (const lang of ['de', 'en']) {
  const titles = [
    ...new Set(
      raw.flatMap((item) =>
        (item.wikipedia ?? []).filter((ref) => ref.lang === lang).map((ref) => ref.title),
      ),
    ),
  ];
  for (let offset = 0; offset < titles.length; offset += 20) {
    const json = await sourceJson(
      apiUrl(`${lang}.wikipedia.org`, {
        action: 'query',
        titles: titles.slice(offset, offset + 20).join('|'),
        redirects: '1',
        prop: 'info|extracts',
        inprop: 'url',
        exintro: '1',
        explaintext: '1',
        exlimit: 'max',
      }),
    );
    const pages = Object.values(json.query?.pages ?? {});
    const aliases = new Map(
      [...(json.query?.normalized ?? []), ...(json.query?.redirects ?? [])].map((alias) => [
        alias.from,
        alias.to,
      ]),
    );
    const normalized = (title) => {
      const seen = new Set();
      while (aliases.has(title) && !seen.has(title)) {
        seen.add(title);
        title = aliases.get(title);
      }
      return title;
    };
    for (const item of raw)
      for (const ref of item.wikipedia ?? []) {
        if (ref.lang !== lang) continue;
        const page = pages.find((page) => page.title === normalized(ref.title));
        if (!page || page.missing !== undefined) continue;
        ref.title = page.title;
        ref.length = page.length ?? 0;
        if (page.fullurl) ref.url = page.fullurl;
        if (page.extract) ref.extract = page.extract;
      }
  }
}
const imageFiles = [...new Set(raw.map((item) => item.imageFile).filter(Boolean))];
const images = imageFiles.length
  ? parseCommonsImages(
      await sourceJson(`https://commons.wikimedia.org/w/api.php?${buildCommonsQuery(imageFiles)}`),
    )
  : new Map();
const now = Date.now();
const result = buildPois(raw, { now, images, precision: 6 });
const pois = result.pois.map((poi) => PoiSchema.parse(poi));
if (pois.length < 15) throw new Error(`Too few distinct POIs after canonical merging: ${pois.length}`);
for (const poi of pois) {
  if (!poi.accessible || poi.hidden || !poi.interests.length) throw new Error(`Ineligible POI: ${poi.name}`);
  if (!poi.sources.wikipedia.some((ref) => ref.url && (ref.extract?.length ?? 0) >= 60))
    throw new Error(`No verified Wikipedia extract for narration: ${poi.name}`);
}
const narrationReadiness = pois.map((poi) => ({
  poiId: poi.id,
  sources: poi.sources.wikipedia
    .filter((ref) => ref.url && (ref.extract?.length ?? 0) >= 60)
    .map((ref) => ({ lang: ref.lang, url: ref.url, verifiedIntroCharacters: ref.extract.length })),
}));
// The existing live source provider fetches excerpts by title. Seed only article metadata, not copied prose.
for (const poi of pois)
  poi.sources.wikipedia = poi.sources.wikipedia.map(({ extract: _extract, ...metadata }) => metadata);
const place = PlaceSchema.parse({
  id: 'DE_berlin-beta-mitte',
  name: 'Berlin-Mitte',
  countryCode: 'DE',
  country: 'Deutschland',
  location: { lat: 52.517, lng: 13.389 },
  sourceLangs: ['de', 'en'],
  createdAt: now,
});
const tiles = [...new Set(pois.map((poi) => poi.tile))].sort();
const areas = tiles.map((tile) => {
  const local = pois.filter((poi) => poi.tile === tile);
  return AreaSchema.parse({
    geohash: tile,
    status: statusForIngest(local),
    createdAt: now,
    updatedAt: now,
    locked: true,
    ingestAttempts: 0,
    poiCount: local.length,
    qualityPoiCount: countQualityPois(local),
    placeId: place.id,
  });
});
const eligibleTemplates = DEFAULT_TEMPLATES.filter((template) => prepareTour(pois, template)).map(
  (template) => template.id,
);
if (!eligibleTemplates.includes('highlights60'))
  throw new Error('The selected POIs cannot support the standard highlights tour');
const output = {
  version: 1,
  provenance: {
    ...candidate.provenance,
    enrichedAt: new Date(now).toISOString(),
    sourceRequests,
    enrichmentLicenses: {
      wikidata: { license: 'CC0', url: 'https://www.wikidata.org/wiki/Wikidata:Licensing' },
      wikipedia: {
        license: 'CC-BY-SA-4.0',
        url: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
      },
      commons: 'Per-image license, author and source URL retained in each imageRef',
    },
  },
  coverage: { placeId: place.id, tiles, bounds: candidate.bounds, mode: 'curated-beta-only' },
  curation: {
    ...selection,
    objects: elements,
    eligibleTemplates,
    routingVerified: false,
    onSiteVerified: false,
    narrationReadiness,
  },
  documents: [
    { path: `places/${place.id}`, data: place },
    ...areas.map((area) => ({ path: `areas/${area.geohash}`, data: area })),
    ...pois.map((poi) => ({ path: `pois/${poi.id}`, data: poi })),
  ],
};
await mkdir(dirname(resolve(outputFile)), { recursive: true });
await writeFile(outputFile, JSON.stringify(output, null, 2) + '\n');
console.log(
  JSON.stringify({
    output: outputFile,
    pois: pois.length,
    tiles,
    eligibleTemplates,
    images: pois.filter((poi) => poi.imageRefs.length).length,
  }),
);
