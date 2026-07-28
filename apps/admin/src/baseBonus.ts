/**
 * 基礎加成 (base bonus) — the pure logic behind 後台 → 基礎加成.
 *
 * owner, 2026-07-28:「初始HP/MP/AP/AD/... 增加數值也要放到後台設定
 * 並且不參與倍率計算」.
 *
 * ⚠️ 這一頁與 戰鬥系統 (combat-env) **語意相反**,而外觀很像。那一頁每一格是
 * 倍率(1.0 = 不變),這一頁每一格是加數(0 = 沒有贈禮)。把 300 打進倍率欄位是
 * 300 倍傷害;把 3.0 打進這裡只是 +3 點血。所以它們是兩份文件、兩個頁面,而且
 * 這個檔案的每個標籤都寫了單位。
 *
 * 加成套用在 `finalizeStat`(packages/shared/src/sim/baseBonus.ts):
 *
 *     final = clamp( (base + Σflat)·(1+ΣpctAdd)·Π(1+pctMult) · envFactor
 *                    + baseBonus[stat] )
 *
 * 也就是**倍率之後、上限之前**。這正是 owner 說的「不參與倍率計算」——
 * v0.9.8 曾把 +300 加在 base 裡,`maxHealth: 3.0` 於是把它變成實際 +900,
 * 而後台顯示的仍是 300。
 *
 * 寫入走 durable content overlay(和 體素身體 同一條路),因為那是唯一撐得過
 * `docker compose build` 的可寫表面。
 */
import { ALL_STATS, type Stat } from "@ggd/shared/sim/stats/statTypes";
import {
  DEFAULT_BASE_BONUS,
  STAT_LABEL_ZH,
  baseBonusFor,
  normalizeBaseBonus,
  type BaseBonusTable,
} from "@ggd/shared/sim/baseBonus";

/** The `config` collection doc the console writes through the durable overlay. */
export const BONUS_COLLECTION = "config";
export const BONUS_DOC_ID = "base-bonus";
export const BONUS_SCHEMA = "config.base-bonus@1";

export interface BaseBonusDoc {
  id: string;
  schema: string;
  bonus: Record<string, number>;
}

export function emptyBonusDoc(): BaseBonusDoc {
  return { id: BONUS_DOC_ID, schema: BONUS_SCHEMA, bonus: {} };
}

/**
 * Pull the `bonus` map out of whatever the API returned (overlay doc, shipped
 * doc, or nothing). A doc of the WRONG SCHEMA yields `{}` rather than being
 * read anyway — an operator who mis-saved a combat-env table here would
 * otherwise see multipliers rendered as flat grants.
 */
export function extractBonus(doc: unknown): Record<string, number> {
  if (!doc || typeof doc !== "object") return {};
  const d = doc as { schema?: unknown; bonus?: unknown };
  if (d.schema !== BONUS_SCHEMA) return {};
  if (!d.bonus || typeof d.bonus !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.bonus as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export interface BonusRow {
  stat: Stat;
  label: string;
  /** what the operator has set, or null when they never touched this stat */
  operator: number | null;
  /** the SHIPPED default for this stat (0 for all but 生命上限) */
  shipped: number;
  /** what actually applies today */
  effective: number;
}

/**
 * One row per stat, in `ALL_STATS` order.
 *
 * ⚠️ 這裡的 fallback 規則和 sim 那邊 **必須一致**:`baseBonusFromDoc` 對缺文件
 * 回傳出貨預設,但對「文件存在、只是沒有這個 key」回傳 0。所以:
 *   · 整份文件不存在 → 每一格顯示出貨預設(生命 300)
 *   · 文件存在但沒有這個 key → 這一格是 **0**,不是出貨預設
 * 兩者差 300 點血。把它寫成一行、寫在這裡,而不是散在畫面上。
 */
export function bonusRows(bonus: Record<string, number> | null): BonusRow[] {
  const table: BaseBonusTable | null = bonus === null ? null : normalizeBaseBonus(bonus);
  return ALL_STATS.map((stat) => {
    const shipped = baseBonusFor(DEFAULT_BASE_BONUS, stat);
    const raw = bonus?.[stat];
    const operator = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    return {
      stat,
      label: STAT_LABEL_ZH[stat],
      operator,
      shipped,
      effective: table === null ? shipped : baseBonusFor(table, stat),
    };
  });
}

/** Set one stat's grant. `0` is a real value (「這一項沒有贈禮」), not a clear. */
export function setBonus(
  bonus: Record<string, number>,
  stat: Stat,
  value: number,
): Record<string, number> {
  return { ...bonus, [stat]: value };
}

/** Drop a stat from the doc entirely — the row goes back to 0. */
export function forgetBonus(bonus: Record<string, number>, stat: Stat): Record<string, number> {
  const next = { ...bonus };
  delete next[stat];
  return next;
}

/** Human summary for the page header. */
export function bonusSummary(rows: readonly BonusRow[]): string {
  const active = rows.filter((r) => r.effective !== 0);
  if (active.length === 0) return "目前沒有任何基礎加成";
  return active.map((r) => `${r.label} ${r.effective > 0 ? "+" : ""}${r.effective}`).join(" · ");
}

/** The doc body to PUT. Always the FULL table the page is showing. */
export function bonusDocFor(bonus: Record<string, number>): BaseBonusDoc {
  return { id: BONUS_DOC_ID, schema: BONUS_SCHEMA, bonus };
}
