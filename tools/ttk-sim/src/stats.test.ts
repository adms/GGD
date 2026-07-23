import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { mean, median, min, max, percentile, linfit, solveX } from "./stats";

describe("stats", () => {
  it("covers ttk-stats", () => cover("ttk-stats"));

  it("mean/median/min/max", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(min([3, 1, 2])).toBe(1);
    expect(max([3, 1, 2])).toBe(3);
  });

  it("empty inputs are NaN, not throws", () => {
    expect(Number.isNaN(mean([]))).toBe(true);
    expect(Number.isNaN(median([]))).toBe(true);
    expect(Number.isNaN(min([]))).toBe(true);
    expect(Number.isNaN(percentile([], 10))).toBe(true);
  });

  it("percentile interpolates", () => {
    expect(percentile([10], 50)).toBe(10);
    expect(percentile([0, 100], 10)).toBeCloseTo(10, 6);
    expect(percentile([0, 10, 20, 30, 40], 50)).toBe(20);
  });

  it("linfit recovers a known line and solveX inverts it", () => {
    // y = 10x - 5
    const xs = [4, 8, 12, 16];
    const ys = xs.map((x) => 10 * x - 5);
    const fit = linfit(xs, ys);
    expect(fit.k).toBeCloseTo(10, 6);
    expect(fit.b).toBeCloseTo(-5, 6);
    expect(solveX(fit, 180)).toBeCloseTo(18.5, 6);
  });
});
