import { pathLength, pointAlong, type Fix, type LatLng } from '@tuur/shared';
import { realClock, type Clock } from '../audio/simulatedEngine';
import type { LocationSource } from './types';

/**
 * GPS simulator (spec 13, phase 4: "simulated GPS route"): walks a polyline at a chosen speed, one fix per
 * second, with optional jumps so a developer can reach the next stop without walking for an hour.
 */
export class SimulatedLocationSource implements LocationSource {
  private distance = 0;
  private timer: unknown;
  speed: number;
  private lastTs: number;
  constructor(
    private readonly path: LatLng[],
    private readonly opts: { speedMps?: number; startOffsetM?: number; clock?: Clock } = {},
  ) {
    this.distance = opts.startOffsetM ?? 0;
    this.speed = opts.speedMps ?? 1.35;
    this.lastTs = (opts.clock ?? realClock).now();
  }
  private get clock() {
    return this.opts.clock ?? realClock;
  }
  get totalMeters() {
    return pathLength(this.path);
  }
  get progressMeters() {
    return this.distance;
  }
  jumpTo(meters: number) {
    this.distance = Math.max(0, Math.min(this.totalMeters, meters));
  }

  async subscribe(cb: (fix: Fix) => void) {
    const total = this.totalMeters;
    const tick = () => {
      const now = this.clock.now();
      const dt = Math.max(0.001, (now - this.lastTs) / 1000);
      this.lastTs = now;
      const before = this.distance;
      this.distance = Math.min(total, this.distance + this.speed * dt);
      const moving = this.distance > before;
      const { point, heading } = pointAlong(this.path, this.distance);
      cb({ lat: point.lat, lng: point.lng, ts: now, accuracy: 6, speed: moving ? this.speed : 0, heading });
      this.timer = this.clock.setTimeout(tick, 1000);
    };
    this.lastTs = this.clock.now();
    this.timer = this.clock.setTimeout(tick, 0);
    return () => {
      if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    };
  }
}
