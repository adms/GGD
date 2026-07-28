/**
 * 屬性上限 (stat caps) — the pure logic behind 後台 → 屬性上限 (GH#286).
 *
 * owner, 2026-07-28:「一般上限是 4.0,搭配特殊條件如技能、道具...等效果,
 * 可以解鎖最多到 10.0。這兩個參數也可以放到後台設定」.
 *
 * ⚠️ 這一頁和它的兩個鄰居很像,而三者的語意**完全不同**:
 *   · 戰鬥系統 (combat-env) —— 每格是**倍率**(1.0 = 不變)
 *   · 基礎加成 (base-bonus) —— 每格是**加數**(0 = 沒有贈禮)
 *   · 屬性上限 (這一頁)     —— 每格是一對**天花板**
 * 所以是三份文件、三個頁面,而且這一頁每一列都寫著「一般 / 解鎖」兩個字。
 *
 * 寫入走 durable content overlay(和 基礎加成 同一條路),因為那是唯一撐得過
 * `docker compose build` 的可寫表面。
 *
 * ⚠️ 存檔一定寫**整張表**(`capsDocFor(rowsToCaps(rows))`),不是只寫被改的那一列。
 * 只寫一列的話,文件裡就會出現「有 as 沒有 ms」這種狀態,而 `capFor` 對缺鍵的
 * 屬性會退回 `STAT_CLAMPS` 且 `unlocked === base` —— 那條屬性從此不能被解鎖,
 * 而且畫面上完全看不出來。
 */
import { STAT_CLAMPS, type Stat } from "@ggd/shared/sim/stats/statTypes";
import { STAT_LABEL_ZH } from "@ggd/shared/sim/baseBonus";
import {
  CAPPABLE_STATS,
  DEFAULT_STAT_CAPS,
  capFor,
  normalizeStatCaps,
  type StatCap,
  type StatCapTable,
} from "@ggd/shared/sim/statCaps";

/** The `config` collection doc the console writes through the durable overlay. */
export const CAPS_COLLECTION = "config";
export const CAPS_DOC_ID = "stat-caps";
export const CAPS_SCHEMA = "config.stat-caps@1";

export interface StatCapsDoc {
  id: string;
  schema: string;
  caps: Record<string, StatCap>;
}

/**
 * Pull the `caps` map out of whatever the API returned (overlay doc, shipped
 * doc, or nothing). WRONG SCHEMA yields `{}` rather than being read anyway —
 * an operator who mis-saved a combat-env table here would otherwise see
 * multipliers rendered as ceilings.
 */
export function extractCaps(doc: unknown): Record<string, StatCap> {
  if (!doc || typeof doc !== "object") return {};
  const d = doc as { schema?: unknown; caps?: unknown };
  if (d.schema !== CAPS_SCHEMA) return {};
  if (!d.caps || typeof d.caps !== "object") return {};
  const out: Record<string, StatCap> = {};
  for (const [k, v] of Object.entries(d.caps as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const { base, unlocked } = v as { base?: unknown; unlocked?: unknown };
    if (typeof base !== "number" || !Number.isFinite(base)) continue;
    if (typeof unlocked !== "number" || !Number.isFinite(unlocked)) continue;
    out[k] = { base, unlocked };
  }
  return out;
}

export interface CapRow {
  stat: Stat;
  label: string;
  /** 操作者設過的值,沒碰過就是 null */
  operator: StatCap | null;
  /** 出貨預設(表裡沒有的屬性 = STAT_CLAMPS 上界,base === unlocked) */
  shipped: StatCap;
  /** 現在真的生效的 */
  effective: StatCap;
  /** 這條屬性的硬下限(顯示用,這一頁不編輯它) */
  floor: number | null;
}

/**
 * One row per CAPPABLE stat.
 *
 * ⚠️ fallback 規則必須和 sim 一致 (`statCapsFromDoc`):
 *   · 整份文件不存在(`caps === null`) → 每一列顯示**出貨預設**(攻速 4/10)
 *   · 文件存在但沒有這個 key         → 這一列是 `STAT_CLAMPS` 上界且**不可解鎖**
 * 兩者差的是「一支技能能不能把攻速推到 10」,而畫面上兩種狀態長得一模一樣 ——
 * 所以差別寫在這裡一次,不散在畫面上。
 */
export function capRows(caps: Record<string, StatCap> | null): CapRow[] {
  const table: StatCapTable | null = caps === null ? null : normalizeStatCaps(caps);
  return CAPPABLE_STATS.map((stat) => {
    const clamp = STAT_CLAMPS[stat];
    const raw = caps?.[stat];
    const operator =
      raw &&
      typeof raw.base === "number" &&
      Number.isFinite(raw.base) &&
      typeof raw.unlocked === "number" &&
      Number.isFinite(raw.unlocked)
        ? { base: raw.base, unlocked: raw.unlocked }
        : null;
    return {
      stat,
      label: STAT_LABEL_ZH[stat],
      operator,
      shipped: capFor(DEFAULT_STAT_CAPS, stat),
      effective: capFor(table ?? DEFAULT_STAT_CAPS, stat),
      floor: clamp ? clamp[0] : null,
    };
  });
}

/** Set one stat's pair. `unlocked < base` is stored as-is; the sim reads it as base. */
export function setCap(
  caps: Record<string, StatCap>,
  stat: Stat,
  cap: StatCap,
): Record<string, StatCap> {
  return { ...caps, [stat]: cap };
}

/**
 * 把畫面上**每一列**折成要 PUT 的表。這是「只存一列會悄悄關掉其他屬性的解鎖」的
 * 那條防線 —— 頁面永遠送整張表,所以文件裡不會出現半套狀態。
 */
export function rowsToCaps(rows: readonly CapRow[]): Record<string, StatCap> {
  const out: Record<string, StatCap> = {};
  for (const r of rows) {
    // 無限大的天花板(生命上限那種沒有 STAT_CLAMPS 的屬性)寫進 JSON 會變成
    // `null`,再讀回來就不是有限數 —— 那一列本來就沒有上限可設,跳過。
    if (!Number.isFinite(r.effective.base) || !Number.isFinite(r.effective.unlocked)) continue;
    out[r.stat] = { base: r.effective.base, unlocked: r.effective.unlocked };
  }
  return out;
}

/** Human summary for the page header. 只列出真的能解鎖的(unlocked > base)。 */
export function capsSummary(rows: readonly CapRow[]): string {
  const unlockable = rows.filter(
    (r) => Number.isFinite(r.effective.unlocked) && r.effective.unlocked > r.effective.base,
  );
  if (unlockable.length === 0) return "目前沒有任何屬性可以被解鎖";
  return unlockable
    .map((r) => `${r.label} ${r.effective.base} → 解鎖 ${r.effective.unlocked}`)
    .join(" · ");
}

/** The doc body to PUT. Always the FULL table the page is showing. */
export function capsDocFor(caps: Record<string, StatCap>): StatCapsDoc {
  return { id: CAPS_DOC_ID, schema: CAPS_SCHEMA, caps };
}
