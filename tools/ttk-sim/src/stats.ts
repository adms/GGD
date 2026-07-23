/** Tiny numeric helpers for the TTK sweep (kept separate so they are unit-tested). */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function min(xs: readonly number[]): number {
  return xs.length ? Math.min(...xs) : NaN;
}

/** Linear-interpolated percentile (p in 0..100). */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 1) return s[0]!;
  const rank = (p / 100) * (s.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return s[lo]! + (s[hi]! - s[lo]!) * (rank - lo);
}

export function max(xs: readonly number[]): number {
  return xs.length ? Math.max(...xs) : NaN;
}

/**
 * Least-squares slope+intercept of y over x (y = k·x + b). Used to interpolate
 * the maxHealth that yields a target TTK, given the ~linear HP→TTK relationship
 * (fixed damage → time-to-kill scales linearly with pool size).
 */
export function linfit(xs: readonly number[], ys: readonly number[]): { k: number; b: number } {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return { k: NaN, b: NaN };
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  const k = den === 0 ? 0 : num / den;
  return { k, b: my - k * mx };
}

/** Invert y = k·x + b for x at a target y. */
export function solveX(fit: { k: number; b: number }, targetY: number): number {
  if (!Number.isFinite(fit.k) || fit.k === 0) return NaN;
  return (targetY - fit.b) / fit.k;
}
