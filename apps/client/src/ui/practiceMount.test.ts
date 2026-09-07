/**
 * 「練習模式的作弊碼選單**一樣沒有看到**」的守衛（GH#365）。
 *
 * ── 真正的原因（量到的，不是猜的）────────────────────────────────────────────
 * `AppRoot` 的掛載閘寫的是 `cheatsAvailable(s.match?.mode)` —— **少了第二個
 * 參數**。練習房走 `playBotMatch(…, practice=true)`，那是一間**平台**房
 * （`mode === "platform"`），所以那個呼叫回 false，`<CheatConsole>` **從來沒有
 * 掛載過**。⛔ 不是「按鈕被藏起來」：backtick 的 keydown handler 住在元件裡面，
 * 元件沒掛 = 按 ` 也不會有事。
 *
 * ⚠️ 這正是失敗形態③：`cheats.test.ts` 有三條測試在驗 `cheatsAvailable` 與
 * `cheatButtonVisible` 的 practice 參數，**全綠** —— 因為沒有一條讀那個呼叫點。
 *
 * ⭐ 所以修法不是「補上第二個參數」（那是判準，下次還會忘）而是把呼叫點的形狀
 * 換掉：`cheatPanelMounts(match)` 收**整個 match 物件**，⛔ 沒有可以漏掉的參數。
 * 這支測試餵的就是 store 真的會放進去的那個形狀。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ATTR_KEYS } from "@ggd/shared/sim/stats/attributes";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { cheatPanelButtonVisible, cheatPanelMounts } from "./cheats";
import { practiceStatRows } from "./practice/practiceModel";

/** `MatchLaunch` 裡與這個決定有關的那兩格（store.ts 的 `platformLaunch`）。 */
const practiceRoom = { mode: "platform" as const, practice: true };
const rankedRoom = { mode: "platform" as const, practice: false };
const offlineRoom = { mode: "offline" as const, practice: false };

describe("練習面板的掛載閘（cheat-panel-gating）", () => {
  it("★ 練習房是一間**平台**房 —— 面板照樣要掛載", () => {
    cover("cheat-panel-gating");
    expect(
      cheatPanelMounts(practiceRoom),
      "練習房沒掛載面板 —— 這正是 owner 回報的『一樣沒有看到』",
    ).toBe(true);
  });

  it("⭐ 反向：一般平台對局不掛載（所以上面驗到的不是『永遠都掛』）", () => {
    expect(cheatPanelMounts(rankedRoom)).toBe(false);
    expect(cheatPanelMounts(null)).toBe(false);
    expect(cheatPanelMounts(undefined)).toBe(false);
    // 離線單機仍然照舊（GH#343 之前就有的行為，⛔ 沒有被這次改動拿走）。
    expect(cheatPanelMounts(offlineRoom)).toBe(true);
  });

  it("★ 🐞 按鈕在**正式站**的練習房裡看得見（環境分級對練習房豁免）", () => {
    // ggd.adms.ai = "public" 級。藏起來 = 這個功能在線上完全找不到。
    expect(cheatPanelButtonVisible(practiceRoom, "ggd.adms.ai")).toBe(true);
    // 同一台主機上的**一般**對局仍然什麼都不顯示。
    expect(cheatPanelButtonVisible(rankedRoom, "ggd.adms.ai")).toBe(false);
    // 離線場只在開發者自己的機器上顯示按鈕（playtest P9，未改動）。
    expect(cheatPanelButtonVisible(offlineRoom, "localhost")).toBe(true);
    expect(cheatPanelButtonVisible(offlineRoom, "ggd.adms.ai")).toBe(false);
  });

  /**
   * ⭐ 屬性分頁的清單**是推導的**（第〇·五守則）。一份手寫的「AD/AP/HP/MP/攻速」
   * 名單上線第二天就少一條（引擎 2026-08-17 才剛加了三條輸出倍率屬性）而且
   * 不會有東西紅 —— 這一條就是那個會紅的東西。
   */
  it("★ 屬性清單涵蓋三圍 + **每一條** Stat，⛔ 不是一份手寫名單", () => {
    cover("cheat-practice-tabs");
    const rows = practiceStatRows();
    expect(rows.filter((r) => r.attr).map((r) => r.key)).toEqual([...ATTR_KEYS]);
    expect(rows.length).toBe(ATTR_KEYS.length + Object.values(Stat).length);
  });
});
