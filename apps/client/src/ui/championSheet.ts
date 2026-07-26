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
      return { key, base: base[key], growth: growth[key], fromAttribute: false };
    }
    const g = championStatGrowth(def, stat, env);
    return {
      key,
      base: championStatBase(def, stat, 1, env),
      growth: Math.abs(g) < EPS ? undefined : g,
      fromAttribute: true,
    };
  });
}
