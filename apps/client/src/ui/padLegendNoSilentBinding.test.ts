/**
 * ⭐ 一條薄守衛：**手把上按得到的東西，畫面上一定要說得出來**（GH#1276）。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 它擋的是「反方向」那個洞
 * ---------------------------------------------------------------------------
 * `gamepadLegend()` 的迴圈從 **`probeGamepadButton(i)` 有回東西的鍵**那一頭走。
 * ⇒ 一顆**只**綁在焦點層、戰鬥表刻意留空的鍵（View/Back → HUD 焦點模式）
 * **結構上進不了那個迴圈** ⇒ 圖例一列都沒有 ⇒ 玩家在戰鬥中永遠找不到
 * 陣亡投幣／觀戰／記分板／設定 —— 而**每一條既有守衛都是綠的**。
 *
 * ⚠️ CLAUDE.md 失敗形態⑫：只驗名詞不驗關係的反方向。
 * ⇒ 這裡從**另一頭**走一次：先問「這顆鍵今天做不做事」，再問「圖例說不說得出來」。
 *
 * 突變紀錄（2026-09-19）：把 `gamepadLegend()` 裡的
 * `const hudFocus = hudFocusLegendRow(); if (hudFocus) rows.push(hudFocus);`
 * 兩行拿掉 ⇒ 本檔第 1、2 條紅並指名 `btn-hudfocus`；用 `Edit` 改回（⛔ 不是 git checkout）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deadCoinKeyHint,
  gamepadLegend,
  hudFocusLegendRow,
  padNameForIndex,
  PAD_HUD_FOCUS_LEGEND_ID,
} from "./controlLegendModel";
import { padHudFocusTuning, SHIPPED_PAD_HUD_FOCUS } from "./hud/padHudFocus";
import { BTN } from "../input/GamepadInput";

const SRC = join(__dirname, "..");
/** 去掉註解：一段**描述**那顆鍵的散文不可以滿足掃描（第三守則）。 */
const PAD_FOCUS_NAV = readFileSync(join(SRC, "ui/PadFocusNav.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

describe("手把圖例：沒有一個動作可以是「畫面上找不到的」", () => {
  it("HUD 焦點模式那顆鍵在圖例裡有一列", () => {
    const ids = gamepadLegend().map((r) => r.id);
    expect(padHudFocusTuning().enabled, "出貨預設是開著的").toBe(true);
    expect(ids, "View/Back 只住焦點層 ⇒ 戰鬥表的 probe 看不到它").toContain(
      PAD_HUD_FOCUS_LEGEND_ID,
    );
  });

  it("那一列印的是**生效中設定**的那顆鍵，⛔ 不是寫死的 Back", () => {
    const shipped = hudFocusLegendRow();
    expect(shipped?.control).toBe("Back");
    // 後台把它改成 X ⇒ 圖例跟著改（⛔ 寫死的話這裡會還是 Back）
    const moved = hudFocusLegendRow({ ...SHIPPED_PAD_HUD_FOCUS, toggleButton: BTN.X });
    expect(moved?.control).toBe("X");
    // 關掉 ⇒ ⛔ 不要印一列按了沒反應的鍵位
    expect(hudFocusLegendRow({ ...SHIPPED_PAD_HUD_FOCUS, enabled: false })).toBeNull();
    // 索引不是一顆真的鍵 ⇒ 同上
    expect(hudFocusLegendRow({ ...SHIPPED_PAD_HUD_FOCUS, toggleButton: 19 })).toBeNull();
  });

  it("圖例說得出來的那顆鍵，`PadFocusNav` 真的在讀它（⛔ 不是一句散文）", () => {
    expect(padNameForIndex(SHIPPED_PAD_HUD_FOCUS.toggleButton)).toBe("BACK");
    expect(PAD_FOCUS_NAV).toContain("nextHudFocusMode");
    expect(PAD_FOCUS_NAV).toContain("padHudFocusTuning");
  });

  it("陣亡投幣鈕的鍵位提示跟著玩家手上的東西走", () => {
    expect(deadCoinKeyHint("keyboard")).toBe("(G)");
    // ⭐ 手把上沒有 G —— 它要說的是那條**真的走得到**的路
    expect(deadCoinKeyHint("gamepad")).toBe("(Back → A)");
    expect(deadCoinKeyHint("gamepad")).not.toContain("G");
    // 觸控：右下大圓鈕陣亡時就是投幣鈕，按鈕在手指底下 ⇒ 不需要鍵位
    expect(deadCoinKeyHint("touch")).toBe("");
  });
});
