import { getApp } from '@react-native-firebase/app';
import {
  AppleAuthProvider,
  GoogleAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  verifyPhoneNumber,
  PhoneAuthProvider,
  type User,
} from '@react-native-firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  where,
} from '@react-native-firebase/firestore';
import {
  HttpsError,
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from '@react-native-firebase/functions';
import { connectStorageEmulator, getStorage } from '@react-native-firebase/storage';
import {
  AreaSchema,
  PoiSchema,
  PoiStatsSchema,
  GroupSchema,
  groupCapacity,
  TourSchema,
  toExploredSpots,
  type PoiStats,
  type GetNarrationRequest,
  type NarrationResponse,
  type Poi,
  type Tour,
  EntitlementSchema,
  LEGAL_VERSION,
  type Entitlement,
  type Wallet,
} from '@tuur/shared';
import { config } from '../config';
import { toBackendError } from './errors';
import {
  BackendError,
  type AreaInfo,
  type AuthApi,
  type Backend,
  type TransitionResponse,
  type Unsubscribe,
  type UserInfo,
} from './types';

const toUser = (u: User | null): UserInfo | null =>
  u
    ? {
        uid: u.uid,
        isAnonymous: u.isAnonymous,
        ...(u.email ? { email: u.email } : {}),
        ...(u.phoneNumber ? { phoneNumber: u.phoneNumber } : {}),
      }
    : null;

let emulatorsConnected = false;

/** Firebase (native SDK, App Check attested on device). In emulator mode all services are pointed at localhost. */
export function createFirebaseBackend(): Backend {
  const app = getApp();
  const auth = getAuth(app);
  const db = getFirestore(app);
  const fns = getFunctions(app, config.functionsRegion);
  const storage = getStorage(app);
  if (config.useEmulators && !emulatorsConnected) {
    emulatorsConnected = true;
    connectAuthEmulator(auth, `http://${config.emulatorHost}:9099`);
    connectFirestoreEmulator(db, config.emulatorHost, 8080);
    connectFunctionsEmulator(fns, config.emulatorHost, 5001);
    connectStorageEmulator(storage, config.emulatorHost, 9199);
  }

  const call = async <Req, Res>(name: string, data: Req): Promise<Res> => {
    try {
      const res = await httpsCallable<Req, Res>(fns, name)(data);
      return res.data;
    } catch (e) {
      throw toBackendError(e instanceof HttpsError ? e : e);
    }
  };

  const signedUrls = new Map<string, string>();

  const authApi: AuthApi = {
    current: () => toUser(auth.currentUser),
    onChange: (cb) => onAuthStateChanged(auth, (u) => cb(toUser(u))),
    ensureSignedIn: async () =>
      toUser(auth.currentUser) ?? (toUser((await signInAnonymously(auth)).user) as UserInfo),
    async signInWithEmail(email, password, create) {
      const current = auth.currentUser;
      if (create) {
        // Upgrade the anonymous user so purchases and progress are kept (spec 3, Auth).
        if (current?.isAnonymous) {
          const { EmailAuthProvider } = await import('@react-native-firebase/auth');
          const res = await linkWithCredential(current, EmailAuthProvider.credential(email, password));
          return toUser(res.user) as UserInfo;
        }
        return toUser((await createUserWithEmailAndPassword(auth, email, password)).user) as UserInfo;
      }
      return toUser((await signInWithEmailAndPassword(auth, email, password)).user) as UserInfo;
    },
    async signInWithApple() {
      const AppleAuthentication = await import('expo-apple-authentication');
      const Crypto = await import('expo-crypto');
      const nonce = Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const res = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashed,
      });
      if (!res.identityToken) throw new BackendError('unknown', 'Apple sign-in returned no token');
      const credential = AppleAuthProvider.credential(res.identityToken, nonce);
      const current = auth.currentUser;
      const out = current?.isAnonymous
        ? await linkWithCredential(current, credential)
        : await signInWithCredential(auth, credential);
      return toUser(out.user) as UserInfo;
    },
    async signInWithGoogle() {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '' });
      await GoogleSignin.hasPlayServices();
      const res = await GoogleSignin.signIn();
      const idToken = (res as { data?: { idToken?: string | null } }).data?.idToken;
      if (!idToken) throw new BackendError('unknown', 'Google sign-in returned no token');
      const credential = GoogleAuthProvider.credential(idToken);
      const current = auth.currentUser;
      const out = current?.isAnonymous
        ? await linkWithCredential(current, credential)
        : await signInWithCredential(auth, credential);
      return toUser(out.user) as UserInfo;
    },
    async requestPhoneVerification(phoneNumber) {
      const snapshot = await verifyPhoneNumber(auth, phoneNumber);
      if (snapshot.state === 'error') throw snapshot.error ?? new Error('Phone verification failed');
      return snapshot.verificationId;
    },
    async confirmPhoneVerification(verificationId, code) {
      const current = auth.currentUser;
      if (!current) throw new BackendError('unauthenticated', 'Sign in before verifying a phone number');
      const credential = PhoneAuthProvider.credential(verificationId, code);
      const result = await linkWithCredential(current, credential);
      return toUser(result.user) as UserInfo;
    },
    signOut: () => signOut(auth),
  };

  async function getPois(tiles: string[]): Promise<Poi[]> {
    const out: Poi[] = [];
    for (let i = 0; i < tiles.length; i += 30) {
      const snap = await getDocs(
        query(
          collection(db, 'pois'),
          where('tile', 'in', tiles.slice(i, i + 30)),
          where('hidden', '==', false),
        ),
      );
      for (const d of snap.docs) {
        const p = PoiSchema.safeParse(d.data());
        if (p.success) out.push(p.data);
      }
    }
    return out;
  }

  return {
    kind: 'firebase',
    auth: authApi,
    async ensureArea(tile, rings) {
      await call('ensureArea', {
        geohash: tile,
        withNeighbors: true,
        ...(rings !== undefined ? { rings } : {}),
      });
    },
    watchArea(tile, cb) {
      return onSnapshot(
        doc(db, 'areas', tile),
        (snap) => {
          if (!snap.exists()) return cb(null);
          const parsed = AreaSchema.safeParse(snap.data());
          cb(
            parsed.success
              ? ({
                  status: parsed.data.status,
                  ...(parsed.data.placeId ? { placeId: parsed.data.placeId } : {}),
                  poiCount: parsed.data.poiCount,
                } satisfies AreaInfo)
              : null,
          );
        },
        () => cb(null),
      );
    },
    getAutoTours: (tile, lang) => call('generateAutoTours', { tile, lang }),
    watchTours(placeId, cb) {
      return onSnapshot(
        // the rules only allow queries that provably return unlocked tours
        query(collection(db, 'tours'), where('placeId', '==', placeId), where('locked', '==', false)),
        (snap) =>
          cb(
            snap.docs.flatMap((d) => {
              const p = TourSchema.safeParse(d.data());
              return p.success ? [p.data as Tour] : [];
            }),
          ),
        () => cb([]),
      );
    },
    async getTour(id) {
      const snap = await getDoc(doc(db, 'tours', id));
      const p = snap.exists() ? TourSchema.safeParse(snap.data()) : undefined;
      return p?.success ? p.data : null;
    },
    getPois,
    async getExploredSpots(tiles) {
      // `poiStats` holds anonymous aggregates written by Cloud Functions (see functions/src/stats).
      const stats: PoiStats[] = [];
      for (let i = 0; i < tiles.length; i += 30) {
        const snap = await getDocs(
          query(collection(db, 'poiStats'), where('tile', 'in', tiles.slice(i, i + 30))),
        );
        for (const d of snap.docs) {
          const s = PoiStatsSchema.safeParse(d.data());
          if (s.success) stats.push(s.data);
        }
      }
      if (stats.length === 0) return [];
      const pois = await getPois(tiles);
      const info = new Map(
        pois.map((p) => {
          const interest = p.primaryInterest ?? p.interests[0];
          const image = p.imageRefs[0];
          return [
            p.id,
            {
              name: p.name,
              location: p.location,
              ...(interest ? { interest } : {}),
              ...(image ? { image } : {}),
            },
          ] as const;
        }),
      );
      return toExploredSpots(stats, info, Date.now());
    },
    composePlannedRoute: (req) => call('composePlannedRoute', req),
    async getTeaser(req) {
      return (await call<{ poiId: string; lang: string }, { text: string }>('getTeaser', req)).text;
    },
    async getNarration(req: GetNarrationRequest) {
      const n = await call<GetNarrationRequest, NarrationResponse>('getNarration', req);
      if (n.audioUrl) signedUrls.set(n.audioPath, n.audioUrl);
      return n;
    },
    async getTransition(req) {
      const t = await call<typeof req, TransitionResponse>('getTransition', req);
      if (t.audioUrl) signedUrls.set(t.audioPath, t.audioUrl);
      return t;
    },
    watchEntitlements(cb) {
      const uid = () => auth.currentUser?.uid;
      let ents: Entitlement[] = [];
      let wallet: Wallet = { balance: 0, rewardBalance: 0 };
      const emit = () => cb({ entitlements: ents, wallet });
      const unsubs: Unsubscribe[] = [];
      const attach = (id: string) => {
        unsubs.push(
          onSnapshot(
            collection(db, 'users', id, 'entitlements'),
            (snap) => {
              ents = snap.docs.flatMap((d) => {
                const p = EntitlementSchema.safeParse(d.data());
                return p.success ? [p.data] : [];
              });
              emit();
            },
            () => emit(),
          ),
          onSnapshot(
            doc(db, 'users', id, 'credits', 'wallet'),
            (snap) => {
              wallet = {
                balance: Number(snap.data()?.['balance'] ?? 0),
                rewardBalance: Number(snap.data()?.['rewardBalance'] ?? 0),
              };
              emit();
            },
            () => emit(),
          ),
        );
      };
      // The caller (useEntitlementSync) re-subscribes whenever the signed-in user changes.
      const current = uid();
      if (current) attach(current);
      return () => unsubs.forEach((u) => u());
    },
    async deleteAccount() {
      await call('deleteAccount', {});
      await signOut(auth).catch(() => undefined);
    },
    exportMyData: () => call('exportMyData', {}),
    claimTourStart: (tourId, sessionId, mode) => call('claimTourStart', { tourId, sessionId, mode }),
    async recordPurchaseConsent(productId) {
      await call('recordPurchaseConsent', { productId, textVersion: LEGAL_VERSION });
    },
    getOffers: (poiIds) => call('getOffers', { poiIds }),
    submitPartnerApplication: (app) => call('submitPartnerApplication', app),
    createGroup: (req) => call('createTourGroup', req),
    joinGroup: (token) => call('joinTourGroup', { token }),
    addGroupSeat: (groupId) => call('addTourGroupSeat', { groupId }),
    async leaveGroup(groupId) {
      await call('leaveTourGroup', { groupId });
    },
    watchGroup(groupId, cb) {
      // members may read their group (rules); the invite hash is stored but never shown
      return onSnapshot(
        doc(db, 'groups', groupId),
        (snap) => {
          const g = snap.exists() ? GroupSchema.safeParse(snap.data()) : undefined;
          cb(
            g?.success
              ? {
                  id: g.data.id,
                  tour: g.data.tour,
                  mode: g.data.mode,
                  hostUid: g.data.hostUid,
                  members: g.data.members.length,
                  capacity: groupCapacity(g.data),
                  status: g.data.status,
                  expiresAt: g.data.expiresAt,
                }
              : null,
          );
        },
        () => cb(null),
      );
    },
    async recordVisit(poiId) {
      await call('recordVisit', { poiId }).catch(() => undefined);
    },
    async recordPartnerEvent(poiId, type) {
      await call('recordPartnerEvent', { poiId, type }).catch(() => undefined);
    },
    createRedemptionToken: (req) => call('createRedemptionToken', req),
    watchRedemption: (tokenId, cb) =>
      onSnapshot(
        doc(db, 'redemptionTokens', tokenId),
        (snap) => cb(snap.data()?.['used'] === true),
        () => undefined,
      ),
    spendCredit: (req) => call('spendCredit', req),
    createInvite: (tourId) => call('createInvite', { tourId }),
    redeemInvite: (token) => call('redeemInvite', { token }),
    createRewardNonce: (request) => call('createRewardNonce', request),
    // Audio is private: the URL was signed by the server together with the access check that served the narration.
    async audioUrl(path) {
      const url = signedUrls.get(path);
      if (!url) throw new BackendError('not_found', 'No access URL for this audio');
      return url;
    },
    async reportNarration(input) {
      await call('reportNarration', input);
    },
  };
}
