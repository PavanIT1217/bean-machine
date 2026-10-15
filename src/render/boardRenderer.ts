import { BALL_RADIUS, HEX_SIZE, PILE_BALL_RADIUS, PEG_RADIUS, ROW_HEIGHT, SPAWN_Y, WALL_HALF_WIDTH } from '../core/config';
import type { World } from '../physics/world';
import { binomialCoefficient, normalPdf } from '../stats/binomial';
import type { Palette } from './palette';
import { makeSphereSprite } from './sprites';

const SIDE_MARGIN = 0.3;
const TOP_MARGIN = 1.0;
const BOTTOM_MARGIN = 0.15;
const DROPPER_Y = SPAWN_Y - 0.55;
const DROPPER_R = 0.22;
const MIN_NUMBER_PX = 6;

export interface Layout {
  /** CSS pixels per peg unit. */
  scale: number;
  originX: number;
  originY: number;
  binHeight: number;
}

export interface BoardOptions {
  showNumbers: boolean;
  showCurve: boolean;
}

/**
 * Draws the board in two passes:
 *  - a cached backdrop holding the static board (honeycomb, Pascal numbers, pegs, bins)
 *    plus the settled pile. Landed balls are only *appended* to it; it is rebuilt from
 *    scratch only on resize, theme, option, row or pile-scale changes, so thousands of
 *    settled balls cost one blit per frame;
 *  - per-frame balls in flight (cached sphere sprites + one trail stroke) and the curve.
 */
export class BoardRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly backdrop = document.createElement('canvas');
  private readonly backCtx: CanvasRenderingContext2D;
  private ballSprite: HTMLCanvasElement | null = null;
  private pegSprite: HTMLCanvasElement | null = null;
  private drawnDots = new Int32Array(0);
  private pileVersion = -1;
  private staticKey = '';
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  layout: Layout = { scale: 1, originX: 0, originY: 0, binHeight: 4 };
  options: BoardOptions = { showNumbers: true, showCurve: true };
  /** Upper bound on device pixel ratio; lowered by the app's quality governor on slow devices. */
  maxPixelRatio = 2;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private palette: Palette,
  ) {
    this.ctx = get2d(canvas);
    this.backCtx = get2d(this.backdrop);
  }

  setPalette(palette: Palette): void {
    this.palette = palette;
    this.invalidate();
  }

  setOptions(options: Partial<BoardOptions>): void {
    this.options = { ...this.options, ...options };
    this.invalidate();
  }

  invalidate(): void {
    this.staticKey = '';
    this.ballSprite = null;
  }

  /** Fit the board to the canvas. Returns the layout, including the bin height the world should use. */
  resize(cssW: number, cssH: number, rows: number): Layout {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    const pw = Math.round(this.cssW * this.dpr);
    const ph = Math.round(this.cssH * this.dpr);
    for (const c of [this.canvas, this.backdrop]) {
      if (c.width !== pw || c.height !== ph) {
        c.width = pw;
        c.height = ph;
      }
    }

    const top = DROPPER_Y - TOP_MARGIN + 0.5;
    const pegSpan = (rows - 1) * ROW_HEIGHT + 2 * HEX_SIZE + 0.2 - top; // dropper → top of bins
    const worldW = rows + 1 + 2 * SIDE_MARGIN;
    const minBin = Math.max(3, rows * 0.36);
    const maxBin = Math.max(5, rows * 0.7);
    const scale = Math.min(this.cssW / worldW, this.cssH / (pegSpan + minBin + BOTTOM_MARGIN));
    const binHeight = Math.min(maxBin, this.cssH / scale - pegSpan - BOTTOM_MARGIN);
    const usedH = (pegSpan + binHeight + BOTTOM_MARGIN) * scale;
    this.layout = {
      scale,
      originX: this.cssW / 2,
      originY: (this.cssH - usedH) / 2 - top * scale,
      binHeight,
    };
    this.invalidate();
    return this.layout;
  }

  private applyWorldTransform(ctx: CanvasRenderingContext2D): void {
    const { scale, originX, originY } = this.layout;
    const s = scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, originX * this.dpr, originY * this.dpr);
  }

  private ensureSprites(): void {
    if (this.ballSprite && this.pegSprite) return;
    const px = this.layout.scale * this.dpr;
    const p = this.palette;
    this.ballSprite = makeSphereSprite(BALL_RADIUS * px, p.ballLight, p.ball, p.ballDark);
    this.pegSprite = makeSphereSprite(Math.max(PEG_RADIUS, DROPPER_R) * px, p.pegLight, p.peg, p.pegDark);
  }

  draw(world: World, bias: number): void {
    const ctx = this.ctx;
    this.ensureSprites();
    const key = `${world.rows}|${world.binHeight}|${this.canvas.width}x${this.canvas.height}`;
    if (key !== this.staticKey || world.pile.version !== this.pileVersion) {
      this.drawStatic(world);
      this.drawnDots.fill(0);
      this.staticKey = key;
      this.pileVersion = world.pile.version;
    }
    this.updatePile(world);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop, 0, 0);

    this.applyWorldTransform(ctx);
    if (this.options.showCurve) this.drawCurve(world, bias);
    this.drawBalls(world);
  }

  private drawStatic(world: World): void {
    const ctx = this.backCtx;
    const p = this.palette;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = p.board;
    ctx.fillRect(0, 0, this.backdrop.width, this.backdrop.height);
    this.applyWorldTransform(ctx);
    const rows = world.rows;
    const s = HEX_SIZE;
    const hw = 0.5; // half hex width

    // Honeycomb: cell (r, k) hangs from peg (r, k) — its top vertex is the peg — so the
    // routes a ball can take run exactly along the cell edges.
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      const cy = world.pegY(r) + s;
      for (let k = 0; k <= r; k++) {
        const cx = world.pegX(r, k);
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + hw, cy - s / 2);
        ctx.lineTo(cx + hw, cy + s / 2);
        ctx.lineTo(cx, cy + s);
        ctx.lineTo(cx - hw, cy + s / 2);
        ctx.lineTo(cx - hw, cy - s / 2);
        ctx.closePath();
      }
    }
    ctx.fillStyle = p.hexFill;
    ctx.fill();
    ctx.strokeStyle = p.hexLine;
    ctx.lineWidth = 0.035;
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (this.options.showNumbers) this.drawNumbers(world);

    // Pegs (gold spheres at each cell's top vertex), plus small joints at the side vertices.
    const peg = this.pegSprite!;
    ctx.fillStyle = p.hexLine;
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      const y = world.pegY(r) + s / 2;
      for (let k = 0; k <= r + 1; k++) {
        const x = k - (r + 1) / 2;
        ctx.moveTo(x + 0.045, y);
        ctx.arc(x, y, 0.045, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    for (let r = 0; r < rows; r++) {
      const y = world.pegY(r);
      for (let k = 0; k <= r; k++) {
        const x = world.pegX(r, k);
        ctx.drawImage(peg, x - PEG_RADIUS, y - PEG_RADIUS, 2 * PEG_RADIUS, 2 * PEG_RADIUS);
      }
    }

    // Dropper: a gold ball with a dotted trail above the first peg.
    ctx.drawImage(peg, -DROPPER_R, DROPPER_Y - DROPPER_R, 2 * DROPPER_R, 2 * DROPPER_R);
    ctx.fillStyle = p.binLine;
    ctx.beginPath();
    for (const dy of [0.35, 0.52]) {
      ctx.moveTo(0.04, DROPPER_Y + dy);
      ctx.arc(0, DROPPER_Y + dy, 0.04, 0, Math.PI * 2);
    }
    ctx.fill();

    // Bins: thin dividers plus a floor line.
    const top = world.binTop;
    const bottom = world.binBottom;
    ctx.fillStyle = p.binLine;
    const lw = Math.max(WALL_HALF_WIDTH * 0.6, 0.7 / this.layout.scale);
    for (let j = 0; j <= rows + 1; j++) {
      const x = j - (rows + 1) / 2;
      ctx.fillRect(x - lw / 2, top, lw, bottom - top);
    }
    ctx.fillRect(-world.halfWidth, bottom, 2 * world.halfWidth, lw * 1.5);
  }

  private drawNumbers(world: World): void {
    const ctx = this.backCtx;
    const rows = world.rows;
    const maxW = 0.82;
    let font = 0.36;
    // Shrink the font until the widest coefficient fits in a cell.
    ctx.font = `600 ${font}px system-ui, -apple-system, sans-serif`;
    const widest = ctx.measureText(String(binomialCoefficient(rows - 1, Math.floor((rows - 1) / 2)))).width;
    if (widest > maxW) font *= maxW / widest;
    if (font * this.layout.scale < MIN_NUMBER_PX) return;
    ctx.font = `600 ${font}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = this.palette.number;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < rows; r++) {
      const cy = world.pegY(r) + HEX_SIZE;
      for (let k = 0; k <= r; k++) {
        ctx.fillText(String(binomialCoefficient(r, k)), world.pegX(r, k), cy + font * 0.04);
      }
    }
  }

  private updatePile(world: World): void {
    const pile = world.pile;
    const counts = world.tally.counts;
    const ctx = this.backCtx;
    const sprite = this.ballSprite!;
    if (this.drawnDots.length !== counts.length) this.drawnDots = new Int32Array(counts.length);
    this.applyWorldTransform(ctx);
    const bottom = world.binBottom;
    const r = PILE_BALL_RADIUS;
    for (let j = 0; j < counts.length; j++) {
      const target = pile.dots(counts[j]);
      let drawn = this.drawnDots[j];
      if (drawn >= target) continue;
      const cx = world.binCenter(j);
      for (; drawn < target; drawn++) {
        const x = cx + pile.slotX(drawn);
        const y = bottom - pile.slotY(drawn);
        ctx.drawImage(sprite, x - r, y - r, 2 * r, 2 * r); // cached layer: cost paid once per ball
      }
      this.drawnDots[j] = drawn;
    }
  }

  private drawBalls(world: World): void {
    const { balls, active, activeCount } = world.pool;
    if (activeCount === 0) return;
    const ctx = this.ctx;

    // Motion trails: one stroke for all balls.
    ctx.strokeStyle = this.palette.trail;
    ctx.lineWidth = BALL_RADIUS * 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < activeCount; i++) {
      const b = balls[active[i]];
      const sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 < 4) continue;
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035);
    }
    ctx.stroke();

    // Sprites are blitted unscaled in device pixels: the cheapest drawImage path.
    const sprite = this.ballSprite!;
    const k = this.layout.scale * this.dpr;
    const ox = this.layout.originX * this.dpr - sprite.width / 2;
    const oy = this.layout.originY * this.dpr - sprite.height / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < activeCount; i++) {
      const b = balls[active[i]];
      ctx.drawImage(sprite, (ox + b.x * k) | 0, (oy + b.y * k) | 0);
    }
    this.applyWorldTransform(ctx);
  }

  /** Normal approximation scaled to the pile, drawn as a smooth gold curve over the bins. */
  private drawCurve(world: World, bias: number): void {
    const total = world.tally.total;
    const ctx = this.ctx;
    const pile = world.pile;
    const bottom = world.binBottom;
    const n = world.rows;
    const mu = n * bias;
    const sd = Math.sqrt(n * bias * (1 - bias));
    const peak = normalPdf(mu, mu, sd);
    // Expected pile height for a density value; before any ball lands, preview the shape.
    const toY = (density: number) =>
      total > 0
        ? bottom - Math.min(world.binHeight, pile.heightForDots((total * density) / pile.ballsPerDot))
        : bottom - 0.8 * world.binHeight * (density / peak);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.palette.curve;
    ctx.globalAlpha = total > 0 ? 1 : 0.45;
    ctx.lineWidth = Math.max(0.05, 1.6 / this.layout.scale);
    ctx.beginPath();
    const steps = (n + 1) * 10;
    for (let s = 0; s <= steps; s++) {
      const k = -0.5 + (s / steps) * (n + 1);
      const y = toY(normalPdf(k, mu, sd));
      const x = world.binCenter(0) + k;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function get2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is not supported');
  return ctx;
}
