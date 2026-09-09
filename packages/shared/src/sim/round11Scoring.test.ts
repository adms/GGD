/**
 * ⭐⭐ 第十一回合計分的守衛（GH#1151 G）。
 */
import { describe, it, expect } from "vitest";
import { round11Score, round11FrozenSurvivalFrac, type Round11Scoring } from "./round11Scoring";

/** 出貨的那三格。 */
const CFG: Round11Scoring = { survivalWeight: 0.5, scoreMultiplier: 2, minContributionForFullSurvival: 0.2 };

describe("① 分數 —— ⭐ 存活 ＋ 戰鬥貢獻", () => {
  it("⭐ 撐滿全場 ＋ 滿額貢獻 ⇒ 1 × 倍率", () => {
    expect(round11Score({ survivalFrac: 1, contributionFrac: 1 }, CFG)).toBeCloseTo(2, 10);
  });

  it("⭐ 零貢獻但撐滿 ⇒ 只有存活那一半，⭐ 而且被折扣", () => {
    // survival 1 × 0.5 × (0/0.2 = 0) ＝ 0；combat 0 ⇒ 0
    expect(round11Score({ survivalFrac: 1, contributionFrac: 0 }, CFG)).toBe(0);
  });

  it("⭐⭐ **低貢獻折扣是按比例**，⛔ 不是歸零", () => {
    // ⚠️ 直接歸零會讓「被追殺整場、打不到人」的玩家拿 0,⭐ 而他確實活著。
    //
    // ⚠️⚠️ ⭐ `survivalWeight: 1` 是**刻意**的:它把戰鬥那一項歸零,
    //   ⇒ 剩下的分數**只剩折扣過的存活分** ⇒ ⭐ 這條斷言真的在量折扣。
    //   ⛔ 我第一版用出貨的 0.5 寫,於是「歸零」的突變**活了下來** ——
    //     因為 0.1 的貢獻自己貢獻了 0.1 分,讓 `> 0` 恆真（失敗形態④:
    //     斷言方向跟缺陷無關）。
    const ONLY_SURVIVAL = { ...CFG, survivalWeight: 1 };
    const half = round11Score({ survivalFrac: 1, contributionFrac: 0.1 }, ONLY_SURVIVAL);
    const full = round11Score({ survivalFrac: 1, contributionFrac: 0.2 }, ONLY_SURVIVAL);
    expect(half, "⛔ 折扣不可以把它歸零").toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
    // ⭐ 而且真的是**按比例**:貢獻 0.1 / 門檻 0.2 ＝ 半價。
    expect(half).toBeCloseTo(full / 2, 10);
  });

  it("⛔ 門檻 <= 0 ⇒ **不折扣**（機制關著），⛔ 不是全部折到 0", () => {
    const off = { ...CFG, minContributionForFullSurvival: 0 };
    expect(round11Score({ survivalFrac: 1, contributionFrac: 0 }, off)).toBeCloseTo(1, 10);
  });

  it("⛔ 倍率 <= 0 ⇒ 當成 1（⭐ 不是把整回合歸零）", () => {
    const z = { ...CFG, scoreMultiplier: 0 };
    expect(round11Score({ survivalFrac: 1, contributionFrac: 1 }, z)).toBeCloseTo(1, 10);
  });

  it("⭐ 輸入夾在 [0,1] —— ⛔ 一個 1.5 的貢獻不可以爆分", () => {
    expect(round11Score({ survivalFrac: 9, contributionFrac: 9 }, CFG)).toBeCloseTo(2, 10);
    expect(round11Score({ survivalFrac: -1, contributionFrac: -1 }, CFG)).toBe(0);
  });

  it("⭐ `survivalWeight` 1 ⇒ 只看存活；0 ⇒ 只看戰鬥", () => {
    const s = { ...CFG, survivalWeight: 1, minContributionForFullSurvival: 0 };
    expect(round11Score({ survivalFrac: 1, contributionFrac: 0 }, s)).toBeCloseTo(2, 10);
    const c = { ...CFG, survivalWeight: 0 };
    expect(round11Score({ survivalFrac: 1, contributionFrac: 0 }, c)).toBe(0);
  });
});

describe("② 換邊後**凍結** —— ⛔ 操作殭屍王的人不可以領滿額存活分", () => {
  it("⭐ 死在一半 ⇒ 存活 0.5，⛔ 不是 1", () => {
    expect(round11FrozenSurvivalFrac(300, 600, 600)).toBeCloseTo(0.5, 10);
  });

  it("⭐ 活到最後 ⇒ 用回合結束時間", () => {
    expect(round11FrozenSurvivalFrac(null, 600, 600)).toBe(1);
  });

  it("⭐⭐ 提早結束（全滅）⇒ ⛔ 活著的人也不是滿額", () => {
    // 回合設定 600 秒,而 120 秒就全滅 ⇒ 活到最後的人是 0.2。
    expect(round11FrozenSurvivalFrac(null, 120, 600)).toBeCloseTo(0.2, 10);
  });

  it("⛔ 長度 0 ⇒ 0（⭐ 不是除以零）", () => {
    expect(round11FrozenSurvivalFrac(null, 100, 0)).toBe(0);
  });
});
