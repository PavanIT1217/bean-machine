import { BALL_RADIUS } from '../core/config';
import type { Body } from './collision';

/** A pooled ball. Instances are allocated once and recycled; never created per frame. */
export class Ball implements Body {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  r = BALL_RADIUS;
  invMass = 1;
  /** Index of the last peg row this ball has made a left/right decision on (-1 = none). */
  row = -1;
  /** Horizontal target the ball is steered towards (centre of the chosen gap). */
  targetX = 0;
  /** Number of "right" decisions so far. */
  rights = 0;
  /** Bin index once it has entered the bin area, else -1. */
  bin = -1;
}

/** Fixed-capacity pool with an O(1) free-list and a dense list of active indices. */
export class BallPool {
  readonly balls: Ball[];
  /** Dense list of active ball indices; only the first `activeCount` are valid. */
  readonly active: Int32Array;
  activeCount = 0;
  private readonly free: Int32Array;
  private freeCount: number;
  /** Position of each ball inside `active` (for O(1) swap-removal). */
  private readonly slot: Int32Array;

  constructor(readonly capacity: number) {
    this.balls = Array.from({ length: capacity }, () => new Ball());
    this.active = new Int32Array(capacity);
    this.free = new Int32Array(capacity);
    this.slot = new Int32Array(capacity).fill(-1);
    for (let i = 0; i < capacity; i++) this.free[i] = capacity - 1 - i;
    this.freeCount = capacity;
  }

  get available(): number {
    return this.freeCount;
  }

  /** Returns the index of a recycled ball, or -1 if the pool is exhausted. */
  acquire(): number {
    if (this.freeCount === 0) return -1;
    const idx = this.free[--this.freeCount];
    this.slot[idx] = this.activeCount;
    this.active[this.activeCount++] = idx;
    return idx;
  }

  release(idx: number): void {
    const s = this.slot[idx];
    if (s < 0) return;
    const last = this.active[--this.activeCount];
    this.active[s] = last;
    this.slot[last] = s;
    this.slot[idx] = -1;
    this.free[this.freeCount++] = idx;
  }

  releaseAll(): void {
    while (this.activeCount > 0) this.release(this.active[this.activeCount - 1]);
  }
}
