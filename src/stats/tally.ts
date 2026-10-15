/**
 * Running bin counts and moments for landed balls. Counts are Float64 so fast mode
 * can push millions of balls without overflow; moments update in O(1) per add.
 */
export class Tally {
  counts: Float64Array;
  total = 0;
  private sum = 0;
  private sumSq = 0;
  /** Increments whenever counts change; consumers use it to skip redundant work. */
  version = 0;

  constructor(bins: number) {
    this.counts = new Float64Array(bins);
  }

  get bins(): number {
    return this.counts.length;
  }

  reset(bins: number = this.counts.length): void {
    if (bins !== this.counts.length) this.counts = new Float64Array(bins);
    else this.counts.fill(0);
    this.total = 0;
    this.sum = 0;
    this.sumSq = 0;
    this.version++;
  }

  add(bin: number, amount = 1): void {
    this.counts[bin] += amount;
    this.total += amount;
    this.sum += bin * amount;
    this.sumSq += bin * bin * amount;
    this.version++;
  }

  /** Add a whole histogram (e.g. from fast mode). */
  addCounts(counts: ArrayLike<number>): void {
    for (let i = 0; i < counts.length; i++) if (counts[i] > 0) this.add(i, counts[i]);
  }

  maxCount(): number {
    let m = 0;
    for (let i = 0; i < this.counts.length; i++) if (this.counts[i] > m) m = this.counts[i];
    return m;
  }

  mean(): number {
    return this.total > 0 ? this.sum / this.total : NaN;
  }

  /** Sample variance (n − 1 denominator). */
  variance(): number {
    if (this.total < 2) return NaN;
    const m = this.sum / this.total;
    return Math.max(0, (this.sumSq - this.total * m * m) / (this.total - 1));
  }

  stdDev(): number {
    return Math.sqrt(this.variance());
  }

  /** Total variation distance between observed proportions and an expected pmf (0 = perfect). */
  totalVariation(pmf: ArrayLike<number>): number {
    if (this.total === 0) return NaN;
    let d = 0;
    for (let i = 0; i < this.counts.length; i++) d += Math.abs(this.counts[i] / this.total - pmf[i]);
    return d / 2;
  }

  /** Pearson chi-square statistic against an expected pmf (bins with tiny expectation skipped). */
  chiSquare(pmf: ArrayLike<number>): number {
    if (this.total === 0) return NaN;
    let chi = 0;
    for (let i = 0; i < this.counts.length; i++) {
      const e = pmf[i] * this.total;
      if (e < 1e-9) continue;
      const diff = this.counts[i] - e;
      chi += (diff * diff) / e;
    }
    return chi;
  }
}
