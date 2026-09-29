import { describe, expect, it } from 'vitest';
import { roundPosition } from './privacy';

describe('roundPosition', () => {
  it('rounds to about 100 m and drops extra fields such as heading', () => {
    expect(roundPosition({ lat: 52.516274, lng: 13.377704, heading: 12 } as never)).toEqual({
      lat: 52.516,
      lng: 13.378,
    });
  });
});
