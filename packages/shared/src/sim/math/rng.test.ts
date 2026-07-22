import { describe, it, expect } from "vitest";
import { Rng } from "./rng";
import { cover } from "../../../testkit/cover";

describe("Rng (mulberry32)", () => {
  it("is deterministic: same seed -> identical sequence", () => {
    cover("sim-rng-deterministic"); // docs/todo/sim-determinism.md sim-01
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 1000 }, () => a.next());
    const seqB = Array.from({ length: 1000 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it("produces floats in [0,1)", () => {
    const r = new Rng(999);
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("int(n) stays in [0,n) and is roughly uniform", () => {
    const r = new Rng(7);
    const buckets = new Array(6).fill(0);
    const N = 60000;
    for (let i = 0; i < N; i++) {
      const v = r.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      buckets[v]++;
    }
    // each bucket should be within 10% of the expected 1/6
    for (const b of buckets) {
      expect(b).toBeGreaterThan((N / 6) * 0.9);
      expect(b).toBeLessThan((N / 6) * 1.1);
    }
  });

  it("state can be snapshotted and restored for replay", () => {
    cover("sim-rng-replay"); // docs/todo/sim-determinism.md sim-02
    const r = new Rng(42);
    for (let i = 0; i < 50; i++) r.next();
    const snapshot = r.state;
    const expected = Array.from({ length: 20 }, () => r.next());

    const restored = new Rng(0);
    restored.state = snapshot;
    const actual = Array.from({ length: 20 }, () => restored.next());
    expect(actual).toEqual(expected);
  });

  it("fork produces an independent but deterministic stream", () => {
    const parent1 = new Rng(100);
    const parent2 = new Rng(100);
    const c1 = parent1.fork(3);
    const c2 = parent2.fork(3);
    expect(c1.next()).toEqual(c2.next());
    // parent stream unaffected by fork content
    expect(parent1.next()).toEqual(parent2.next());
  });
});
