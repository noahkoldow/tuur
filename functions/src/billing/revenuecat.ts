import { z } from 'zod';
import { BillingError } from './errors';

const id = z.string().min(1).max(1500);
const environment = z.enum(['production', 'sandbox']);
const purchaseSchema = z.object({
  id,
  customer_id: id,
  product_id: id,
  store_purchase_identifier: id,
  store: z.string().min(1),
  environment,
  quantity: z.number().int().positive(),
  status: z.enum(['owned', 'refunded']),
  ownership: z.enum(['purchased', 'family_shared']),
});
const subscriptionSchema = z.object({
  id,
  customer_id: id,
  product_id: id.nullable(),
  store: z.string().min(1),
  environment,
  gives_access: z.boolean(),
  ends_at: z.number().nullable(),
  current_period_ends_at: z.number().nullable(),
  auto_renewal_status: z.string(),
  ownership: z.enum(['purchased', 'family_shared']),
});

export type RevenueCatPurchase = z.infer<typeof purchaseSchema> & { productIdentifier: string };
export type RevenueCatSubscription = z.infer<typeof subscriptionSchema> & {
  productIdentifier: string | null;
};
export interface RevenueCatCustomer {
  id: string;
  aliases: string[];
  purchases: RevenueCatPurchase[];
  subscriptions: RevenueCatSubscription[];
}
export interface RevenueCatReader {
  customer(id: string, environment: 'production' | 'sandbox'): Promise<RevenueCatCustomer>;
}

export function reconciliationRequired(eventId?: string, issue?: string): never {
  throw new BillingError('failed-precondition', 'RevenueCat requires verified purchase reconciliation', {
    reason: 'revenuecat_transfer_reconciliation_required',
    ...(eventId ? { eventId } : {}),
    ...(issue ? { issue } : {}),
  });
}

/** Read-only V2 adapter. Never turn an API failure, partial page or unknown state into an empty wallet.
 * https://www.revenuecat.com/docs/api-v2/customer/resources
 * https://www.revenuecat.com/docs/api-v2/customer
 */
export class RevenueCatV2 implements RevenueCatReader {
  private readonly root: string;
  constructor(
    private readonly projectId: string,
    private readonly apiKey: string,
    private readonly request = fetch,
  ) {
    this.root = `/v2/projects/${encodeURIComponent(projectId)}`;
  }
  private async get(path: string): Promise<unknown> {
    if (!this.projectId || !this.apiKey) reconciliationRequired();
    const url = new URL(path, 'https://api.revenuecat.com');
    // Pagination URLs are provider data, never permission to send the API key to another host/project.
    if (url.origin !== 'https://api.revenuecat.com' || !url.pathname.startsWith(`${this.root}/`))
      reconciliationRequired();
    const response = await this.request(url, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    if (!response.ok) reconciliationRequired();
    return response.json();
  }
  private async list<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
    const items: T[] = [];
    const visited = new Set<string>();
    let next: string | null = path;
    while (next) {
      if (visited.has(next) || visited.size >= 20) reconciliationRequired();
      visited.add(next);
      const page = z
        .object({ object: z.literal('list'), items: z.array(schema), next_page: z.string().nullable() })
        .safeParse(await this.get(next));
      if (!page.success) reconciliationRequired();
      items.push(...page.data.items);
      next = page.data.next_page;
    }
    return items;
  }
  async customer(customerId: string, env: 'production' | 'sandbox'): Promise<RevenueCatCustomer> {
    const base = `${this.root}/customers/${encodeURIComponent(customerId)}`;
    const customer = z.object({ id }).safeParse(await this.get(base));
    if (!customer.success) reconciliationRequired();
    const canonicalBase = `${this.root}/customers/${encodeURIComponent(customer.data.id)}`;
    const [aliases, purchases, subscriptions] = await Promise.all([
      this.list(`${canonicalBase}/aliases?limit=100`, z.object({ id })),
      this.list(`${canonicalBase}/purchases?environment=${env}&limit=100`, purchaseSchema),
      this.list(`${canonicalBase}/subscriptions?environment=${env}&limit=100`, subscriptionSchema),
    ]);
    const aliasIds = [...new Set([customer.data.id, ...aliases.map((a) => a.id)])];
    if (!aliasIds.includes(customerId)) reconciliationRequired();
    if (
      [...purchases, ...subscriptions].some((p) => p.environment !== env || !aliasIds.includes(p.customer_id))
    )
      reconciliationRequired();
    const productIds = [
      ...new Set([...purchases, ...subscriptions].flatMap((p) => (p.product_id ? [p.product_id] : []))),
    ];
    const products = new Map<string, string>();
    for (const productId of productIds) {
      const product = z
        .object({ id, store_identifier: id })
        .safeParse(await this.get(`${this.root}/products/${encodeURIComponent(productId)}`));
      if (!product.success || product.data.id !== productId) reconciliationRequired();
      products.set(productId, product.data.store_identifier);
    }
    return {
      id: customer.data.id,
      aliases: aliasIds,
      purchases: purchases.map((p) => ({ ...p, productIdentifier: products.get(p.product_id)! })),
      subscriptions: subscriptions.map((s) => ({
        ...s,
        productIdentifier: s.product_id ? products.get(s.product_id)! : null,
      })),
    };
  }
}

/** An alias is only an app UID if Firebase Auth confirms it. Multiple real UIDs require manual review. */
export async function resolveCustomerUid(
  customer: RevenueCatCustomer,
  findUids: (ids: string[]) => Promise<string[]>,
): Promise<string> {
  const candidates = customer.aliases.filter(
    (a) => !a.startsWith('$RCAnonymousID:') && a.length <= 128 && !a.includes('/'),
  );
  const uids = [...new Set(await findUids(candidates))];
  if (uids.length !== 1 || !candidates.includes(uids[0]!)) reconciliationRequired();
  return uids[0]!;
}
