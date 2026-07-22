/**
 * Seeded deterministic PRNG (mulberry32). The ONLY source of randomness allowed
 * inside the simulation — `Math.random()` is banned in `sim/**`. The RNG state is
 * part of world state, so a match is fully reproducible from `(seed, inputs)`.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Raw 32-bit state for snapshotting / reproducibility checks. */
  get state(): number {
    return this.s >>> 0;
  }
  set state(v: number) {
    this.s = v >>> 0;
  }

  /** Fork a child RNG deterministically (e.g. per-seat streams). */
  fork(salt: number): Rng {
    return new Rng((this.state ^ Math.imul(salt | 1, 0x9e3779b1)) >>> 0);
  }
}
