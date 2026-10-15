/** Minimal rigid-circle state used by the collision routines. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** 0 = immovable. */
  invMass: number;
}

/**
 * Resolve a collision between two moving circles in place.
 * Separates them along the contact normal (split by inverse mass) and, if they are
 * approaching, applies an impulse with coefficient of restitution `e` ∈ [0, 1].
 * Returns true when the circles were overlapping.
 */
export function collideCircles(a: Body, b: Body, e: number): boolean {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const rs = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rs * rs) return false;
  const invSum = a.invMass + b.invMass;
  if (invSum === 0) return false;

  let d = Math.sqrt(d2);
  if (d < 1e-9) {
    // Perfectly coincident centres: pick a deterministic normal.
    dx = 0;
    dy = 1;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  const penetration = rs - (d2 < 1e-18 ? 0 : d);

  const ca = (penetration * a.invMass) / invSum;
  const cb = (penetration * b.invMass) / invSum;
  a.x -= nx * ca;
  a.y -= ny * ca;
  b.x += nx * cb;
  b.y += ny * cb;

  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn >= 0) return true; // already separating

  const j = (-(1 + e) * vn) / invSum;
  a.vx -= j * nx * a.invMass;
  a.vy -= j * ny * a.invMass;
  b.vx += j * nx * b.invMass;
  b.vy += j * ny * b.invMass;
  return true;
}

/**
 * Collide a moving circle with an immovable circle (a peg) at (px, py) with radius pr.
 * Equivalent to collideCircles with an infinite-mass partner, without needing a peg object.
 */
export function collideWithStatic(a: Body, px: number, py: number, pr: number, e: number): boolean {
  let dx = a.x - px;
  let dy = a.y - py;
  const rs = a.r + pr;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rs * rs) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-9) {
    dx = 0;
    dy = -1;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  a.x = px + nx * rs;
  a.y = py + ny * rs;
  const vn = a.vx * nx + a.vy * ny;
  if (vn < 0) {
    a.vx -= (1 + e) * vn * nx;
    a.vy -= (1 + e) * vn * ny;
  }
  return true;
}
