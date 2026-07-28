/**
 * The champion STAT SHEET as a player should read it — one definition shared by
 * champ-select's 屬性 tab and the codex's champion page.
 *
 * WHY THIS EXISTS (task #248). Until the 三圍 landed, "base" and "per-level
 * growth" were literally `def.baseStats[k]` and `def.growth[k]`, so both tables
 * just iterated the two records. That is now WRONG: `baseStats.maxHealth` holds
 * the source map's raw 150, and the champion's real level-1 health is
 * `150 + 25×STR = 575`. A table that printed 150 (and then, obeying #125,
 * multiplied it by the combat-env `maxHealth` factor to "戰鬥實際") would be
 * confidently wrong in both columns — the exact stale-reader failure #248 was
 * told to design against.
 *
 * So the rows are computed through the SIM's own seam,
 * `sim/stats/attributes.ts championStatBase/championStatGrowth`, the same one
 * `recomputeStats` uses. For a stat with no attribute source (mr, ms, range,
 * cdr…) the helpers reduce to exactly the old `base` / `growth` numbers, so
 * nothing else about the tables changes.
 */
import {
  championStatBase,
  championStatGrowth,
  ATTR_STAT_SOURCE,
  type AttributeCarrier,
} from "@ggd/shared/sim/stats/attributes";
import { ALL_STATS, type Stat } from "@ggd/shared/sim/stats/statTypes";
import { DEFAULT_BASE_BONUS, finalizeStat, type BaseBonusTable } from "@ggd/shared/sim/baseBonus";
import { DEFAULT_STAT_CAPS, type StatCapTable } from "@ggd/shared/sim/statCaps";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";

/** One row of the stat table: the level-1 value and the per-level increment. */
export interface ChampionSheetRow {
  /** stat-doc key ("maxHealth", "ad", "mr" …) */
  readonly key: string;
  /** level-1 base INCLUDING the 三圍 term; undefined = the card is silent */
  readonly base: number | undefined;
  /** per-level increment INCLUDING attribute growth; undefined = none */
  readonly growth: number | undefined;
  /** true when an attribute contributes to this row (drives the 三圍 hint) */
  readonly fromAttribute: boolean;
  /**
   * 戰鬥實際 —— the value the player will really have at level 1: env multiplier,
   * then 基礎加成, then the stat clamp, via the SIM's own `finalizeStat`.
   *
   * ⚠️ 這一欄不能由呼叫端自己算成 `base × 倍率`。基礎加成是**加在倍率之後**的
   * (sim/baseBonus.ts),自己乘的面板會少掉那 300,而且畫面上完全看不出來 ——
   * 它只是一個「比較小的合理數字」。undefined = 這張卡對這一項沒有意見。
   */
  readonly final: number | undefined;
}

const EPS = 1e-9;
const STAT_BY_KEY = new Map<string, Stat>(ALL_STATS.map((s) => [s as string, s]));

/**
 * Every stat the card has an opinion about, in the document's own key order
 * (baseStats first, then any growth-only key), each resolved through the sim.
 */
export function championSheetRows(
  def: AttributeCarrier,
  env?: CombatEnvMultipliers,
  baseBonus: BaseBonusTable = DEFAULT_BASE_BONUS,
  /**
   * 屬性上限表 (GH#286). 缺 = **出貨預設**,不是空表 —— 空表會讓 `capFor` 退回
   * `STAT_CLAMPS`,於是後台把攻速一般上限調到 5.0 之後,面板還是印 4.0 而伺服器
   * 給 5.0。這張卡本身沒有 buff,所以這裡永遠沒有 `capRaise`:面板顯示的是
   * 「這位英雄裸裝的天花板」。
   */
  caps: StatCapTable = DEFAULT_STAT_CAPS,
): ChampionSheetRow[] {
  const base = def.baseStats as Readonly<Record<string, number | undefined>>;
  const growth = def.growth as Readonly<Record<string, number | undefined>>;
  const keys = [...new Set([...Object.keys(base), ...Object.keys(growth)])];
  return keys.map((key) => {
    const stat = STAT_BY_KEY.get(key);
    const derived =
      stat !== undefined && def.attributes !== undefined && ATTR_STAT_SOURCE[stat] !== undefined;
    if (stat === undefined || !derived) {
      // no attribute source (or a hand-edited unknown key) — the doc IS the truth
      const b = base[key];
      return {
        key,
        base: b,
        growth: growth[key],
        fromAttribute: false,
        // A hand-edited unknown key has no Stat, so there is nothing to finalize
        // — the doc value IS the number, and inventing a multiplier for it would
        // be worse than showing none.
        final: stat === undefined || b === undefined ? undefined : finalizeStat(b, stat, { env, baseBonus, caps }),
      };
    }
    const g = championStatGrowth(def, stat, env);
    const b = championStatBase(def, stat, 1, env);
    return {
      key,
      base: b,
      growth: Math.abs(g) < EPS ? undefined : g,
      fromAttribute: true,
      final: finalizeStat(b, stat, { env, baseBonus, caps }),
    };
  });
}
