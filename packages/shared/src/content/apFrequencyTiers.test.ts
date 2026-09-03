/**
 * ⭐⭐ **AP 係數的三把五級距**（GH#939）。
 *
 * owner 2026-09-02（逐字核准的 15 個數字）：
 * > 「我贊同你的新三類五級距（**普攻 0.10/0.16/0.33/0.70/1.00** ·
 * >  **技能 0.30/0.50/0.60/0.80/1.00** · **特殊條件 0.50/0.60/1.20/3.00/7.00**）」
 *
 * ⛔⛔ **為什麼一把尺抓不平**（owner 同一則的前半逐字）：
 * > 「AP 加成有比較多條件變因⋯**頻率[每次攻擊/技能施展/技能標籤變身反彈等特殊條件]**
 * >  ⋯請你提建議而非**一把尺抓平**」
 *
 * ⭐ 量到的實例（GH#946）：92-04 的 3.0×AP 掛在 `onBasicAttack` 上，
 * 6 秒窗口內普攻約 4 次 ⇒ **等效 12×AP**，⛔ 而全庫中位是 0.6。
 * ⇒ ⭐⭐ **同一個數字在三種頻率下不是同一件事** —— 那正是三把尺存在的理由。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `basicAttack.極大` 從 1.0 改成 3.0 → 🔴 ③「普攻那一把尺的上限破了」
 * M2 `classifyApFrequency` 的普攻分支移到條件分支後面
 *    → 🔴 ④「掛普攻**而且**帶條件的節點被分到 specialCondition」
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_AP_COEFFICIENT,
  classifyApFrequency,
  resolveApFrequencyTier,
} from "./apCoefficient";

const DOC = JSON.parse(
  readFileSync(join(__dirname, "../../../../content/config/ap-coefficient.json"), "utf8"),
) as { frequency?: unknown };

const FREQ = (DEFAULT_AP_COEFFICIENT as unknown as {
  frequency: Record<string, Record<string, number>>;
}).frequency;

describe("AP 係數的三把五級距（GH#939）", () => {
  it("★★ ⭐⭐ owner **逐字核准的 15 個數字**一格不差", () => {
    expect(FREQ["basicAttack"], "⛔ 普攻那一把尺與 owner 的原話不符").toEqual({
      極小: 0.1, 小: 0.16, 中: 0.33, 大: 0.7, 極大: 1.0,
    });
    expect(FREQ["abilityCast"], "⛔ 技能那一把尺與 owner 的原話不符").toEqual({
      極小: 0.3, 小: 0.5, 中: 0.6, 大: 0.8, 極大: 1.0,
    });
    expect(FREQ["specialCondition"], "⛔ 特殊條件那一把尺與 owner 的原話不符").toEqual({
      極小: 0.5, 小: 0.6, 中: 1.2, 大: 3.0, 極大: 7.0,
    });
  });

  it("★★ ⭐ 出貨 JSON 與 `DEFAULT_*` **逐格相同**（兩個住處會漂 ⇒ 紅）", () => {
    expect(DOC.frequency, "⛔ `content/config/ap-coefficient.json` 與常數漂了").toEqual(FREQ);
  });

  it("★★ ⭐⭐ 三把尺的**形狀刻意不同**（⛔ 這就是「一把尺抓不平」的意思）", () => {
    // ⭐ 普攻每秒都在觸發 ⇒ 上限 1.00，⛔ 再高就是全遊戲最大輸出。
    expect(FREQ["basicAttack"]!["極大"], "⛔ 普攻那一把尺的上限破了").toBe(1.0);
    // ⭐ 一次施放要付冷卻與耗魔 ⇒ 下限不能太低。
    expect(FREQ["abilityCast"]!["極小"], "⛔ 技能那一把尺的下限太低 ⇒ 施放沒有回報").toBeGreaterThanOrEqual(0.3);
    // ⭐ 特殊條件要先滿足一個玩家控制不了的前提 ⇒ 上限最高。
    expect(
      FREQ["specialCondition"]!["極大"],
      "⛔ 特殊條件那一把尺不再是最高的 ⇒ 三把尺塌成一把",
    ).toBeGreaterThan(FREQ["abilityCast"]!["極大"]!);
    // ⭐ 每一把尺自己都要**單調遞增**（⛔ 否則「級距高」不代表「係數大」）。
    for (const [name, t] of Object.entries(FREQ)) {
      const v = ["極小", "小", "中", "大", "極大"].map((k) => t[k]!);
      for (let i = 1; i < v.length; i += 1)
        expect(v[i], `⛔ ${name} 的第 ${i + 1} 格沒有比前一格大`).toBeGreaterThan(v[i - 1]!);
    }
  });

  it("★★ ⭐⭐ 分類的**順序是承重的**：掛普攻**而且**帶條件 ⇒ 仍算普攻", () => {
    // ⭐ 這正是 92-04（GH#946）的形狀：`onBasicAttack` ＋ 目標帶 `blind`。
    expect(
      classifyApFrequency({ when: { kind: "status" } }, { on: "onBasicAttack", condition: {} }, {}),
      "⛔⛔ 一個掛在普攻上的節點被分到 `specialCondition` ⇒\n" +
        "  ⭐ 決定它量級的是**頻率**（每秒都在觸發），⛔ 條件只是把它乘上一個機率。\n" +
        "  ⇒ 分錯尺 = 92-04 那種「等效 12×AP」再發生一次。",
    ).toBe("basicAttack");
    expect(classifyApFrequency({ when: {} }, undefined, {}), "⛔ 帶 when 的沒被分到特殊條件").toBe(
      "specialCondition",
    );
    expect(classifyApFrequency({}, undefined, {}), "⛔ 沒有條件也沒掛普攻的應該是基準那一把").toBe(
      "abilityCast",
    );
  });

  it("⭐ 解析器：級距名不在表上 ⇒ 回 `null`（⛔ 不是 0）", () => {
    expect(resolveApFrequencyTier("basicAttack", "中"), "⛔ 查不到已知級距").toBe(0.33);
    expect(
      resolveApFrequencyTier("basicAttack", "沒有這一格"),
      "⛔ 未知級距回了數字 —— `0` 的意思是「不吃 AP」，⭐ 而那是**另一件事**",
    ).toBeNull();
  });
});
