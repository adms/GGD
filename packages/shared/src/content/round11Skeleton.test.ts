/**
 * ⭐⭐ **第十一回合的旋鈕骨架**（GH#919 #920 #921 #922 #923 #924 #925）。
 *
 * ⛔⛔ **這是骨架，⛔ 不是實作** —— `enabled` 出貨 `false`，
 * ⭐ 整個區塊今天逐位元 no-op。⛔ 沒有任何畫面或卡面在宣稱它會發生
 * （第一·五守則：⛔ 不放「說了但不會發生」的字）。
 *
 * ⭐ **它為什麼先存在**：六張票的參數**全部撞同一個檔**
 * （`content/config/arena-rules.json`，goal 逐字「8 張全撞」）
 * ⇒ 逐張加一格 ＝ 六次同檔衝突；⭐ 一次把形狀定下來 ＝ 之後每張票只補**它自己的實作**。
 *
 * ⚠️⚠️ ⭐ **而這一支最重要的斷言是第 1 條：出貨值必須是關的。**
 * ⛔ 一個「有欄位、有預設值、而 sim 沒實作」的模式如果**開著**出貨，
 * 它就是這個 repo 記過最多次的形狀：機制在、玩家拿不到、而每一條測試都是綠的。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `content/config/arena-rules.json` 的 `round11.enabled` 改成 true
 *    → 🔴 ①逐字「骨架不可以開著出貨」
 * M2 `SHIPPED_ROUND11.maxAliveZombies` 改成 200（owner 較早的那個數字）
 *    → 🔴 ②「出貨值與 JSON 漂了」
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SHIPPED_ROUND11, zRound11Config } from "./schema/config/arenaRules.round11";

const DOC = JSON.parse(
  readFileSync(join(__dirname, "../../../../content/config/arena-rules.json"), "utf8"),
) as { round11?: unknown };

describe("第十一回合的旋鈕骨架（GH#919–#925）", () => {
  it("★★ ⭐⭐ 骨架**不可以開著出貨**（sim 那一半還沒做）", () => {
    expect(
      SHIPPED_ROUND11.enabled,
      "⛔⛔ 一個「有欄位、有預設值、而 sim 沒實作」的模式**開著出貨** ⇒\n" +
        "  ⭐ 那是這個 repo 記過最多次的形狀：機制在、玩家拿不到、而每一條測試都是綠的。",
    ).toBe(false);
    expect((DOC.round11 as { enabled: boolean }).enabled, "⛔ JSON 那一份是開的").toBe(false);
  });

  it("★★ ⭐ 出貨值與 JSON **逐格相同**（兩個住處會漂 ⇒ 紅）", () => {
    expect(
      DOC.round11,
      "⛔ `content/config/arena-rules.json` 的 round11 與 `SHIPPED_ROUND11` 漂了 ——\n" +
        "  ⭐ 改一邊就要改另一邊（第一守則的三個住處）",
    ).toEqual(SHIPPED_ROUND11);
  });

  it("★★ ⭐ 出貨值**過得了出貨的 Zod**（⛔ 一份收不下的預設等於沒有預設）", () => {
    expect(() => zRound11Config.parse(SHIPPED_ROUND11)).not.toThrow();
    expect(() => zRound11Config.parse(DOC.round11)).not.toThrow();
  });

  it("★★ ⭐⭐ owner 逐字點名的四個數字都在（⛔ 沒有一格是我挑的）", () => {
    // 「那就大膽一點 **直接卡上限 500個殭屍**」
    expect(SHIPPED_ROUND11.maxAliveZombies, "⛔ 不是 owner 說的 500").toBe(500);
    // 「[強度係數] **×2**」
    expect(SHIPPED_ROUND11.bossStrengthMult, "⛔ 不是 owner 說的 ×2").toBe(2);
    // 「是**總分加倍的獎勵局**」
    expect(SHIPPED_ROUND11.scoring.scoreMultiplier, "⛔ 不是「總分加倍」").toBe(2);
    // 票文：「⛔ 不要寫死它⋯**預設 `arena.royale`**」
    expect(SHIPPED_ROUND11.arenaId, "⛔ 場地預設不是 arena.royale").toBe("arena.royale");
  });

  it("⭐ 「漸進式生成」寫得出來 —— ⛔ 而 `0` 是 owner 明說不要的那一種", () => {
    // owner 逐字：「生成速度**不是一開始就拉滿 而是漸進式**」
    expect(
      SHIPPED_ROUND11.spawnRampSec,
      "⛔ 出貨的爬升時間是 0 ＝ 一開始就滿載 ＝ owner 明說不要的那一種",
    ).toBeGreaterThan(0);
    // ⭐ 反方向：界線仍然收得下 0（那是一個合法的**設定**，只是不該是出貨值）
    expect(() =>
      zRound11Config.parse({ ...SHIPPED_ROUND11, spawnRampSec: 0 }),
    ).not.toThrow();
  });

  it("⭐ 波次表是**一張表**（⛔ 不是一串 if）而且每一列都有正權重", () => {
    const ev = SHIPPED_ROUND11.waveTable.events;
    expect(ev.length, "⛔ 波次表是空的 ⇒ 那一格等於不存在").toBeGreaterThan(0);
    expect(
      ev.filter((e) => !(e.weight > 0)).map((e) => e.kind),
      "⛔ 有事件的權重是 0 ⇒ 它一輩子不會被抽到（＝一句說了不會發生的話）",
    ).toEqual([]);
  });
});
