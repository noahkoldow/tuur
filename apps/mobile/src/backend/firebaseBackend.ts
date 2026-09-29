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
import { connectStorageEmulator, getDownloadURL, getStorage, ref } from '@react-native-firebase/storage';
import {
  AreaSchema,
  PoiSchema,
  TourSchema,
  type GetNarrationRequest,
  type NarrationResponse,
  type Poi,
  type Tour,
  EntitlementSchema,
  type Entitlement,
  type Wallet,
} from '@tuur/shared';
import { config } from '../config';
import {
  BackendError,
  type AreaInfo,
  type AuthApi,
  type Backend,
  type Unsubscribe,
  type UserInfo,
} from './types';

function toBackendError(e: unknown): BackendError {
  if (e instanceof BackendError) return e;
  const code = (e as { code?: string } | null)?.code ?? '';
  const message = (e as Error | null)?.message ?? 'unknown';
  const details = (e as { details?: { reason?: string; retryAfterMs?: number } } | null)?.details;
  if (code.includes('permission-denied'))
    return new BackendError('locked', message, undefined, details?.reason);
  if (
    code.includes('failed-precondition') &&
    details?.reason &&
    details.reason !== 'insufficient' &&
    /^(too_far|partner_inactive|offer_|daily_limit|already_redeemed_today)/.test(details.reason)
  )
    return new BackendError('redeem_denied', message, undefined, details.reason);
  if (code.includes('failed-precondition') && details?.reason === 'insufficient')
    return new BackendError('insufficient_credit', message, undefined, details.reason);
  if (code.includes('failed-precondition') || code.includes('already-exists'))
    return new BackendError('invite_invalid', message, undefined, details?.reason);
  if (code.includes('resource-exhausted'))
    return new BackendError('rate_limited', message, details?.retryAfterMs);
  if (code.includes('unavailable') && details?.reason) return new BackendError('paused', message);
  if (code.includes('unavailable') || code.includes('network')) return new BackendError('network', message);
  if (code.includes('not-found')) return new BackendError('not_found', message);
  if (code.includes('unauthenticated')) return new BackendError('unauthenticated', message);
  return new BackendError('unknown', message);
}

const toUser = (u: User | null): UserInfo | null =>
  u ? { uid: u.uid, isAnonymous: u.isAnonymous, ...(u.email ? { email: u.email } : {}) } : null;

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
    signOut: () => signOut(auth),
  };

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
        query(collection(db, 'tours'), where('placeId', '==', placeId)),
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
    async getPois(tiles) {
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
    },
    composePlannedRoute: (req) => call('composePlannedRoute', req),
    async getTeaser(req) {
      return (await call<{ poiId: string; lang: string }, { text: string }>('getTeaser', req)).text;
    },
    getNarration: (req: GetNarrationRequest) =>
      call<GetNarrationRequest, NarrationResponse>('getNarration', req),
    getTransition: (req) => call('getTransition', req),
    watchEntitlements(cb) {
      const uid = () => auth.currentUser?.uid;
      let ents: Entitlement[] = [];
      let wallet: Wallet = { balance: 0, rewardBalance: 0 };
      const emit = () => cb({ entitlements: ents, wallet });
      const unsubs: Unsubscribe[] = [];
      const attach = (id: string) => {
        unsubs.push(
          onSnapshot(collection(db, 'users', id, 'entitlements'), (snap) => {
            ents = snap.docs.flatMap((d) => {
              const p = EntitlementSchema.safeParse(d.data());
              return p.success ? [p.data] : [];
            });
            emit();
          }),
          onSnapshot(doc(db, 'users', id, 'credits', 'wallet'), (snap) => {
            wallet = {
              balance: Number(snap.data()?.['balance'] ?? 0),
              rewardBalance: Number(snap.data()?.['rewardBalance'] ?? 0),
            };
            emit();
          }),
        );
      };
      const first = uid();
      if (first) attach(first);
      const offAuth = onAuthStateChanged(auth, (u) => {
        if (u && u.uid !== first && unsubs.length === 0) attach(u.uid);
      });
      return () => {
        offAuth();
        unsubs.forEach((u) => u());
      };
    },
    async deleteAccount() {
      await call('deleteAccount', {});
      await signOut(auth).catch(() => undefined);
    },
    exportMyData: () => call('exportMyData', {}),
    getOffers: (poiIds) => call('getOffers', { poiIds }),
    async recordPartnerEvent(poiId, type) {
      await call('recordPartnerEvent', { poiId, type }).catch(() => undefined);
    },
    createRedemptionToken: (req) => call('createRedemptionToken', req),
    watchRedemption: (tokenId, cb) =>
      onSnapshot(doc(db, 'redemptionTokens', tokenId), (snap) => cb(snap.data()?.['used'] === true)),
    spendCredit: (req) => call('spendCredit', req),
    createInvite: (tourId) => call('createInvite', { tourId }),
    redeemInvite: (token) => call('redeemInvite', { token }),
    createRewardNonce: () => call('createRewardNonce', {}),
    audioUrl: (path) => getDownloadURL(ref(storage, path)),
    async reportNarration(input) {
      await call('reportNarration', input);
    },
  };
}
