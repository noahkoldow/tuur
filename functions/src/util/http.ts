export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
}

export const USER_AGENT =
  process.env['TUUR_USER_AGENT'] ?? 'tuur/0.1 (+https://tuur.app; contact: set TUUR_USER_AGENT)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** JSON fetch with timeout and bounded retries on 429/5xx; public endpoints (Overpass, Wikimedia) rate limit. */
export async function fetchJson<T = unknown>(url: string, opt: FetchOptions = {}): Promise<T> {
  const retries = opt.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opt.timeoutMs ?? 30_000);
    try {
      const res = await fetch(url, {
        method: opt.method ?? 'GET',
        ...(opt.body ? { body: opt.body } : {}),
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...opt.headers },
        signal: ctrl.signal,
      });
      if (res.ok) return (await res.json()) as T;
      lastErr = new Error(`HTTP ${res.status} for ${new URL(url).host}`);
      if (res.status !== 429 && res.status < 500) throw lastErr;
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && e.message.startsWith('HTTP 4') && !e.message.startsWith('HTTP 429')) throw e;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(500 * 2 ** attempt);
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetch failed');
}
