import { z } from 'zod';

/**
 * Entitlements are the single source of truth for access (spec 6.4). They live in `users/{uid}/entitlements` and
 * are written exclusively by Cloud Functions (RevenueCat webhook, credit spending, invite redemption, rewarded-ad
 * verification). Clients can only read them; security rules forbid client writes.
 */
export const SubscriptionEntitlementSchema = z.object({
  type: z.literal('subscription'),
  active: z.boolean(),
  productId: z.string(),
  /** null = unknown / lifetime */
  expiresAt: z.number().nullable(),
  willRenew: z.boolean().default(false),
  periodType: z.string().optional(),
  store: z.string().optional(),
  updatedAt: z.number(),
});

export const TOUR_ENTITLEMENT_SOURCES = ['credit', 'reward', 'invite', 'free'] as const;
export const TourEntitlementSchema = z.object({
  type: z.literal('tour'),
  tourId: z.string(),
  source: z.enum(TOUR_ENTITLEMENT_SOURCES),
  grantedAt: z.number(),
  /** Standard tours are unlocked permanently (null). */
  expiresAt: z.number().nullable(),
  /** Set for invited friends: who shared the tour. */
  inviteFrom: z.string().optional(),
});

export const SessionEntitlementSchema = z.object({
  type: z.literal('session'),
  placeId: z.string(),
  /** 24 h at one place (spec 6.1). */
  expiresAt: z.number(),
  source: z.literal('credit'),
  grantedAt: z.number(),
});

export const EntitlementSchema = z.discriminatedUnion('type', [
  SubscriptionEntitlementSchema,
  TourEntitlementSchema,
  SessionEntitlementSchema,
]);
export type Entitlement = z.infer<typeof EntitlementSchema>;
export type SubscriptionEntitlement = z.infer<typeof SubscriptionEntitlementSchema>;
export type TourEntitlement = z.infer<typeof TourEntitlementSchema>;
export type SessionEntitlement = z.infer<typeof SessionEntitlementSchema>;

export const SESSION_DURATION_MS = 24 * 3600_000;
export const MAX_INVITES_PER_TOUR = 2;

export type SessionMode = 'tour' | 'planned' | 'fork' | 'roam';

export interface AccessContext {
  /** Standard tour the narration belongs to. */
  tourId?: string;
  /** Whether that tour is the free tour of its place (from the tour document, never from the client). */
  tourFree?: boolean;
  /** Dynamic modes are sold as 24 h sessions per place. */
  mode?: SessionMode;
  placeId?: string;
}

export type AccessDecision =
  | { allowed: true; reason: 'subscription' | 'free' | 'tour' | 'session' }
  | { allowed: false; reason: 'denied' | 'no_context' };

export function isSubscriber(ents: Entitlement[], now: number): boolean {
  return ents.some(
    (e) => e.type === 'subscription' && e.active && (e.expiresAt === null || e.expiresAt > now),
  );
}

/** Decides whether content may be served. Evaluated server-side before any (paid) generation happens. */
export function decideAccess(ents: Entitlement[], ctx: AccessContext, now: number): AccessDecision {
  if (isSubscriber(ents, now)) return { allowed: true, reason: 'subscription' };
  if (ctx.mode === 'planned' || ctx.mode === 'fork' || ctx.mode === 'roam') {
    if (
      ctx.placeId &&
      ents.some((e) => e.type === 'session' && e.placeId === ctx.placeId && e.expiresAt > now)
    )
      return { allowed: true, reason: 'session' };
    return { allowed: false, reason: 'denied' };
  }
  if (!ctx.tourId) return { allowed: false, reason: 'no_context' };
  if (ctx.tourFree) return { allowed: true, reason: 'free' };
  if (
    ents.some(
      (e) => e.type === 'tour' && e.tourId === ctx.tourId && (e.expiresAt === null || e.expiresAt > now),
    )
  )
    return { allowed: true, reason: 'tour' };
  return { allowed: false, reason: 'denied' };
}

export interface Wallet {
  /** Purchased credits (1.99 EUR each, via RevenueCat). */
  balance: number;
  /** Credits earned by watching rewarded ads; only valid for standard tours. */
  rewardBalance: number;
}

export type SpendKind = 'tour' | 'session';
export type SpendDecision =
  | { ok: true; use: 'reward' | 'paid'; wallet: Wallet }
  | { ok: false; reason: 'insufficient' | 'already_unlocked' | 'subscriber' };

/** One credit unlocks one standard tour permanently or one 24 h session (spec 6.1). Reward credits first for tours. */
export function decideSpend(
  wallet: Wallet,
  kind: SpendKind,
  alreadyUnlocked: boolean,
  subscriber: boolean,
): SpendDecision {
  if (subscriber) return { ok: false, reason: 'subscriber' };
  if (alreadyUnlocked) return { ok: false, reason: 'already_unlocked' };
  if (kind === 'tour' && wallet.rewardBalance > 0)
    return { ok: true, use: 'reward', wallet: { ...wallet, rewardBalance: wallet.rewardBalance - 1 } };
  if (wallet.balance > 0)
    return { ok: true, use: 'paid', wallet: { ...wallet, balance: wallet.balance - 1 } };
  return { ok: false, reason: 'insufficient' };
}

export type InviteDecision =
  { ok: true; remaining: number } | { ok: false; reason: 'not_purchased' | 'limit_reached' };

/** Only tours bought with a credit can be shared, at most twice (spec 6.3). Rewards and invites cannot be re-shared. */
export function decideInvite(ents: Entitlement[], tourId: string, existingInvites: number): InviteDecision {
  const bought = ents.some((e) => e.type === 'tour' && e.tourId === tourId && e.source === 'credit');
  if (!bought) return { ok: false, reason: 'not_purchased' };
  if (existingInvites >= MAX_INVITES_PER_TOUR) return { ok: false, reason: 'limit_reached' };
  return { ok: true, remaining: MAX_INVITES_PER_TOUR - existingInvites - 1 };
}

export interface InviteDoc {
  tourId: string;
  ownerUid: string;
  createdAt: number;
  expiresAt: number;
  redeemedBy?: string | undefined;
  redeemedAt?: number | undefined;
}

export type RedeemDecision =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_redeemed' | 'own_invite' | 'already_unlocked' };

export function decideRedeem(
  invite: InviteDoc | undefined,
  uid: string,
  alreadyUnlocked: boolean,
  now: number,
): RedeemDecision {
  if (!invite) return { ok: false, reason: 'not_found' };
  if (invite.redeemedBy) return { ok: false, reason: 'already_redeemed' };
  if (invite.expiresAt <= now) return { ok: false, reason: 'expired' };
  if (invite.ownerUid === uid) return { ok: false, reason: 'own_invite' };
  if (alreadyUnlocked) return { ok: false, reason: 'already_unlocked' };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------
// RevenueCat webhook (spec 6.4): purchase events become entitlement operations.

export const RC_EVENT_TYPES = [
  'INITIAL_PURCHASE',
  'RENEWAL',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'REFUND',
  'TEST',
] as const;

export const RevenueCatEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  app_user_id: z.string(),
  product_id: z.string().optional(),
  new_product_id: z.string().optional(),
  expiration_at_ms: z.number().nullable().optional(),
  event_timestamp_ms: z.number().optional(),
  environment: z.string().optional(),
  purchased_at_ms: z.number().optional(),
  period_type: z.string().optional(),
  store: z.string().optional(),
  transaction_id: z.string().optional(),
  cancel_reason: z.string().optional(),
});
export type RevenueCatEvent = z.infer<typeof RevenueCatEventSchema>;

export type ProductKind = { kind: 'credit'; credits: number } | { kind: 'subscription' };
export type ProductMap = Record<string, ProductKind>;

export const DEFAULT_PRODUCTS: ProductMap = {
  tuur_credit_1: { kind: 'credit', credits: 1 },
  tuur_credit_5: { kind: 'credit', credits: 5 },
  tuur_sub_monthly: { kind: 'subscription' },
  tuur_sub_yearly: { kind: 'subscription' },
};

export type RevenueCatOp =
  | { op: 'setSubscription'; entitlement: SubscriptionEntitlement }
  | { op: 'addCredits'; amount: number; ref: string }
  | { op: 'removeCredits'; amount: number; ref: string }
  | { op: 'ignore'; reason: string };

/**
 * Pure mapping of a RevenueCat event to operations. Idempotency is handled by the caller (event id ledger);
 * unknown products and unknown event types are ignored instead of failing the webhook.
 */
export function planRevenueCatEvent(e: RevenueCatEvent, products: ProductMap, now: number): RevenueCatOp[] {
  if (e.type === 'TEST') return [{ op: 'ignore', reason: 'test' }];
  const productId = e.type === 'PRODUCT_CHANGE' && e.new_product_id ? e.new_product_id : e.product_id;
  const product = productId ? products[productId] : undefined;
  if (!product) return [{ op: 'ignore', reason: `unknown_product:${productId ?? 'none'}` }];

  if (product.kind === 'credit') {
    const ref = e.transaction_id ?? e.id;
    if (e.type === 'NON_RENEWING_PURCHASE' || e.type === 'INITIAL_PURCHASE')
      return [{ op: 'addCredits', amount: product.credits, ref }];
    if (e.type === 'REFUND') return [{ op: 'removeCredits', amount: product.credits, ref }];
    return [{ op: 'ignore', reason: `credit_event:${e.type}` }];
  }

  const expiresAt = e.expiration_at_ms ?? null;
  const base = {
    type: 'subscription' as const,
    productId: productId!,
    expiresAt,
    ...(e.period_type ? { periodType: e.period_type } : {}),
    ...(e.store ? { store: e.store } : {}),
    updatedAt: now,
  };
  switch (e.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'PRODUCT_CHANGE':
    case 'UNCANCELLATION':
      return [
        {
          op: 'setSubscription',
          entitlement: { ...base, active: expiresAt === null || expiresAt > now, willRenew: true },
        },
      ];
    case 'CANCELLATION':
      // Access continues until the period ends; it just will not renew.
      return [
        {
          op: 'setSubscription',
          entitlement: { ...base, active: expiresAt === null || expiresAt > now, willRenew: false },
        },
      ];
    case 'BILLING_ISSUE':
      return [
        {
          op: 'setSubscription',
          entitlement: { ...base, active: expiresAt === null || expiresAt > now, willRenew: false },
        },
      ];
    case 'EXPIRATION':
    case 'REFUND':
      return [{ op: 'setSubscription', entitlement: { ...base, active: false, willRenew: false } }];
    default:
      return [{ op: 'ignore', reason: `unhandled:${e.type}` }];
  }
}
