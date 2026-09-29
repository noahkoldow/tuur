import Stripe from 'stripe';
import { StripeSubscriptionSchema, type StripeSubscription } from '@tuur/shared';

/** Payment events the app cares about (already validated and narrowed). */
export type PaymentEvent =
  | {
      id: string;
      created?: number;
      type: 'checkout_completed';
      partnerId: string;
      customerId: string;
      subscriptionId?: string;
    }
  | {
      id: string;
      created?: number;
      type: 'subscription';
      partnerId: string | undefined;
      subscription: StripeSubscription;
      deleted: boolean;
    }
  | { id: string; type: 'ignored' };

export interface CheckoutRequest {
  partnerId: string;
  email?: string;
  customerId?: string;
  priceId: string;
  tier: 'visibility' | 'offers';
  successUrl: string;
  cancelUrl: string;
}

/** Stripe behind an interface so everything runs with a mock (no keys in dev/tests). */
export interface PaymentsProvider {
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
  createPortal(customerId: string, returnUrl: string): Promise<{ url: string }>;
  /** Cancels a subscription immediately (account deletion); a missing subscription is not an error. */
  cancelSubscription(subscriptionId: string): Promise<void>;
  /** Verifies the signature and returns a normalized event; throws on invalid signatures. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent;
}

export class StripePayments implements PaymentsProvider {
  private readonly stripe: Stripe;
  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createCheckout(req: CheckoutRequest) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: req.priceId, quantity: 1 }],
      client_reference_id: req.partnerId,
      ...(req.customerId ? { customer: req.customerId } : req.email ? { customer_email: req.email } : {}),
      subscription_data: { metadata: { partnerId: req.partnerId, tier: req.tier } },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
    });
    if (!session.url) throw new Error('Stripe returned no checkout url');
    return { url: session.url };
  }

  async createPortal(customerId: string, returnUrl: string) {
    const s = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: s.url };
  }

  async cancelSubscription(subscriptionId: string) {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId);
    } catch (e) {
      if ((e as { code?: string }).code !== 'resource_missing') throw e;
    }
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent {
    if (!signature) throw new Error('missing signature');
    const ev = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    return {
      ...normalizeStripeEvent(ev.id, ev.type, ev.data.object),
      created: ev.created * 1000,
    } as PaymentEvent;
  }
}

export function normalizeStripeEvent(id: string, type: string, object: unknown): PaymentEvent {
  if (type === 'checkout.session.completed') {
    const s = object as {
      client_reference_id?: string | null;
      customer?: string | null;
      subscription?: string | null;
    };
    if (!s.client_reference_id || !s.customer) return { id, type: 'ignored' };
    return {
      id,
      type: 'checkout_completed',
      partnerId: s.client_reference_id,
      customerId: s.customer,
      ...(s.subscription ? { subscriptionId: s.subscription } : {}),
    };
  }
  if (type.startsWith('customer.subscription.')) {
    const parsed = StripeSubscriptionSchema.safeParse(object);
    if (!parsed.success) return { id, type: 'ignored' };
    return {
      id,
      type: 'subscription',
      partnerId: parsed.data.metadata['partnerId'],
      subscription: parsed.data,
      deleted: type === 'customer.subscription.deleted',
    };
  }
  return { id, type: 'ignored' };
}

/** Deterministic mock: checkout URLs point back at the success URL; webhooks are JSON with the same shape. */
export class MockPayments implements PaymentsProvider {
  async createCheckout(req: CheckoutRequest) {
    return { url: `${req.successUrl}${req.successUrl.includes('?') ? '&' : '?'}mock_checkout=${req.tier}` };
  }
  async createPortal(_customerId: string, returnUrl: string) {
    return { url: returnUrl };
  }
  cancelled: string[] = [];
  async cancelSubscription(subscriptionId: string) {
    this.cancelled.push(subscriptionId);
  }
  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent {
    if (signature !== 'mock') throw new Error('bad signature');
    const ev = JSON.parse(rawBody.toString('utf8')) as {
      id: string;
      type: string;
      created?: number;
      data: { object: unknown };
    };
    const n = normalizeStripeEvent(ev.id, ev.type, ev.data.object);
    return ev.created ? ({ ...n, created: ev.created * 1000 } as PaymentEvent) : n;
  }
}
