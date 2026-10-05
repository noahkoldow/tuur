import { describe, expect, it, vi } from 'vitest';
import { RevenueCatV2 } from './revenuecat';

const root = '/v2/projects/project';
const base = `${root}/customers/alice`;
const list = (items: unknown[], next_page: string | null = null) => ({ object: 'list', items, next_page });
const purchase = {
  id: 'purchase',
  customer_id: 'alice',
  product_id: 'prod_1',
  store_purchase_identifier: '100000001',
  store: 'app_store',
  environment: 'production',
  quantity: 1,
  status: 'owned',
  ownership: 'purchased',
};
function api(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    [base]: { id: 'alice' },
    [`${base}/aliases?limit=100`]: list([{ id: 'alice' }]),
    [`${base}/purchases?environment=production&limit=100`]: list([purchase]),
    [`${base}/subscriptions?environment=production&limit=100`]: list([]),
    [`${root}/products/prod_1`]: { id: 'prod_1', store_identifier: 'tuur_credit_5' },
    ...overrides,
  };
  const request = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const body = responses[url.pathname + url.search];
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 });
  });
  return { reader: new RevenueCatV2('project', 'test-secret', request), request };
}

describe('RevenueCat V2 reconciliation adapter', () => {
  it('resolves canonical customer aliases and paginated purchases to store product IDs', async () => {
    const next = `${base}/purchases?starting_after=purchase`;
    const { reader, request } = api({
      [`${root}/customers/%24RCAnonymousID%3Aalias`]: { id: 'alice' },
      [`${base}/aliases?limit=100`]: list([{ id: '$RCAnonymousID:alias' }]),
      [`${base}/purchases?environment=production&limit=100`]: list([purchase], next),
      [next]: list([{ ...purchase, id: 'purchase2', store_purchase_identifier: '100000002' }]),
    });
    const result = await reader.customer('$RCAnonymousID:alias', 'production');
    expect(result.aliases).toEqual(['alice', '$RCAnonymousID:alias']);
    expect(result.purchases.map((p) => p.productIdentifier)).toEqual(['tuur_credit_5', 'tuur_credit_5']);
    expect(request.mock.calls.every(([, init]) => init?.redirect === 'error')).toBe(true);
  });

  it.each([401, 403, 404, 429, 503])(
    'fails closed on HTTP %i without leaking response/key',
    async (status) => {
      const { reader } = api({ [base]: new Response('sensitive upstream body', { status }) });
      await expect(reader.customer('alice', 'production')).rejects.toMatchObject({
        code: 'failed-precondition',
      });
    },
  );

  it.each([
    'https://evil.test/steal',
    '/v2/projects/another/customers/alice/purchases',
    `${base}/purchases?environment=production&limit=100`,
  ])('rejects unsafe or cyclic pagination: %s', async (next) => {
    const { reader, request } = api({
      [`${base}/purchases?environment=production&limit=100`]: list([], next),
    });
    await expect(reader.customer('alice', 'production')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(request.mock.calls.some(([url]) => String(url).includes('evil.test'))).toBe(false);
  });

  it.each([
    { ...purchase, status: 'new_unknown_status' },
    { ...purchase, customer_id: 'another-account' },
    { ...purchase, environment: 'sandbox' },
    { ...purchase, quantity: undefined },
  ])('rejects incomplete, foreign or unexpected purchases', async (bad) => {
    const { reader } = api({ [`${base}/purchases?environment=production&limit=100`]: list([bad]) });
    await expect(reader.customer('alice', 'production')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
