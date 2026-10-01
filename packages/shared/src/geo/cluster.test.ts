import { describe, expect, it } from 'vitest';
import { cellDegForZoom, clusterByGrid } from './cluster';

const at = (id: string, lat: number, lng: number) => ({ id, location: { lat, lng } });

describe('clusterByGrid', () => {
  it('merges markers in the same cell and keeps lone ones with their own key', () => {
    const items = [at('a', 52.5001, 13.4001), at('b', 52.5002, 13.4002), at('c', 52.6, 13.6)];
    const out = clusterByGrid(items, 0.01);
    expect(out).toHaveLength(2);
    const merged = out.find((c) => c.members.length === 2)!;
    expect(merged.key.startsWith('c:')).toBe(true);
    expect(merged.location.lat).toBeCloseTo(52.50015, 5);
    expect(out.find((c) => c.members.length === 1)!.key).toBe('c');
  });

  it('does not cluster when zoomed in far enough, and halves the cell per zoom level', () => {
    const items = [at('a', 52.5001, 13.4001), at('b', 52.5009, 13.4009)];
    expect(clusterByGrid(items, cellDegForZoom(19))).toHaveLength(2);
    expect(cellDegForZoom(15) / cellDegForZoom(16)).toBeCloseTo(2);
    expect(clusterByGrid(items, 0)).toHaveLength(2);
  });
});
