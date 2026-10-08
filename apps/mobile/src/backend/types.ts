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
  ExploredSpot,
  PartnerApplication,
  OfflineDownloadAccess,
  SelectNearbyRequest,
  SelectNearbyResult,
  GetWalkingRouteRequest,
  WalkingRouteResult,
  TourScript,
  Interest,
  UpdateTourTimeRequest,
  TourTimeResult,
  AiConsentState,
} from '@tuur/shared';

export type Unsubscribe = () => void;

export interface ContentReportInput {
  requestId: string;
  kind: 'ad' | 'offer';
  offerId?: string;
  reason: 'offensive' | 'age_inappropriate' | 'misleading' | 'other';
  text: string;
  blockPartner: boolean;
}

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
  audioUrl?: string;
}

export interface UserInfo {
  uid: string;
  isAnonymous: boolean;
  email?: string;
  phoneNumber?: string;
  /** Firebase provider IDs; older test/offline fixtures may omit these. */
  providerIds?: string[];
}

export interface EntitlementState {
  entitlements: Entitlement[];
  wallet: Wallet;
}

/** What the listener is doing; the server checks entitlements against it before serving content. */
export interface AccessInfo {
  tourId?: string;
  mode?: 'tour' | 'planned' | 'fork' | 'roam';
  /** Live group the listener belongs to (server checks the membership, D47). */
  groupId?: string;
  /** Server-issued active-time lease, shared across all modes in this walk. */
  sessionId?: string;
  /** Prepaid download identity, bound to the exact narration script instance. */
  downloadId?: string;
}

/** What members see of a live group (D47). */
export interface GroupInfo {
  id: string;
  tour: Tour;
  mode: 'tour' | 'planned';
  hostUid: string;
  members: number;
  capacity: number;
  status: 'live' | 'ended';
  expiresAt: number;
  audio?: { script: TourScript; lang: string; voice?: string; primaryInterest?: Interest };
  sessionId?: string;
}

export type SpendRequest =
  { kind: 'tour'; tourId: string; paidOnly?: boolean } | { kind: 'session'; placeId: string };

/** Only present on the in-memory demo backend: simulates what the store + webhooks would grant. */
export interface DemoControls {
  grantCredits(n: number): void;
  grantRewardCredit(): void;
  grantSubscription(productId?: 'tuur_sub_monthly' | 'tuur_sub_yearly'): void;
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
  /** Resolves for a primary account; a mobile number is optional. Never creates a guest identity. */
  ensureSignedIn(): Promise<UserInfo>;
  signInWithEmail(email: string, password: string, create: boolean): Promise<UserInfo>;
  signInWithApple(): Promise<UserInfo>;
  signInWithGoogle(): Promise<UserInfo>;
  requestPhoneVerification(phoneNumber: string): Promise<string>;
  confirmPhoneVerification(verificationId: string, code: string): Promise<UserInfo>;
  signOut(): Promise<void>;
}

/**
 * Everything the app needs from the server. Implemented by Firebase (production, emulators) and by an in-memory
 * demo backend (web preview, tests, offline development). Screens never talk to Firebase directly.
 */
export interface Backend {
  readonly kind: 'firebase' | 'demo';
  readonly auth: AuthApi;
  getAiConsent(): Promise<AiConsentState>;
  updateAiConsent(granted: boolean): Promise<AiConsentState>;
  /** Asks the server to ingest the tile and its neighbors (only the geohash is sent, never a position). */
  ensureArea(tile: string, rings?: number): Promise<void>;
  watchArea(tile: string, cb: (a: AreaInfo | null) => void): Unsubscribe;
  /** Triggers/reads auto tours for the area's place in the given language. */
  getAutoTours(tile: string, lang: string): Promise<GenerateToursResult>;
  watchTours(placeId: string, cb: (tours: Tour[]) => void): Unsubscribe;
  getTour(id: string): Promise<Tour | null>;
  getPois(tiles: string[]): Promise<Poi[]>;
  /** Gemini curates real candidates as the walk progresses; no precise GPS is sent. */
  selectNearby(req: SelectNearbyRequest): Promise<SelectNearbyResult>;
  /** Transient origin/target coordinates for directions; never a location history. */
  getWalkingRoute(req: GetWalkingRouteRequest): Promise<WalkingRouteResult>;
  /** Places other users explored in these tiles (anonymous aggregates, k-anonymity threshold applied). */
  getExploredSpots(tiles: string[]): Promise<ExploredSpot[]>;
  /** Personal route (spec 5.2): re-checks the client plan with routing times and adds the narrative thread. */
  composePlannedRoute(req: ComposeRouteRequest): Promise<{ tour: Tour; dropped: string[] }>;
  /** One-sentence teaser for crossroads cards. */
  getTeaser(req: { poiId: string; lang: string; access?: AccessInfo }): Promise<string>;
  /** Free source text for a place; never generates narration or consumes audio time. */
  getPoiText(req: { poiId: string; lang: string; access?: AccessInfo }): Promise<Poi>;
  /** Live entitlements and credit wallet (server-written, read-only for the client). */
  watchEntitlements(cb: (s: EntitlementState) => void): Unsubscribe;
  claimTourStart(
    tourId: string,
    sessionId: string,
    mode: 'tour' | 'planned',
  ): Promise<{ counted: boolean; remaining: number | null }>;
  updateTourTime(req: UpdateTourTimeRequest): Promise<TourTimeResult>;
  spendCredit(req: SpendRequest): Promise<{ used: 'reward' | 'paid'; wallet: Wallet }>;
  /** Verifies a fixed itinerary for download; does not start a tour or consume a tour-start quota. */
  prepareTourDownload(
    tourId: string,
    mode: 'tour' | 'planned',
    scriptInstanceId?: string,
  ): Promise<OfflineDownloadAccess>;
  createInvite(tourId: string): Promise<{ token: string; remaining: number; expiresAt: number }>;
  redeemInvite(token: string): Promise<{ tourId: string }>;
  /** Nonce for rewarded-ad server-side verification (daily limit enforced on the server). */
  createRewardNonce(request: {
    tourId: string;
  }): Promise<{ nonce: string; remainingToday: number; purpose: 'free_tour' }>;
  /** Active offers of partner stops (server filters by validity and partner plan). */
  getOffers(poiIds: string[]): Promise<PublicOffer[]>;
  /** Anonymous, deduplicated partner statistics (impression = offers shown, visit = arrival). */
  recordPartnerEvent(poiId: string, type: 'impression' | 'visit'): Promise<void>;
  /** Arrival at a stop: feeds the anonymous explorer counts of the explore map (fire and forget). */
  recordVisit(poiId: string): Promise<void>;
  /** Live group tours (D47): the host opens a group and shares `token` as a link. */
  createGroup(req: {
    tourId: string;
    mode: 'tour' | 'planned';
    audio: NonNullable<GroupInfo['audio']>;
    sessionId?: string;
    recordings?: { kind: 'narration' | 'transition'; key: string; poiId: string; fromPoiId?: string }[];
  }): Promise<{ token: string; group: GroupInfo }>;
  joinGroup(token: string): Promise<{ group: GroupInfo }>;
  /** Spends one bought seat credit of the host for one more place. */
  addGroupSeat(groupId: string, requestId?: string): Promise<{ capacity: number; seatBalance: number }>;
  leaveGroup(groupId: string): Promise<void>;
  watchGroup(groupId: string, cb: (g: GroupInfo | null) => void): Unsubscribe;
  /** Business onboarding: sends a partner application for admin review. */
  submitPartnerApplication(app: PartnerApplication): Promise<{ id: string }>;
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
  /** Records the express consent to immediate delivery (loss of the right of withdrawal) before a purchase. */
  recordPurchaseConsent(productId: string): Promise<void>;
  demo?: DemoControls;
  getNarration(req: GetNarrationRequest): Promise<NarrationResponse>;
  getTransition(req: {
    fromPoiId: string;
    toPoiId: string;
    lang: string;
    walkMinutes: number;
    tourTitle?: string;
    scriptInstanceId?: string;
    /** Guide voice persona id (settings). */
    voice?: string;
    download?: boolean;
    access?: AccessInfo;
  }): Promise<TransitionResponse>;
  /** Resolves a playable/downloadable URL for a Cloud Storage audio path. */
  audioUrl(audioPath: string): Promise<string>;
  reportNarration(input: {
    narrationKey: string;
    reason: 'wrong_fact' | 'offensive' | 'audio_issue' | 'other';
    text?: string;
  }): Promise<void>;
  reportContent(input: ContentReportInput): Promise<void>;
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
