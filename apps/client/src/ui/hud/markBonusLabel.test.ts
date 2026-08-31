/**
 * ⭐⭐ GH#899 —— 標記旁邊的「已失層數換來多少」那一句。
 *
 * ⚠️ 這條**不是**在驗數學（那是 `sim/marks.ts::syncPerStackSource` 的事，
 * 而 `content/twelveTrialsGrants.test.ts` 已經走出貨內容證過四段）。
 * ⭐ 它驗的是**玩家看不看得到** —— owner 逐字：
 *   「Berserker 12試煉 **復活12次沒有加12次攻擊力與生命力**」
 * ⇒ 伺服器有加，⛔ 而每一個顯示它的地方都不顯示它。
 *
 * MUTATION LOG：
 *   · `markIdentity` 裡的 `markOwners()` 那一段拿掉 → ① 紅（畫出內部 id `trial`）
 *   · `markBonusLabel` 的 `× spent` 改成 `× 1`      → ② 紅（12 層失 3 只印 +10%）
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@ggd/shared/content/registries", () => ({ StatusEffects: { tryGet: () => undefined } }));
vi.mock("@ggd/shared/sim/content/registry", () => ({
  Abilities: {
    tryGet: () => undefined,
    all: () => [
      {
        name: "52-00 十二道試煉",
        icon: "icons/trial.webp",
        marks: [
          {
            markId: "trial",
            initial: 12,
            perStackLost: [
              { stat: "ad", op: "pctAdd", value: 0.1 },
              { stat: "maxHealth", op: "pctAdd", value: 0.1 },
            ],
          },
        ],
      },
      { name: "純計數的那一支", marks: [{ markId: "counter-only", initial: 3 }] },
    ],
  },
}));

const { markIdentity, markBonusLabel, resetMarkOwnerCache } = await import("./markModel");

beforeEach(() => resetMarkOwnerCache());

describe("GH#899 標記要說出它換來了什麼", () => {
  it("★ ① 名字用**宣告它的那支技能**（⛔ 不是內部英文 id）", () => {
    expect(
      markIdentity("trial").label,
      "⛔ HUD 把內部 id `trial` 原封不動畫給玩家看 —— 出貨唯一的那個標記在 " +
        "`Abilities` 與 `StatusEffects` 裡**都查不到**，而它的名字就在宣告它的技能上。",
    ).toBe("52-00 十二道試煉");
  });

  it("★ ② 失了幾層就乘幾層（⛔ 不是每層都印同一個數字）", () => {
    expect(markBonusLabel("trial", 12), "⛔ 一層都沒失就不該有這一句").toBeNull();
    expect(markBonusLabel("trial", 9)).toBe("攻擊力+30% · 最大生命+30%");
    expect(markBonusLabel("trial", 0)).toBe("攻擊力+120% · 最大生命+120%");
  });

  it("⭐ 沒有 `perStackLost` 的標記**逐位元不變**（⛔ 不憑空多一行字）", () => {
    expect(markBonusLabel("counter-only", 1)).toBeNull();
    expect(markBonusLabel("不存在的標記", 1)).toBeNull();
  });
});
