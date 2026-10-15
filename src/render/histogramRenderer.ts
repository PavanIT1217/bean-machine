import { normalPdf } from '../stats/binomial';
import type { Tally } from '../stats/tally';
import type { Palette } from './palette';

/** Compact histogram of observed proportions with binomial markers and the normal curve. */
export class HistogramRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private palette: Palette,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
  }

  setPalette(p: Palette): void {
    this.palette = p;
  }

  resize(cssW: number, cssH: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = cssW;
    this.h = cssH;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
  }

  draw(tally: Tally, pmf: Float64Array, rows: number, bias: number): void {
    const { ctx, w, h, palette } = this;
    if (w === 0) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const bins = rows + 1;
    const padB = 16;
    const padT = 6;
    const plotH = h - padB - padT;
    const bw = w / bins;
    let maxP = 0;
    for (let j = 0; j < bins; j++) {
      maxP = Math.max(maxP, pmf[j]);
      if (tally.total > 0) maxP = Math.max(maxP, tally.counts[j] / tally.total);
    }
    maxP = maxP * 1.1 || 1;
    const y = (p: number) => padT + plotH * (1 - p / maxP);

    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, padT + plotH + 0.5);
    ctx.lineTo(w, padT + plotH + 0.5);
    ctx.stroke();

    if (tally.total > 0) {
      ctx.fillStyle = palette.bar;
      for (let j = 0; j < bins; j++) {
        const p = tally.counts[j] / tally.total;
        const top = y(p);
        ctx.fillRect(j * bw + bw * 0.12, top, bw * 0.76, padT + plotH - top);
      }
    }

    const mu = rows * bias;
    const sd = Math.sqrt(rows * bias * (1 - bias));
    ctx.strokeStyle = palette.curve;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= w; px += 2) {
      const k = px / bw - 0.5;
      const py = y(normalPdf(k, mu, sd));
      if (px === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.fillStyle = palette.binomial;
    for (let j = 0; j < bins; j++) {
      ctx.beginPath();
      ctx.arc((j + 0.5) * bw, y(pmf[j]), Math.min(3.5, bw * 0.25), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = palette.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const step = bins > 16 ? 5 : bins > 9 ? 2 : 1;
    for (let j = 0; j < bins; j += step) ctx.fillText(String(j), (j + 0.5) * bw, h);
  }
}
