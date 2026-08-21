// @vitest-environment jsdom
/**
 * padHudFocus.test — GH#508 的承重守衛：**戰鬥中進入 HUD 焦點模式之後，那六個
 * 控制項聚焦得到**。
 *
 * ⚠️ 這一條要同時證明兩半，少一半都是「做了但玩家拿不到」：
 *   ① 閘真的翻過來（`padHudFocusActive`）—— 拿掉 `|| hudFocusMode` 就紅；
 *   ② 翻過來之後那六個控制項真的在**出貨的**可聚焦集合裡（`FOCUSABLE_SELECTOR`
 *      是 ui/PadFocusNav 出貨的那一份，⛔ 不是這裡手抄的一份選擇器）。
 *
 * 六個之中 **屬性面板**是唯一原本一顆可聚焦元素都沒有的（整片 pointerEvents:none），
 * 所以它在這裡以 `data-pad-stats-toggle` 的形狀出現 —— StatsHoverPanel 的
 * `padTrigger` 欄位長出來的那顆開關。
 */
import { describe, expect, it } from "vitest";
import { focusNavActive } from "../../input/padFocusNav";
import { FOCUSABLE_SELECTOR } from "../PadFocusNav";
import {
  PAD_HUD_FOCUS_FIELDS,
  SHIPPED_PAD_HUD_FOCUS,
  nextHudFocusMode,
  padHudFocusActive,
  resolvePadHudFocusTuning,
} from "./padHudFocus";

/** The six controls #508 lists, in the shape each one really renders. */
const COMBAT_HUD_CONTROLS: readonly [string, string][] = [
  ["陣亡投幣", '<button type="button">丟 100金 (G) 10/10</button>'],
  ["前往觀戰", '<button type="button">前往觀戰 第2競技場</button>'],
  ["記分板", '<button type="button" data-hud-slot="scoreboard">記分板</button>'],
  ["設定/音效", '<button type="button" aria-label="設定">⚙</button>'],
  ["操作說明的 ✕", '<button type="button" aria-label="關閉操作說明">✕</button>'],
  ["屬性面板", '<button type="button" data-pad-stats-toggle aria-label="屬性面板">屬性</button>'],
];

const COMBAT = { screen: "match", phase: "combat", hasScope: false };

describe("#508 兩段式 HUD 焦點模式", () => {
  it("戰鬥中焦點層本來是退場的（缺陷本體，⛔ 不是被這一票改掉的預設）", () => {
    expect(focusNavActive(COMBAT), "combat 仍然預設由英雄拿著手把").toBe(false);
    expect(padHudFocusActive({ ...COMBAT, hudFocusMode: false })).toBe(false);
  });

  it("進入模式後，六個控制項全部聚焦得到", () => {
    expect(padHudFocusActive({ ...COMBAT, hudFocusMode: true })).toBe(true);
    for (const [name, html] of COMBAT_HUD_CONTROLS) {
      document.body.innerHTML = html;
      const el = document.body.firstElementChild;
      expect(el, name).not.toBeNull();
      expect(
        el!.matches(FOCUSABLE_SELECTOR),
        `${name} 不在手把的可聚焦集合裡 —— 模式開了也碰不到`,
      ).toBe(true);
    }
  });

  it("一顆鍵進、同一顆鍵出、B 也出、離開戰鬥自動退", () => {
    const t = SHIPPED_PAD_HUD_FOCUS;
    const f = { standingDown: true, togglePressed: false, backPressed: false, padPresent: true };
    expect(nextHudFocusMode(false, { ...f, togglePressed: true }, t)).toBe(true);
    expect(nextHudFocusMode(true, { ...f, togglePressed: true }, t)).toBe(false);
    expect(nextHudFocusMode(true, { ...f, backPressed: true }, t)).toBe(false);
    expect(nextHudFocusMode(true, { ...f, standingDown: false }, t)).toBe(false);
    expect(nextHudFocusMode(true, { ...f, padPresent: false }, t)).toBe(false);
    expect(nextHudFocusMode(false, { ...f, togglePressed: true }, { ...t, enabled: false })).toBe(false);
  });

  it("欄位有上界而且會回報夾了什麼（⛔ 不是靜默吃掉）", () => {
    const { tuning, problems } = resolvePadHudFocusTuning({ toggleButton: 800 });
    const max = PAD_HUD_FOCUS_FIELDS.find((f) => f.key === "toggleButton")?.max;
    expect(tuning.toggleButton).toBe(max);
    expect(problems.map((p) => p.key)).toContain("toggleButton");
  });
});
