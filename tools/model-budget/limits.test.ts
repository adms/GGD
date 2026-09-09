/**
 * The budget lines are only trustworthy if their derivations are arithmetic, not
 * vibes. These tests pin each line to the formula the page prints beside it, so
 * a future edit that changes a number without changing its reason fails loudly.
 */
import { describe, expect, it } from "vitest";
import { HERO_MODEL_BUDGET } from "../../packages/shared/src/content/modelUpload/budget";
import {
  C_CHAN_MS,
  C_MESH_MS,
  ANIMATION_FRAME_MS,
  CHAMPION_CHANNEL_LIMIT,
  DERIVED_CHAMPION_CHANNEL_LIMIT,
  CHAMPION_INSTANCES,
  CHAN_LIMIT,
  COMBAT_FRAME_SPLIT,
  DERATE,
  FRAME_MS,
  GATES,
  LINES,
  MESH_LIMIT,
  TRI_LIMIT,
  TRI_WARN,
  TARGET,
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
  /**
   * ⭐⭐ GH#1164 —— 這一條在 2026-09-10 之前斷言「出貨上限**塞得進** 9 ms 的動畫切片」。
   *
   * > owner 2026-09-10（逐字）：「太低了 至少要有 300以上每個」「你改成 300 warning, 500 limit」
   *
   * ⇒ ⭐ 出貨值現在是**他指定的字面值**（`content/config/model-lod.json`），
   * ⛔ 而**不再**由這條公式推導 ⇒ 舊斷言必然紅，而它紅的**不是缺陷**。
   *
   * ⭐ 保留的是**公式本身仍然成立**（⛔ 不是刪掉它）：
   * `DERIVED_CHAMPION_CHANNEL_LIMIT` 照原本那組假設算出 160，
   * ⭐ 而它今天的角色是**診斷** —— 它讓「調高上限的代價」看得見。
   */
  it("推導本身仍然成立（⛔ 而它不再決定出貨值）", () => {
    // ⭐ 公式沒壞：照 3× 保守係數，12 名同場塞得進 9 ms
    expect(DERIVED_CHAMPION_CHANNEL_LIMIT * CHAMPION_INSTANCES * C_CHAN_MS * DERATE).toBeLessThanOrEqual(ANIMATION_FRAME_MS);
    expect((DERIVED_CHAMPION_CHANNEL_LIMIT + 10) * CHAMPION_INSTANCES * C_CHAN_MS * DERATE).toBeGreaterThan(ANIMATION_FRAME_MS);
    // ⭐ 而出貨值**高於**推導值 ⇒ 保守餘裕被刻意縮小了，⛔ 那是 owner 的裁決
    expect(CHAMPION_CHANNEL_LIMIT).toBeGreaterThan(DERIVED_CHAMPION_CHANNEL_LIMIT);
    expect(CHAN_LIMIT).toBe(CHAMPION_INSTANCES * CHAMPION_CHANNEL_LIMIT);
  });
  it("the supported tablet allocation totals one 30 fps frame", () => {
    expect(TARGET.fps).toBe(30);
    expect(TARGET.phonesSupported).toBe(false);
    expect(TARGET.performanceBasis).toBe("estimated");
    expect(TARGET.deviceBenchmarkRequired).toBe(false);
    expect(COMBAT_FRAME_SPLIT.reduce((sum, s) => sum + s.ms, 0)).toBeCloseTo(FRAME_MS, 8);
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
    for (const key of ["tris", "meshes", "texEdge", "channels"] as const) {
      expect(champ[key]).toEqual(HERO_MODEL_BUDGET[key]);
    }
    expect(champ.simultaneous).toBe(12);
    // texture edge is a hard 1024 ceiling, never higher
    expect(champ.texEdge.limit).toBe(1024);
  });
  it("arena decor gates' simultaneous counts are ENFORCED, not asserted here", () => {
    // ⛔ 這裡刻意不再寫 `toBe(50)`：出貨的擺放數是**量出來的**，而抄一份到測試裡
    // 就是第四個住處（它在 GH#362 加了散佈規則之後靜默過期了整整一版）。
    // 真正的守衛是 `placement.test.ts` —— 它逐張 arena 數，⛔ 不抄字面值。
    for (const role of ["arena-decor", "arena-decor-cc0"])
      expect(GATES.find((g) => g.role === role)!.simultaneous).toBeGreaterThan(0);
    // cc0 是「地標不是草」⇒ 它的除數必須比整片櫻花林小，否則開這條 gate 沒有意義。
    const cc0 = GATES.find((g) => g.role === "arena-decor-cc0")!;
    expect(cc0.simultaneous).toBeLessThan(GATES.find((g) => g.role === "arena-decor")!.simultaneous);
    expect(cc0.pathPrefix, "成員判準不見了 ⇒ 沒有任何檔案會走這條 gate").toBeTruthy();
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
