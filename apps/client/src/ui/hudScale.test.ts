/**
 * 守衛：HUD 縮放**算子**（owner 2026-08-10 的七檔位）。
 *
 * 驗的是「同一個基準尺寸，不同檔位算出不同的實際 px，而可點擊的東西不會被縮到
 * 點不到」——⛔ 不驗任何出貨數值（52 / 364 / 184 都不准進斷言）。基準尺寸一律用
 * 夾具，兩個檔位互相比較，所以之後 owner 調 tile 大小這條守衛不會用錯誤的訊息紅。
 *
 * 承重的一行是 `hudScaleTappable` 的
 *   `Math.max(scaled, Math.min(px, touchTargetFloorPx))`
 * —— 突變（改成直接 `return scaled;`）已驗證會讓下面第三個斷言紅。
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_HUD_SCALE_TIER,
  hudScale,
  hudScalePolicy,
  hudScaleTappable,
} from "./hudScale";
import { migrateSettings } from "../settings/types";

describe("hudScale operator", () => {
  it("scales one base size per tier, and never shrinks a tappable one out of reach", () => {
    // 夾具，不是出貨值：一個「大到本來就超過觸控下限」的可點擊邊長。
    const tappableBase = hudScalePolicy().touchTargetFloorPx + 16;

    // ① 同一個輸入，兩個檔位算出不同的東西（縮放真的發生了）
    expect(hudScale(tappableBase, "max")).toBeGreaterThan(hudScale(tappableBase, "min"));
    // ② 「中」＝今天的行為，逐位元不變（不改設定的人畫面一格都不能變）
    expect(hudScale(tappableBase, "medium")).toBe(tappableBase);
    // ③ 承重：最小檔位仍然點得到（10% 會把它算成個位數 px）
    expect(hudScaleTappable(tappableBase, "min")).toBeGreaterThanOrEqual(
      hudScalePolicy().touchTargetFloorPx,
    );
    // ④ 下限只能往下擋：一個本來就小於下限的按鈕，在「中」不可以被放大
    const belowFloor = hudScalePolicy().touchTargetFloorPx - 8;
    expect(hudScaleTappable(belowFloor, "medium")).toBe(belowFloor);
  });

  it("a persisted blob from before the setting existed lands on 中", () => {
    expect(migrateSettings({ version: 4, graphics: {}, network: {} }).ui.hudScale).toBe(
      DEFAULT_HUD_SCALE_TIER,
    );
  });
});
