import { writeFile } from 'node:fs/promises';

// Match article identities to fixture source IDs, never to a generic place category.
// Run manually to refresh Commons metadata; preview rendering itself needs no API calls.
const places = {
  'Brandenburg Gate': ['way/1', 'Q82425'],
  'Reichstag building': ['way/2', 'Q4340'],
  'Memorial to the Murdered Jews of Europe': ['way/3', 'Q151550'],
  'Pergamon Museum': ['way/4', 'Q154591'],
  'Neues Museum': ['way/5'],
  'Berlin Cathedral': ['way/6', 'Q154548'],
  'Checkpoint Charlie': ['node/7'],
  Gendarmenmarkt: ['node/8', 'Q157525'],
  'Tiergarten (park)': ['way/9', 'Q101777'],
  'Neue Wache': ['way/16', 'Q568432'],
  Bebelplatz: ['way/17'],
  'Berlin State Opera': ['way/18', 'Q166492'],
  'Humboldt Forum': ['way/19', 'Q116336'],
  Zeughaus: ['way/20', 'Q161080'],
  'Friedrichswerder Church': ['node/21', 'Q546510'],
  Plönlein: ['way/101'],
  "St. James's Church, Rothenburg ob der Tauber": ['way/102', 'Q691456'],
  'Rathaus Rothenburg': ['way/103'],
  'Burggarten Rothenburg': ['way/105'],
  'Mittelalterliches Kriminalmuseum': ['node/106'],
  'Yasaka Shrine': ['way/301', 'Q1136528'],
  'Kiyomizu-dera': ['way/302', 'Q193706'],
  'Maruyama Park': ['way/303', 'Q11526873'],
  Gion: ['way/304'],
  'Kyoto Municipal Museum of Art': ['node/307'],
  Ninenzaka: ['way/309'],
  'Kōdai-ji': ['way/310', 'Q1189396'],
  'Hōkan-ji': ['way/311'],
  'Chion-in': ['way/312'],
};

// These Commons descriptions were checked for the exact landmark. Use these when the
// article has no image, or its legacy image lacks a machine-readable photographer credit.
const fileOverrides = {
  'Reichstag building': 'File:Reichstag building Berlin view from west before sunset.jpg',
  'Friedrichswerder Church': 'File:Berlin - Friedrichswerdersche Kirche - Innenansicht (9734).jpg',
  'Yasaka Shrine': 'File:South Tower Gate of Yasaka Shrine in Kyoto, 20240820 1706 5167.jpg',
  Plönlein: 'File:Plönlein, Rothenburg ob der Tauber, Alemania, 2023-06-17, DD 36.jpg',
  'Rathaus Rothenburg': 'File:Rathaus & Marktplatz Rothenburg Tauber 029-vBh.jpg',
  'Burggarten Rothenburg': 'File:Rothenburg ob der Tauber, Burggarten (5).jpg',
  'Mittelalterliches Kriminalmuseum':
    'File:50 000 Exponate aus 1000 Jahren Kriminalgeschichte zeigt das Kriminalmuseum Rothenburg ob der Tauber. 42.jpg',
  'Hōkan-ji':
    'File:Yasaka-dori early morning with street lanterns and the Tower of Yasaka (Hokan-ji Temple), Kyoto, Japan.jpg',
};

const request = async (host, params) => {
  const response = await fetch(
    `https://${host}/w/api.php?${new URLSearchParams({
      action: 'query',
      format: 'json',
      ...params,
    })}`,
    { headers: { 'User-Agent': 'tuur-demo-photos/1.0 (Commons attribution refresh)' } },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${host}`);
  const json = await response.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json;
};

const pages = await request('en.wikipedia.org', {
  titles: Object.keys(places).join('|'),
  redirects: '1',
  prop: 'pageimages',
  piprop: 'name',
  pilicense: 'free',
  pilimit: '50',
});
const redirects = new Map((pages.query.redirects ?? []).map(({ from, to }) => [from, to]));
const byTitle = new Map(Object.values(pages.query.pages).map((page) => [page.title, page]));
const files = Object.values(pages.query.pages).flatMap((page) =>
  page.pageimage ? [`File:${page.pageimage}`] : [],
);
const commons = await request('commons.wikimedia.org', {
  titles: [...new Set([...files, ...Object.values(fileOverrides)])].join('|'),
  prop: 'imageinfo',
  iiprop: 'url|extmetadata',
  iiurlwidth: '960',
  redirects: '1',
});
const normalized = (title) => title.replaceAll('_', ' ');
const byFile = new Map(Object.values(commons.query.pages).map((page) => [normalized(page.title), page]));
const plain = (text = '') =>
  text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
const withoutTracking = (value) => {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
  return url.href;
};
const result = [];
for (const [article, sourceIds] of Object.entries(places)) {
  const page = byTitle.get(redirects.get(article) ?? article);
  const file = fileOverrides[article] ?? (page?.pageimage ? `File:${page.pageimage}` : undefined);
  const image = file ? byFile.get(normalized(file)) : undefined;
  const info = image?.imageinfo?.[0];
  const meta = info?.extmetadata ?? {};
  if (!info || !meta.LicenseShortName?.value) {
    console.warn(`No Commons photo for ${article}: ${page?.pageimage ?? 'no page image'}`);
    continue;
  }
  const author = plain(meta.Artist?.value);
  if (!author) throw new Error(`Missing photographer credit for ${article}`);
  result.push({
    article,
    sourceIds,
    image: {
      file: image.title,
      url: withoutTracking(info.thumburl ?? info.url),
      ...(info.thumburl ? { thumbUrl: withoutTracking(info.thumburl) } : {}),
      author,
      license: meta.LicenseShortName.value,
      ...(meta.LicenseUrl?.value ? { licenseUrl: meta.LicenseUrl.value } : {}),
      sourceUrl: info.descriptionurl,
    },
  });
}
await writeFile(
  new URL('../packages/shared/src/fixtures/place-photos.json', import.meta.url),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(`Saved ${result.length} source-matched photos with Commons metadata.`);
