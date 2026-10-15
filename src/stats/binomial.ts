import type { Rng } from '../core/rng';

const logFactorialCache: number[] = [0, 0];

/** ln(n!) for non-negative integer n, memoised. */
export function logFactorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`logFactorial: invalid n=${n}`);
  for (let i = logFactorialCache.length; i <= n; i++) {
    logFactorialCache[i] = logFactorialCache[i - 1] + Math.log(i);
  }
  return logFactorialCache[n];
}

/** Exact binomial coefficient C(n, k) (exact for all n ≤ 60). */
export function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const m = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= m; i++) {
    result = (result * (n - m + i)) / i;
  }
  return Math.round(result);
}

/** P(X = k) for X ~ Binomial(n, p), computed in log-space for stability. */
export function binomialPmf(n: number, k: number, p: number): number {
  if (k < 0 || k > n) return 0;
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  const logC = logFactorial(n) - logFactorial(k) - logFactorial(n - k);
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log1p(-p));
}

/** Full pmf for k = 0..n. Writes into `out` when provided (no allocation). */
export function binomialDistribution(n: number, p: number, out?: Float64Array): Float64Array {
  const pmf = out && out.length >= n + 1 ? out : new Float64Array(n + 1);
  for (let k = 0; k <= n; k++) pmf[k] = binomialPmf(n, k, p);
  return pmf;
}

export const binomialMean = (n: number, p: number): number => n * p;
export const binomialVariance = (n: number, p: number): number => n * p * (1 - p);
export const binomialStdDev = (n: number, p: number): number => Math.sqrt(binomialVariance(n, p));

/** Normal probability density. */
export function normalPdf(x: number, mean: number, stdDev: number): number {
  if (stdDev <= 0) return x === mean ? Infinity : 0;
  const z = (x - mean) / stdDev;
  return Math.exp(-0.5 * z * z) / (stdDev * Math.sqrt(2 * Math.PI));
}

/** Draw one Binomial(n, p) sample as a sum of Bernoulli trials (n is small here). */
export function sampleBinomial(n: number, p: number, rng: Rng): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng() < p) k++;
  return k;
}

/**
 * Drop `balls` balls statistically and accumulate bin counts into `out` (length ≥ n+1).
 * Uses inverse-CDF sampling: one uniform per ball, so 1M balls take a few ms.
 */
export function sampleBinomialCounts(
  n: number,
  p: number,
  balls: number,
  rng: Rng,
  out: Float64Array,
  cdfScratch: Float64Array = new Float64Array(n + 1),
): Float64Array {
  let acc = 0;
  for (let k = 0; k <= n; k++) {
    acc += binomialPmf(n, k, p);
    cdfScratch[k] = acc;
  }
  cdfScratch[n] = 1;
  for (let b = 0; b < balls; b++) {
    const u = rng();
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (u < cdfScratch[mid]) hi = mid;
      else lo = mid + 1;
    }
    out[lo] += 1;
  }
  return out;
}
