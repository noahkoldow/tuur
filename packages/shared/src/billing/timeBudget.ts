import { z } from 'zod';

export const CREDIT_TOUR_MINUTES = 90;
export const SUBSCRIPTION_TOUR_MINUTES_PER_MONTH = 500;
/** A disconnected client cannot keep a metered tour running indefinitely. */
export const TOUR_TIME_LEASE_SECONDS = 90;
export const TOUR_TIME_HEARTBEAT_SECONDS = 30;

export const UpdateTourTimeRequestSchema = z.object({
  sessionId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/),
  /** Monotonically increasing per session. Re-send the same sequence after an uncertain response. */
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  mode: z.enum(['tour', 'planned', 'fork', 'roam']),
  tourId: z.string().min(1).max(200).optional(),
  placeId: z.string().min(1).max(200).optional(),
  tile: z.string().min(1).max(30).optional(),
  scriptInstanceId: z.string().min(1).max(200).optional(),
  state: z.enum(['active', 'paused', 'ended']),
});
export type UpdateTourTimeRequest = z.infer<typeof UpdateTourTimeRequestSchema>;
export type TourTimeSource = 'subscription' | 'credit' | 'legacy' | 'free';
export interface UpdateTourTimeResult {
  /** Device-only archive playback; never authorizes online content generation. */
  offline?: true;
  sessionId: string;
  sequence: number;
  remainingSeconds: number | null;
  leaseExpiresAt: number | null;
  serverNow: number;
  source: TourTimeSource;
  state: 'active' | 'paused' | 'ended';
}
export type TourTimeResult = UpdateTourTimeResult;

/** Only server-confirmed active intervals count; pauses and time after the lease never do. */
export function activeTourSeconds(chargedThrough: number, leaseExpiresAt: number, now: number): number {
  return Math.max(0, Math.min(now, leaseExpiresAt) - chargedThrough) / 1000;
}

/** Both subscription products receive a fresh calendar-month allowance; unused minutes do not roll over. */
export const tourTimeMonth = (now: number): string => new Date(now).toISOString().slice(0, 7);
export function nextTourTimeMonth(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

export function tourTimeMonthStart(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

/** A valid subscription can carry the same short lease into its next monthly allowance. */
export function tourTimeLeaseEnd(
  now: number,
  source: TourTimeSource,
  remainingSeconds: number | null,
  entitlementExpiresAt: number | null,
): number {
  const maxEnd = now + TOUR_TIME_LEASE_SECONDS * 1000;
  let allowanceEnd = now + (remainingSeconds ?? Infinity) * 1000;
  const renewal = nextTourTimeMonth(now);
  // The old allowance must cover every second up to renewal; never bridge an exhausted gap.
  if (source === 'subscription' && allowanceEnd >= renewal && maxEnd > renewal)
    allowanceEnd = renewal + SUBSCRIPTION_TOUR_MINUTES_PER_MONTH * 60_000;
  return Math.min(maxEnd, allowanceEnd, entitlementExpiresAt ?? Infinity);
}
