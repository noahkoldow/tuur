import type {
  Entitlement,
  PublicOffer,
  Wallet,
  ComposeRouteRequest,
  AreaStatus,
  GenerateToursResult,
  GetNarrationRequest,
  NarrationResponse,
  Poi,
  Tour,
} from '@tuur/shared';

export type Unsubscribe = () => void;

export interface AreaInfo {
  status: AreaStatus;
  placeId?: string;
  poiCount: number;
}

export interface TransitionResponse {
  key: string;
  text: string;
  audioPath: string;
  audioDurationMs: number;
}

export interface UserInfo {
  uid: string;
  isAnonymous: boolean;
  email?: string;
}

export interface EntitlementState {
  entitlements: Entitlement[];
  wallet: Wallet;
}

/** What the listener is doing; the server checks entitlements against it before serving content. */
export interface AccessInfo {
  tourId?: string;
  mode?: 'tour' | 'planned' | 'fork' | 'roam';
}

export type SpendRequest = { kind: 'tour'; tourId: string } | { kind: 'session'; placeId: string };

/** Only present on the in-memory demo backend: simulates what the store + webhooks would grant. */
export interface DemoControls {
  grantCredits(n: number): void;
  grantRewardCredit(): void;
  grantSubscription(): void;
}

export interface RedemptionToken {
  token: string;
  tokenId: string;
  expiresAt: number;
  offerTitle: string;
  partnerName: string;
}

export interface AuthApi {
  current(): UserInfo | null;
  onChange(cb: (u: UserInfo | null) => void): Unsubscribe;
  /** Resolves once a user exists (creates an anonymous one if needed). */
  ensureSignedIn(): Promise<UserInfo>;
  signInWithEmail(email: string, password: string, create: boolean): Promise<UserInfo>;
  signInWithApple(): Promise<UserInfo>;
  signInWithGoogle(): Promise<UserInfo>;
  signOut(): Promise<void>;
}

/**
 * Everything the app needs from the server. Implemented by Firebase (production, emulators) and by an in-memory
 * demo backend (web preview, tests, offline development). Screens never talk to Firebase directly.
 */
export interface Backend {
  readonly kind: 'firebase' | 'demo';
  readonly auth: AuthApi;
  /** Asks the server to ingest the tile and its neighbors (only the geohash is sent, never a position). */
  ensureArea(tile: string, rings?: number): Promise<void>;
  watchArea(tile: string, cb: (a: AreaInfo | null) => void): Unsubscribe;
  /** Triggers/reads auto tours for the area's place in the given language. */
  getAutoTours(tile: string, lang: string): Promise<GenerateToursResult>;
  watchTours(placeId: string, cb: (tours: Tour[]) => void): Unsubscribe;
  getTour(id: string): Promise<Tour | null>;
  getPois(tiles: string[]): Promise<Poi[]>;
  /** Personal route (spec 5.2): re-checks the client plan with routing times and adds the narrative thread. */
  composePlannedRoute(req: ComposeRouteRequest): Promise<{ tour: Tour; dropped: string[] }>;
  /** One-sentence teaser for crossroads cards. */
  getTeaser(req: { poiId: string; lang: string; access?: AccessInfo }): Promise<string>;
  /** Live entitlements and credit wallet (server-written, read-only for the client). */
  watchEntitlements(cb: (s: EntitlementState) => void): Unsubscribe;
  spendCredit(req: SpendRequest): Promise<{ used: 'reward' | 'paid'; wallet: Wallet }>;
  createInvite(tourId: string): Promise<{ token: string; remaining: number; expiresAt: number }>;
  redeemInvite(token: string): Promise<{ tourId: string }>;
  /** Nonce for rewarded-ad server-side verification (daily limit enforced on the server). */
  createRewardNonce(): Promise<{ nonce: string; remainingToday: number }>;
  /** Active offers of partner stops (server filters by validity and partner plan). */
  getOffers(poiIds: string[]): Promise<PublicOffer[]>;
  /** Anonymous, deduplicated partner statistics (impression = offers shown, visit = arrival). */
  recordPartnerEvent(poiId: string, type: 'impression' | 'visit'): Promise<void>;
  /** Signed single-use QR token; the position is only used for the proximity check and never stored. */
  createRedemptionToken(req: {
    offerId: string;
    position: { lat: number; lng: number };
  }): Promise<RedemptionToken>;
  /** Fires once the partner has scanned the token. */
  watchRedemption(tokenId: string, cb: (used: boolean) => void): Unsubscribe;
  /** GDPR: deletes the account and all its data on the server (then signs out). */
  deleteAccount(): Promise<void>;
  /** GDPR: everything stored about the account as a JSON document. */
  exportMyData(): Promise<Record<string, unknown>>;
  demo?: DemoControls;
  getNarration(req: GetNarrationRequest): Promise<NarrationResponse>;
  getTransition(req: {
    fromPoiId: string;
    toPoiId: string;
    lang: string;
    walkMinutes: number;
    tourTitle?: string;
    access?: AccessInfo;
  }): Promise<TransitionResponse>;
  /** Resolves a playable/downloadable URL for a Cloud Storage audio path. */
  audioUrl(audioPath: string): Promise<string>;
  reportNarration(input: {
    narrationKey: string;
    reason: 'wrong_fact' | 'offensive' | 'audio_issue' | 'other';
    text?: string;
  }): Promise<void>;
}

export class BackendError extends Error {
  constructor(
    readonly code:
      | 'network'
      | 'paused'
      | 'rate_limited'
      | 'unavailable'
      | 'not_found'
      | 'unauthenticated'
      | 'locked'
      | 'insufficient_credit'
      | 'invite_invalid'
      | 'redeem_denied'
      | 'unknown',
    message: string,
    readonly retryAfterMs?: number,
    /** Server-provided machine reason (e.g. `insufficient`, `already_redeemed`). */
    readonly reason?: string,
  ) {
    super(message);
  }
}
