import { describe, expect, it } from 'vitest';
import { parseToken, signToken, verifyToken } from './token';

const secret = 'test-secret';
const base = { expiresAt: 1_800_000_600_000, partnerId: 'p1', offerId: 'o1' };

describe('redemption token', () => {
  it('round-trips and verifies against partner and offer', () => {
    const t = signToken(secret, base);
    const p = parseToken(t)!;
    expect(p.expiresAt).toBe(base.expiresAt);
    expect(verifyToken(secret, p, 'p1', 'o1')).toBe(true);
  });
  it('rejects a changed partner, offer, secret, expiry or signature', () => {
    const t = signToken(secret, base);
    const p = parseToken(t)!;
    expect(verifyToken(secret, p, 'p2', 'o1')).toBe(false);
    expect(verifyToken(secret, p, 'p1', 'o2')).toBe(false);
    expect(verifyToken('other', p, 'p1', 'o1')).toBe(false);
    expect(verifyToken(secret, { ...p, expiresAt: p.expiresAt + 1 }, 'p1', 'o1')).toBe(false);
    expect(
      verifyToken(
        secret,
        { ...p, signature: p.signature.slice(0, -1) + (p.signature.endsWith('A') ? 'B' : 'A') },
        'p1',
        'o1',
      ),
    ).toBe(false);
  });
  it('rejects malformed tokens', () => {
    expect(parseToken('garbage')).toBeUndefined();
    expect(parseToken('tuur2.abcdefgh.1800000600000.' + 'A'.repeat(43))).toBeUndefined();
    expect(parseToken(signToken(secret, base) + 'x!')).toBeUndefined();
  });
});
