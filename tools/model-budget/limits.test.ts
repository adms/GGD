/**
 * The budget lines are only trustworthy if their derivations are arithmetic, not
 * vibes. These tests pin each line to the formula the page prints beside it, so
 * a future edit that changes a number without changing its reason fails loudly.
 */
import { describe, expect, it } from "vitest";
import {
  C_CHAN_MS,
  C_MESH_MS,
  CHAN_LIMIT,
  DERATE,
  GATES,
  LINES,
  MESH_LIMIT,
  TRI_LIMIT,
  TRI_WARN,
  verdict,
} from "./limits";

describe("cost constants come from the measurements, not round numbers", () => {
  it("c_mesh is the #80 A/B slope", () => {
    expect(C_MESH_MS).toBeCloseTo((9.2 - 5.6) / (713 - 279), 6);
  });
  it("c_chan is the #99 runtime probe", () => {
    expect(C_CHAN_MS).toBeCloseTo(2.19 / 1476, 6);
  });
});

describe("scene lines are the frame slice divided by the derated constant", () => {
  it("mesh line = 6 ms budget, within one rounding step", () => {
    expect(Math.abs(MESH_LIMIT - 6.0 / (C_MESH_MS * DERATE))).toBeLessThan(10);
  });
  it("channel line = 3 ms budget", () => {
    expect(Math.abs(CHAN_LIMIT - 3.0 / (C_CHAN_MS * DERATE))).toBeLessThan(20);
  });
  it("worst frame the current assets can build stays under the triangle line", () => {
    // 12 × heaviest asset (dragon2 19,542) + heaviest arena ≈ 289k
    expect(12 * 19542 + 65000).toBeLessThan(TRI_LIMIT);
    expect(TRI_WARN).toBeLessThan(TRI_LIMIT);
  });
});

describe("every line and gate carries its derivation string", () => {
  it("no line ships without a why", () => {
    for (const l of LINES) expect(l.why.length).toBeGreaterThan(20);
  });
  it("no gate ships without a why or a simultaneous-count justification", () => {
    for (const g of GATES) {
      expect(g.why.length).toBeGreaterThan(20);
      expect(g.simultaneousWhy.length).toBeGreaterThan(10);
      expect(g.simultaneous).toBeGreaterThan(0);
    }
  });
});

describe("per-import gates are the scene budget divided by simultaneous count", () => {
  it("champion gate assumes 12 seats with duplicate picks legal", () => {
    const champ = GATES.find((g) => g.role === "champion")!;
    expect(champ.simultaneous).toBe(12);
    // texture edge is a hard 1024 ceiling, never higher
    expect(champ.texEdge.limit).toBe(1024);
  });
  it("arena decor gate assumes godie's 50 trees", () => {
    expect(GATES.find((g) => g.role === "arena-decor")!.simultaneous).toBe(50);
  });
  it("bulk-placed props are forbidden a skeleton (channels limit 0)", () => {
    expect(GATES.find((g) => g.role === "arena-decor")!.channels.limit).toBe(0);
    expect(GATES.find((g) => g.role === "intermission-prop")!.channels.limit).toBe(0);
  });
});

describe("verdict is monotonic and treats the boundary as inclusive of the lower band", () => {
  it("at/below warn is ok", () => expect(verdict(10, 10, 20)).toBe("ok"));
  it("between warn and limit is warn", () => expect(verdict(15, 10, 20)).toBe("warn"));
  it("at limit is still warn (not over)", () => expect(verdict(20, 10, 20)).toBe("warn"));
  it("above limit is over", () => expect(verdict(21, 10, 20)).toBe("over"));
});
