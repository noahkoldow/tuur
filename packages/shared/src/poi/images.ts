import type { ImageRef } from '../schemas';

interface CommonsPage {
  title: string;
  imageinfo?: {
    url: string;
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
}

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** MediaWiki treats spaces and underscores alike, while JS Map keys do not. */
export function normalizeCommonsFile(file: string): string {
  return `File:${file
    .replace(/^(?:File|Image):/i, '')
    .replace(/_/g, ' ')
    .trim()}`;
}

/** Only freely licensed media may be shown (spec 3, Bilder). Attribution fields are mandatory in the UI. */
export function isFreeLicense(short: string): boolean {
  if (/(?:^|[ -])(?:NC|ND)(?:[ -]|$)|non.?commercial|no.?derivatives/i.test(short)) return false;
  return /^(?:CC[ -]BY(?:[ -]SA)?|CC0|Public domain|PD|GFDL|FAL|Attribution)(?:\s|$)/i.test(short.trim());
}

export function buildCommonsQuery(files: string[], thumbWidth = 960): string {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(thumbWidth),
    redirects: '1',
    titles: [...new Set(files.map(normalizeCommonsFile))].join('|'),
  });
  return p.toString();
}

export function parseCommonsImages(json: unknown): Map<string, ImageRef> {
  const query = (
    json as {
      query?: {
        pages?: Record<string, CommonsPage>;
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
      };
    } | null
  )?.query;
  const pages = query?.pages ?? {};
  const out = new Map<string, ImageRef>();
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    const license = meta['LicenseShortName']?.value;
    if (!license || !isFreeLicense(license)) continue;
    const author = meta['Artist']?.value ? stripHtml(meta['Artist'].value) : undefined;
    const licenseUrl = meta['LicenseUrl']?.value;
    if (!author && !/^(?:CC0|Public domain|PD)(?:\s|$)/i.test(license)) continue;
    const image: ImageRef = {
      file: page.title,
      url: info.thumburl ?? info.url,
      ...(info.thumburl ? { thumbUrl: info.thumburl } : {}),
      ...(author ? { author } : {}),
      license,
      ...(licenseUrl ? { licenseUrl } : {}),
      sourceUrl:
        info.descriptionurl ??
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    };
    out.set(page.title, image);
    out.set(normalizeCommonsFile(page.title), image);
  }
  // An image may have been renamed on Commons. Keep aliases so existing OSM / Wikipedia
  // references still resolve; a redirect chain can include both normalization and renaming.
  const aliases = [...(query?.normalized ?? []), ...(query?.redirects ?? [])];
  for (let pass = 0; pass < aliases.length; pass++) {
    for (const { from, to } of aliases) {
      const image = out.get(to) ?? out.get(normalizeCommonsFile(to));
      if (image) {
        out.set(from, image);
        out.set(normalizeCommonsFile(from), image);
      }
    }
  }
  return out;
}
