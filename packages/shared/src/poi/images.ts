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

/** Only freely licensed media may be shown (spec 3, Bilder). Attribution fields are mandatory in the UI. */
export function isFreeLicense(short: string): boolean {
  return /^(CC[ -]BY|CC[ -]BY-SA|CC0|Public domain|PD|GFDL|FAL|Attribution)/i.test(short.trim());
}

export function buildCommonsQuery(files: string[], thumbWidth = 960): string {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(thumbWidth),
    titles: files.join('|'),
  });
  return p.toString();
}

export function parseCommonsImages(json: unknown): Map<string, ImageRef> {
  const pages = (json as { query?: { pages?: Record<string, CommonsPage> } } | null)?.query?.pages ?? {};
  const out = new Map<string, ImageRef>();
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    const license = meta['LicenseShortName']?.value;
    if (!license || !isFreeLicense(license)) continue;
    const author = meta['Artist']?.value ? stripHtml(meta['Artist'].value) : undefined;
    const licenseUrl = meta['LicenseUrl']?.value;
    out.set(page.title, {
      file: page.title,
      url: info.thumburl ?? info.url,
      ...(info.thumburl ? { thumbUrl: info.thumburl } : {}),
      ...(author ? { author } : {}),
      license,
      ...(licenseUrl ? { licenseUrl } : {}),
      sourceUrl:
        info.descriptionurl ??
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    });
  }
  return out;
}
