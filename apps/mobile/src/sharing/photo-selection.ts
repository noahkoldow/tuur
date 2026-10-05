import type { ActivityPhoto, loadActivityPhotos } from './activity-photos';

type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'denied' | 'unavailable' | 'error';
interface SelectionState {
  status: Status;
  photos: ActivityPhoto[];
  displayed: string[];
  limited: boolean;
  canAskAgain: boolean;
  failed: boolean;
  checking: boolean;
}

const initialState = (): SelectionState => ({
  status: 'idle',
  photos: [],
  displayed: [],
  limited: false,
  canAskAgain: true,
  failed: false,
  checking: false,
});

/** Ephemeral consent and render readiness for one recap, never persisted to history. */
export class PhotoSelection {
  private state = initialState();
  private revision = 0;
  private validationRevision = 0;
  private request?: AbortController;
  private listeners = new Set<() => void>();

  constructor(
    private readonly dependencies: {
      load: (signal: AbortSignal) => ReturnType<typeof loadActivityPhotos>;
      permitted: (photos: readonly ActivityPhoto[]) => Promise<boolean>;
    },
  ) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(state: SelectionState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  /** Invalidates native work that cannot be cancelled when leaving this activity. */
  cancel = () => {
    this.revision++;
    this.request?.abort();
    this.request = undefined;
  };
  clear = () => {
    this.cancel();
    this.update(initialState());
  };

  load = async () => {
    this.cancel();
    const revision = this.revision;
    const request = new AbortController();
    this.request = request;
    this.update({ ...initialState(), status: 'loading' });
    try {
      const result = await this.dependencies.load(request.signal);
      if (revision !== this.revision) return;
      if (result.status === 'ready') {
        this.update({ ...initialState(), ...result, status: result.photos.length ? 'ready' : 'empty' });
      } else {
        this.update({ ...initialState(), ...result });
      }
    } catch {
      if (revision === this.revision) this.update({ ...initialState(), status: 'error' });
    }
  };

  remove = (id: string, failed = false) => {
    if (!this.state.photos.some((photo) => photo.id === id)) return;
    this.cancel();
    const photos = this.state.photos.filter((photo) => photo.id !== id);
    this.update({
      ...this.state,
      photos,
      displayed: this.state.displayed.filter((value) => value !== id),
      status: photos.length ? 'ready' : 'idle',
      failed: this.state.failed || failed,
      checking: false,
    });
  };

  displayed = (id: string) => {
    if (!this.state.photos.some((photo) => photo.id === id) || this.state.displayed.includes(id)) return;
    this.update({ ...this.state, displayed: [...this.state.displayed, id] });
  };

  canShare = () =>
    this.state.status !== 'loading' &&
    !this.state.checking &&
    this.state.photos.every((photo) => this.state.displayed.includes(photo.id));

  /** Read-only permission check; does not renew opt-in or request access. */
  revalidate = async () => {
    if (!this.state.photos.length) return true;
    const revision = this.revision;
    const validation = ++this.validationRevision;
    this.update({ ...this.state, checking: true });
    try {
      const permitted = await this.dependencies.permitted(this.state.photos);
      if (revision !== this.revision || validation !== this.validationRevision) return false;
      if (!permitted) {
        this.cancel();
        this.update({ ...initialState(), status: 'denied', canAskAgain: false });
        return false;
      }
      this.update({ ...this.state, checking: false });
      return true;
    } catch {
      if (revision === this.revision && validation === this.validationRevision) {
        this.cancel();
        this.update({ ...initialState(), status: 'error' });
      }
      return false;
    }
  };
}
