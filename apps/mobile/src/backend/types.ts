import type {
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
  getTeaser(req: { poiId: string; lang: string }): Promise<string>;
  getNarration(req: GetNarrationRequest): Promise<NarrationResponse>;
  getTransition(req: {
    fromPoiId: string;
    toPoiId: string;
    lang: string;
    walkMinutes: number;
    tourTitle?: string;
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
      'network' | 'paused' | 'rate_limited' | 'unavailable' | 'not_found' | 'unauthenticated' | 'unknown',
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}
