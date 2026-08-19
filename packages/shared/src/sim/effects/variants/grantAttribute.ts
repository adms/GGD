/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { AttrBasis } from "../../stats/attributes";

/**
 * grantAttribute — PERMANENTLY add 力/敏/智, with a 「每 N 次」 gate and a
 * ceiling on the resulting attribute (07-00 獸化心靈). See
 * `effects/grantAttribute.ts` for why an attribute is not a StatModifier and
 * why the tally advances even when the ceiling refuses the payout.
 */
export interface GrantAttributeVariant {
  kind: "grantAttribute";
  attr: "str" | "agi" | "int";
  /**
   * "flat" (default) = `amount` points. "pctOfCurrent" = `amount` × the
   * LIVE attribute, so 1.0 is 「×2」. A real decision: a flat number is
   * enormous at level 1 and irrelevant at level 9.
   */
  mode?: "flat" | "pctOfCurrent";
  /** points (flat) or ratio of the live attribute (pctOfCurrent) per PAYOUT */
  amount: number;
  /**
   * ABSENT = PERMANENT (獸化心靈's WC3 `ModifyHeroStat`). Present = the
   * grant is reversed at an absolute tick (龍紋記憶's 3 秒). Refreshes per
   * `<origin>|<attr>` rather than stacking, so a chain-stun cannot reach ×8.
   */
  durationSec?: number;
  /** pay only on every Nth trigger. absent/1 = every time. 獸化心靈 = 8 */
  everyNth?: number;
  /** refuse the payout once the LIVE attribute reaches this. 獸化心靈 = 120 */
  maxAttribute?: number;
  /**
   * WHICH 三圍 `maxAttribute` measures — 決策點做成欄位 (CLAUDE.md 第一守則),
   * and the axis is the SOURCE MAP'S OWN, not one invented here.
   *
   * Blizzard's `GetHeroStatBJ(stat, unit, includeBonuses)` takes the answer
   * as a parameter, and the extracted spells under
   * `tools/w3x-import/out/GoDieEX22s/jass-spells/` use both values:
   * damage formulas read `…,true)` (bonuses in), while 蒼月潮 07-00 獸化心靈's
   * hidden ceiling reads `GetHeroStatBJ(1,GetKillingUnit(),false)<$8C`
   * (bonuses OUT). GGD's two accumulators line up exactly —
   * `ChampionComp.attrBonus` ≡ `ModifyHeroStat` (base), an item's
   * `ModifierSource.attributes` ≡ equipment (bonus).
   *
   *   · `"base"` (DEFAULT, and the conservative one) — innate + growth +
   *     三選一 picks + previous `grantAttribute` payouts. This is what
   *     獸化心靈's JASS measures, and it keeps a champion's innate passive
   *     UNAFFECTED by what he is carrying: equipping 朗基努斯之槍 (+12 AGI)
   *     must not silently retire 蒼月潮's kill-stacking 12 points early.
   *     It is also byte-identical to the behaviour every shipped doc had
   *     before items could grant 三圍 at all.
   *   · `"total"` — items included, for a future card whose ceiling is meant
   *     to mean 「總敏捷」 in the same sense a weapon's 效能 line does.
   */
  maxAttributeBasis?: AttrBasis;
  /**
   * WHERE THE POINTS ARE BANKED —— 決策點做成欄位, and the difference is
   * 「賣掉之後還在不在」.
   *
   *   · `"champion"` (DEFAULT, and byte-identical to every doc authored
   *     before this field) — `ChampionComp.attrBonus`, WC3 `ModifyHeroStat`.
   *     Permanent, and deliberately INDEPENDENT of whatever caused it:
   *     蒼月潮 07-00 獸化心靈 earns the 敏捷 with his own hands and it is his.
   *   · `"source"` — the accumulator on the `ModifierSource` that FIRED this
   *     hook (`ModifierSource.attrEarned`). 甘豆腐之袍 godie-i03f 「每殺死一名
   *     英雄可以額外獲得 10點智慧，上限 160」: an ITEM's stacks belong to the
   *     item, so selling the robe takes the 160 智慧 with it. The whole class
   *     of 「賣掉還留著」 bug becomes unreachable rather than tested-for,
   *     because `detachSource` drops the accumulator and there is nowhere
   *     else the points could be.
   *
   * ⚠️ `"source"` REQUIRES a hook origin (`origin === "hook:<sourceId>"`),
   * which is what every item passive / aura hook has. Run from an ABILITY's
   * effect list there is no source to bank into and the payout is REFUSED
   * (never silently redirected into `attrBonus`, which would be the
   * permanent-and-unsellable semantics wearing the sellable one's name).
   */
  store?: "champion" | "source";
  /**
   * `store: "source"` ONLY —— the ceiling on how much THIS SOURCE has paid
   * out in total, per attribute. 甘豆腐之袍's 「上限 160」 = 16 stacks of 10.
   *
   * ⚠️ IT IS NOT {@link maxAttribute}, and the difference is why this field
   * had to exist. `maxAttribute` caps the champion's RESULTING 三圍 (獸化心靈's
   * 「敏捷 < 120」, innate + level growth included), so on a high-level 智慧
   * hero it would refuse the very first stack and the robe would be a card
   * that does nothing. This one counts only what the robe itself has issued.
   *
   * A payout that would cross the ceiling is CLAMPED to the remaining
   * headroom, never refused: 「上限 160」 is a promise about the total, and
   * refusing would make an item authored 15/160 pay 150 instead of 160.
   */
  maxSourceTotal?: number;
}
