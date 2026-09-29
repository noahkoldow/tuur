import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { syncPartnerPoi, loadPartner, loadPartnerConfig } from '../partners/service';
import type { PaymentsProvider } from '../partners/payments';

export interface AccountAuth {
  getUser(uid: string): Promise<{
    uid: string;
    email?: string | undefined;
    providerData: { providerId: string }[];
    metadata: { creationTime?: string | undefined; lastSignInTime?: string | undefined };
  }>;
  deleteUser(uid: string): Promise<void>;
}

export interface AccountDeps {
  db: Firestore;
  auth: AccountAuth;
  payments: PaymentsProvider;
  now: () => number;
  /** Removes stored files below a prefix (per-user grounded narrations). */
  deleteFiles?: (prefix: string) => Promise<void>;
}

/** Keys of `rateLimits` that embed the user id (document id prefixes); deleted with the account. */
const RATE_LIMIT_PREFIXES = [
  'narr_user_',
  'narr_dl_',
  'route_user_',
  'ensureArea_',
  'feedback_',
  'redeem_token_',
  'redeem_scan_',
  'partner_save_',
  'checkout_',
  'delete_account_',
  'invite_',
  'redeem_',
  'tours_user_',
  'teaser_user_',
  'route_',
  'export_data_',
];

async function deleteByQuery(db: Firestore, q: FirebaseFirestore.Query): Promise<number> {
  let n = 0;
  for (;;) {
    const snap = await q.limit(300).get();
    if (snap.empty) return n;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    n += snap.size;
    if (snap.size < 300) return n;
  }
}

/**
 * Deletes everything that belongs to the account (GDPR Art. 17): user documents and subcollections, invites, QR tokens,
 * reward nonces, rate-limit counters, partner profile with offers and statistics (partner POI is unlinked, a running
 * subscription is cancelled), anonymizes feedback and finally removes the authentication record.
 * Anonymous aggregates (usage costs, redemption log without user ids) stay.
 */
export async function deleteAccount(deps: AccountDeps, uid: string) {
  const { db } = deps;
  const summary: Record<string, number> = {};

  const partner = await loadPartner(db, uid);
  if (partner) {
    if (partner.plan.stripeSubscriptionId)
      await deps.payments.cancelSubscription(partner.plan.stripeSubscriptionId);
    if (partner.poiId) {
      const { cfg } = await loadPartnerConfig(db);
      await syncPartnerPoi(db, { ...partner, status: 'suspended' }, cfg, deps.now());
    }
    summary['offers'] = await deleteByQuery(db, db.collection('offers').where('partnerId', '==', uid));
    summary['partnerStats'] = await deleteByQuery(
      db,
      db.collection('partnerStats').where('partnerId', '==', uid),
    );
    await db.collection('partners').doc(uid).delete();
    summary['partner'] = 1;
  }

  await db.recursiveDelete(db.collection('users').doc(uid));
  summary['invites'] = await deleteByQuery(db, db.collection('invites').where('ownerUid', '==', uid));
  const redeemedInvites = await db.collection('invites').where('redeemedBy', '==', uid).get();
  for (const d of redeemedInvites.docs) await d.ref.update({ redeemedBy: 'deleted' });
  summary['redemptionTokens'] = await deleteByQuery(
    db,
    db.collection('redemptionTokens').where('uid', '==', uid),
  );
  summary['rewardNonces'] = await deleteByQuery(db, db.collection('rewardNonces').where('uid', '==', uid));

  // the feedback document id contains the uid and the free text may identify the user: delete the reports outright
  summary['feedback'] = await deleteByQuery(db, db.collection('feedback').where('uid', '==', uid));
  summary['revenuecatEvents'] = await deleteByQuery(
    db,
    db.collection('revenuecatEvents').where('uid', '==', uid),
  );

  let limits = 0;
  for (const prefix of RATE_LIMIT_PREFIXES) {
    limits += await deleteByQuery(
      db,
      db
        .collection('rateLimits')
        .where(FieldPath.documentId(), '>=', `${prefix}${uid}`)
        .where(FieldPath.documentId(), '<=', `${prefix}${uid}`),
    );
  }
  summary['rateLimits'] = limits;

  await deps.deleteFiles?.(`narrations-grounded/${uid}/`);
  await deps.auth.deleteUser(uid);
  return { deleted: true, summary };
}

/** Data export (GDPR Art. 15/20): everything stored about the account in a machine-readable form, without secrets. */
export async function exportMyData(deps: AccountDeps, uid: string) {
  const { db } = deps;
  const list = async (q: FirebaseFirestore.Query) =>
    (await q.limit(2000).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const user = await deps.auth.getUser(uid).catch(() => undefined);
  const userDoc = await db.collection('users').doc(uid).get();
  const partner = await loadPartner(db, uid);
  const invites = await list(db.collection('invites').where('ownerUid', '==', uid));
  return {
    generatedAt: deps.now(),
    account: user
      ? {
          uid,
          ...(user.email ? { email: user.email } : {}),
          providers: user.providerData.map((p) => p.providerId),
          createdAt: user.metadata.creationTime,
          lastSignIn: user.metadata.lastSignInTime,
        }
      : { uid },
    profile: userDoc.data() ?? null,
    entitlements: await list(db.collection('users').doc(uid).collection('entitlements')),
    wallet: (await db.collection('users').doc(uid).collection('credits').doc('wallet').get()).data() ?? null,
    creditLedger: await list(db.collection('users').doc(uid).collection('creditLedger')),
    consents: await list(db.collection('users').doc(uid).collection('consents')),
    plannedRoutes: (await list(db.collection('users').doc(uid).collection('sessions'))).map((s) => ({
      id: s.id,
      kind: (s as Record<string, unknown>)['kind'],
      expiresAt: (s as Record<string, unknown>)['expiresAt'],
      placeName: (s as Record<string, unknown>)['placeName'],
      // the stored route path (start/end of a planned route are part of it)
      path: (s as Record<string, unknown>)['path'],
    })),
    // invite tokens are stored hashed; only the metadata of your invites is exported
    invitesCreated: invites.map((i) => {
      const r = i as Record<string, unknown>;
      return {
        tourId: r['tourId'],
        createdAt: r['createdAt'],
        expiresAt: r['expiresAt'],
        redeemed: Boolean(r['redeemedBy']),
      };
    }),
    redemptionTokens: (await list(db.collection('redemptionTokens').where('uid', '==', uid))).map((t) => {
      const r = t as Record<string, unknown>;
      return { offerId: r['offerId'], day: r['day'], used: r['used'], expiresAt: r['expiresAt'] };
    }),
    feedback: (await list(db.collection('feedback').where('uid', '==', uid))).map((f) => {
      const r = f as Record<string, unknown>;
      return {
        narrationKey: r['narrationKey'],
        reason: r['reason'],
        text: r['text'],
        status: r['status'],
        createdAt: r['createdAt'],
      };
    }),
    partner: partner ?? null,
    offers: partner ? await list(db.collection('offers').where('partnerId', '==', uid)) : [],
  };
}
