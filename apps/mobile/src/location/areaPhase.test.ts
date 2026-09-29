import { describe, expect, it } from 'vitest';
import { deriveAreaPhase } from './areaPhase';

const pos = { lat: 1, lng: 1 };
const base = { position: pos, area: null, tourCall: 'idle' as const, toursCount: 0, ensureFailed: false };

describe('deriveAreaPhase', () => {
  it('shows failed (with retry) when the area request failed and no area exists, instead of exploring forever', () => {
    expect(deriveAreaPhase(base)).toBe('exploring');
    expect(deriveAreaPhase({ ...base, ensureFailed: true })).toBe('failed');
  });
  it('covers the other phases', () => {
    expect(deriveAreaPhase({ ...base, position: null })).toBe('no-location');
    expect(deriveAreaPhase({ ...base, area: { status: 'failed', poiCount: 0 } })).toBe('failed');
    expect(deriveAreaPhase({ ...base, area: { status: 'ingesting', poiCount: 0 } })).toBe('exploring');
    expect(deriveAreaPhase({ ...base, area: { status: 'ready', poiCount: 9 }, tourCall: 'generating' })).toBe(
      'generating',
    );
    expect(
      deriveAreaPhase({ ...base, area: { status: 'ready', poiCount: 9 }, tourCall: 'ready', toursCount: 2 }),
    ).toBe('ready');
    expect(
      deriveAreaPhase({ ...base, area: { status: 'low_content', poiCount: 2 }, tourCall: 'no_tours' }),
    ).toBe('low_content');
    expect(deriveAreaPhase({ ...base, area: { status: 'ready', poiCount: 9 }, tourCall: 'error' })).toBe(
      'failed',
    );
  });
});
