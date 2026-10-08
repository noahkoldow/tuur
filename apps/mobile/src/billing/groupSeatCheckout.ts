import type { PurchaseResult } from './types';

type PendingSeat = { groupId: string; requestId: string; phase: 'redeem' | 'purchase' };
export type SeatCheckoutResult = 'idle' | 'delivered' | 'waiting' | 'cancelled' | 'unavailable' | 'consent';

export interface SeatCheckoutDeps {
  uid: string;
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };
  newId(): string;
  isCurrentAccount(): boolean;
  availableCredits(): number;
  redeem(groupId: string, requestId: string): Promise<unknown>;
  recordConsent(): Promise<void>;
  purchase(): Promise<PurchaseResult>;
}

const detail = (error: unknown) => error as { code?: string; reason?: string } | undefined;
const forgottenAccounts = new Set<string>();

/** Call before clearing local data after permanent account deletion; ordinary sign-out keeps recovery intact. */
export function forgetGroupSeatAccount(uid: string) {
  forgottenAccounts.add(uid);
}

/**
 * One account-scoped, durable intent. Persist before any debit or store sheet: retries and app restarts reuse the
 * same server idempotency key. Only an explicit store cancellation permits discarding an uncertain purchase.
 */
export class GroupSeatCheckout {
  private intent: PendingSeat | undefined;
  private running: Promise<SeatCheckoutResult> | undefined;
  private readonly key: string;

  constructor(private readonly deps: SeatCheckoutDeps) {
    this.key = `tuur.group-seat.v1.${deps.uid}`;
  }

  get pending() {
    return Boolean(this.intent);
  }

  private account() {
    if (forgottenAccounts.has(this.deps.uid) || !this.deps.isCurrentAccount())
      throw new Error('Seat checkout account changed');
  }

  private async read() {
    this.account();
    const raw = await this.deps.storage.getItem(this.key);
    this.account();
    if (!raw) return (this.intent = undefined);
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      !('groupId' in value) ||
      typeof value.groupId !== 'string' ||
      !('requestId' in value) ||
      typeof value.requestId !== 'string' ||
      !/^[A-Za-z0-9_-]{10,120}$/.test(value.requestId) ||
      !('phase' in value) ||
      (value.phase !== 'redeem' && value.phase !== 'purchase')
    )
      throw new Error('Invalid pending seat checkout');
    this.intent = value as PendingSeat;
    return this.intent;
  }

  private async save(intent: PendingSeat) {
    this.account();
    await this.deps.storage.setItem(this.key, JSON.stringify(intent));
    this.intent = intent;
    // An already-running storage write must not recreate deleted account data after the deletion cleanup.
    if (forgottenAccounts.has(this.deps.uid)) await this.clear();
    this.account();
  }

  private async clear() {
    await this.deps.storage.removeItem(this.key);
    this.intent = undefined;
  }

  private run(action: () => Promise<SeatCheckoutResult>) {
    if (this.running) return this.running;
    const task = action().finally(() => {
      if (this.running === task) this.running = undefined;
    });
    this.running = task;
    return task;
  }

  private async deliver(intent: PendingSeat): Promise<SeatCheckoutResult> {
    this.account();
    try {
      await this.deps.redeem(intent.groupId, intent.requestId);
    } catch (error) {
      this.account();
      if (detail(error)?.reason === 'no_seat_credit') {
        if (intent.phase === 'purchase') return 'waiting';
        // No store sheet has been opened and the server confirms nothing was spent.
        await this.clear();
        return 'idle';
      }
      if (
        detail(error)?.code === 'not_found' ||
        detail(error)?.reason === 'ended' ||
        detail(error)?.reason === 'max_size'
      ) {
        // An ended group is not evidence that StoreKit cancelled. Keep waiting for a late paid credit instead
        // of allowing a second purchase for a new group while the first payment is still unresolved.
        if (intent.phase === 'purchase' && this.deps.availableCredits() < 1) return 'waiting';
        // The purchased credit remains in the wallet for a later group.
        await this.clear();
        return 'unavailable';
      }
      throw error; // Preserve the intent when the outcome of the request is unknown.
    }
    await this.clear();
    return 'delivered';
  }

  recover() {
    return this.run(async () => {
      const intent = await this.read();
      return intent ? this.deliver(intent) : 'idle';
    });
  }

  start(groupId: string, consent: boolean) {
    return this.run(async () => {
      const previous = await this.read();
      if (previous) return this.deliver(previous);
      const intent: PendingSeat = { groupId, requestId: this.deps.newId(), phase: 'redeem' };
      await this.save(intent);
      const existingCredit = await this.deliver(intent);
      if (existingCredit !== 'idle') return existingCredit;
      if (!consent) return 'consent';
      this.account();
      await this.deps.recordConsent();
      await this.save({ ...intent, phase: 'purchase' });
      // An error or app termination may happen after StoreKit charged successfully. Keep the intent until the
      // server grants the credit. Recovery never opens another purchase sheet.
      const result = await this.deps.purchase();
      if (result === 'cancelled') {
        await this.clear();
        return 'cancelled';
      }
      this.account();
      return this.deliver(this.intent!);
    });
  }
}
