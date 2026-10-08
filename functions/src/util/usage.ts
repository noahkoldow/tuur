import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { estimateCostUsd, type AiConfig, type Usage } from '@tuur/shared';
import { warn } from 'firebase-functions/logger';
import { AiConsentError } from '../privacy/aiConsent';

export type UsageKind = 'narration' | 'factcheck' | 'tts' | 'transition' | 'classify' | 'routing' | 'teaser';
export type BudgetConfig = Pick<AiConfig, 'pricing' | 'dailyBudgetUsd' | 'areaDailyBudgetUsd' | 'killSwitch'>;

export const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

export interface UsageEntry {
  kind: UsageKind;
  model?: string;
  usage: Usage;
  /** Area tile the cost is attributed to (no user identifiers are stored, spec 10). */
  tile?: string;
  key?: string;
  ok: boolean;
  note?: string;
}

/** Writes one `usageLogs` entry and increments the daily aggregates used for budgets and the admin dashboard. */
export async function logUsage(
  db: Firestore,
  pricing: AiConfig['pricing'],
  entry: UsageEntry,
  now = Date.now(),
): Promise<number> {
  const costUsd = estimateCostUsd(entry.usage, pricing);
  const day = dayKey(now);
  const batch = db.batch();
  batch.set(db.collection('usageLogs').doc(), { ts: now, day, ...stripUndefined(entry), costUsd });
  const inc = {
    costUsd: FieldValue.increment(costUsd),
    calls: FieldValue.increment(1),
    inputTokens: FieldValue.increment((entry.usage.inputTokens ?? 0) + (entry.usage.liteInputTokens ?? 0)),
    outputTokens: FieldValue.increment((entry.usage.outputTokens ?? 0) + (entry.usage.liteOutputTokens ?? 0)),
    ttsChars: FieldValue.increment(entry.usage.ttsChars ?? 0),
    groundingQueries: FieldValue.increment(entry.usage.groundingQueries ?? 0),
    [`byKind.${entry.kind}`]: FieldValue.increment(costUsd),
  };
  batch.set(db.collection('usageDaily').doc(day), { day, ...inc }, { merge: true });
  if (entry.tile)
    batch.set(
      db.collection('usageDailyAreas').doc(`${day}_${entry.tile}`),
      { day, tile: entry.tile, costUsd: FieldValue.increment(costUsd), calls: FieldValue.increment(1) },
      { merge: true },
    );
  await batch.commit();
  return costUsd;
}

export async function spentToday(
  db: Firestore,
  tile: string | undefined,
  now = Date.now(),
): Promise<{ globalToday: number; areaToday: number }> {
  const day = dayKey(now);
  const [g, a] = await Promise.all([
    db.collection('usageDaily').doc(day).get(),
    tile ? db.collection('usageDailyAreas').doc(`${day}_${tile}`).get() : Promise.resolve(undefined),
  ]);
  return {
    globalToday: Number(g.get('costUsd') ?? 0) + Number(g.get('reservedUsd') ?? 0),
    areaToday: Number(a?.get('costUsd') ?? 0) + Number(a?.get('reservedUsd') ?? 0),
  };
}

export class BudgetError extends Error {
  readonly code = 'unavailable';
  readonly details: { reason: string };
  constructor(reason: string) {
    super('Generation is paused');
    this.details = { reason };
  }
}

/** A pending reservation never expires automatically: a timed-out worker may still incur provider charges. */
export interface BudgetReservation {
  id: string;
  day: string;
  tile?: string;
  costUsd: number;
}

export async function reserveBudget(
  db: Firestore,
  cfg: BudgetConfig,
  usage: Usage,
  tile: string | undefined,
  now: number,
): Promise<BudgetReservation> {
  const costUsd = estimateCostUsd(usage, cfg.pricing);
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new BudgetError('invalid_cost_estimate');
  const day = dayKey(now);
  const ref = db.collection('usageReservations').doc();
  const global = db.collection('usageDaily').doc(day);
  const area = tile ? db.collection('usageDailyAreas').doc(`${day}_${tile}`) : undefined;
  const reservation = { id: ref.id, day, ...(tile ? { tile } : {}), costUsd };
  await db.runTransaction(async (tx) => {
    const g = await tx.get(global);
    const a = area ? await tx.get(area) : undefined;
    const total = (s: typeof g | undefined) =>
      Number(s?.get('costUsd') ?? 0) + Number(s?.get('reservedUsd') ?? 0);
    if (cfg.killSwitch) throw new BudgetError('kill_switch');
    if (total(g) + costUsd > cfg.dailyBudgetUsd || total(g) >= cfg.dailyBudgetUsd)
      throw new BudgetError('daily_budget');
    if (area && (total(a) + costUsd > cfg.areaDailyBudgetUsd || total(a) >= cfg.areaDailyBudgetUsd))
      throw new BudgetError('area_budget');
    tx.set(ref, { ...reservation, createdAt: now, status: 'pending' });
    tx.set(global, { day, reservedUsd: FieldValue.increment(costUsd) }, { merge: true });
    if (area) tx.set(area, { day, tile, reservedUsd: FieldValue.increment(costUsd) }, { merge: true });
  });
  return reservation;
}

/** Atomically replace the reservation with measured estimated spend; replays cannot charge or release it twice. */
export async function settleBudget(
  db: Firestore,
  cfg: BudgetConfig,
  reservation: BudgetReservation,
  entry: UsageEntry,
  now: number,
): Promise<void> {
  const costUsd = estimateCostUsd(entry.usage, cfg.pricing);
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new BudgetError('invalid_cost_estimate');
  const ref = db.collection('usageReservations').doc(reservation.id);
  const log = db.collection('usageLogs').doc(reservation.id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get('status') !== 'pending') return;
    const { day, tile } = reservation;
    tx.set(log, {
      ts: now,
      day,
      ...stripUndefined(entry),
      costUsd,
      ...(costUsd > reservation.costUsd ? { exceededReservation: true } : {}),
    });
    const counters = {
      day,
      reservedUsd: FieldValue.increment(-reservation.costUsd),
      costUsd: FieldValue.increment(costUsd),
      calls: FieldValue.increment(1),
      inputTokens: FieldValue.increment((entry.usage.inputTokens ?? 0) + (entry.usage.liteInputTokens ?? 0)),
      outputTokens: FieldValue.increment(
        (entry.usage.outputTokens ?? 0) + (entry.usage.liteOutputTokens ?? 0),
      ),
      ttsChars: FieldValue.increment(entry.usage.ttsChars ?? 0),
      groundingQueries: FieldValue.increment(entry.usage.groundingQueries ?? 0),
      byKind: { [entry.kind]: FieldValue.increment(costUsd) },
    };
    tx.set(db.collection('usageDaily').doc(day), counters, { merge: true });
    if (tile)
      tx.set(
        db.collection('usageDailyAreas').doc(`${day}_${tile}`),
        {
          day,
          tile,
          reservedUsd: FieldValue.increment(-reservation.costUsd),
          costUsd: FieldValue.increment(costUsd),
          calls: FieldValue.increment(1),
        },
        { merge: true },
      );
    tx.set(
      ref,
      {
        status: 'settled',
        settledAt: now,
        actualCostUsd: costUsd,
        // Only settled reservations can be garbage-collected; pending ones are deliberately fail-closed.
        expireAt: new Date(now + 90 * 86400_000),
      },
      { merge: true },
    );
  });
}

/** Every bounded upstream attempt reserves budget first, including retries and alternate voices. */
export async function withBudget<T extends { usage: Usage }>(
  db: Firestore,
  cfg: BudgetConfig,
  entry: Omit<UsageEntry, 'usage' | 'ok'>,
  maximum: Usage,
  run: () => Promise<T>,
  now: () => number,
): Promise<T> {
  const reservation = await reserveBudget(db, cfg, maximum, entry.tile, now());
  let result: T;
  try {
    result = await run();
  } catch (error) {
    if (error instanceof AiConsentError) {
      // The privacy boundary refuses before sending anything upstream. Unlike a provider
      // timeout, this is known to incur no cost and must not consume the spending allowance.
      await settleBudget(
        db,
        cfg,
        reservation,
        { ...entry, usage: {}, ok: false, note: 'ai_consent_required' },
        now(),
      );
      throw error;
    }
    // Operational diagnostics deliberately omit messages, URLs, payloads and credentials.
    const failure = error as { name?: unknown; status?: unknown; code?: unknown; cause?: { code?: unknown } };
    warn('Bounded provider request failed', {
      kind: entry.kind,
      errorName: typeof failure?.name === 'string' ? failure.name : 'unknown',
      status: typeof failure?.status === 'number' ? failure.status : null,
      code: typeof failure?.code === 'number' ? failure.code : null,
      causeCode:
        typeof failure?.cause?.code === 'string' && /^[A-Z_]+$/.test(failure.cause.code)
          ? failure.cause.code
          : null,
    });
    // Timeout/invalid response can still be billable. Charge the reserved estimate, never refund an uncertain call.
    await settleBudget(
      db,
      cfg,
      reservation,
      { ...entry, usage: maximum, ok: false, note: 'provider_failure_estimate' },
      now(),
    );
    throw error;
  }
  // If persistence fails, the pending reservation remains held. Do not execute the provider again here.
  await settleBudget(db, cfg, reservation, { ...entry, usage: result.usage, ok: true }, now());
  return result;
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
