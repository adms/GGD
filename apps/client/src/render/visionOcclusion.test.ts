/**
 * ⭐【全視野】的渲染那一半 —— owner 2026-08-23：
 * 「理論上這個地圖是**全視野，就算牆後也看得到**⋯我卻**看不到**也打不到」。
 *
 * ⚠️ 這一支在 2026-08-23 之前驗的是**相反**的事（GH#324「躲在牆後的敵人不畫」），
 * 而且它驗的是一份**自己抄的** `occluded` 純函式，⛔ 不是出貨的 `occludeArgsFor`
 * （失敗形態⑥：測的不是出貨的那個）。原文留在
 * `docs/legacy/_overwrites/` 的自動留底裡。
 *
 * ⚠️ 遮蔽從頭到尾就**不是權威視野**：伺服器照樣把每個人的位置送給每個人
 * （快照是一份共用 state）。所以關掉它一格資訊都沒有多送 —— 它只是不再把
 * 已經送到的東西藏起來。
 *
 * 突變紀錄：`occludeArgsFor` 的 `if (rules.fullVision) return undefined;` 刪掉
 * → 第一條紅（＝ owner 抱怨的那個畫面回來）。
 */
import { describe, it, expect } from "vitest";
import type { ZoneDef } from "@ggd/shared/sim/world/ArenaDef";
import { DEFAULT_VISION_RULES } from "@ggd/shared/sim/vision";
import { occludeArgsFor } from "./occlusionZone";

/** 一面實心牆橫在 z=0，觀看者在南邊。 */
const ZONE: ZoneDef = {
  id: "zone-0",
  center: { x: 0, z: 0 },
  boundaryRadius: 24,
  obstacles: [{ kind: "box", center: { x: 0, z: 0 }, halfW: 6, halfD: 0.5 }],
  spawns: [[{ x: 0, z: -6 }], [{ x: 0, z: 6 }]],
  bounds: { kind: "rect", halfW: 24, halfD: 24 },
};
const ME = { x: 0, z: -4 };

describe("全視野的渲染那一半（owner 2026-08-23）", () => {
  it("⭐ 出貨規則：一格都不遮 —— 牆後的敵人照樣畫出來", () => {
    expect(occludeArgsFor([ZONE], 0, ME, 0, DEFAULT_VISION_RULES)).toBeUndefined();
  });

  it("⭐ 關掉它就是一鍵 rollback：GH#324 的遮蔽逐位元回來", () => {
    const args = occludeArgsFor([ZONE], 0, ME, 0, {
      ...DEFAULT_VISION_RULES,
      fullVision: false,
    });
    // 牆後被遮，而牆的兩端之外沒有 —— 證明它不是「一律遮」。
    expect(args?.blocked(0, 4)).toBe(true);
    expect(args?.blocked(10, -4)).toBe(false);
  });
});
