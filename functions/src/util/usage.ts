import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { estimateCostUsd, type AiConfig, type Usage } from '@tuur/shared';

export type UsageKind = 'narration' | 'factcheck' | 'tts' | 'transition' | 'classify' | 'routing';

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
  return { globalToday: Number(g.get('costUsd') ?? 0), areaToday: Number(a?.get('costUsd') ?? 0) };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
