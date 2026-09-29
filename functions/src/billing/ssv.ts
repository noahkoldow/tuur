import { createVerify } from 'node:crypto';

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
): { ok: boolean; params: URLSearchParams } {
  const q = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  const params = new URLSearchParams(q);
  const idx = q.indexOf('&signature=');
  const signature = params.get('signature');
  const keyId = params.get('key_id');
  if (idx < 0 || !signature || !keyId) return { ok: false, params };
  const key = keys.find((k) => String(k.keyId) === keyId);
  if (!key) return { ok: false, params };
  const content = q.slice(0, idx);
  try {
    const ok = createVerify('SHA256').update(content).verify(key.pem, Buffer.from(signature, 'base64url'));
    return { ok, params };
  } catch {
    return { ok: false, params };
  }
}

let cache: { at: number; keys: VerifierKey[] } | undefined;

/** Google's public verifier keys (cached for 24 h, refetched if a key id is unknown). */
export async function fetchVerifierKeys(
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
  force = false,
): Promise<VerifierKey[]> {
  if (!force && cache && now - cache.at < 24 * 3600_000) return cache.keys;
  const res = await fetchImpl('https://www.gstatic.com/admob/reward/verifier-keys.json');
  if (!res.ok) throw new Error(`verifier keys HTTP ${res.status}`);
  const json = (await res.json()) as { keys: { keyId: number | string; pem: string }[] };
  cache = { at: now, keys: json.keys.map((k) => ({ keyId: k.keyId, pem: k.pem })) };
  return cache.keys;
}
