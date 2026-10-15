import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import {
  binomialCoefficient,
  binomialDistribution,
  binomialMean,
  binomialPmf,
  binomialStdDev,
  binomialVariance,
  logFactorial,
  normalPdf,
  sampleBinomial,
  sampleBinomialCounts,
} from '../src/stats/binomial';

describe('binomial coefficients', () => {
  it('matches known values', () => {
    expect(binomialCoefficient(4, 2)).toBe(6);
    expect(binomialCoefficient(10, 3)).toBe(120);
    expect(binomialCoefficient(30, 15)).toBe(155117520);
    expect(binomialCoefficient(5, 0)).toBe(1);
    expect(binomialCoefficient(5, 5)).toBe(1);
    expect(binomialCoefficient(5, 6)).toBe(0);
    expect(binomialCoefficient(5, -1)).toBe(0);
  });

  it('satisfies Pascal’s rule', () => {
    for (let n = 1; n <= 30; n++) {
      for (let k = 1; k < n; k++) {
        expect(binomialCoefficient(n, k)).toBe(binomialCoefficient(n - 1, k - 1) + binomialCoefficient(n - 1, k));
      }
    }
  });

  it('logFactorial agrees with direct products and rejects bad input', () => {
    expect(logFactorial(0)).toBe(0);
    expect(logFactorial(5)).toBeCloseTo(Math.log(120), 12);
    expect(() => logFactorial(-1)).toThrow(RangeError);
    expect(() => logFactorial(1.5)).toThrow(RangeError);
  });
});

describe('binomial pmf', () => {
  it('gives exact values for a fair 4-row board', () => {
    const expected = [1, 4, 6, 4, 1].map((c) => c / 16);
    expected.forEach((v, k) => expect(binomialPmf(4, k, 0.5)).toBeCloseTo(v, 14));
  });

  it('sums to 1 for every supported row count and bias', () => {
    for (let n = 5; n <= 30; n++) {
      for (const p of [0.3, 0.5, 0.7]) {
        const pmf = binomialDistribution(n, p);
        expect(pmf.length).toBe(n + 1);
        expect(pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      }
    }
  });

  it('is symmetric at p = 0.5 and mirrored for p and 1 − p', () => {
    const n = 17;
    for (let k = 0; k <= n; k++) {
      expect(binomialPmf(n, k, 0.5)).toBeCloseTo(binomialPmf(n, n - k, 0.5), 15);
      expect(binomialPmf(n, k, 0.3)).toBeCloseTo(binomialPmf(n, n - k, 0.7), 15);
    }
  });

  it('handles degenerate probabilities and out-of-range k', () => {
    expect(binomialPmf(10, 0, 0)).toBe(1);
    expect(binomialPmf(10, 3, 0)).toBe(0);
    expect(binomialPmf(10, 10, 1)).toBe(1);
    expect(binomialPmf(10, 11, 0.5)).toBe(0);
  });

  it('reuses the output buffer when it is large enough', () => {
    const buf = new Float64Array(40);
    expect(binomialDistribution(12, 0.5, buf)).toBe(buf);
  });

  it('has the textbook mean and variance', () => {
    for (const [n, p] of [[12, 0.5], [30, 0.3], [5, 0.7]] as const) {
      const pmf = binomialDistribution(n, p);
      let m = 0;
      let v = 0;
      pmf.forEach((q, k) => (m += k * q));
      pmf.forEach((q, k) => (v += (k - m) ** 2 * q));
      expect(m).toBeCloseTo(binomialMean(n, p), 10);
      expect(v).toBeCloseTo(binomialVariance(n, p), 10);
      expect(binomialStdDev(n, p)).toBeCloseTo(Math.sqrt(n * p * (1 - p)), 12);
    }
  });
});

describe('normal approximation', () => {
  it('integrates to ~1 and peaks at the mean', () => {
    let area = 0;
    for (let x = -10; x <= 10; x += 0.001) area += normalPdf(x, 0, 1) * 0.001;
    expect(area).toBeCloseTo(1, 4);
    expect(normalPdf(0, 0, 1)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 12);
    expect(normalPdf(3, 3, 2)).toBeGreaterThan(normalPdf(4, 3, 2));
  });

  it('approximates the binomial pmf for large n (de Moivre–Laplace)', () => {
    const n = 30;
    const p = 0.5;
    const mu = binomialMean(n, p);
    const sd = binomialStdDev(n, p);
    for (let k = 10; k <= 20; k++) {
      expect(Math.abs(normalPdf(k, mu, sd) - binomialPmf(n, k, p))).toBeLessThan(0.003);
    }
  });
});

describe('sampling', () => {
  it('single samples stay in range and average to np', () => {
    const rng = mulberry32(42);
    let sum = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const k = sampleBinomial(12, 0.7, rng);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(12);
      sum += k;
    }
    expect(sum / N).toBeCloseTo(8.4, 1);
  });

  it('fast-mode counts match the pmf for 100k balls', () => {
    const n = 20;
    const p = 0.4;
    const N = 100_000;
    const counts = sampleBinomialCounts(n, p, N, mulberry32(7), new Float64Array(n + 1));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(N);
    const pmf = binomialDistribution(n, p);
    let tvd = 0;
    for (let k = 0; k <= n; k++) tvd += Math.abs(counts[k] / N - pmf[k]);
    expect(tvd / 2).toBeLessThan(0.01);
  });

  it('is deterministic for a fixed seed', () => {
    const a = sampleBinomialCounts(10, 0.5, 1000, mulberry32(1), new Float64Array(11));
    const b = sampleBinomialCounts(10, 0.5, 1000, mulberry32(1), new Float64Array(11));
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
