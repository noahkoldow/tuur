import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  current: vi.fn<() => { uid: string } | null>(),
  end: vi.fn(),
  checkpoint: vi.fn(),
  downloads: vi.fn(),
  history: vi.fn(),
  settings: vi.fn(),
  crash: vi.fn(),
  storageRemove: vi.fn(),
  forgetSeatAccount: vi.fn(),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { removeItem: fake.storageRemove },
}));
vi.mock('../billing/groupSeatCheckout', () => ({ forgetGroupSeatAccount: fake.forgetSeatAccount }));
vi.mock('../backend', () => ({ getBackend: () => ({ auth: { current: fake.current } }) }));
vi.mock('../guide/session', () => ({ endSession: fake.end, clearSavedSession: fake.checkpoint }));
vi.mock('../offline', () => ({ getDownloadManager: () => ({ clearAll: fake.downloads }) }));
vi.mock('../state/history', () => ({ useHistory: { getState: () => ({ clear: fake.history }) } }));
vi.mock('../state/settings', () => ({ useSettings: { getState: () => ({ set: fake.settings }) } }));
vi.mock('../telemetry', () => ({ setCrashReporting: fake.crash }));

import { clearDeletedAccountData } from './delete-local-data';

beforeEach(() => {
  vi.resetAllMocks();
  fake.current.mockReturnValue(null);
  fake.end.mockResolvedValue(undefined);
  fake.checkpoint.mockResolvedValue(undefined);
  fake.downloads.mockResolvedValue(undefined);
  fake.crash.mockResolvedValue(undefined);
  fake.storageRemove.mockResolvedValue(undefined);
});

describe('local account cleanup after server deletion', () => {
  it('clears private downloads, recordings, history and preferences after stopping the session', async () => {
    await clearDeletedAccountData('deleted');
    expect(fake.end.mock.invocationCallOrder[0]).toBeLessThan(fake.downloads.mock.invocationCallOrder[0]!);
    expect(fake.checkpoint).toHaveBeenCalledOnce();
    expect(fake.downloads).toHaveBeenCalledOnce();
    expect(fake.history).toHaveBeenCalledOnce();
    expect(fake.settings).toHaveBeenCalledWith(
      expect.objectContaining({ onboarded: false, analyticsConsent: false, interests: [], seenTips: [] }),
    );
    expect(fake.crash).toHaveBeenCalledWith(false);
    expect(fake.storageRemove).toHaveBeenCalledExactlyOnceWith('tuur.group-seat.v1.deleted');
    expect(fake.forgetSeatAccount).toHaveBeenCalledExactlyOnceWith('deleted');
    expect(fake.forgetSeatAccount.mock.invocationCallOrder[0]).toBeLessThan(
      fake.storageRemove.mock.invocationCallOrder[0]!,
    );
  });

  it('is retryable if a device refuses to delete an offline map pack', async () => {
    fake.downloads.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(clearDeletedAccountData('deleted')).rejects.toThrow('storage unavailable');
    expect(fake.history).not.toHaveBeenCalled();
    await clearDeletedAccountData('deleted');
    expect(fake.downloads).toHaveBeenCalledTimes(2);
    expect(fake.history).toHaveBeenCalledOnce();
  });

  it('never removes a different signed-in user’s local data', async () => {
    fake.current.mockReturnValue({ uid: 'another' });
    await expect(clearDeletedAccountData('deleted')).rejects.toThrow('Account changed');
    expect(fake.end).not.toHaveBeenCalled();
    expect(fake.downloads).not.toHaveBeenCalled();
    expect(fake.storageRemove).not.toHaveBeenCalled();
  });

  it('retries the deleted account’s pending seat intent cleanup after a storage failure', async () => {
    fake.storageRemove.mockRejectedValueOnce(new Error('storage locked'));
    await expect(clearDeletedAccountData('owner-a')).rejects.toThrow('storage locked');
    expect(fake.history).not.toHaveBeenCalled();
    await clearDeletedAccountData('owner-a');
    expect(fake.storageRemove.mock.calls).toEqual([
      ['tuur.group-seat.v1.owner-a'],
      ['tuur.group-seat.v1.owner-a'],
    ]);
    expect(fake.history).toHaveBeenCalledOnce();
  });

  it('rechecks ownership after stopping the old session', async () => {
    fake.end.mockImplementationOnce(async () => {
      fake.current.mockReturnValue({ uid: 'another' });
    });
    await expect(clearDeletedAccountData('deleted')).rejects.toThrow('Account changed');
    expect(fake.checkpoint).not.toHaveBeenCalled();
    expect(fake.downloads).not.toHaveBeenCalled();
  });
});
