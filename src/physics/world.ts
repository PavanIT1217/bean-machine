import {
  BALL_RADIUS,
  BASE_GRAVITY,
  BIN_TOP_GAP,
  MAX_ACTIVE_BALLS,
  MAX_SPEED,
  PEG_RADIUS,
  ROW_HEIGHT,
  SPAWN_Y,
  SUBSTEP,
  WALL_HALF_WIDTH,
} from '../core/config';
import type { Rng } from '../core/rng';
import { Tally } from '../stats/tally';
import { BallPool, type Ball } from './ball';
import { collideCircles, collideWithStatic } from './collision';
import { Pile } from './pile';

const GRID_CELL = 0.5; // ≥ ball diameter, so neighbours are always in adjacent cells
const SPAWN_SPEED = 4;
const SPAWN_SPACING = 2.05 * BALL_RADIUS;
const DECISION_HEIGHT = (PEG_RADIUS + BALL_RADIUS) * 2.5;

export interface WorldOptions {
  rows: number;
  bias: number;
  restitution: number;
  gravity: number;
  binHeight: number;
  rng: Rng;
  capacity?: number;
}

/**
 * The Galton board simulation.
 *
 * Coordinates are in peg units (peg spacing = 1), origin at the first peg, y down.
 * Row r has r+1 pegs at x = k − r/2. Bins sit below the last row, one per possible
 * number of "right" bounces, with dividers directly under the last row's pegs.
 *
 * Collisions are real (circle–circle impulses with restitution). To honour the bias
 * setting, a ball arriving at each peg row makes a Bernoulli(p) left/right decision that
 * moves its horizontal steering target half a spacing that way; a damped spring nudges
 * the ball towards it while gravity, pegs and other balls do the rest. The bin a ball
 * lands in is decided by where the physics actually puts it.
 */
export class World {
  readonly pool: BallPool;
  readonly tally: Tally;
  readonly pile = new Pile();
  rows: number;
  bias: number;
  restitution: number;
  gravityScale: number;
  binHeight: number;
  rng: Rng;

  /** Balls ever spawned since reset (in flight + landed via physics). */
  spawned = 0;
  private lastSpawned = -1;
  private accumulator = 0;

  // Spatial hash (allocated on configure, reused every substep).
  private gridCols = 0;
  private gridRows = 0;
  private gridX0 = 0;
  private gridY0 = 0;
  private cellHead = new Int32Array(0);
  private readonly cellNext: Int32Array;

  constructor(opts: WorldOptions) {
    this.rows = opts.rows;
    this.bias = opts.bias;
    this.restitution = opts.restitution;
    this.gravityScale = opts.gravity;
    this.binHeight = opts.binHeight;
    this.rng = opts.rng;
    this.pool = new BallPool(opts.capacity ?? MAX_ACTIVE_BALLS);
    this.cellNext = new Int32Array(this.pool.capacity);
    this.tally = new Tally(opts.rows + 1);
    this.configure(opts.rows, opts.binHeight);
  }

  // ---- geometry -------------------------------------------------------------------------
  get binCount(): number {
    return this.rows + 1;
  }
  get halfWidth(): number {
    return (this.rows + 1) / 2;
  }
  get lastRowY(): number {
    return (this.rows - 1) * ROW_HEIGHT;
  }
  get binTop(): number {
    return this.lastRowY + BIN_TOP_GAP;
  }
  get binBottom(): number {
    return this.binTop + this.binHeight;
  }
  pegX(row: number, k: number): number {
    return k - row / 2;
  }
  pegY(row: number): number {
    return row * ROW_HEIGHT;
  }
  binCenter(bin: number): number {
    return bin - this.rows / 2;
  }
  binIndexAt(x: number): number {
    const j = Math.round(x + this.rows / 2);
    return j < 0 ? 0 : j > this.rows ? this.rows : j;
  }

  // ---- lifecycle ------------------------------------------------------------------------
  /** Change row count / bin height. Changing rows clears everything. */
  configure(rows: number, binHeight: number): void {
    const rowsChanged = rows !== this.rows || this.tally.bins !== rows + 1;
    this.rows = rows;
    this.binHeight = binHeight;
    this.pile.configure(binHeight);
    if (rowsChanged) this.reset();
    else this.pile.fit(this.tally.maxCount());

    this.gridX0 = -this.halfWidth - 1;
    this.gridY0 = SPAWN_Y - 2;
    this.gridCols = Math.ceil((2 * this.halfWidth + 2) / GRID_CELL) + 1;
    this.gridRows = Math.ceil((this.binBottom - this.gridY0 + 1) / GRID_CELL) + 1;
    const cells = this.gridCols * this.gridRows;
    if (this.cellHead.length < cells) this.cellHead = new Int32Array(cells);
  }

  reset(): void {
    this.pool.releaseAll();
    this.tally.reset(this.rows + 1);
    this.pile.resetScale();
    this.pile.configure(this.binHeight);
    this.spawned = 0;
    this.lastSpawned = -1;
    this.accumulator = 0;
  }

  get inFlight(): number {
    return this.pool.activeCount;
  }

  /** Drop one ball from the top. Returns false if the pool is exhausted. */
  spawn(): boolean {
    const idx = this.pool.acquire();
    if (idx < 0) return false;
    const b = this.pool.balls[idx];
    b.x = (this.rng() - 0.5) * 0.1;
    b.y = SPAWN_Y;
    b.vx = 0;
    b.vy = SPAWN_SPEED;
    b.row = -1;
    b.rights = 0;
    b.bin = -1;
    b.targetX = 0;
    // Queue behind the previous ball if it hasn't cleared the spout yet (a falling stream).
    if (this.lastSpawned >= 0) {
      const prev = this.pool.balls[this.lastSpawned];
      if (prev.row < 0 && prev.bin < 0 && prev.y - SPAWN_Y < SPAWN_SPACING) {
        b.y = prev.y - SPAWN_SPACING;
        b.vy = Math.max(prev.vy, SPAWN_SPEED);
      }
    }
    this.lastSpawned = idx;
    this.spawned++;
    return true;
  }

  /** Advance by `dt` seconds using fixed substeps. Returns number of balls that landed. */
  step(dt: number): number {
    this.accumulator += dt;
    let landed = 0;
    while (this.accumulator >= SUBSTEP) {
      landed += this.substep(SUBSTEP);
      this.accumulator -= SUBSTEP;
    }
    return landed;
  }

  // ---- simulation ------------------------------------------------------------------------
  private substep(h: number): number {
    const g = BASE_GRAVITY * this.gravityScale;
    // Steering spring tuned to the time it takes to fall one row, so behaviour is
    // independent of the gravity setting.
    const tRow = Math.sqrt((2 * ROW_HEIGHT) / g);
    const omega = 3.5 / tRow;
    const k = omega * omega;
    const c = 2 * 0.9 * omega;
    const { balls, active } = this.pool;

    for (let i = 0; i < this.pool.activeCount; i++) {
      const b = balls[active[i]];
      b.vy += g * h;
      b.vx += (k * (b.targetX - b.x) - c * b.vx) * h;
      const sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 > MAX_SPEED * MAX_SPEED) {
        const s = MAX_SPEED / Math.sqrt(sp2);
        b.vx *= s;
        b.vy *= s;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      this.decide(b);
    }

    this.collideBalls();

    let landed = 0;
    const e = this.restitution;
    const binTop = this.binTop;
    for (let i = 0; i < this.pool.activeCount; i++) {
      const idx = active[i];
      const b = balls[idx];
      if (b.y < binTop) {
        this.collidePegs(b, e);
        const lim = this.halfWidth - b.r;
        if (b.x < -lim) {
          b.x = -lim;
          if (b.vx < 0) b.vx = -b.vx * e;
        } else if (b.x > lim) {
          b.x = lim;
          if (b.vx > 0) b.vx = -b.vx * e;
        }
      } else if (this.updateInBin(b, e)) {
        this.pool.release(idx);
        if (idx === this.lastSpawned) this.lastSpawned = -1;
        i--; // swap-removal moved another ball into slot i
        landed++;
      }
    }
    return landed;
  }

  private collidePegs(b: Ball, e: number): void {
    const row = Math.round(b.y / ROW_HEIGHT);
    if (row < 0 || row >= this.rows) return;
    // Pegs are ≥ 0.866 apart, far more than ball+peg radius, so only the nearest can touch.
    let kk = Math.round(b.x + row / 2);
    if (kk < 0) kk = 0;
    else if (kk > row) kk = row;
    const px = kk - row / 2;
    const py = row * ROW_HEIGHT;
    collideWithStatic(b, px, py, PEG_RADIUS, e);
  }

  /**
   * As a ball reaches the contact height of the next peg row it "chooses" a side:
   * Bernoulli(bias). The steering target moves half a peg spacing that way, which is
   * exactly the peg below in the following row (or the bin centre after the last row).
   */
  private decide(b: Ball): void {
    const next = b.row + 1;
    if (next >= this.rows || b.y < next * ROW_HEIGHT - DECISION_HEIGHT) return;
    b.row = next;
    const right = this.rng() < this.bias;
    if (right) b.rights++;
    const dir = right ? 1 : -1;
    b.targetX += 0.5 * dir;
    b.vx += dir * 1.0;
  }

  /** Bin-area physics. Returns true when the ball has come to rest on the pile. */
  private updateInBin(b: Ball, e: number): boolean {
    if (b.bin < 0) {
      b.bin = this.binIndexAt(b.x);
      b.targetX = this.binCenter(b.bin);
      if (b.row < 0) b.row = this.rows - 1;
    }
    const cx = this.binCenter(b.bin);
    const left = cx - 0.5 + WALL_HALF_WIDTH + b.r;
    const right = cx + 0.5 - WALL_HALF_WIDTH - b.r;
    if (b.x < left) {
      b.x = left;
      if (b.vx < 0) b.vx = -b.vx * e;
    } else if (b.x > right) {
      b.x = right;
      if (b.vx > 0) b.vx = -b.vx * e;
    }
    const pile = this.pile;
    const count = this.tally.counts[b.bin];
    let slot = Math.floor(count / pile.ballsPerDot);
    if (slot >= pile.capacity) slot = pile.capacity - 1;
    const restY = this.binBottom - pile.slotY(slot);
    if (b.y >= restY) {
      this.tally.add(b.bin);
      pile.fit(this.tally.counts[b.bin]);
      return true;
    }
    return false;
  }

  private collideBalls(): void {
    const n = this.pool.activeCount;
    if (n < 2) return;
    const { balls, active } = this.pool;
    const cols = this.gridCols;
    const rows = this.gridRows;
    const head = this.cellHead;
    const next = this.cellNext;
    head.fill(-1, 0, cols * rows);
    for (let i = 0; i < n; i++) {
      const idx = active[i];
      const cell = this.cellOf(balls[idx]);
      next[idx] = head[cell];
      head[cell] = idx;
    }
    // Visit each unordered pair once: pairs within a cell, then each cell against its
    // four "forward" neighbours (E, SW, S, SE).
    const e = this.restitution * 0.6;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const c = cy * cols + cx;
        for (let ai = head[c]; ai !== -1; ai = next[ai]) {
          const a = balls[ai];
          for (let bj = next[ai]; bj !== -1; bj = next[bj]) this.pair(a, balls[bj], e);
          if (cx + 1 < cols) this.cellPairs(a, head[c + 1], e);
          if (cy + 1 < rows) {
            const below = c + cols;
            if (cx > 0) this.cellPairs(a, head[below - 1], e);
            this.cellPairs(a, head[below], e);
            if (cx + 1 < cols) this.cellPairs(a, head[below + 1], e);
          }
        }
      }
    }
  }

  private cellPairs(a: Ball, first: number, e: number): void {
    for (let bj = first; bj !== -1; bj = this.cellNext[bj]) this.pair(a, this.pool.balls[bj], e);
  }

  private pair(a: Ball, b: Ball, e: number): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const rs = a.r + b.r;
    if (dx * dx + dy * dy < rs * rs) collideCircles(a, b, e);
  }

  private cellOf(b: Ball): number {
    let cx = Math.floor((b.x - this.gridX0) / GRID_CELL);
    let cy = Math.floor((b.y - this.gridY0) / GRID_CELL);
    if (cx < 0) cx = 0;
    else if (cx >= this.gridCols) cx = this.gridCols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.gridRows) cy = this.gridRows - 1;
    return cy * this.gridCols + cx;
  }
}
