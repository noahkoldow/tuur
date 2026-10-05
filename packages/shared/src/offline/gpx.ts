import { decodePolyline, encodePolyline } from '../routing/polyline';
import type { Tour } from '../routing/tour';

export class GpxExportError extends Error {
  constructor(readonly code: 'missing_route' | 'invalid_route' | 'invalid_stop') {
    super(`Cannot export GPX: ${code}`);
    this.name = 'GpxExportError';
  }
}

export interface TourGpxExport {
  xml: string;
  fileName: string;
}

type ExportableTour = Pick<Tour, 'path' | 'stops'> & Partial<Pick<Tour, 'texts'>>;

/** XML 1.0 disallows control characters and isolated UTF-16 surrogates, even when escaped. */
function cleanText(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const n = character.codePointAt(0)!;
      return (
        n === 9 ||
        n === 10 ||
        n === 13 ||
        (n >= 0x20 && n <= 0xd7ff) ||
        (n >= 0xe000 && n <= 0xfffd) ||
        n >= 0x10000
      );
    })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();
}

const label = (value: string) => Array.from(cleanText(value)).slice(0, 160).join('');
const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  );

function exportFileName(title: string): string {
  const safe = Array.from(title.normalize('NFKC').replace(/[^\p{L}\p{N}\p{M}_-]+/gu, '-'))
    .slice(0, 60)
    .join('')
    .replace(/^-+|-+$/g, '');
  // Prefix avoids reserved Windows names; 60 Unicode codepoints keep UTF-8 below 255 filename bytes.
  return `tuur-${safe || 'tour'}.gpx`;
}

function validCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** GPX coordinates use xsd:decimal, which excludes exponent notation. */
function decimal(value: number): string {
  const raw = String(value);
  if (!raw.includes('e')) return raw;
  const [mantissa, exponent] = raw.split('e-');
  const negative = value < 0;
  const digits = mantissa!.replace('-', '').replace('.', '');
  return `${negative ? '-' : ''}0.${'0'.repeat(Number(exponent) - 1)}${digits}`;
}

function coordinates(lat: number, lng: number): string {
  // GPX longitude is [-180, 180); +180 and -180 describe the same meridian.
  return `lat="${decimal(lat)}" lon="${decimal(lng === 180 ? -180 : lng)}"`;
}

/**
 * GPX 1.1: the complete stored path becomes one track; stops become numbered waypoints.
 * No routing, timestamps, elevations, narration, access receipts or account data are inferred/exported.
 * https://www.topografix.com/GPX/1/1/
 */
export function buildTourGpx(tour: ExportableTour, title?: string): TourGpxExport {
  if (!tour.path) throw new GpxExportError('missing_route');
  if (typeof tour.path !== 'string' || tour.path.length > 1_000_000 || !/^[?-~]+$/.test(tour.path))
    throw new GpxExportError('invalid_route');
  const points = decodePolyline(tour.path);
  // The shared display decoder tolerates truncation. A canonical round-trip rejects it for export.
  if (
    points.length < 2 ||
    points.length > 100_000 ||
    encodePolyline(points) !== tour.path ||
    points.some(([lat, lng]) => !validCoordinates(lat, lng)) ||
    !points.some(([lat, lng]) => lat !== points[0]![0] || lng !== points[0]![1])
  )
    throw new GpxExportError('invalid_route');
  if (
    !Array.isArray(tour.stops) ||
    !tour.stops.length ||
    tour.stops.some(
      (stop) =>
        !stop ||
        !stop.location ||
        !validCoordinates(stop.location.lat, stop.location.lng) ||
        !Number.isSafeInteger(stop.order) ||
        stop.order < 0 ||
        typeof stop.name !== 'string',
    ) ||
    new Set(tour.stops.map((stop) => stop.order)).size !== tour.stops.length
  )
    throw new GpxExportError('invalid_stop');
  const name =
    label(title ?? '') ||
    Object.values(tour.texts ?? {})
      .map((text) => label(text.title))
      .find(Boolean) ||
    'tuur Tour';
  const waypoints = [...tour.stops]
    .sort((a, b) => a.order - b.order)
    .map(
      (stop, index) =>
        `  <wpt ${coordinates(stop.location.lat, stop.location.lng)}><name>${escapeXml(`${index + 1}. ${label(stop.name) || 'Stop'}`)}</name></wpt>`,
    );
  const track = points.map(([lat, lng]) => `      <trkpt ${coordinates(lat, lng)}/>`);
  return {
    fileName: exportFileName(name),
    xml: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="tuur" xmlns="http://www.topografix.com/GPX/1/1">',
      `  <metadata><name>${escapeXml(name)}</name></metadata>`,
      ...waypoints,
      '  <trk>',
      `    <name>${escapeXml(name)}</name>`,
      '    <trkseg>',
      ...track,
      '    </trkseg>',
      '  </trk>',
      '</gpx>',
      '',
    ].join('\n'),
  };
}
