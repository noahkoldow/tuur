import type { Firestore } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;
type Ref = { path: string; id: string };
type Query = {
  path: string;
  filters: [string, string, unknown][];
  group?: string;
  count?: number;
  fields?: string[];
};

/** Transactional in-memory test double. Transactions commit atomically and enforce reads before writes. */
export function memoryFirestore() {
  const docs = new Map<string, Data>();
  let nextId = 0;
  let queue = Promise.resolve();
  const snapshot = (ref: Ref) => ({
    id: ref.id,
    ref: doc(ref.path),
    exists: docs.has(ref.path),
    data: () => docs.get(ref.path),
    get: (key: string) => docs.get(ref.path)?.[key],
  });
  const mergeData = (old: Data, value: Data): Data =>
    Object.fromEntries(
      Object.entries(value).map(([key, v]) => {
        if (v && typeof v === 'object' && 'operand' in v)
          return [key, Number(old[key] ?? 0) + Number(v.operand)];
        if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date))
          return [key, { ...((old[key] as Data) ?? {}), ...mergeData((old[key] as Data) ?? {}, v as Data) }];
        return [key, v];
      }),
    );
  const write = (ref: Ref, data: Data, merge = false) =>
    docs.set(ref.path, {
      ...(merge ? docs.get(ref.path) : {}),
      ...mergeData(docs.get(ref.path) ?? {}, data),
    });
  const doc = (path: string): unknown => ({
    path,
    id: path.split('/').at(-1)!,
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => snapshot({ path, id: path.split('/').at(-1)! }),
    delete: async () => {
      docs.delete(path);
    },
    set: async (data: Data, options?: { merge: boolean }) => {
      write({ path, id: '' }, data, options?.merge);
    },
  });
  const querySnapshot = (q: Query) => {
    const rows = [...docs.entries()]
      .filter(([path, value]) => {
        const parts = path.split('/');
        return (
          (q.group
            ? parts.at(-2) === q.group
            : path.startsWith(`${q.path}/`) && parts.length === q.path.split('/').length + 1) &&
          q.filters.every(([key, op, v]) =>
            op === '>'
              ? Number(value[key]) > Number(v)
              : op === 'in'
                ? (v as unknown[]).includes(value[key])
                : value[key] === v,
          )
        );
      })
      .slice(0, q.count ?? Infinity)
      .map(([path]) => {
        const snap = snapshot({ path, id: path.split('/').at(-1)! });
        if (q.fields === undefined) return snap;
        const data = snap.data() ?? {};
        const projected = Object.fromEntries(
          q.fields.filter((field) => field in data).map((field) => [field, data[field]]),
        );
        return { ...snap, data: () => projected, get: (key: string) => projected[key] };
      });
    return { docs: rows, empty: rows.length === 0, size: rows.length };
  };
  const query = (q: Query): unknown => ({
    ...q,
    doc: (id = `auto-${++nextId}`) => doc(`${q.path}/${id}`),
    add: async (data: Data) => {
      const id = `auto-${++nextId}`;
      const ref = { path: `${q.path}/${id}`, id };
      write(ref, data);
      return doc(ref.path);
    },
    where: (key: string, op: string, value: unknown) => {
      if (op !== '==' && op !== '>' && op !== 'in') throw new Error(`Unsupported memory query: ${op}`);
      return query({ ...q, filters: [...q.filters, [key, op, value]] });
    },
    limit: (count: number) => query({ ...q, count }),
    select: (...fields: string[]) => query({ ...q, fields }),
    get: async () => querySnapshot(q),
  });
  const collection = (path: string) => query({ path, filters: [] });
  const db = {
    collection,
    collectionGroup: (group: string) => query({ path: '', group, filters: [] }),
    batch: () => {
      const pending: (() => void)[] = [];
      const batch = {
        set: (ref: Ref, data: Data, options?: { merge: boolean }) => {
          pending.push(() => {
            write(ref, data, options?.merge);
          });
          return batch;
        },
        delete: (ref: Ref) => {
          pending.push(() => {
            docs.delete(ref.path);
          });
          return batch;
        },
        commit: async () => {
          pending.forEach((apply) => apply());
          pending.length = 0;
          return [];
        },
      };
      return batch;
    },
    async runTransaction<T>(run: (tx: unknown) => Promise<T>): Promise<T> {
      let release!: () => void;
      const before = queue;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await before;
      const pending: (() => void)[] = [];
      try {
        const result = await run({
          get: async (ref: Ref | Query) => {
            if (pending.length) throw new Error('Firestore transaction read after write');
            return 'filters' in ref ? querySnapshot(ref) : snapshot(ref);
          },
          set: (ref: Ref, data: Data, options?: { merge: boolean }) => {
            pending.push(() => {
              write(ref, data, options?.merge);
            });
          },
        });
        pending.forEach((apply) => apply());
        return result;
      } finally {
        release();
      }
    },
  } as unknown as Firestore;
  return { db, docs };
}
