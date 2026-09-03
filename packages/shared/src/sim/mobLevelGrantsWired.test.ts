/**
 * ⭐⭐ **owner 要的三格等級規則，在出貨 config 上真的成立**（GH#918）。
 *
 * owner 2026-09-02（逐字，兩則）：
 * > 「把打6隻就升級**先設定為關閉**，特殊殭屍 + lv3, 殭屍王 + lv10
 * >  這樣可以大幅避免掉直接升級被省略的 xp」
 * > 「[「特殊 +lv3、王 +lv10」是獎池還是每人] **獎池，跟以前一樣**」
 *
 * ⭐ 2026-09-03 回驗：這三格**都已經落地**（票文寫的 `min(1)` 界線也早就是 `min(0)`）。
 * ⇒ ⭐ 這一支不是「把它做出來」，是**把它釘住**——
 * ⛔ 因為三個住處（config / Zod / admin）之間今天沒有任何東西在問
 * 「⭐ owner 那三句話還成立嗎」。
 *
 * ⚠️⚠️ ⭐ **而它刻意驗的是「規則轉換之後」的值，⛔ 不是 config 的字面值**：
 * 特殊怪的獎勵在 config 是**扁平**的 `special.bountyLevels`，
 * 而 sim 讀的是**巢狀**的 `rules.special.bounty.levels`
 * ⇒ ⭐ 中間那一層轉換有一個「三個欄位都 undefined 就整塊 null」的分支
 * ⇒ ⛔ 一旦有人把那三格拿掉，特殊怪會**安靜地不給任何獎勵**（失敗形態⑧）。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `content/config/arena-rules.json` 的 `special.bountyLevels` 改成 0
 *    → 🔴 ②逐字「特殊殭屍的等級獎勵是 0 —— owner 說的是 +lv3」
 * M2 `killsPerLevel` 改回 6 → 🔴 ①「『每 N 隻升一級』沒有關掉」
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mobRulesFromConfig, mobBountyRules } from "./mobs";

const CFG = JSON.parse(
  readFileSync(join(__dirname, "../../../../content/config/arena-rules.json"), "utf8"),
) as Record<string, unknown>;

/** ⭐ ⚠️ 它收的是 `mobWaves` **那一層**（⛔ 不是整份 config），第二參是 tick 長度。 */
const MW = CFG["mobWaves"] as Record<string, unknown>;
/** ⭐ 過**出貨的**轉換（⛔ 不是讀 JSON 的字面值 —— 那會漏掉中間那一層）。 */
const RULES = mobRulesFromConfig(MW as never, 1 / 30);

describe("殭屍擊殺的等級規則（GH#918）", () => {
  it("★★ ⭐ 「每 N 隻升一級」是**關掉**的（owner：「先設定為關閉」）", () => {
    expect(
      (CFG["mobWaves"] as { reward: { killsPerLevel: number } }).reward.killsPerLevel,
      "⛔⛔ 「每 N 隻升一級」沒有關掉 —— owner 2026-09-02 逐字：\n" +
        "  「把打6隻就升級**先設定為關閉**⋯這樣可以大幅避免掉直接升級被省略的 xp」",
    ).toBe(0);
  });

  it("★★ ⭐ 特殊殭屍 **+lv3**、殭屍王 **+lv10**（過轉換之後的值）", () => {
    const sp = mobBountyRules(RULES, "special");
    const bo = mobBountyRules(RULES, "boss");
    expect(sp, "⛔⛔ 特殊殭屍**整塊獎勵是 null** ⇒ 它安靜地不給任何東西").toBeTruthy();
    expect(bo, "⛔ 殭屍王的獎勵規則不見了").toBeTruthy();
    expect(sp!.levels, "⛔ 特殊殭屍的等級獎勵不是 3 —— owner 說的是 **+lv3**").toBe(3);
    expect(bo!.levels, "⛔ 殭屍王的等級獎勵不是 10 —— owner 說的是 **+lv10**").toBe(10);
  });

  it("★★ ⭐⭐ 兩者都是**獎池**（owner 第③則：「獎池，跟以前一樣」）", () => {
    const sp = mobBountyRules(RULES, "special")!;
    const bo = mobBountyRules(RULES, "boss")!;
    expect(
      sp.splitByDamage,
      "⛔ 特殊殭屍變成「直接給 killer」了 —— owner 逐字要的是**獎池**",
    ).toBe(true);
    expect(bo.splitByDamage, "⛔ 殭屍王不再照傷害比例分").toBe(true);
  });

  it("⭐ 界線寫得出 0（⛔ 這一格曾經是 `min(1)` ⇒ 『關閉』寫不出來）", () => {
    // ⭐ 直接問**出貨的 Zod**：把 0 餵進去要過。
    const withZero = JSON.parse(JSON.stringify(MW)) as {
      reward: { killsPerLevel: number };
    };
    withZero.reward.killsPerLevel = 0;
    expect(
      () => mobRulesFromConfig(withZero as never, 1 / 30),
      "⛔ 餵 0 進去炸了 —— 那代表界線又把「關閉」擋掉了",
    ).not.toThrow();
  });
});
