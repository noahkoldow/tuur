import { distanceMeters, type LatLng } from '../geo/geohash';
import { applyModifiers } from '../poi/scoring';
import type { Offer, Partner } from './schemas';

/** Configurable limits (Firestore `config/partners` overrides these defaults). */
export interface PartnerConfig {
  /** Score points added per tier; always clamped to `boostCap`. */
  boost: { visibility: number; offers: number };
  boostCap: number;
  tokenTtlMs: number;
  /** The listener has to be this close to the partner to open a redemption QR. */
  maxRedeemDistanceM: number;
}

export const DEFAULT_PARTNER_CONFIG: PartnerConfig = {
  boost: { visibility: 8, offers: 12 },
  boostCap: 15,
  tokenTtlMs: 10 * 60_000,
  maxRedeemDistanceM: 150,
};

export const isPartnerLive = (p: Pick<Partner, 'status' | 'plan'>, now: number): boolean =>
  p.status === 'approved' &&
  p.plan.active &&
  p.plan.tier !== 'none' &&
  (p.plan.currentPeriodEnd === null || p.plan.currentPeriodEnd > now);

/** Score boost of a partner right now: 0 unless approved with an active paid plan; never above the cap (spec 7.1). */
export function partnerBoostPoints(
  p: Pick<Partner, 'status' | 'plan'>,
  now: number,
  cfg: PartnerConfig = DEFAULT_PARTNER_CONFIG,
): number {
  if (!isPartnerLive(p, now)) return 0;
  const raw = p.plan.tier === 'offers' ? cfg.boost.offers : cfg.boost.visibility;
  return Math.max(0, Math.min(raw, cfg.boostCap));
}

/** Final POI score: base * admin weight + capped partner boost. */
export function scoreWithPartner(
  baseScore: number,
  adminWeight: number,
  boost: number,
  cfg: PartnerConfig = DEFAULT_PARTNER_CONFIG,
): number {
  return applyModifiers(baseScore, { adminWeight, partnerBoost: boost, partnerBoostCap: cfg.boostCap });
}

/** Offers are only sold in the `offers` tier. */
export const canHaveOffers = (p: Pick<Partner, 'status' | 'plan'>, now: number) =>
  isPartnerLive(p, now) && p.plan.tier === 'offers';

export function offerWindow(o: Pick<Offer, 'active' | 'validFrom' | 'validUntil'>, now: number) {
  if (!o.active) return 'inactive' as const;
  if (now < o.validFrom) return 'not_started' as const;
  if (now >= o.validUntil) return 'expired' as const;
  return 'open' as const;
}

export type TokenDecision =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'partner_inactive'
        | 'offer_inactive'
        | 'offer_not_started'
        | 'offer_expired'
        | 'too_far'
        | 'daily_limit'
        | 'already_redeemed_today';
    };

export interface CreateTokenInput {
  partner: Pick<Partner, 'status' | 'plan'>;
  offer: Pick<Offer, 'active' | 'validFrom' | 'validUntil' | 'dailyLimit'>;
  now: number;
  /** Listener position for the proximity check; never stored. */
  userPosition: LatLng;
  partnerLocation: LatLng;
  redeemedToday: number;
  userRedeemedToday: boolean;
  cfg?: PartnerConfig;
}

export function decideCreateToken(i: CreateTokenInput): TokenDecision {
  const cfg = i.cfg ?? DEFAULT_PARTNER_CONFIG;
  if (!canHaveOffers(i.partner, i.now)) return { ok: false, reason: 'partner_inactive' };
  const w = offerWindow(i.offer, i.now);
  if (w === 'inactive') return { ok: false, reason: 'offer_inactive' };
  if (w === 'not_started') return { ok: false, reason: 'offer_not_started' };
  if (w === 'expired') return { ok: false, reason: 'offer_expired' };
  if (distanceMeters(i.userPosition, i.partnerLocation) > cfg.maxRedeemDistanceM)
    return { ok: false, reason: 'too_far' };
  if (i.userRedeemedToday) return { ok: false, reason: 'already_redeemed_today' };
  if (i.offer.dailyLimit !== undefined && i.redeemedToday >= i.offer.dailyLimit)
    return { ok: false, reason: 'daily_limit' };
  return { ok: true };
}

export type RedeemTokenDecision =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'wrong_partner'
        | 'expired'
        | 'already_used'
        | 'partner_inactive'
        | 'offer_inactive'
        | 'offer_expired'
        | 'daily_limit';
    };

export interface RedeemInput {
  token: { partnerId: string; expiresAt: number; used: boolean };
  scannerPartnerId: string;
  partner: Pick<Partner, 'status' | 'plan'>;
  offer: Pick<Offer, 'active' | 'validFrom' | 'validUntil' | 'dailyLimit'>;
  now: number;
  redeemedToday: number;
}

/** Checked when the partner scans: right partner, not expired, single use, offer still valid and within its limit. */
export function decideRedeemToken(i: RedeemInput): RedeemTokenDecision {
  if (i.token.partnerId !== i.scannerPartnerId) return { ok: false, reason: 'wrong_partner' };
  if (i.token.used) return { ok: false, reason: 'already_used' };
  if (i.token.expiresAt <= i.now) return { ok: false, reason: 'expired' };
  if (!canHaveOffers(i.partner, i.now)) return { ok: false, reason: 'partner_inactive' };
  const w = offerWindow(i.offer, i.now);
  if (w === 'inactive') return { ok: false, reason: 'offer_inactive' };
  if (w !== 'open') return { ok: false, reason: 'offer_expired' };
  if (i.offer.dailyLimit !== undefined && i.redeemedToday >= i.offer.dailyLimit)
    return { ok: false, reason: 'daily_limit' };
  return { ok: true };
}

/** UTC day key (`YYYY-MM-DD`) used for daily limits and aggregated stats. */
export const dayKeyUtc = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** Spoken label before partner content (UWG: partner content must be recognizable, spec 7.3). */
export function partnerIntro(lang: string): string {
  return lang === 'de' ? 'Eine Vorstellung unseres Partners.' : 'A word from our partner.';
}
