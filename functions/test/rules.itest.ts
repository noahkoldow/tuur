import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-tuur-rules',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: host!,
      port: Number(port),
    },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'pois/a'), { hidden: false, name: 'A' });
    await setDoc(doc(db, 'pois/h'), { hidden: true, name: 'H' });
    await setDoc(doc(db, 'areas/u33dc0'), { status: 'ready' });
    await setDoc(doc(db, 'tours/t1'), { locked: false });
    await setDoc(doc(db, 'tours/t2'), { locked: true });
    await setDoc(doc(db, 'users/alice/entitlements/sub'), { active: true });
    await setDoc(doc(db, 'config/public'), { x: 1 });
    await setDoc(doc(db, 'config/ai'), { dailyBudgetUsd: 1 });
  });
});

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const admin = () => env.authenticatedContext('root', { admin: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('firestore rules', () => {
  it('requires sign-in to read areas and pois; hides moderated pois from users', async () => {
    await assertFails(getDoc(doc(anon(), 'pois/a')));
    await assertSucceeds(getDoc(doc(alice(), 'pois/a')));
    await assertFails(getDoc(doc(alice(), 'pois/h')));
    await assertSucceeds(getDoc(doc(admin(), 'pois/h')));
    await assertSucceeds(getDoc(doc(alice(), 'areas/u33dc0')));
  });

  it('never lets clients write server-owned collections', async () => {
    await assertFails(setDoc(doc(alice(), 'pois/x'), { hidden: false }));
    await assertFails(setDoc(doc(alice(), 'areas/u33dc1'), { status: 'ready' }));
    await assertFails(setDoc(doc(admin(), 'pois/x'), { hidden: false }));
  });

  it('entitlements: owner can read, nobody (incl. owner and admin) can write', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/entitlements/sub')));
    await assertFails(getDoc(doc(bob(), 'users/alice/entitlements/sub')));
    await assertFails(setDoc(doc(alice(), 'users/alice/entitlements/pro'), { active: true }));
    await assertFails(updateDoc(doc(alice(), 'users/alice/entitlements/sub'), { active: false }));
    await assertFails(deleteDoc(doc(alice(), 'users/alice/entitlements/sub')));
    await assertFails(setDoc(doc(admin(), 'users/alice/entitlements/pro'), { active: true }));
    await assertFails(
      setDoc(doc(alice(), 'users/alice/credits/wallet'), { balance: 100, rewardBalance: 100 }),
    );
    await assertFails(setDoc(doc(alice(), 'users/alice/creditLedger/x'), { delta: 5 }));
    await assertFails(setDoc(doc(alice(), 'invites/abc'), { tourId: 't', ownerUid: 'alice' }));
    await assertFails(getDoc(doc(alice(), 'invites/abc')));
    await assertFails(setDoc(doc(alice(), 'users/alice/rewardCounters/2026-01-01'), { granted: 0 }));
    await assertFails(setDoc(doc(alice(), 'users/alice/sessions/s1'), { expiresAt: 1 }));
  });

  it('partner data: owner/admin read only, no client writes, tokens only readable by their listener', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'partners/alice'), { ownerUid: 'alice', status: 'approved' });
      await setDoc(doc(db, 'offers/o1'), { partnerId: 'alice', title: 't' });
      await setDoc(doc(db, 'redemptionTokens/t1'), {
        uid: 'bob',
        partnerId: 'alice',
        token: 'x',
        used: false,
      });
      await setDoc(doc(db, 'partnerStats/alice_2026-01-01'), { partnerId: 'alice', impressions: 3 });
      await setDoc(doc(db, 'redemptions/r1'), { partnerId: 'alice' });
    });
    await assertSucceeds(getDoc(doc(alice(), 'partners/alice')));
    await assertFails(getDoc(doc(bob(), 'partners/alice')));
    await assertSucceeds(getDoc(doc(admin(), 'partners/alice')));
    await assertFails(setDoc(doc(alice(), 'partners/alice'), { status: 'approved', plan: { active: true } }));
    await assertFails(updateDoc(doc(alice(), 'partners/alice'), { status: 'approved' }));
    await assertSucceeds(getDoc(doc(alice(), 'offers/o1')));
    await assertFails(getDoc(doc(bob(), 'offers/o1')));
    await assertFails(setDoc(doc(alice(), 'offers/o2'), { partnerId: 'alice' }));
    await assertSucceeds(getDoc(doc(bob(), 'redemptionTokens/t1')));
    await assertFails(getDoc(doc(alice(), 'redemptionTokens/t1')));
    await assertFails(updateDoc(doc(bob(), 'redemptionTokens/t1'), { used: true }));
    await assertSucceeds(getDoc(doc(alice(), 'partnerStats/alice_2026-01-01')));
    await assertFails(getDoc(doc(bob(), 'partnerStats/alice_2026-01-01')));
    await assertFails(getDoc(doc(alice(), 'redemptions/r1')));
    await assertFails(setDoc(doc(alice(), 'partnerStats/alice_2026-01-02'), { partnerId: 'alice' }));
  });

  it('users can only edit their own whitelisted profile fields', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { language: 'de', interests: ['history'] }));
    await assertFails(setDoc(doc(bob(), 'users/alice'), { language: 'de' }));
    await assertFails(setDoc(doc(alice(), 'users/alice'), { language: 'de', admin: true }));
    await assertFails(setDoc(doc(alice(), 'users/alice'), { language: 'xx' }));
    await assertFails(deleteDoc(doc(alice(), 'users/alice')));
  });

  it('tours: signed-in read of unlocked tours only, never client-writable', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'tours/t1')));
    await assertFails(getDoc(doc(alice(), 'tours/t2')));
    await assertSucceeds(getDoc(doc(admin(), 'tours/t2')));
    await assertFails(getDoc(doc(anon(), 'tours/t1')));
    await assertFails(setDoc(doc(alice(), 'tours/t3'), { locked: false }));
    await assertFails(updateDoc(doc(admin(), 'tours/t1'), { locked: true }));
  });

  it('only the public config doc is client-readable', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'config/public')));
    await assertFails(getDoc(doc(alice(), 'config/ai')));
    await assertSucceeds(getDoc(doc(admin(), 'config/ai')));
  });
});
