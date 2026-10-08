import { BackendError } from './types';

/** Maps Firebase callable errors (code + details.reason) to the app's BackendError. */
export function toBackendError(e: unknown): BackendError {
  if (e instanceof BackendError) return e;
  const code = (e as { code?: string } | null)?.code ?? '';
  const message = (e as Error | null)?.message ?? 'unknown';
  const details = (e as { details?: { reason?: string; retryAfterMs?: number } } | null)?.details;
  if (details?.reason === 'ai_consent_required')
    return new BackendError('locked', message, undefined, details.reason);
  if (details?.reason === 'group_audio_pending')
    return new BackendError('unavailable', message, details.retryAfterMs ?? 1500, details.reason);
  if (
    details?.reason &&
    /^(tour_time_|tour_in_progress|tour_session_ended|time_|monthly_time_)/.test(details.reason)
  )
    return new BackendError('locked', message, details.retryAfterMs, details.reason);
  if (code.includes('permission-denied'))
    return new BackendError('locked', message, undefined, details?.reason);
  if (
    code.includes('failed-precondition') &&
    details?.reason &&
    details.reason !== 'insufficient' &&
    /^(too_far|partner_inactive|offer_|daily_limit|already_redeemed_today)/.test(details.reason)
  )
    return new BackendError('redeem_denied', message, undefined, details.reason);
  if (code.includes('failed-precondition') && details?.reason === 'insufficient')
    return new BackendError('insufficient_credit', message, undefined, details.reason);
  if (code.includes('failed-precondition') || code.includes('already-exists'))
    return new BackendError('invite_invalid', message, undefined, details?.reason);
  if (code.includes('resource-exhausted'))
    return new BackendError('rate_limited', message, details?.retryAfterMs, details?.reason);
  if (code.includes('unavailable') && details?.reason)
    return new BackendError('paused', message, details.retryAfterMs, details.reason);
  if (code.includes('unavailable') || code.includes('network')) return new BackendError('network', message);
  if (code.includes('not-found')) return new BackendError('not_found', message);
  if (code.includes('unauthenticated')) return new BackendError('unauthenticated', message);
  return new BackendError('unknown', message);
}
