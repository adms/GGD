/**
 * ⭐⭐ 賽後評分的**八個基準錨**變成設定（2026-09-01）——
 * main 責任①「⛔ 沒有只能改程式才碰得到的角落」的第二批。
 *
 * ── ⭐ 為什麼是這八個 ──────────────────────────────────────────────────
 * `sim/stats/rating.ts` 的檔頭**自己寫著**：
 * > 「FORMULA (**documented so balance/tuning is auditable**)」
 * ⇒ ⭐ 它明說這是**要調的東西** —— ⛔ 而在此之前它們是八個寫死的常數，
 *   owner 想讓 S+ 難一點就得改程式（第一守則）。
 *
 * ⭐ 每一格是「這一軸拿滿分要多少」⇒ **調小 = 更容易拿高分**。
 *
 * ── ⭐ 這條驗**行為**，⛔ 不是「欄位存在」（失敗形態⑦）────────────────────
 * 每一條都**兩個方向**：出貨值下拿到出貨評分 **且** 換一個錨之後評分**真的跟著變**。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `subScores` 的 `refOf(refs.damage, DMG_REF)` 改回硬用 `DMG_REF` → ② 紅
 *   · `refOf` 的 `v > 0` 拿掉 → ③ 紅（0 讓那一軸永遠滿分）
 */
import { describe, it, expect } from "vitest";
import { compositeScore, DEFAULT_RATING_REFS } from "./rating";
import type { PlayerMatchStats } from "./matchStats";

/**
 * 一位「中庸」的玩家 —— ⭐ 每一軸都沒有滿，這樣調錨才看得出方向。
 *
 * ⚠️ ⭐ 而 lobby 刻意放**兩個人**：`compositeScore` 是
 * `clamp01(0.5·roleScore + 0.5·percentile + …)`，⛔ 單人 lobby 的 percentile 恆為 1
 * ⇒ 分數會**撞上 clamp01 的天花板**，而那時候調任何錨都量不到差別
 * （⭐ 一把在飽和區量的尺是瞎的 —— 第一次寫這條測試時我就是這樣紅的）。
 */
const P: PlayerMatchStats = {
  kills: 3, deaths: 3, assists: 3, damageDealt: 6000, damageTaken: 6000, damageBlocked: 0,
  healingDone: 2000, ccAppliedTicks: 100, goldEarned: 3000, xp: 1000,
  abilityCasts: 20, abilityHits: 10, abilityWhiffs: 10, basicAttackHits: 20,
  flowersEaten: 2, timeAliveTicks: 1000, killParticipation: 4, largestSingleHit: 800,
  multikills: 0, revivesPerformed: 1, revivesReceived: 0, coinsCollected: 5,
  guardianDamage: 0, guardiansSlain: 0, bountyGold: 0,
};

/** 一位**更強**的隊友 ⇒ percentile 掉到 0.5，⭐ 讓分數離開飽和區。 */
const STRONG: PlayerMatchStats = { ...P, kills: 20, deaths: 1, damageDealt: 60000 };
const LOBBY = [P, STRONG];

describe("⭐ 評分基準錨是設定，⛔ 不是常數", () => {
  it("★ ① 出貨值**逐位元等於**原本寫死的八個（⛔ 這一輪不可以改到評分）", () => {
    expect(DEFAULT_RATING_REFS).toEqual({
      kda: 5, killParticipation: 8, damage: 12000, tanked: 18000,
      healed: 6000, ccTicks: 300, objectives: 6, rescues: 3,
    });
  });

  it("★ ② ⭐ **調錨，分數真的跟著變**（⛔ 兩個方向都量）", () => {
    const base = compositeScore(P, LOBBY, "carry");
    // ⭐ 方向 A：不傳錨 ⇒ 與傳出貨值**完全相同**（⛔ 缺席不可以改行為）
    expect(compositeScore(P, LOBBY, "carry", {}), "⛔ 缺席時行為變了").toBe(base);
    expect(compositeScore(P, LOBBY, "carry", DEFAULT_RATING_REFS), "⛔ 明寫出貨值時行為變了").toBe(base);
    // ⭐ 方向 B：把輸出錨**調小一半** ⇒ 同一場的分數要**變高**
    const easier = compositeScore(P, LOBBY, "carry", { damage: 6000 });
    expect(
      easier,
      "⛔⛔ 把「輸出拿滿分的門檻」砍半而分數沒變 ⇒ ⭐ 那一格是**假的可調**\n" +
        "（第一·五守則：後台有一格、玩家那邊什麼都不會發生）。",
    ).toBeGreaterThan(base);
    // ⭐ 反向：調大 ⇒ 變低
    expect(compositeScore(P, LOBBY, "carry", { damage: 48000 })).toBeLessThan(base);
  });

  it("★ ③ ⛔ 0／負／NaN 一律退回出貨值（⭐ 否則那一軸永遠滿分）", () => {
    const base = compositeScore(P, LOBBY, "carry");
    for (const bad of [0, -1, Number.NaN]) {
      expect(
        compositeScore(P, LOBBY, "carry", { damage: bad }),
        `⛔ \`damage: ${String(bad)}\` 應該退回出貨值 —— ⭐ 一個 0 的錨會讓「輸出」那一軸永遠滿分`,
      ).toBe(base);
    }
  });
});
