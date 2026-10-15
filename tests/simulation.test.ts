import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { BallPool } from '../src/physics/ball';
import { Pile, nextNiceScale } from '../src/physics/pile';
import { World } from '../src/physics/world';
import { binomialMean, binomialStdDev } from '../src/stats/binomial';
import { Tally } from '../src/stats/tally';

function run(rows: number, bias: number, balls: number, rate = 40, restitution = 0.45, gravity = 1): World {
  const world = new World({ rows, bias, restitution, gravity, binHeight: 12, rng: mulberry32(1234) });
  let acc = 0;
  for (let t = 0; t < 600 && world.tally.total < balls; t += 1 / 60) {
    acc += rate / 60;
    while (acc >= 1 && world.spawned < balls) {
      world.spawn();
      acc--;
    }
    world.step(1 / 60);
  }
  return world;
}

describe('World (physics simulation)', () => {
  it('lands every dropped ball in a bin', () => {
    const w = run(8, 0.5, 200);
    expect(w.tally.total).toBe(200);
    expect(w.inFlight).toBe(0);
  });

  it('reproduces the binomial distribution for a fair board', () => {
    const w = run(12, 0.5, 800);
    expect(Math.abs(w.tally.mean() - binomialMean(12, 0.5))).toBeLessThan(0.25);
    expect(Math.abs(w.tally.stdDev() - binomialStdDev(12, 0.5))).toBeLessThan(0.25);
  });

  it('shifts the distribution with the left/right bias', () => {
    const w = run(10, 0.7, 600);
    expect(Math.abs(w.tally.mean() - binomialMean(10, 0.7))).toBeLessThan(0.3);
    const w2 = run(10, 0.3, 600);
    expect(Math.abs(w2.tally.mean() - binomialMean(10, 0.3))).toBeLessThan(0.3);
  });

  it('reset clears balls and counts; configure with new rows resizes bins', () => {
    const w = run(6, 0.5, 50);
    w.spawn();
    w.reset();
    expect(w.inFlight).toBe(0);
    expect(w.tally.total).toBe(0);
    w.configure(20, 12);
    expect(w.tally.bins).toBe(21);
  });
});

describe('BallPool', () => {
  it('recycles indices and never exceeds capacity', () => {
    const pool = new BallPool(3);
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect(pool.acquire()).toBe(-1);
    pool.release(b);
    expect(pool.activeCount).toBe(2);
    expect(Array.from(pool.active.subarray(0, 2)).sort()).toEqual([a, c].sort());
    expect(pool.acquire()).toBe(b);
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect(pool.available).toBe(3);
  });
});

describe('Pile', () => {
  it('stacks slots bottom-up inside the bin walls', () => {
    const pile = new Pile();
    pile.configure(5);
    for (let i = 0; i < pile.capacity; i++) {
      expect(Math.abs(pile.slotX(i))).toBeLessThan(0.5);
      expect(pile.slotY(i)).toBeLessThanOrEqual(5);
      if (i > 0) expect(pile.slotY(i)).toBeGreaterThanOrEqual(pile.slotY(i - 1));
    }
  });

  it('switches to a coarser scale when a bin overflows', () => {
    const pile = new Pile();
    pile.configure(3);
    expect(pile.fit(pile.capacity)).toBe(false);
    expect(pile.fit(pile.capacity * 3)).toBe(true);
    expect(pile.ballsPerDot).toBe(5);
    expect(pile.dots(pile.capacity * 3)).toBeLessThanOrEqual(pile.capacity);
  });

  it('uses 1-2-5 scale steps', () => {
    expect([1, 2, 5, 10, 20, 50].map(nextNiceScale)).toEqual([2, 5, 10, 20, 50, 100]);
  });
});

describe('Tally', () => {
  it('tracks mean, sample std dev and goodness of fit', () => {
    const t = new Tally(5);
    [0, 1, 2, 3, 4].forEach((b) => t.add(b));
    expect(t.mean()).toBe(2);
    expect(t.stdDev()).toBeCloseTo(Math.sqrt(2.5), 12);
    expect(t.totalVariation([0.2, 0.2, 0.2, 0.2, 0.2])).toBeCloseTo(0, 12);
    expect(t.chiSquare([0.2, 0.2, 0.2, 0.2, 0.2])).toBeCloseTo(0, 12);
    t.addCounts([5, 0, 0, 0, 0]);
    expect(t.total).toBe(10);
    expect(t.maxCount()).toBe(6);
    t.reset();
    expect(t.total).toBe(0);
    expect(Number.isNaN(t.mean())).toBe(true);
  });
});
