export interface PhotoAttribution {
  author?: string | undefined;
  license?: string | undefined;
  licenseUrl?: string | undefined;
  sourceUrl?: string | undefined;
  file?: string | undefined;
}

/** Credits must open web pages, including when the displayed image is an offline file. */
export function attributionUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** Older cached Commons metadata can lack a license URL; only infer unambiguous licenses. */
export function photoAttribution(image: PhotoAttribution) {
  const cc = image.license?.trim().match(/^CC[ -]BY(?:[ -](SA))?\s+(\d\.\d)$/i);
  const licenseUrl =
    attributionUrl(image.licenseUrl) ??
    (cc
      ? `https://creativecommons.org/licenses/by${cc[1] ? '-sa' : ''}/${cc[2]}/`
      : /^CC0(?:\s+1\.0)?$/i.test(image.license?.trim() ?? '')
        ? 'https://creativecommons.org/publicdomain/zero/1.0/'
        : undefined);
  const sourceUrl =
    attributionUrl(image.sourceUrl) ??
    (image.file?.trim()
      ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(image.file.trim().replace(/ /g, '_'))}`
      : undefined);
  return { ...image, sourceUrl, licenseUrl };
}
