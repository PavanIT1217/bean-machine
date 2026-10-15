/**
 * Shared constants. The physics world uses "peg units": horizontal peg spacing = 1.
 * Everything else (radii, gravity, bin sizes) is expressed relative to that, so the
 * simulation behaves identically at any screen size; the renderer only scales.
 */
export const ROW_HEIGHT = Math.sqrt(3) / 2;
export const BALL_RADIUS = 0.15;
/** Settled balls are drawn (and packed) a little smaller so piles read as dense stacks. */
export const PILE_BALL_RADIUS = 0.1;
export const PEG_RADIUS = 0.1;
export const WALL_HALF_WIDTH = 0.03;
/** Spawn point (centre) above the first peg. */
export const SPAWN_Y = -1.1;
/** Hexagon circumradius: pointy-top hexes of width 1 tile exactly onto the peg lattice. */
export const HEX_SIZE = 1 / Math.sqrt(3);
/** Vertical gap between the last peg row and the top of the bin walls (below the honeycomb). */
export const BIN_TOP_GAP = 2 * HEX_SIZE + 0.2;
/** Gravity in peg units / s² at the 1× setting. */
export const BASE_GRAVITY = 30;
export const MAX_SPEED = 25;
/** Physics substep, seconds. */
export const SUBSTEP = 1 / 240;
/** Maximum balls simulated simultaneously (pool size). */
export const MAX_ACTIVE_BALLS = 1500;

export const MIN_ROWS = 5;
export const MAX_ROWS = 30;

export interface Settings {
  rows: number;
  ballCount: number;
  dropRate: number;
  bounciness: number;
  bias: number;
  gravity: number;
  /** Simulation time scale (0.5×, 1×, 2×). */
  speed: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  rows: 10,
  ballCount: 1000,
  dropRate: 25,
  bounciness: 0.45,
  bias: 0.5,
  gravity: 1,
  speed: 1,
};

/** Values offered by the ball-count stepper. */
export const BALL_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000] as const;
