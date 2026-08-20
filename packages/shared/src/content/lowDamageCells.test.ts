/**
 * GH#445 —— 「傷害相對冷卻偏低」那一族：**推導對不對** + **接線有沒有接上**。
 *
 * ⛔ 這裡**沒有一個出貨數字**（第二守則：抄一份出貨值就是第四個住處，而它一定
 * 會過期並用錯誤的訊息紅）。斷言全部是**關係**：
 *   · 被標記的格子，它的期望輸出真的低於錨點
 *   · 它指名的「要跳到哪一級」真的追得平錨點  ← ⭐ 這一條讓警告是**可行動的**
 *   · 對角線（單體）恆等於錨點，所以永遠不會被標記
 *   · 一支落在標記格的技能，`checkNewHeroDocs` 真的會叫；開關關掉就不叫
 */
import { describe, it, expect } from "vitest";
import {
  ANCHOR_SHAPE,
  ANCHOR_TIER,
  anchorRate,
  cellRate,
  lowDamageCells,
} from "./lowDamageCells";
import { DEFAULT_COOLDOWN_TIERS } from "./cooldownTiers";
import { DEFAULT_DAMAGE_TIERS } from "./damageTiers";
import { DEFAULT_EXPECTED_HITS } from "./proportionality";
import { SKILL_TIER_NAMES } from "./skillTiers";
import { DEFAULT_NEW_HERO_CHECKS, checkNewHeroDocs } from "./newHeroChecks";

const SEC = DEFAULT_COOLDOWN_TIERS.seconds;
const DMG = DEFAULT_DAMAGE_TIERS.damage;
const HITS = DEFAULT_EXPECTED_HITS;

describe("傷害偏低的級距格是推導出來的（GH#445）", () => {
  it("每一格都真的低於錨點，而它指名的補救級距真的追得平", () => {
    const cells = lowDamageCells(SEC, DMG, HITS);
    const anchor = anchorRate(SEC, DMG, HITS);
    expect(anchor, "錨點算不出來 —— 整族警告是空的").toBeGreaterThan(0);
    // ⚠️ 出貨表下這不是零（範圍那兩格）。它變成零時要嘛表被調寬了（好事），
    //    要嘛推導壞了（壞事）——⛔ 分不出來的斷言不是守衛，所以這裡釘的是**方向**。
    for (const c of cells) {
      expect(c.ratePerCardSecond, `${c.shape}・${c.tier}`).toBeLessThan(anchor);
      expect(c.deficitPct, `${c.shape}・${c.tier}`).toBeLessThan(0);
      // ⭐ 可行動性：跳到 requiredDamageTier 之後，每卡面秒真的 ≥ 錨點。
      const fixed = (DMG[c.requiredDamageTier] * HITS[c.shape]) / SEC[c.shape][c.tier];
      expect(fixed, `${c.shape}・${c.tier} 指名的「${c.requiredDamageTier}」補不回錨點`).toBeGreaterThanOrEqual(
        anchor * (1 - 1e-9),
      );
    }
  });

  it("對角線（錨點那個形狀）恆等於錨點，⛔ 永遠不該被標記", () => {
    const anchor = anchorRate(SEC, DMG, HITS);
    for (const tier of SKILL_TIER_NAMES) {
      expect(cellRate(SEC, DMG, HITS, ANCHOR_SHAPE, tier)).toBeCloseTo(anchor, 6);
    }
    expect(lowDamageCells(SEC, DMG, HITS).map((c) => c.shape)).not.toContain(ANCHOR_SHAPE);
  });
});

describe("警告真的接到了創建新英雄的檢查上（GH#445）", () => {
  /** 一支落在**第一個**被標記的格子裡的技能草稿。⛔ 秒數從表推，不手打。 */
  const draftInFlaggedCell = (): Record<string, unknown> => {
    const c = lowDamageCells(SEC, DMG, HITS)[0]!;
    return {
      id: "godie-probe.q",
      schema: "ability@1",
      name: "探針",
      slot: "Q",
      castType: "ground",
      maxRank: 4,
      // `radius` 在場 ⇒ `cooldownShapeOf` 判成「範圍」（與出貨查表同一支判斷）
      radius: 5,
      cooldown: [SEC[c.shape][c.tier]],
      manaCost: [60],
      effects: [],
      description: "探針",
    };
  };

  it("落在標記格會跳，關掉那一條開關就不跳", () => {
    const doc = draftInFlaggedCell();
    const on = checkNewHeroDocs([{ collection: "abilities", id: "godie-probe.q", doc }]);
    expect(on.filter((w) => w.rule === "low-damage-cell").length).toBeGreaterThan(0);

    const off = checkNewHeroDocs([{ collection: "abilities", id: "godie-probe.q", doc }], {
      config: {
        ...DEFAULT_NEW_HERO_CHECKS,
        rules: { ...DEFAULT_NEW_HERO_CHECKS.rules, "low-damage-cell": false },
      },
    });
    expect(off.filter((w) => w.rule === "low-damage-cell")).toEqual([]);
  });
});
