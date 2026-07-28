/**
 * statDisplay — the ONE place the shop turns a sim `Stat` into text.
 *
 * Two audiences read a stat number in this shop and they are NOT the same:
 *
 *   the PANEL shows RESOLVED absolutes — "128.4 攻擊力", "17% 爆擊率" — the value
 *     the pipeline actually produced for THIS champion right now, plus the
 *     signed delta a hypothetical item would add. Percentages here are resolved
 *     (a `+15.4% 攻速` item shows as `+0.31` on a 0.5-base champion) because the
 *     panel answers "what does it DO FOR ME".
 *   the ROW shows AUTHORED values — build-independent, so the same item reads
 *     the same on every row and after every purchase (see itemStats.ts). It
 *     reuses only the number formatters below, never the resolved path.
 *
 * Keeping both here means the two can never format the same stat two ways.
 *
 * The 15-stat order is FIXED (never sorted, never reordered by magnitude): a
 * fixed grid is what makes a stat's position memorisable, and #106 asked for
 * 「英雄全屬性狀態」 — all fifteen, always, even the two (cdr, range) that no
 * catalogue item moves.
 */
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import {
  ATTR_KEYS,
  ATTR_LABEL,
  championAttribute,
  type AttrBonus,
  type AttrKey,
  type AttributeCarrier,
} from "@ggd/shared/sim/stats/attributes";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";

/** How a stat's magnitude reads as text. */
type StatUnit =
  | "int" //     rounded integer            (護甲 42, 生命 1842)
  | "num1" //    one decimal, trailing .0 trimmed (攻擊力 128.4, 移動速度 5.8)
  | "num2" //    two decimals               (攻擊速度 0.72)
  | "pct" //     value×100 %                (爆擊率 17%, 吸血 36%)
  | "pctBonus"; // (value−1)×100 %, for a multiplier stored as 1.75 = +75%

export interface StatMeta {
  readonly stat: Stat;
  readonly label: string;
  readonly unit: StatUnit;
  /** which panel column (0 = offence/magic, 1 = defence/utility). */
  readonly column: 0 | 1;
}

/**
 * The panel order, top-to-bottom within each column. Column 0 is offence+magic,
 * column 1 is defence+resources+mobility — the two halves of a build.
 */
export const STAT_META: readonly StatMeta[] = [
  // ---- column 0: offence / magic ----
  { stat: Stat.AttackDamage, label: "攻擊力", unit: "num1", column: 0 },
  { stat: Stat.AttackSpeed, label: "攻擊速度", unit: "num2", column: 0 },
  { stat: Stat.CritChance, label: "爆擊率", unit: "pct", column: 0 },
  { stat: Stat.CritDamage, label: "爆擊傷害", unit: "pctBonus", column: 0 },
  { stat: Stat.Lifesteal, label: "吸血", unit: "pct", column: 0 },
  { stat: Stat.AbilityPower, label: "法術強度", unit: "num1", column: 0 },
  { stat: Stat.CooldownReduction, label: "冷卻縮減", unit: "pct", column: 0 },
  { stat: Stat.AttackRange, label: "攻擊距離", unit: "num1", column: 0 },
  // ---- column 1: defence / resources / mobility ----
  { stat: Stat.MaxHealth, label: "生命", unit: "int", column: 1 },
  { stat: Stat.HealthRegen, label: "生命回復", unit: "num1", column: 1 },
  { stat: Stat.MaxMana, label: "魔力", unit: "int", column: 1 },
  { stat: Stat.ManaRegen, label: "魔力回復", unit: "num1", column: 1 },
  { stat: Stat.Armor, label: "護甲", unit: "num1", column: 1 },
  { stat: Stat.MagicResist, label: "魔法抗性", unit: "num1", column: 1 },
  // A 0..1 rate like 爆擊率/吸血, hence `pct`. Sits with the other mitigation
  // stats: it is defence, not mobility. Only basic attacks can be evaded —
  // abilities never are (see sim/combat/evasion.ts for why), so the panel value
  // deliberately does NOT promise blanket damage avoidance.
  { stat: Stat.Evasion, label: "迴避", unit: "pct", column: 1 },
  { stat: Stat.MoveSpeed, label: "移動速度", unit: "num1", column: 1 },
];

// ⚠️ Every `Stat` MUST have a row above. `META_BY_STAT` is built with an
// `as Record<Stat, StatMeta>` cast, so a missing stat is NOT a compile error —
// it silently yields `undefined` at runtime and the panel just drops that row.
// `evasion` was added to the sim and this table was missed, so the 英雄全屬性狀態
// panel showed 15 of 16 stats with nothing to indicate the 16th existed. The
// assertion below turns that class of omission into a loud startup failure.

const META_BY_STAT: Readonly<Record<Stat, StatMeta>> = Object.fromEntries(
  STAT_META.map((m) => [m.stat, m]),
) as Record<Stat, StatMeta>;

/**
 * The guard the cast above cannot provide. Enumerating `Stat` at runtime is the
 * only way to catch a stat that exists in the sim but has no row here, because
 * the `as Record<Stat, StatMeta>` assertion tells TypeScript the map is total
 * when it is merely typed that way.
 *
 * Exported (not run at import time) so it is a test assertion rather than a
 * module side effect — a panel must never fail to load over a display label.
 */
export function missingStatMetaRows(): Stat[] {
  return Object.values(Stat).filter((s) => META_BY_STAT[s] === undefined);
}

export function statMeta(stat: Stat): StatMeta {
  return META_BY_STAT[stat];
}

export function statLabel(stat: Stat): string {
  return META_BY_STAT[stat]?.label ?? stat;
}

/** Trim a fixed-decimal string of a redundant trailing `.0` / `.00`. */
function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/**
 * Format a RESOLVED absolute stat value for the panel. `爆擊傷害` is a stored
 * multiplier (1.75), shown as its bonus over 1.0 (+75%); everything else reads
 * literally.
 */
export function formatStatValue(stat: Stat, value: number): string {
  const unit = META_BY_STAT[stat]?.unit ?? "num1";
  switch (unit) {
    case "int":
      return String(Math.round(value));
    case "num1":
      return trimZeros(value.toFixed(1));
    case "num2":
      return value.toFixed(2);
    case "pct":
      return `${Math.round(value * 100)}%`;
    case "pctBonus":
      return `${Math.round((value - 1) * 100)}%`;
  }
}

/**
 * Format a stat DELTA (after − before) with an explicit sign. A delta is always
 * the change in the underlying quantity, so `爆擊傷害` and every other percent
 * stat use the same `Δ×100 %` here (only the absolute reading subtracts the 1.0
 * base — that asymmetry is intentional and lives above).
 */
export function formatStatDelta(stat: Stat, delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const mag = Math.abs(delta);
  const unit = META_BY_STAT[stat]?.unit ?? "num1";
  switch (unit) {
    case "int":
      return `${sign}${Math.round(mag)}`;
    case "num1":
      return `${sign}${trimZeros(mag.toFixed(1))}`;
    case "num2":
      return `${sign}${trimZeros(mag.toFixed(2))}`;
    case "pct":
    case "pctBonus":
      return `${sign}${trimZeros((mag * 100).toFixed(1))}%`;
  }
}

/**
 * A delta counts as "visible" (worth drawing a `+N` for) only when it rounds to
 * a nonzero string at the stat's own display precision — otherwise a
 * 0.4-of-a-percent rounding artefact would paint a `+0%` chip on a stat the
 * item does not touch.
 */
/**
 * ── 三圍 (#260) ─────────────────────────────────────────────────────────────
 * One row of the shop's 力／敏／智 panel. Owner: 「記得 力敏智三屬性也要顯示在
 * SHOP 的玩家角色屬性表」.
 *
 * `total` is the number the panel prints; `bought` is the 能力屬性強化 part of
 * it, shown as the `(+x.x)` beside it exactly as the stat grid shows its own.
 * `innate` is the champion's own value at this level, so `total = innate +
 * bought` is visible arithmetic rather than a claim.
 */
export interface AttrRow {
  key: AttrKey;
  label: string;
  innate: number;
  bought: number;
  total: number;
}

/**
 * Build the three rows for a champion at a level, with what was bought.
 *
 * Resolved through the SHARED `championAttribute` — the same function
 * `championStatBase` calls — so the panel's 力量 and the sim's 力量 are one
 * number with one definition. A champion with no 三圍 block reads 0 + bought,
 * which is exactly what the sim gives it.
 *
 * `env` is accepted (and ignored by `championAttribute`) because an attribute is
 * NOT env-scaled: the combat-env coefficients scale attribute → STAT, and those
 * are applied where the stat is computed. Taking the parameter keeps the caller
 * honest about that instead of leaving the reader to wonder whether #125's
 * post-multiplier rule was forgotten here.
 */
export function attributeRows(
  def: AttributeCarrier | undefined,
  level: number,
  bought: AttrBonus,
  _env?: CombatEnvMultipliers,
): AttrRow[] {
  if (!def) return [];
  return ATTR_KEYS.map((key) => {
    const innate = championAttribute(def, key, level);
    return {
      key,
      label: ATTR_LABEL[key],
      innate,
      bought: bought[key],
      total: innate + bought[key],
    };
  });
}

/** 三圍 print format: one decimal, so a bought +0.1 is never rounded away. */
export function formatAttrValue(value: number): string {
  return value.toFixed(1);
}

export function isVisibleDelta(stat: Stat, delta: number): boolean {
  if (delta === 0) return false;
  const unit = META_BY_STAT[stat]?.unit ?? "num1";
  const mag = Math.abs(delta);
  switch (unit) {
    case "int":
      return Math.round(mag) >= 1;
    case "num1":
      return mag >= 0.05;
    case "num2":
      return mag >= 0.005;
    case "pct":
    case "pctBonus":
      return mag * 100 >= 0.05;
  }
}
