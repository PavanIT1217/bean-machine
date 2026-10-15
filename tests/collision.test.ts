import { describe, expect, it } from 'vitest';
import { type Body, collideCircles, collideWithStatic } from '../src/physics/collision';

const body = (x: number, y: number, vx = 0, vy = 0, r = 0.5, invMass = 1): Body => ({ x, y, vx, vy, r, invMass });
const momentum = (...bs: Body[]) =>
  bs.reduce((acc, b) => ({ x: acc.x + b.vx / b.invMass, y: acc.y + b.vy / b.invMass }), { x: 0, y: 0 });
const kinetic = (...bs: Body[]) => bs.reduce((acc, b) => acc + (0.5 * (b.vx ** 2 + b.vy ** 2)) / b.invMass, 0);

describe('collideCircles', () => {
  it('ignores circles that do not overlap', () => {
    const a = body(0, 0, 1, 0);
    const b = body(1.01, 0, -1, 0);
    expect(collideCircles(a, b, 1)).toBe(false);
    expect(a.vx).toBe(1);
    expect(b.vx).toBe(-1);
  });

  it('swaps velocities in an elastic head-on collision of equal masses', () => {
    const a = body(0, 0, 2, 0);
    const b = body(0.9, 0, -1, 0);
    expect(collideCircles(a, b, 1)).toBe(true);
    expect(a.vx).toBeCloseTo(-1, 12);
    expect(b.vx).toBeCloseTo(2, 12);
  });

  it('conserves momentum and kinetic energy when e = 1', () => {
    const a = body(0, 0, 3, 1, 0.5, 1);
    const b = body(0.6, 0.5, -1, 0, 0.5, 0.5);
    const p0 = momentum(a, b);
    const k0 = kinetic(a, b);
    collideCircles(a, b, 1);
    const p1 = momentum(a, b);
    expect(p1.x).toBeCloseTo(p0.x, 10);
    expect(p1.y).toBeCloseTo(p0.y, 10);
    expect(kinetic(a, b)).toBeCloseTo(k0, 10);
  });

  it('conserves momentum but removes the normal relative velocity when e = 0', () => {
    const a = body(0, 0, 2, 0);
    const b = body(0.9, 0, 0, 0);
    collideCircles(a, b, 0);
    expect(a.vx).toBeCloseTo(1, 12);
    expect(b.vx).toBeCloseTo(1, 12);
  });

  it('scales the separating speed by the restitution coefficient', () => {
    for (const e of [0, 0.25, 0.5, 0.9]) {
      const a = body(0, 0, 1, 0);
      const b = body(0.95, 0, -1, 0);
      collideCircles(a, b, e);
      expect(b.vx - a.vx).toBeCloseTo(2 * e, 12);
    }
  });

  it('pushes overlapping circles apart until they just touch', () => {
    const a = body(0, 0);
    const b = body(0.4, 0.3); // distance 0.5, radii sum 1
    collideCircles(a, b, 0.5);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(1, 12);
    // Equal masses share the correction equally, so the midpoint does not move.
    expect((a.x + b.x) / 2).toBeCloseTo(0.2, 12);
    expect((a.y + b.y) / 2).toBeCloseTo(0.15, 12);
  });

  it('does not add an impulse to bodies that are already separating', () => {
    const a = body(0, 0, -1, 0);
    const b = body(0.9, 0, 1, 0);
    collideCircles(a, b, 1);
    expect(a.vx).toBe(-1);
    expect(b.vx).toBe(1);
  });

  it('treats invMass = 0 as immovable', () => {
    const wall = body(1, 0, 0, 0, 0.5, 0);
    const a = body(0.2, 0, 3, 0);
    collideCircles(a, wall, 0.5);
    expect(wall.x).toBe(1);
    expect(wall.vx).toBe(0);
    expect(a.x).toBeCloseTo(0, 12);
    expect(a.vx).toBeCloseTo(-1.5, 12);
  });

  it('handles coincident centres without NaN', () => {
    const a = body(0, 0, 0, 1);
    const b = body(0, 0, 0, -1);
    collideCircles(a, b, 1);
    for (const v of [a.x, a.y, a.vx, a.vy, b.x, b.y, b.vx, b.vy]) expect(Number.isFinite(v)).toBe(true);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(1, 12);
  });
});

describe('collideWithStatic (pegs)', () => {
  it('reflects a ball falling straight onto a peg with restitution', () => {
    const ball = body(0, -0.2, 0, 5, 0.15);
    expect(collideWithStatic(ball, 0, 0, 0.1, 0.5)).toBe(true);
    expect(ball.vy).toBeCloseTo(-2.5, 12);
    expect(ball.vx).toBeCloseTo(0, 12);
    expect(ball.y).toBeCloseTo(-0.25, 12);
  });

  it('deflects an off-centre hit sideways and preserves tangential speed', () => {
    const ball = body(0.15, -0.15, 0, 4, 0.15);
    collideWithStatic(ball, 0, 0, 0.1, 1);
    expect(ball.vx).toBeGreaterThan(0);
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(4, 10); // elastic: speed unchanged
  });

  it('matches collideCircles against an infinite-mass circle', () => {
    const a = body(0.1, -0.18, 1, 3, 0.15);
    const b = { ...a };
    const peg = body(0, 0, 0, 0, 0.1, 0);
    collideWithStatic(a, 0, 0, 0.1, 0.6);
    collideCircles(b, peg, 0.6);
    expect(a.x).toBeCloseTo(b.x, 12);
    expect(a.y).toBeCloseTo(b.y, 12);
    expect(a.vx).toBeCloseTo(b.vx, 12);
    expect(a.vy).toBeCloseTo(b.vy, 12);
  });

  it('returns false and leaves the ball alone when not touching', () => {
    const ball = body(1, 1, 1, 1, 0.15);
    expect(collideWithStatic(ball, 0, 0, 0.1, 0.5)).toBe(false);
    expect(ball).toEqual(body(1, 1, 1, 1, 0.15));
  });
});
