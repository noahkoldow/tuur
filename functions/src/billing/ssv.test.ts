import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeAdmobCallback, matchesRewardedAdUnit, verifyAdmobSignature } from './ssv';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const key = { keyId: 123, pem };
const signed = (content: string) =>
  `${content}&signature=${sign('SHA256', Buffer.from(content), privateKey).toString('base64url')}&key_id=123`;
const payload = 'ad_unit=123&custom_data=nonce%2B%2F&transaction_id=tx-1&user_id=alice';
const response = (keys: unknown = [key]) => new Response(JSON.stringify({ keys }));
async function isolatedFetcher() {
  vi.resetModules();
  return (await import('./ssv')).fetchVerifierKeys;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('AdMob signed callback fields', () => {
  it('verifies untouched bytes and returns only the authenticated business fields', () => {
    const verified = verifyAdmobSignature(signed(payload), [key]);
    expect(verified.ok).toBe(true);
    expect(verified.params.get('custom_data')).toBe('nonce+/');
    expect(verified.params.get('user_id')).toBe('alice');
    expect(verified.params.has('signature')).toBe(false);
    expect(verified.params.has('key_id')).toBe(false);
    expect(verified.keyId).toBe('123');
  });

  it.each([
    '&user_id=attacker&custom_data=attacker-nonce',
    '&transaction_id=another-transaction',
    '&signature=another-signature',
    '&key_id=123',
  ])('rejects unsigned appended fields: %s', (extra) => {
    const verified = verifyAdmobSignature(signed('ad_unit=123&transaction_id=original') + extra, [key]);
    expect(verified.ok).toBe(false);
    expect([...verified.params]).toEqual([]);
    expect(verified.keyId).toBeUndefined();
  });

  it('rejects business fields inserted between signature and key_id', () => {
    const query = signed('ad_unit=123').replace('&key_id=', '&user_id=attacker&key_id=');
    expect(verifyAdmobSignature(query, [key]).ok).toBe(false);
  });

  it.each([
    `${payload}&user_id=bob`,
    `${payload}&%75ser_id=bob`,
    `${payload}&key_id=123`,
    `${payload}&signature=earlier`,
  ])('rejects duplicate or reserved signed fields: %s', (content) => {
    expect(verifyAdmobSignature(signed(content), [key]).ok).toBe(false);
  });

  it('does not expose fields when a signed user or signature has been changed', () => {
    const result = verifyAdmobSignature(signed(payload).replace('user_id=alice', 'user_id=bob'), [key]);
    expect(result.ok).toBe(false);
    expect([...result.params]).toEqual([]);
  });

  it('allows a well-formed unknown key ID to request a bounded refresh without returning business fields', () => {
    const result = verifyAdmobSignature(signed(payload), []);
    expect(result).toMatchObject({ ok: false, keyId: '123' });
    expect([...result.params]).toEqual([]);
  });
});

describe('AdMob rewarded unit binding', () => {
  const configured = 'ca-app-pub-5666991539216529/6260074942';

  it.each(['6260074942', configured])('accepts the configured signed unit: %s', (unit) => {
    const verified = verifyAdmobSignature(signed(`ad_unit=${encodeURIComponent(unit)}&user_id=alice`), [key]);
    expect(verified.ok).toBe(true);
    expect(matchesRewardedAdUnit(verified.params, configured)).toBe(true);
  });

  it.each(['another-unit', '6260074943', 'ca-app-pub-0000000000000000/6260074942', 'prefix6260074942'])(
    'rejects a validly signed callback for a different unit: %s',
    (unit) => {
      const verified = verifyAdmobSignature(signed(`ad_unit=${encodeURIComponent(unit)}&user_id=alice`), [
        key,
      ]);
      expect(verified.ok).toBe(true);
      expect(matchesRewardedAdUnit(verified.params, configured)).toBe(false);
    },
  );

  it('rejects a valid signature with no ad unit', () => {
    const verified = verifyAdmobSignature(signed('user_id=alice'), [key]);
    expect(verified.ok).toBe(true);
    expect(matchesRewardedAdUnit(verified.params, configured)).toBe(false);
  });

  it.each(['', '6260074942', 'forged/6260074942'])(
    'fails closed for missing or malformed config: %s',
    (unit) => {
      expect(matchesRewardedAdUnit(new URLSearchParams('ad_unit=6260074942'), unit)).toBe(false);
    },
  );
});

describe('AdMob callback completion', () => {
  const configured = 'ca-app-pub-5666991539216529/6260074942';

  it('acknowledges a signed foreign unit without invoking any Auth or reward storage operation', async () => {
    const grant = vi.fn(async () => ({ granted: true }));
    const check = verifyAdmobSignature(signed(payload), [key]);
    expect(await completeAdmobCallback(check, configured, grant)).toEqual({
      status: 200,
      body: { granted: false, reason: 'different_ad_unit' },
    });
    expect(grant).not.toHaveBeenCalled();
  });

  it('rejects an unsigned foreign unit without invoking any Auth or reward storage operation', async () => {
    const grant = vi.fn(async () => ({ granted: true }));
    const check = verifyAdmobSignature(payload, [key]);
    expect(await completeAdmobCallback(check, configured, grant)).toEqual({
      status: 403,
      body: 'invalid signature',
    });
    expect(grant).not.toHaveBeenCalled();
  });

  it('acknowledges a signed foreign unit even without app-specific reward parameters', async () => {
    const grant = vi.fn(async () => ({ granted: true }));
    const check = verifyAdmobSignature(signed('ad_unit=1234567890'), [key]);
    expect(await completeAdmobCallback(check, configured, grant)).toEqual({
      status: 200,
      body: { granted: false, reason: 'different_ad_unit' },
    });
    expect(grant).not.toHaveBeenCalled();
  });

  it('passes only authenticated parameters to the reward operation for the configured unit', async () => {
    const grant = vi.fn(async () => ({ granted: false, reason: 'unknown_nonce' }));
    const check = verifyAdmobSignature(signed(payload.replace('ad_unit=123', 'ad_unit=6260074942')), [key]);
    expect(await completeAdmobCallback(check, configured, grant)).toEqual({
      status: 200,
      body: { granted: false, reason: 'unknown_nonce' },
    });
    expect(grant).toHaveBeenCalledExactlyOnceWith({
      userId: 'alice',
      nonce: 'nonce+/',
      transactionId: 'tx-1',
    });
  });

  it('rejects missing reward parameters for the configured unit without invoking the reward operation', async () => {
    const grant = vi.fn(async () => ({ granted: true }));
    const check = verifyAdmobSignature(signed('ad_unit=6260074942'), [key]);
    expect(await completeAdmobCallback(check, configured, grant)).toEqual({
      status: 400,
      body: 'missing params',
    });
    expect(grant).not.toHaveBeenCalled();
  });

  it.each(['', '6260074942', 'forged/6260074942'])(
    'keeps malformed server config retryable: %s',
    async (unit) => {
      const grant = vi.fn(async () => ({ granted: true }));
      const check = verifyAdmobSignature(signed(payload), [key]);
      expect(await completeAdmobCallback(check, unit, grant)).toEqual({
        status: 503,
        body: 'ad unit not configured',
      });
      expect(grant).not.toHaveBeenCalled();
    },
  );
});

describe('AdMob verifier key request bounds', () => {
  it('shares one fetch across concurrent cold callbacks', async () => {
    const fetchKeys = await isolatedFetcher();
    let resolve!: (value: Response) => void;
    const request = vi.fn<typeof fetch>(() => new Promise<Response>((done) => (resolve = done)));
    const first = fetchKeys(request, 0);
    const second = fetchKeys(request, 0, true);
    expect(request).toHaveBeenCalledTimes(1);
    resolve(response());
    expect(await first).toEqual([key]);
    expect(await second).toEqual([key]);
  });

  it('keeps unknown-key refreshes within one request per minute and accepts rotated keys afterwards', async () => {
    const fetchKeys = await isolatedFetcher();
    const rotated = { ...key, keyId: 456 };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response([rotated]));
    expect(await fetchKeys(request, 0)).toEqual([key]);
    for (const now of [1, 1000, 59_999]) expect(await fetchKeys(request, now, true)).toEqual([key]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(await fetchKeys(request, 60_000, true)).toEqual([rotated]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('refreshes the ordinary cache at 24 hours', async () => {
    const fetchKeys = await isolatedFetcher();
    const request = vi.fn<typeof fetch>(async () => response());
    await fetchKeys(request, 0);
    await fetchKeys(request, 24 * 3600_000 - 1);
    expect(request).toHaveBeenCalledTimes(1);
    await fetchKeys(request, 24 * 3600_000);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('applies cooldown after upstream failure instead of amplifying callbacks', async () => {
    const fetchKeys = await isolatedFetcher();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(response());
    await expect(fetchKeys(request, 0)).rejects.toThrow('HTTP 503');
    await expect(fetchKeys(request, 1000, true)).rejects.toThrow('cooling down');
    expect(request).toHaveBeenCalledTimes(1);
    expect(await fetchKeys(request, 60_000, true)).toEqual([key]);
  });

  it('never falls back to keys older than 24 hours after a failed refresh', async () => {
    const fetchKeys = await isolatedFetcher();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response())
      .mockRejectedValueOnce(new Error('network failed'));
    await fetchKeys(request, 0);
    await expect(fetchKeys(request, 24 * 3600_000)).rejects.toThrow('network failed');
    await expect(fetchKeys(request, 24 * 3600_000 + 1)).rejects.toThrow('cooling down');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([
    { name: 'empty list', keys: [] },
    { name: 'duplicate IDs', keys: [key, key] },
    { name: 'invalid ID', keys: [{ keyId: 'bad', pem }] },
    { name: 'missing PEM', keys: [{ keyId: 123 }] },
  ])('rejects $name without replacing a valid cache', async ({ keys }) => {
    const fetchKeys = await isolatedFetcher();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response(keys));
    await fetchKeys(request, 0);
    await expect(fetchKeys(request, 60_000, true)).rejects.toThrow();
    expect(await fetchKeys(request, 60_001)).toEqual([key]);
  });

  it('aborts a stalled request at five seconds and refuses redirects', async () => {
    vi.useFakeTimers();
    const fetchKeys = await isolatedFetcher();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error('timeout')), ms);
      return controller.signal;
    });
    const request = vi.fn<typeof fetch>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
        }),
    );
    const result = expect(fetchKeys(request, 0)).rejects.toThrow('timeout');
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(request.mock.calls[0]?.[1]?.redirect).toBe('error');
    await vi.advanceTimersByTimeAsync(5000);
    await result;
  });
});
