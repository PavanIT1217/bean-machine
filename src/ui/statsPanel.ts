import { binomialMean, binomialStdDev } from '../stats/binomial';
import type { Tally } from '../stats/tally';
import { byId } from './dom';

const fmt = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '—');
const fmtInt = (v: number) => Math.round(v).toLocaleString();

const IDS = [
  'stat-dropped',
  'stat-inflight',
  'stat-mean-obs',
  'stat-mean-exp',
  'stat-sd-obs',
  'stat-sd-exp',
  'stat-tvd',
  'stat-scale',
  'live-dropped',
  'live-mean',
  'live-mean-exp',
  'live-sd',
  'live-sd-exp',
  'live-scale',
] as const;
type Id = (typeof IDS)[number];

/** Writes the stats table and the live strip. Only touches nodes whose text changed. */
export class StatsPanel {
  private readonly cells = Object.fromEntries(IDS.map((id) => [id, byId(id)])) as Record<Id, HTMLElement>;
  private readonly scaleWrap = byId('live-scale-wrap');
  private readonly cache = new Map<Id, string>();

  update(tally: Tally, pmf: Float64Array, rows: number, bias: number, inFlight: number, ballsPerDot: number): void {
    const mean = fmt(tally.mean());
    const meanExp = fmt(binomialMean(rows, bias));
    const sd = fmt(tally.stdDev());
    const sdExp = fmt(binomialStdDev(rows, bias));
    const dropped = fmtInt(tally.total);
    const tvd = tally.totalVariation(pmf);
    this.set('stat-dropped', dropped);
    this.set('stat-inflight', fmtInt(inFlight));
    this.set('stat-mean-obs', mean);
    this.set('stat-mean-exp', meanExp);
    this.set('stat-sd-obs', sd);
    this.set('stat-sd-exp', sdExp);
    this.set('stat-tvd', Number.isFinite(tvd) ? `${(tvd * 100).toFixed(1)}%` : '—');
    this.set('stat-scale', ballsPerDot === 1 ? '1 ball' : `${ballsPerDot.toLocaleString()} balls`);
    this.set('live-dropped', dropped);
    this.set('live-mean', mean);
    this.set('live-mean-exp', meanExp);
    this.set('live-sd', sd);
    this.set('live-sd-exp', sdExp);
    this.set('live-scale', ballsPerDot.toLocaleString());
    this.scaleWrap.hidden = ballsPerDot === 1;
  }

  private set(id: Id, text: string): void {
    if (this.cache.get(id) === text) return;
    this.cache.set(id, text);
    this.cells[id].textContent = text;
  }
}
