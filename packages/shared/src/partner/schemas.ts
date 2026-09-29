import { z } from 'zod';
import { LatLngSchema } from '../schemas';

export const PARTNER_STATUSES = ['pending', 'approved', 'suspended'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

/** `visibility` = capped score boost + partner label; `offers` = visibility + offers with QR redemption. */
export const PARTNER_TIERS = ['none', 'visibility', 'offers'] as const;
export type PartnerTier = (typeof PARTNER_TIERS)[number];

export const PARTNER_CATEGORIES = [
  'cafe',
  'restaurant',
  'shop',
  'museum',
  'hotel',
  'activity',
  'other',
] as const;

const text = (max: number) => z.string().trim().min(1).max(max);

export const PartnerProfileSchema = z.object({
  name: text(80),
  category: z.enum(PARTNER_CATEGORIES),
  address: text(200),
  countryCode: z.string().length(2),
  openingHours: z.string().trim().max(300).default(''),
  /** Partner-provided introduction; the source of the spoken "partner introduction" (never verified facts). */
  description: text(600),
  website: z.string().url().max(200).optional(),
  imageUrls: z.array(z.string().url().max(400)).max(3).default([]),
});
export type PartnerProfile = z.infer<typeof PartnerProfileSchema>;

export const PartnerPlanSchema = z.object({
  tier: z.enum(PARTNER_TIERS),
  active: z.boolean(),
  /** null = unknown; an active plan past this time is treated as inactive (webhook may be late). */
  currentPeriodEnd: z.number().nullable().default(null),
  cancelAtPeriodEnd: z.boolean().default(false),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  currency: z.string().optional(),
});
export type PartnerPlan = z.infer<typeof PartnerPlanSchema>;

export const PartnerSchema = PartnerProfileSchema.extend({
  id: z.string(),
  ownerUid: z.string(),
  status: z.enum(PARTNER_STATUSES),
  plan: PartnerPlanSchema,
  /** Existing POI this partner is attached to (set on admin approval). */
  poiId: z.string().optional(),
  /** Request to create a new POI at this location (needs admin approval). */
  poiProposal: z.object({ name: text(120), location: LatLngSchema }).optional(),
  /** Bumped whenever narration-relevant profile data changes (part of the narration cache key). */
  contentRev: z.number().int().nonnegative().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Partner = z.infer<typeof PartnerSchema>;

export const OfferInputSchema = z
  .object({
    title: text(80),
    description: text(400),
    terms: z.string().trim().max(400).default(''),
    validFrom: z.number().int().nonnegative(),
    validUntil: z.number().int().positive(),
    dailyLimit: z.number().int().min(1).max(1000).optional(),
    active: z.boolean().default(true),
  })
  .refine((o) => o.validUntil > o.validFrom, { message: 'validUntil must be after validFrom' });
export type OfferInput = z.infer<typeof OfferInputSchema>;

export const OfferSchema = z
  .object({
    id: z.string(),
    partnerId: z.string(),
    poiId: z.string(),
    title: text(80),
    description: text(400),
    terms: z.string().max(400).default(''),
    validFrom: z.number().int().nonnegative(),
    validUntil: z.number().int().positive(),
    dailyLimit: z.number().int().min(1).max(1000).optional(),
    active: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .refine((o) => o.validUntil > o.validFrom);
export type Offer = z.infer<typeof OfferSchema>;

/** Offer as shown in the app (no partner internals). */
export interface PublicOffer {
  id: string;
  poiId: string;
  partnerName: string;
  title: string;
  description: string;
  terms: string;
  validUntil: number;
}
