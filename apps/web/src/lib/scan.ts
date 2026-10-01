/** Redemption token as issued by `createRedemptionToken`: `tuur1.<jti>.<exp>.<HMAC>` (DECISIONS D30). */
const TOKEN = /tuur1\.[A-Za-z0-9_-]{8,40}\.\d{10,14}\.[A-Za-z0-9_-]{40,50}/;

/**
 * Pulls the redemption token out of whatever the scanner or the manual field delivered (the bare token, a link
 * containing it, URL-encoded text, stray whitespace). Returns undefined when nothing token-shaped is found; the
 * server still verifies signature, expiry, single use and limits.
 */
export function extractToken(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // not URL-encoded
  }
  return (TOKEN.exec(decoded) ?? TOKEN.exec(text))?.[0];
}
