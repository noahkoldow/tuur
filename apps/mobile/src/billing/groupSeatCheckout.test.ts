import { describe, expect, it, vi } from 'vitest';
import { forgetGroupSeatAccount, GroupSeatCheckout, type SeatCheckoutDeps } from './groupSeatCheckout';

function setup(uid = 'host') {
  const saved = new Map<string, string>();
  let balance = 0;
  let capacity = 3;
  let current = uid;
  let nextId = 0;
  const redeemed = new Set<string>();
  const deps: SeatCheckoutDeps = {
    uid,
    storage: {
      getItem: async (key) => saved.get(key) ?? null,
      setItem: async (key, value) => {
        saved.set(key, value);
      },
      removeItem: async (key) => {
        saved.delete(key);
      },
    },
    newId: () => `seat-request-${++nextId}`,
    isCurrentAccount: () => current === uid,
    availableCredits: () => balance,
    redeem: vi.fn(async (_groupId, requestId) => {
      if (redeemed.has(requestId)) return;
      if (!balance) throw { reason: 'no_seat_credit' };
      balance--;
      capacity++;
      redeemed.add(requestId);
    }),
    recordConsent: vi.fn(async () => undefined),
    purchase: vi.fn(async () => 'purchased' as const),
  };
  return {
    deps,
    saved,
    checkout: () => new GroupSeatCheckout(deps),
    grant: (amount = 1) => {
      balance += amount;
    },
    account: (uid: string) => {
      current = uid;
    },
    state: () => ({ balance, capacity }),
  };
}

describe('durable group seat delivery', () => {
  it('does not recreate local checkout data when permanent deletion races an in-flight write', async () => {
    const t = setup('deleted-host');
    let resume!: () => void;
    const waiting = new Promise<void>((resolve) => {
      resume = resolve;
    });
    t.deps.storage.setItem = vi.fn(async (key, value) => {
      await waiting;
      t.saved.set(key, value);
    });
    const pending = t.checkout().start('group-one', true);
    await vi.waitFor(() => expect(t.deps.storage.setItem).toHaveBeenCalledOnce());
    forgetGroupSeatAccount('deleted-host');
    t.saved.clear();
    resume();
    await expect(pending).rejects.toThrow('account changed');
    expect(t.saved.size).toBe(0);
    expect(t.deps.purchase).not.toHaveBeenCalled();
  });
  it('uses an existing paid credit without opening StoreKit or asking for purchase consent', async () => {
    const t = setup();
    t.grant();
    expect(await t.checkout().start('group-one', false)).toBe('delivered');
    expect(t.deps.purchase).not.toHaveBeenCalled();
    expect(t.deps.recordConsent).not.toHaveBeenCalled();
    expect(t.state()).toEqual({ balance: 0, capacity: 4 });
    expect(t.saved.size).toBe(0);
  });

  it('does not purchase without express consent when the server confirms no credit exists', async () => {
    const t = setup();
    expect(await t.checkout().start('group-one', false)).toBe('consent');
    expect(t.deps.purchase).not.toHaveBeenCalled();
    expect(t.saved.size).toBe(0);
  });

  it('delivers a late webhook after repeated checks and a process restart without another purchase', async () => {
    const t = setup();
    expect(await t.checkout().start('group-one', true)).toBe('waiting');
    expect(t.deps.recordConsent).toHaveBeenCalledOnce();
    const restarted = t.checkout();
    for (let i = 0; i < 20; i++) expect(await restarted.recover()).toBe('waiting');
    // A second tap while confirmation is outstanding is also only a delivery retry.
    expect(await restarted.start('group-one', true)).toBe('waiting');
    t.grant();
    expect(await restarted.recover()).toBe('delivered');
    expect(await restarted.recover()).toBe('idle');
    expect(t.deps.purchase).toHaveBeenCalledOnce();
    expect(t.state()).toEqual({ balance: 0, capacity: 4 });
  });

  it('removes a cancelled store attempt and allows a later intentional purchase', async () => {
    const t = setup();
    vi.mocked(t.deps.purchase).mockResolvedValueOnce('cancelled');
    expect(await t.checkout().start('group-one', true)).toBe('cancelled');
    expect(t.saved.size).toBe(0);
    expect(await t.checkout().recover()).toBe('idle');
    expect(await t.checkout().start('group-one', true)).toBe('waiting');
    expect(t.deps.purchase).toHaveBeenCalledTimes(2);
  });

  it('persists before StoreKit and recovers when the app loses the purchase response', async () => {
    const t = setup();
    vi.mocked(t.deps.purchase).mockImplementationOnce(async () => {
      expect(JSON.parse([...t.saved.values()][0]!)).toMatchObject({ phase: 'purchase' });
      t.grant();
      throw new Error('App interrupted after payment');
    });
    await expect(t.checkout().start('group-one', true)).rejects.toThrow('interrupted');
    expect(await t.checkout().recover()).toBe('delivered');
    expect(t.deps.purchase).toHaveBeenCalledOnce();
    expect(t.state()).toEqual({ balance: 0, capacity: 4 });
  });

  it('replays the same delivery ID when a successful debit response is lost, even with spare credits', async () => {
    const t = setup();
    t.grant(2);
    const redeem = t.deps.redeem;
    t.deps.redeem = vi.fn(async (groupId, requestId) => {
      await redeem(groupId, requestId);
      throw new Error('Response lost');
    });
    await expect(t.checkout().start('group-one', false)).rejects.toThrow('Response lost');
    t.deps.redeem = redeem;
    expect(await t.checkout().recover()).toBe('delivered');
    expect(t.state()).toEqual({ balance: 1, capacity: 4 });
    expect(t.deps.purchase).not.toHaveBeenCalled();
  });

  it('serializes concurrent taps into one purchase and preserves an intent if the network outcome is unknown', async () => {
    const t = setup();
    const checkout = t.checkout();
    expect(await Promise.all([checkout.start('group-one', true), checkout.start('group-one', true)])).toEqual(
      ['waiting', 'waiting'],
    );
    expect(t.deps.purchase).toHaveBeenCalledOnce();
    vi.mocked(t.deps.redeem).mockRejectedValueOnce(new Error('Offline'));
    await expect(checkout.recover()).rejects.toThrow('Offline');
    expect(checkout.pending).toBe(true);
    expect(t.saved.size).toBe(1);
  });

  it('keeps a purchased credit for a later group if the original group has ended', async () => {
    const t = setup();
    expect(await t.checkout().start('group-one', true)).toBe('waiting');
    t.grant();
    vi.mocked(t.deps.redeem).mockRejectedValueOnce({ reason: 'ended' });
    expect(await t.checkout().recover()).toBe('unavailable');
    expect(t.state().balance).toBe(1);
    expect(await t.checkout().start('group-two', false)).toBe('delivered');
    expect(t.deps.purchase).toHaveBeenCalledOnce();
  });

  it('does not start a second purchase if a group ends before the first webhook arrives', async () => {
    const t = setup();
    expect(await t.checkout().start('group-one', true)).toBe('waiting');
    const redeem = t.deps.redeem;
    t.deps.redeem = vi.fn(async (groupId, requestId) => {
      if (groupId === 'group-one') throw { reason: 'ended' };
      return redeem(groupId, requestId);
    });
    expect(await t.checkout().start('group-two', true)).toBe('waiting');
    expect(t.deps.purchase).toHaveBeenCalledOnce();
    t.grant();
    expect(await t.checkout().recover()).toBe('unavailable');
    expect(await t.checkout().start('group-two', false)).toBe('delivered');
    expect(t.deps.purchase).toHaveBeenCalledOnce();
  });

  it('does not deliver the previous account’s intent after an account change during StoreKit', async () => {
    const t = setup();
    vi.mocked(t.deps.purchase).mockImplementationOnce(async () => {
      t.account('someone-else');
      return 'purchased';
    });
    await expect(t.checkout().start('group-one', true)).rejects.toThrow('account changed');
    expect(t.deps.redeem).toHaveBeenCalledTimes(1); // Only the pre-purchase balance check.
    t.account('host');
    t.grant();
    expect(await t.checkout().recover()).toBe('delivered');
  });
});
