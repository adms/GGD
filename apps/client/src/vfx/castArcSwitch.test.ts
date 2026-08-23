/**
 * ⚡ GH#571 —— 施法電弧的**總開關**真的到得了畫面（第一守則）。
 *
 * ⚠️ 這條補的是 lane L 自己報出來的唯一欠帳：機制落地了，而
 * `config.vfx-families@1.castArcs` 那一格當時不存在 ⇒ owner 覺得太吵時
 * 唯一的回頭路是**改程式 + 重建映像 + 一次部署**，⛔ 而那正是第一守則在防的東西。
 *
 * ⭐ 斷言的是**行為**：同一組 vfxKey、同一個座標，只因為那一格轉成 false，
 * `arcCastPlan` 就一道電弧都不生（⛔ 不是斷言「那個變數等於 false」，
 * 那是屬性不是行為 —— 第二守則失敗形態⑦）。
 *
 * ⛔ 一個數字都沒有進斷言：⛔ 不問生幾道（那取決於 `ARC_CAST_SELF_COUNT`
 * 與內容的 shape token，是 owner 會調的東西），只問「有 vs 沒有」。
 *
 * 突變（一條，承重線）:把 `arcCastPlan` 開頭的 `if (!arcCastEnabled) return [];`
 * 拿掉 → 紅（關掉之後照樣生電弧 ＝ 那一格是死旋鈕）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CAST_ARCS } from "@ggd/shared/content/schema/vfx";
import { arcCastPlan, castArcsEnabled, setCastArcsEnabled } from "./arcBolt";

/** 出貨內容真的在用的那一族鍵（雷神之槌的閃電就住在 vfxLayers 裡）。 */
const KEYS = ["fx.prim.lightning.beam-lg", "fx.prim.wind.tornado"];
const CASTER = { x: 3, z: 4 };
const POINT = { x: 12, z: 4 };

afterEach(() => setCastArcsEnabled(undefined));

describe("施法電弧的總開關（GH#571）", () => {
  it("⛔ 出貨預設是**關**的（owner 2026-08-23「請你預設關閉」）", () => {
    // ⚠️ 這一條在 2026-08-23 之前斷言的是「預設**開**」。owner 當天回報
    //    「第一回合就開始 lag」，而伺服器實測完全沒事（sim tick p99 2.8ms /
    //    預算 33.3ms、shedEvents 0、主機 load 0.24）⇒ 成本在客戶端。
    //    ⭐ 出貨預設翻面時，測試要跟著驗**新的預設**（第〇·六守則）。
    expect(castArcsEnabled()).toBe(DEFAULT_CAST_ARCS);
    expect(DEFAULT_CAST_ARCS, "出貨預設應該是關的").toBe(false);
    expect(arcCastPlan(KEYS, CASTER, POINT, 7, 1)).toEqual([]);
  });

  it("⭐ 後台轉開就真的生得出來（⇒ 它不是一格死旋鈕）", () => {
    setCastArcsEnabled(true);
    expect(
      arcCastPlan(KEYS, CASTER, POINT, 7, 1).length,
      "轉開了還是一道都不生 ⇒ 那一格存得起來、讀得回來、遊戲一輩子看不到",
    ).toBeGreaterThan(0);
  });

  it("後台留白（undefined）= 回到出貨預設，⛔ 不是關掉", () => {
    setCastArcsEnabled(false);
    setCastArcsEnabled(undefined);
    expect(castArcsEnabled()).toBe(DEFAULT_CAST_ARCS);
  });
});
