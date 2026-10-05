import { createVerify } from 'node:crypto';
import { z } from 'zod';

export interface VerifierKey {
  keyId: number | string;
  pem: string;
}

/**
 * AdMob server-side verification (SSV): the callback query string is signed with ECDSA/SHA-256. The signed
 * content is everything before `&signature=`; the signature and key id follow at the end of the query.
 */
export function verifyAdmobSignature(
  queryString: string,
  keys: VerifierKey[],
): { ok: boolean; params: URLSearchParams; keyId?: string } {
  const q = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  const invalid = { ok: false, params: new URLSearchParams() };
  if (q.length > 16_384) return invalid;
  const idx = q.indexOf('&signature=');
  if (idx < 1) return invalid;
  // Google puts exactly these two fields last. Anything after them is unsigned and must never reach reward logic.
  const suffix = /^signature=([^&]+)&key_id=([0-9]{1,20})$/.exec(q.slice(idx + 1));
  if (!suffix) return invalid;
  const signature = new URLSearchParams(`signature=${suffix[1]}`).get('signature');
  const keyId = suffix[2]!;
  if (!signature || !/^[A-Za-z0-9_-]+={0,2}$/.test(signature)) return invalid;
  const content = q.slice(0, idx);
  const params = new URLSearchParams(content);
  const names = [...params.keys()];
  // Reject ambiguous duplicate/encoded names, including signature or key_id inside the signed payload.
  if (new Set(names).size !== names.length || params.has('signature') || params.has('key_id')) return invalid;
  const key = keys.find((k) => String(k.keyId) === keyId);
  if (!key) return { ...invalid, keyId };
  try {
    const ok = createVerify('SHA256').update(content).verify(key.pem, Buffer.from(signature, 'base64url'));
    return { ok, params: ok ? params : invalid.params, keyId };
  } catch {
    return { ...invalid, keyId };
  }
}

const REWARDED_UNIT_PATTERN = /^ca-app-pub-[0-9]{16}\/([0-9]{10})$/;

/** Google's signed ad_unit is the numeric unit ID, not the ca-app-pub publisher prefix used by the SDK. */
export function matchesRewardedAdUnit(params: URLSearchParams, configuredUnit: string): boolean {
  const expected = configuredUnit.trim();
  const match = REWARDED_UNIT_PATTERN.exec(expected);
  if (!match) return false;
  const actual = params.get('ad_unit');
  // If Google supplies the full ID, require the entire publisher prefix to match too.
  return actual === match[1] || actual === expected;
}

type RewardResult = { granted: boolean; reason?: string };

/** Keep every Auth/Firestore operation behind the authenticated, configured-unit gate. */
export async function completeAdmobCallback(
  check: ReturnType<typeof verifyAdmobSignature>,
  configuredUnit: string,
  grant: (params: { userId: string; nonce: string; transactionId: string }) => Promise<RewardResult>,
): Promise<{ status: number; body: string | RewardResult }> {
  if (!check.ok) return { status: 403, body: 'invalid signature' };
  // Misconfiguration must remain retryable rather than acknowledging and losing legitimate rewards.
  if (!REWARDED_UNIT_PATTERN.test(configuredUnit.trim()))
    return { status: 503, body: 'ad unit not configured' };
  if (!matchesRewardedAdUnit(check.params, configuredUnit))
    return { status: 200, body: { granted: false, reason: 'different_ad_unit' } };
  const userId = check.params.get('user_id');
  const nonce = check.params.get('custom_data');
  const transactionId = check.params.get('transaction_id');
  if (!userId || !nonce || !transactionId) return { status: 400, body: 'missing params' };
  return { status: 200, body: await grant({ userId, nonce, transactionId }) };
}

const KEY_TTL_MS = 24 * 3600_000;
const REFRESH_COOLDOWN_MS = 60_000;
const VerifierKeysSchema = z.object({
  keys: z
    .array(
      z.object({
        keyId: z.union([z.number().int().nonnegative().safe(), z.string().regex(/^[0-9]{1,20}$/)]),
        pem: z.string().min(1).max(8192),
      }),
    )
    .min(1)
    .max(32),
});
let cache: { at: number; keys: VerifierKey[] } | undefined;
let lastAttemptAt: number | undefined;
let inFlight: Promise<VerifierKey[]> | undefined;

/** Google's public keys: at most 24 h old, one shared fetch, and at most one refresh attempt per minute. */
export async function fetchVerifierKeys(
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
  force = false,
): Promise<VerifierKey[]> {
  const fresh = cache && now >= cache.at && now - cache.at < KEY_TTL_MS ? cache.keys : undefined;
  if (!force && fresh) return fresh;
  if (inFlight) return inFlight;
  if (lastAttemptAt !== undefined && now >= lastAttemptAt && now - lastAttemptAt < REFRESH_COOLDOWN_MS) {
    if (fresh) return fresh;
    throw new Error('Verifier key refresh is cooling down');
  }
  lastAttemptAt = now;
  inFlight = (async () => {
    const res = await fetchImpl('https://www.gstatic.com/admob/reward/verifier-keys.json', {
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!res.ok) throw new Error(`verifier keys HTTP ${res.status}`);
    const json = VerifierKeysSchema.parse(await res.json());
    if (new Set(json.keys.map((key) => String(key.keyId))).size !== json.keys.length)
      throw new Error('Duplicate verifier key IDs');
    cache = { at: now, keys: json.keys };
    return cache.keys;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = undefined;
  }
}
