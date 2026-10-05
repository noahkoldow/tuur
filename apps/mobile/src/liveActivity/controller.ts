import type { LiveActivityContent } from './model';

export interface NativeLiveActivity {
  getId(): string;
  update(content: LiveActivityContent, staleDate: Date): Promise<void> | void;
  end(policy: 'immediate'): Promise<void> | void;
}

export interface LiveActivityFactory {
  getInstances(): NativeLiveActivity[];
  start(
    content: LiveActivityContent,
    url: string,
    staleDate: Date,
  ): NativeLiveActivity | Promise<NativeLiveActivity>;
}

interface ControllerOptions {
  url(sessionId: string): string;
  updateIntervalMs?: number;
  onError?(error: unknown): void;
}

interface Session {
  id: string;
  content: LiveActivityContent;
}

interface ActiveActivity {
  sessionId: string;
  native: NativeLiveActivity;
  content: LiveActivityContent;
  writtenAt: number;
  updateFailedEpoch?: number;
  endFailedEpoch?: number;
}

function significantContent(content: LiveActivityContent): string {
  return JSON.stringify([
    content.title,
    content.subtitle,
    content.status,
    content.symbol,
    content.progress,
    content.progressValue,
    content.staleStatus,
    content.staleCompact,
  ]);
}

function sameContent(a: LiveActivityContent, b: LiveActivityContent): boolean {
  return (
    significantContent(a) === significantContent(b) &&
    a.distance === b.distance &&
    a.compactText === b.compactText
  );
}

/**
 * A single owner for ActivityKit mutations. Session IDs must identify a particular run,
 * not a reusable route. Closed IDs remain closed so late GPS/audio callbacks are harmless.
 * Calls resolve after reconciliation; a coalesced distance update may still be scheduled.
 */
export function createLiveActivityController(factory: LiveActivityFactory, options: ControllerOptions) {
  const updateIntervalMs = Math.max(0, options.updateIntervalMs ?? 5_000);
  // A suspended/terminated JS process stops renewing this lease. The widget can then
  // replace stale navigation with its native, localized "open tuur" fallback.
  const refreshIntervalMs = 30_000;
  const staleAfterMs = 60_000;
  const closedSessions = new Set<string>();
  let desired: Session | null = null;
  let active: ActiveActivity | null = null;
  let foreground = false;
  let foregroundEpoch = 0;
  let initialized = false;
  let failedStart: { sessionId: string; epoch: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tail = Promise.resolve();

  function report(error: unknown) {
    // A diagnostic hook must never break navigation or the serialization queue.
    try {
      options.onError?.(error);
    } catch {
      // Native system surfaces are optional; the guide continues on every failure.
    }
  }

  function cancelTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function schedule(delay: number) {
    timer = setTimeout(() => {
      timer = undefined;
      void enqueue();
    }, delay);
  }

  async function initializeOnce() {
    if (initialized) return;
    initialized = true;
    try {
      // Activities from a terminated JS process have no live guide to update them.
      // Never adopt one and accidentally show another session's position or narration.
      for (const orphan of factory.getInstances()) {
        try {
          await orphan.end('immediate');
        } catch (error) {
          report(error);
        }
      }
    } catch (error) {
      report(error);
    }
  }

  async function reconcile() {
    cancelTimer();
    await initializeOnce();

    // Re-read desired after every native await: a session may have ended or been
    // replaced while ActivityKit was processing the previous mutation.
    while (true) {
      if (active && (!desired || active.sessionId !== desired.id)) {
        if (active.endFailedEpoch === foregroundEpoch) return;
        const ending = active;
        const attemptEpoch = foregroundEpoch;
        try {
          await ending.native.end('immediate');
          active = null;
        } catch (error) {
          ending.endFailedEpoch = attemptEpoch;
          report(error);
          return;
        }
        continue;
      }

      if (!desired) return;

      if (!active) {
        if (!foreground) return; // ActivityKit only permits an app to start while foregrounded.
        if (failedStart?.sessionId === desired.id && failedStart.epoch === foregroundEpoch) return;
        const starting = desired;
        const attemptEpoch = foregroundEpoch;
        const writtenAt = Date.now();
        try {
          const native = await factory.start(
            starting.content,
            options.url(starting.id),
            new Date(writtenAt + staleAfterMs),
          );
          active = {
            sessionId: starting.id,
            native,
            content: starting.content,
            writtenAt,
          };
          failedStart = null;
        } catch (error) {
          failedStart = { sessionId: starting.id, epoch: attemptEpoch };
          report(error);
          // A different session might have arrived while the failed start was pending.
          if (desired?.id !== starting.id) continue;
          return;
        }
        continue;
      }

      if (active.updateFailedEpoch === foregroundEpoch) return;
      const checking = active;
      try {
        const activityId = checking.native.getId();
        if (!factory.getInstances().some((instance) => instance.getId() === activityId)) {
          // The user or system removed it. Respect dismissal until a new guide session.
          closedSessions.add(checking.sessionId);
          desired = null;
          active = null;
          return;
        }
      } catch (error) {
        checking.updateFailedEpoch = foregroundEpoch;
        report(error);
        return;
      }

      const refreshRemaining = active.writtenAt + refreshIntervalMs - Date.now();
      if (sameContent(active.content, desired.content) && refreshRemaining > 0) {
        schedule(refreshRemaining);
        return;
      }
      const significant = significantContent(active.content) !== significantContent(desired.content);
      const remaining = active.writtenAt + updateIntervalMs - Date.now();
      if (!significant && remaining > 0 && refreshRemaining > 0) {
        schedule(Math.min(remaining, refreshRemaining));
        return;
      }

      const updating = active;
      const content = desired.content;
      const attemptEpoch = foregroundEpoch;
      const writtenAt = Date.now();
      try {
        await updating.native.update(content, new Date(writtenAt + staleAfterMs));
        updating.content = content;
        updating.writtenAt = writtenAt;
        updating.updateFailedEpoch = undefined;
      } catch (error) {
        updating.updateFailedEpoch = attemptEpoch;
        report(error);
        return;
      }
    }
  }

  function enqueue(): Promise<void> {
    tail = tail.then(reconcile).catch(report);
    return tail;
  }

  function endSession(id: string): Promise<void> {
    closedSessions.add(id);
    if (desired?.id === id) {
      desired = null;
      cancelTimer();
    }
    return enqueue();
  }

  return {
    initialize: enqueue,
    setSession(id: string, content: LiveActivityContent | null): Promise<void> {
      if (content === null) return endSession(id);
      if (closedSessions.has(id)) return tail;
      if (desired && desired.id !== id) closedSessions.add(desired.id);
      desired = { id, content: { ...content } };
      return enqueue();
    },
    setForeground(value: boolean): Promise<void> {
      if (value && !foreground) foregroundEpoch += 1;
      foreground = value;
      return enqueue();
    },
    endSession,
  };
}
