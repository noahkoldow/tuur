import { describe, expect, it } from 'vitest';
import { roamEntryState } from './roamEntry';

describe('opening a place from Home', () => {
  const loaded = {
    hasPosition: true,
    ready: true,
    hasPlace: true,
    failed: false,
    unlocked: false,
    accessReady: true,
    starting: false,
  };
  it('can continue after closing and reopening the paywall, then receiving access', () => {
    expect(roamEntryState(loaded)).toBe('locked');
    expect(roamEntryState({ ...loaded, unlocked: true })).toBe('ready');
    expect(roamEntryState({ ...loaded, unlocked: true, starting: true })).toBe('starting');
  });
  it('offers location first, then a missing-place recovery for an example from another city', () => {
    expect(roamEntryState({ ...loaded, hasPosition: false, ready: false, hasPlace: false })).toBe('location');
    expect(roamEntryState({ ...loaded, hasPlace: false })).toBe('missing');
  });
  it('distinguishes offline and retry loading from an empty result', () => {
    expect(roamEntryState({ ...loaded, ready: false, hasPlace: false, failed: true })).toBe('error');
    expect(roamEntryState({ ...loaded, ready: false, hasPlace: false })).toBe('loading');
    expect(roamEntryState({ ...loaded, hasPlace: false })).toBe('missing');
  });
});
