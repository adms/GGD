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
  baseBonusBounds,
  baseBonusFinalClamp,
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
  /** legal input range for this stat (task #277) — the SAME numbers the sim clamps to */
  min: number;
  max: number;
  /**
   * The FINAL-VALUE clamp this stat is subject to, or null (task #279).
   * Present = a number the operator types here can be silently eaten by
   * `finalizeStat`, and the page has to say so — the copy promises
   * 「填 300 玩家就是多 300」, which is false for these six stats.
   */
  finalClamp: readonly [number, number] | null;
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
    const [min, max] = baseBonusBounds(stat);
    return {
      stat,
      label: STAT_LABEL_ZH[stat],
      operator,
      shipped,
      effective: table === null ? shipped : baseBonusFor(table, stat),
      min,
      max,
      finalClamp: baseBonusFinalClamp(stat),
    };
  });
}

// ------------------------------------------------------------ validation ----

/**
 * Field-level validation for one input box (task #277), mirroring
 * `baseBonusBounds` — the SAME function the Zod schema and the sim clamp use,
 * so a value this page accepts is a value the write and the engine accept.
 * Returns a zh-Hant message, or "" when the value is legal.
 *
 * ⚠️ 為什麼是「即時」而不是「按下儲存才擋」。這一頁的每個欄位都是全域的:
 * `maxHealth: -9999` 會讓 115 位英雄全部開場即死。操作者應該在**打字的當下**
 * 就看見紅框,而不是先送出去、再從一個 400 猜自己做錯了什麼。
 */
export function validateBonusInput(text: string, stat: Stat): string {
  const t = text.trim();
  if (t === "") return "請輸入數字（0 = 沒有贈禮）";
  const n = Number(t);
  if (!Number.isFinite(n)) return "必須是數字";
  const [min, max] = baseBonusBounds(stat);
  if (n < min) return `不能是負數（下限 ${min}）—— 要全域下修請用「戰鬥系統」的倍率`;
  if (n > max) return `超過這一項的上限 ${max}`;
  return "";
}

/**
 * The 「這一列有上限」 note, or null (task #279).
 *
 * The page's own copy says 「填 300 玩家就是多 300」. For the six stats that
 * carry a `STAT_CLAMPS` entry that is NOT TRUE: `finalizeStat` clamps AFTER
 * adding the grant, so an operator who types 3 into 攻擊速度 gets 4.0 (the
 * ceiling) on every champion and no message anywhere. This is the message.
 */
export function bonusClampNote(row: BonusRow): string | null {
  if (!row.finalClamp) return null;
  const [lo, hi] = row.finalClamp;
  return `⚠ 最終值夾在 ${lo} ~ ${hi}：加完之後超過 ${hi} 的部分會被吃掉，玩家拿不到`;
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

/**
 * 出貨預設那句話,**從 `DEFAULT_BASE_BONUS` 算出來**(不是寫死在文案裡)。
 *
 * ⚠️ 這個函式存在的唯一理由是一次真的發生過的說謊。頁面抬頭寫死了
 * 「出貨預設是生命上限 +300」,而 owner 2026-07-30 把出貨值改成 650 之後,
 * 同一個畫面上:
 *   · 每一列的「出貨預設」欄印 650(它讀 `DEFAULT_BASE_BONUS`)
 *   · 抬頭印 +300         ← 謊話
 *   · 「還原出貨版」的確認句印 +300 ← 謊話,而且是在一個**破壞性**按鈕上
 * 三個數字兩個錯,而操作者要靠它決定要不要按下那顆沒有 undo 的按鈕。
 *
 * 讀出來就不會落後。CLAUDE.md:「語意改了,舊文案就是謊話,必須一起改」——
 * 最可靠的「一起改」是根本不要有第二份。
 */
export function shippedBonusNote(): string {
  const gifts = ALL_STATS.map((s) => ({ s, v: baseBonusFor(DEFAULT_BASE_BONUS, s) })).filter(
    (g) => g.v !== 0,
  );
  if (gifts.length === 0) return "每一項都是 0（沒有任何贈禮）";
  return `${gifts.map((g) => `${STAT_LABEL_ZH[g.s]} ${g.v > 0 ? "+" : ""}${g.v}`).join(" · ")}，其餘為 0`;
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
