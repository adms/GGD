/**
 * ⭐⭐ GH#330 —— 「沒加點」在按下去的當下幾乎沒有回饋。
 *
 * owner 2026-08-14 回報「悟空變身超級賽亞人**沒有任何效果、甚至沒有進入 CD**」。
 * ⭐ 逐項查證之後**引擎與內容都是好的**：學了 E 之後 `castAbility → "ok"`、
 * 真的變身、冷卻 1760 tick、魔力 970→812。
 * ⇒ ⭐ 唯一會同時產生那四個症狀的狀態是 **`rank: 0`（沒加點）**。
 *
 * ⭐ 根治是把「照 `skillOrder` 自動加點」做成**預設開的後台開關** ——
 * bot 早就走這條路（`Tier0Brain.ts:274`），⛔ 人只是沒接上。
 *
 * MUTATION LOG：`MatchController` 那一行 `for (const sl of order) rankUpAbility(...)`
 * 拿掉 → ①紅（技能點沒被花掉）。
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_ARENA_RULES, rulesFromDoc } from "./arenaRules";

describe("GH#330 自動加點開關", () => {
  it("★ ⭐ 出貨預設是**開的**（owner 因為沒加點而回報「技能壞了」）", () => {
    expect(DEFAULT_ARENA_RULES.autoSpendSkillPoints, "⛔ 預設關掉＝缺陷回來").toBe(true);
  });

  it("★ ⭐ 後台可以關掉（一鍵 rollback 回手動加點）", () => {
    const off = rulesFromDoc({
      schema: "config.arena-rules@1",
      autoSpendSkillPoints: false,
      offerCount: 3,
      finalRound: 9,
      rounds: {},
    } as never);
    expect(off.autoSpendSkillPoints).toBe(false);
  });

  it("⭐ 文件缺這一格 ⇒ **開著**（＝出貨行為），⛔ 不是關著", () => {
    // ⚠️ 舊房間／舊錄影沒有這一格。缺席退成「關」＝把缺陷靜默地放回線上。
    const legacy = rulesFromDoc({
      schema: "config.arena-rules@1",
      offerCount: 3,
      finalRound: 9,
      rounds: {},
    } as never);
    expect(legacy.autoSpendSkillPoints).toBe(true);
  });

  it("⭐ 出貨內容那一份也是開的（三個住處要一致）", async () => {
    const doc = (await import("node:fs")).readFileSync(
      new URL("../../../../content/config/arena-rules.json", import.meta.url),
      "utf8",
    );
    expect(JSON.parse(doc).autoSpendSkillPoints).toBe(true);
  });
});
