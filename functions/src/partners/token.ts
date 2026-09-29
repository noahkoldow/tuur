import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PREFIX = 'tuur1';

export interface TokenParts {
  jti: string;
  expiresAt: number;
  partnerId: string;
  offerId: string;
}

const mac = (secret: string, p: TokenParts) =>
  createHmac('sha256', secret)
    .update([PREFIX, p.jti, p.expiresAt, p.partnerId, p.offerId].join('.'))
    .digest('base64url');

/**
 * Redemption token as shown in the QR code: `tuur1.<jti>.<expiresAt>.<signature>`. The signature binds the token to
 * partner and offer; single use and the owning user are enforced by the token document (looked up by jti).
 */
export function signToken(secret: string, p: Omit<TokenParts, 'jti'> & { jti?: string }): string {
  const parts: TokenParts = { ...p, jti: p.jti ?? randomBytes(12).toString('base64url') };
  return [PREFIX, parts.jti, parts.expiresAt, mac(secret, parts)].join('.');
}

export interface ParsedToken {
  jti: string;
  expiresAt: number;
  signature: string;
}

export function parseToken(token: string): ParsedToken | undefined {
  const m = /^tuur1\.([A-Za-z0-9_-]{8,40})\.(\d{10,14})\.([A-Za-z0-9_-]{40,50})$/.exec(token.trim());
  return m ? { jti: m[1]!, expiresAt: Number(m[2]), signature: m[3]! } : undefined;
}

/** Verifies the signature against the partner/offer stored on the token document (timing-safe). */
export function verifyToken(
  secret: string,
  parsed: ParsedToken,
  partnerId: string,
  offerId: string,
): boolean {
  const expected = mac(secret, { jti: parsed.jti, expiresAt: parsed.expiresAt, partnerId, offerId });
  const a = Buffer.from(expected);
  const b = Buffer.from(parsed.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
