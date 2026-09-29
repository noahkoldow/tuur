import { describe, expect, it } from 'vitest';
import { formatKm } from './format';

describe('formatKm', () => {
  it('uses the decimal separator of the language', () => {
    expect(formatKm(1100, 'de')).toBe('1,1');
    expect(formatKm(1100, 'en')).toBe('1.1');
    expect(formatKm(950, 'de')).toBe('1,0');
  });
});
