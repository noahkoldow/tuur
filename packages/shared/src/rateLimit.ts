export interface RateLimitState {
  windowStart: number;
  count: number;
}
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

/** Fixed-window limiter as a pure function; the caller persists `next` transactionally. */
export function rateLimitDecision(
  state: RateLimitState | undefined,
  now: number,
  rule: RateLimitRule,
): { allowed: boolean; next: RateLimitState; retryAfterMs: number } {
  if (!state || now - state.windowStart >= rule.windowMs) {
    return { allowed: true, next: { windowStart: now, count: 1 }, retryAfterMs: 0 };
  }
  if (state.count >= rule.limit) {
    return { allowed: false, next: state, retryAfterMs: state.windowStart + rule.windowMs - now };
  }
  return { allowed: true, next: { windowStart: state.windowStart, count: state.count + 1 }, retryAfterMs: 0 };
}
