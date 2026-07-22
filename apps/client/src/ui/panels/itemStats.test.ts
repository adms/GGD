/**
 * The authored row model: merge duplicate modifiers, format each stat by its
 * nature, and strip the stat-claim lines out of the WC3 效能 block so the ✦
 * effect line carries only what the stat chips cannot. Run against the shapes
 * measured in content/items (丈八蛇矛's doubled ad, 魔戒's contradicting
 * 全能力+12, 妖刀村正's orb-tagged 吸血).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { ModOp } from "@ggd/shared/sim/stats/modifiers";
import {
  mergeItemModifiers,
  authoredMagnitude,
  formatAuthoredBonus,
  isStatClaimLine,
  parseItemDescription,
  effectLine,
  buildItemRow,
} from "./itemStats";

describe("mergeItemModifiers", () => {
  it("sums duplicate (stat, op) pairs — the pipeline does, so the row must (is-01)", () => {
    cover("shop-item-stats");
    // 丈八蛇矛: ad 18 + maxHealth 237 + ad 10.8  →  ad 28.8, maxHealth 237
    const merged = mergeItemModifiers([
      { stat: Stat.AttackDamage, op: ModOp.Flat, value: 18 },
      { stat: Stat.MaxHealth, op: ModOp.Flat, value: 237 },
      { stat: Stat.AttackDamage, op: ModOp.Flat, value: 10.8 },
    ]);
    const ad = merged.find((m) => m.stat === Stat.AttackDamage)!;
    expect(ad.value).toBeCloseTo(28.8, 6);
    expect(merged).toHaveLength(2);
    // canonical order: ad (offence) before maxHealth (defence)
    expect(merged[0]!.stat).toBe(Stat.AttackDamage);
  });

  it("keeps different ops on the same stat separate", () => {
    cover("shop-item-stats");
    const merged = mergeItemModifiers([
      { stat: Stat.AttackDamage, op: ModOp.Flat, value: 20 },
      { stat: Stat.AttackDamage, op: ModOp.PercentAdd, value: 0.1 },
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("authoredMagnitude / formatAuthoredBonus", () => {
  it("formats each stat by its nature (is-02)", () => {
    cover("shop-item-stats");
    expect(authoredMagnitude(Stat.AttackDamage, ModOp.Flat, 28.8)).toBe("28.8");
    expect(authoredMagnitude(Stat.MaxHealth, ModOp.Flat, 237)).toBe("237");
    expect(authoredMagnitude(Stat.AttackSpeed, ModOp.PercentAdd, 0.154)).toBe("15.4%");
    expect(authoredMagnitude(Stat.Lifesteal, ModOp.Flat, 0.36)).toBe("36%");
    expect(authoredMagnitude(Stat.CritChance, ModOp.Flat, 0.171)).toBe("17.1%");
    expect(authoredMagnitude(Stat.CritDamage, ModOp.Flat, 0.286)).toBe("28.6%");
    expect(authoredMagnitude(Stat.ManaRegen, ModOp.PercentAdd, 1)).toBe("100%");
  });

  it("labels the chip", () => {
    cover("shop-item-stats");
    expect(formatAuthoredBonus({ stat: Stat.AttackDamage, op: ModOp.Flat, value: 28.8 })).toBe("攻擊力 +28.8");
    expect(formatAuthoredBonus({ stat: Stat.Lifesteal, op: ModOp.Flat, value: 0.36 })).toBe("吸血 +36%");
  });
});

describe("isStatClaimLine", () => {
  it("strips whole-line attribute claims, keeps mechanical text (is-03)", () => {
    cover("shop-item-stats");
    // stripped (they duplicate / contradict the chips)
    for (const s of ["攻擊力+50", "力量+30", "全能力+12", "攻擊速度+50%", "生命+777", "移動速度+95", "魔力回復速度+150%", "裝甲+8"]) {
      expect(isStatClaimLine(s)).toBe(true);
    }
    // kept (real mechanics the chips cannot express)
    for (const s of ["擴散傷害60%", "15%機率造成2倍傷害", "吸血25%（法球）", "永久隱身", "傳送到同盟", "施展需求魔力：150點", "50%格擋100點傷害"]) {
      expect(isStatClaimLine(s)).toBe(false);
    }
  });
});

describe("parseItemDescription + effectLine", () => {
  it("splits rarity / 效能 / 解說 and derives the ✦ line (is-04)", () => {
    cover("shop-item-stats");
    // 丈八蛇矛's real description
    const parsed = parseItemDescription(
      "夢幻\n效能\n攻擊力+50\n力量+30\n擴散傷害60%\n\n解說\n是把相當神奇的兵器，使用者智力會降低，至於原因仍然是個謎。",
    );
    expect(parsed.rarity).toBe("夢幻");
    expect(parsed.efficacy).toEqual(["攻擊力+50", "力量+30", "擴散傷害60%"]);
    expect(parsed.lore).toContain("神奇的兵器");
    // only the non-stat-claim survives
    expect(effectLine(parsed.efficacy)).toBe("擴散傷害60%");
  });

  it("handles a 解說-only description (no 效能 block)", () => {
    cover("shop-item-stats");
    const parsed = parseItemDescription("解說\n只是一段風味文字。");
    expect(parsed.efficacy).toEqual([]);
    expect(effectLine(parsed.efficacy)).toBeNull();
    expect(parsed.lore).toContain("風味文字");
  });

  it("returns nulls for an empty/absent description", () => {
    cover("shop-item-stats");
    const parsed = parseItemDescription(undefined);
    expect(parsed.rarity).toBeNull();
    expect(parsed.lore).toBeNull();
    expect(effectLine(parsed.efficacy)).toBeNull();
  });
});

describe("buildItemRow", () => {
  it("lifts the anchor stat out and leaves the rest as chips (is-05)", () => {
    cover("shop-item-stats");
    // 妖刀村正-shaped: ad (anchor) 43.2 + lifesteal 36%, effect 吸血25%（法球）
    const row = buildItemRow(
      {
        id: "yaotou",
        name: "妖刀村正",
        modifiers: [
          { stat: Stat.AttackDamage, op: ModOp.Flat, value: 43.2 },
          { stat: Stat.Lifesteal, op: ModOp.Flat, value: 0.36 },
        ],
        description: "神器\n效能\n吸血25%（法球）\n攻擊力+30",
      },
      Stat.AttackDamage,
    );
    expect(row.rarity).toBe("神器");
    expect(row.anchorText).toBe("43.2");
    expect(row.secondary).toEqual(["吸血 +36%"]);
    expect(row.effect).toBe("吸血25%（法球）");
    // the WC3 原文 stat claim is retained for the labelled expansion, not the ✦ line
    expect(row.claims).toEqual(["攻擊力+30"]);
  });

  it("shows — via a null anchor when the item lacks the anchor stat (is-06)", () => {
    cover("shop-item-stats");
    // 武聖手鐲: crit stats, no ad → anchor null, both stats to chips
    const row = buildItemRow(
      {
        id: "wrist",
        name: "武聖手鐲",
        modifiers: [
          { stat: Stat.CritChance, op: ModOp.Flat, value: 0.171 },
          { stat: Stat.CritDamage, op: ModOp.Flat, value: 0.286 },
        ],
        description: "效能\n15%機率造成2倍傷害",
      },
      Stat.AttackDamage,
    );
    expect(row.anchorText).toBeNull();
    expect(row.secondary).toEqual(["爆擊率 +17.1%", "爆擊傷害 +28.6%"]);
    expect(row.effect).toBe("15%機率造成2倍傷害");
  });
});
