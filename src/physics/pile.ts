import { PILE_BALL_RADIUS, WALL_HALF_WIDTH } from '../core/config';

const NICE_SCALES = [1, 2, 5];

/**
 * Geometry of settled balls stacked in a bin, using hexagonal packing:
 * even layers hold `cols` balls, odd layers `cols - 1` balls offset by one radius.
 * When a bin would overflow, each drawn "dot" starts representing more balls
 * (1, 2, 5, 10, 20, 50, ...) so a million-ball fast drop still fits.
 */
export class Pile {
  readonly r = PILE_BALL_RADIUS;
  cols = 1;
  layerHeight = 2 * PILE_BALL_RADIUS;
  capacity = 1;
  ballsPerDot = 1;
  binHeight = 1;
  /** Bumped whenever slot geometry or the scale changes (renderer must redraw). */
  version = 0;
  private pad = 0;
  private perPair = 1;

  configure(binHeight: number): void {
    const r = this.r;
    const inner = 1 - 2 * WALL_HALF_WIDTH;
    this.binHeight = binHeight;
    this.cols = Math.max(1, Math.floor(inner / (2 * r)));
    this.pad = (inner - this.cols * 2 * r) / 2;
    if (this.cols > 1) {
      this.layerHeight = 2 * r * (Math.sqrt(3) / 2);
      this.perPair = 2 * this.cols - 1;
    } else {
      this.layerHeight = 2 * r;
      this.perPair = 2;
    }
    const layers = Math.max(1, Math.floor((binHeight - 2 * r) / this.layerHeight) + 1);
    this.capacity = this.slotsForLayers(layers);
    this.version++;
  }

  private slotsForLayers(layers: number): number {
    if (this.cols === 1) return layers;
    const pairs = Math.floor(layers / 2);
    return pairs * this.perPair + (layers % 2) * this.cols;
  }

  resetScale(): void {
    if (this.ballsPerDot !== 1) {
      this.ballsPerDot = 1;
      this.version++;
    }
  }

  /** Grow `ballsPerDot` so a bin holding `maxCount` balls fits. Returns true if it changed. */
  fit(maxCount: number): boolean {
    let scale = this.ballsPerDot;
    while (Math.ceil(maxCount / scale) > this.capacity) scale = nextNiceScale(scale);
    if (scale !== this.ballsPerDot) {
      this.ballsPerDot = scale;
      this.version++;
      return true;
    }
    return false;
  }

  /** Number of dots to draw for a bin count. */
  dots(count: number): number {
    return Math.min(this.capacity, Math.ceil(count / this.ballsPerDot));
  }

  /** Horizontal offset of slot `index` from the bin centre. */
  slotX(index: number): number {
    const r = this.r;
    const left = -0.5 + WALL_HALF_WIDTH + this.pad;
    if (this.cols === 1) return left + r;
    const rem = index % this.perPair;
    return rem < this.cols ? left + r + rem * 2 * r : left + 2 * r + (rem - this.cols) * 2 * r;
  }

  /** Height of slot `index`'s centre above the bin floor. */
  slotY(index: number): number {
    const layer =
      this.cols === 1
        ? index
        : 2 * Math.floor(index / this.perPair) + (index % this.perPair < this.cols ? 0 : 1);
    return this.r + layer * this.layerHeight;
  }

  /** Continuous pile height (top surface) for a fractional number of dots, used for curves. */
  heightForDots(dots: number): number {
    if (dots <= 0) return 0;
    const perLayer = this.cols === 1 ? 1 : this.perPair / 2;
    return (dots / perLayer) * this.layerHeight + (2 * this.r - this.layerHeight);
  }
}

export function nextNiceScale(scale: number): number {
  let mag = 1;
  while (mag * 10 <= scale) mag *= 10;
  const lead = scale / mag;
  const i = NICE_SCALES.findIndex((s) => s > lead + 1e-9);
  return i === -1 ? mag * 10 : NICE_SCALES[i] * mag;
}
