/**
 * 🔍 燈箱守衛（GH#669 追加，owner 2026-08-27「按單張圖片可跳出放大至全螢幕」）。
 * 體驗層 ⇒ 一條薄的：① `stepFrame` 的夾住語意（⛔ 不迴圈 —— 迴圈會讓逐幀比對
 * 讀成「這一幀怎麼倒退了」）② 接線可撤銷性（形態③：把 FeatureReviewPage 的
 * onClick 刪掉，整個功能消失而其他測試全綠 —— 這一條就是為那個刪除而紅的）。
 * ── 突變：FeatureReviewPage 的 `setZoom({ batch: b.id, …)` 那行刪掉 → ② 紅。實測過。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stepFrame } from "./FrameLightbox";

describe("連續圖片燈箱 (frame-lightbox)", () => {
  it("① 夾住不迴圈：第 1 張再往左停住、最後一張再往右停住", () => {
    expect(stepFrame(0, -1, 5)).toBe(0);
    expect(stepFrame(4, 1, 5)).toBe(4);
    expect(stepFrame(2, 1, 5)).toBe(3);
    expect(stepFrame(2, -1, 5)).toBe(1);
    expect(stepFrame(0, 1, 0)).toBe(0); // 空清單不爆
  });

  it("② 縮圖真的接到燈箱（⛔ 刪掉 onClick 整個功能就消失，而沒有這條就沒有東西紅）", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "FeatureReviewPage.tsx"),
      "utf8",
    );
    expect(src, "縮圖的點擊沒有接到 setZoom —— 燈箱開不起來").toMatch(/onClick=\{\(\) => setZoom\(\{ batch: b\.id/);
    expect(src, "燈箱元件沒有被渲染 —— setZoom 設了也沒人畫").toContain("<FrameLightbox");
  });
});
