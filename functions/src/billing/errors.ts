export class BillingError extends Error {
  constructor(
    readonly code:
      | 'permission-denied'
      | 'failed-precondition'
      | 'not-found'
      | 'invalid-argument'
      | 'resource-exhausted'
      | 'already-exists',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
