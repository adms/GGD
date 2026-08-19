/**
 * 【FATE 貼圖 token 是唯一的住處】（GH#453，owner 2026-08-19「貼圖也盡量 FATE」）
 *
 * ⭐ 驗的是**接線**：地面產生器與地面痕跡的顏色是不是真的從那一份 token 算出來的。
 * ⛔ 不驗「金色是不是 #C9A227」「obsidian 強度是不是 0.45」（第二守則：驗機制不驗
 * 數字）。體驗層 ⇒ 一條薄的，⛔ 不開對抗輪。
 * 突變紀錄（承重）：`styles.ts` 的 `RAW_GROUND_STYLES.map(fateGraded)` 換回
 * `RAW_GROUND_STYLES`（FATE 調色整個蒸發，PNG 照樣產得出來）→ 第二條紅（+0 vs 7）。
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  FATE_HEX,
  fateSplitTone,
  hexToLinear,
  luma,
  type FateHue,
  type Rgb,
} from "@ggd/shared/art/fatePalette";
import { GROUND_STYLES, RAW_GROUND_STYLES } from "../../scripts/texgen/styles";
import { GROUND_DECAL_ART } from "../vfx/feedbackPresets";

const REPO = resolve(__dirname, "../../../..");
/** 兩個顏色的**色相**差多遠：各自除以自己的總和（⇒ 跟深淺無關）再取曼哈頓距離。 */
const hueGap = (a: Rgb, b: Rgb): number => {
  const n = (c: Rgb): Rgb => {
    const s = c[0] + c[1] + c[2] || 1;
    return [c[0] / s, c[1] / s, c[2] / s];
  };
  const [x, y] = [n(a), n(b)];
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
};

describe("FATE 貼圖 token（GH#453）", () => {
  it("分離調色：暗部往靛藍、亮部往金，而且亮度不動", () => {
    const grey: Rgb = [0.05, 0.05, 0.05];
    const dark = fateSplitTone(grey, 1, 0.4, 1); // 落在區間之下 ⇒ 全暗部
    const bright = fateSplitTone(grey, 1, 0, 0.1); // 落在區間之上 ⇒ 全亮部
    expect(hueGap(dark, hexToLinear(FATE_HEX.indigo))).toBeLessThan(
      hueGap(dark, hexToLinear(FATE_HEX.gold)),
    );
    expect(hueGap(bright, hexToLinear(FATE_HEX.gold))).toBeLessThan(
      hueGap(bright, hexToLinear(FATE_HEX.indigo)),
    );
    // 手感住在亮度裡 —— 調色只轉色相，⛔ 不可以動到對比／起伏
    for (const c of [dark, bright]) expect(luma(c)).toBeCloseTo(luma(grey), 6);
  });

  it("出貨的地面 painter 真的被 token 調過色（⛔ 不是只有 raw）", () => {
    let moved = 0;
    for (let i = 0; i < GROUND_STYLES.length; i++) {
      const s = GROUND_STYLES[i]!;
      const raw = RAW_GROUND_STYLES[i]!;
      expect(s.id).toBe(raw.id);
      const a = s.paint(0.31, 0.62);
      const b = raw.paint(0.31, 0.62);
      if (hueGap([a.r, a.g, a.b], [b.r, b.g, b.b]) > 1e-9) moved++;
      // 結構（起伏／粗糙度）⛔ 一位元都不可以被調色動到
      expect(a.h).toBe(b.h);
      expect(a.rough).toBe(b.rough);
    }
    expect(moved).toBe(GROUND_STYLES.length);
  });

  it("地面痕跡：顏色從 token 推導，而且那三張圖真的在 disk 上", () => {
    const expected: Record<string, FateHue> = {
      scorch: "crimson",
      crack: "indigo",
      dirt: "gold",
    };
    for (const [kind, h] of Object.entries(expected)) {
      const art = GROUND_DECAL_ART[kind as keyof typeof GROUND_DECAL_ART];
      expect(art, kind).not.toBeNull();
      // 色相要逐比例等於 token 的那一格 —— 寫死一組 hex 回去就會紅
      expect(hueGap(art!.tint, hexToLinear(FATE_HEX[h])), kind).toBeLessThan(1e-6);
      expect(existsSync(join(REPO, "content", art!.texture)), art!.texture).toBe(true);
    }
  });
});
