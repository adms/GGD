/**
 * 傷害排行榜 (#636) —— 後台頁的純邏輯半邊(fetch / 過濾 / 佔比 / 分頁)。
 *
 * 資料鏈:game-server 每場收尾把 top 單發寫進 Redis zset
 * (apps/game-server/src/stats/damageBoard.ts),這裡經 platform 的
 * admin proxy 讀 `/admin/damage-board`,一次拿前 1000 筆,**過濾與分頁都在
 * 瀏覽器做** —— 1000 筆 JSON 遠小於一張英雄頭像,來回打 server 過濾只是把
 * 一個陣列 filter 變成一條要維護的查詢語言。
 *
 * ⚠️ 佔比的計算基礎:**目前過濾結果內**的傷害總和(不是全 zset)——
 * 頁面上要把這句話印出來(CLAUDE.md:百分比一定要標出計算基礎)。
 */
import { api } from "./api";

/** 與 game-server `DamageBoardEntry` 同形(wire 契約;多餘欄位忽略)。 */
export interface DamageBoardRow {
  round: number;
  championId: string;
  items: string[];
  abilityId: string;
  slot: string;
  damage: number;
  /** epoch ms */
  ts: number;
  version: string;
  matchId: string;
  seatId: number;
  /**
   * ⭐ GH#658 —— 這一次施放打在**單一英雄**身上的最大一擊。
   * `null` = 這一筆是 #658 之前寫進 zset 的舊資料(⛔ 不是 0 傷害)。
   */
  victimDamage: number | null;
  /** 那一擊命中當下,該目標的最大生命。`null` = 不知道(同上)。 */
  victimMaxHp: number | null;
}

/**
 * GH#658 —— 「這一發佔了目標多少血」。**推導**,⛔ 不存第二份(第〇·四守則)。
 *
 * ⚠️ 回 `null` 而不是 0:舊資料沒有這兩格。0 是一個**真的**百分比,
 * 拿它代表「不知道」會讓每一筆舊列看起來都像沒打到人(#658 逐字點名的坑)。
 */
export function pctOfMaxHp(r: Pick<DamageBoardRow, "victimDamage" | "victimMaxHp">): number | null {
  const { victimDamage: d, victimMaxHp: m } = r;
  if (d === null || m === null || !(m > 0) || !(d > 0)) return null;
  return d / m;
}

export interface DamageBoardResp {
  total: number;
  rows: DamageBoardRow[];
}

/** 寬鬆正規化:壞列跳過,不讓一筆垃圾清空整頁。 */
export function normalizeDamageBoard(v: unknown): DamageBoardResp {
  const out: DamageBoardResp = { total: 0, rows: [] };
  if (typeof v !== "object" || v === null) return out;
  const o = v as Record<string, unknown>;
  if (typeof o.total === "number") out.total = o.total;
  if (!Array.isArray(o.rows)) return out;
  for (const r of o.rows) {
    if (typeof r !== "object" || r === null) continue;
    const e = r as Record<string, unknown>;
    if (
      typeof e.championId !== "string" ||
      typeof e.abilityId !== "string" ||
      typeof e.damage !== "number" ||
      !Number.isFinite(e.damage)
    )
      continue;
    out.rows.push({
      round: typeof e.round === "number" ? e.round : 0,
      championId: e.championId,
      items: Array.isArray(e.items) ? e.items.filter((x): x is string => typeof x === "string") : [],
      abilityId: e.abilityId,
      slot: typeof e.slot === "string" ? e.slot : "",
      damage: e.damage,
      ts: typeof e.ts === "number" ? e.ts : 0,
      version: typeof e.version === "string" ? e.version : "",
      matchId: typeof e.matchId === "string" ? e.matchId : "",
      seatId: typeof e.seatId === "number" ? e.seatId : -1,
      // ⚠️ 缺席 → `null`(不知道),⛔ 不是 0 —— 見 {@link pctOfMaxHp}。
      victimDamage: typeof e.victimDamage === "number" && Number.isFinite(e.victimDamage) ? e.victimDamage : null,
      victimMaxHp: typeof e.victimMaxHp === "number" && Number.isFinite(e.victimMaxHp) ? e.victimMaxHp : null,
    });
  }
  return out;
}

/** 前 1000 筆(依 damage 降冪,server 端已排序)。 */
export async function fetchDamageBoard(count = 1_000): Promise<DamageBoardResp> {
  const raw = await api.request<unknown>(`/admin/damage-board?count=${count}`);
  return normalizeDamageBoard(raw);
}

/** 過濾器 —— "" = 不過濾。 */
export interface DamageBoardFilter {
  championId: string;
  abilityId: string;
  version: string;
  /**
   * ⭐ GH#658「只看一擊超過門檻的」。0 = 不過濾。
   * ⚠️ 門檻本身是 `config.damage-rules@1` 的 `oneShotPctOfMaxHp`(後台可調),
   * ⛔ 這裡不寫死 —— 頁面把當下生效的值填進來。
   */
  minPctOfMaxHp: number;
}

export function filterDamageRows(
  rows: readonly DamageBoardRow[],
  f: DamageBoardFilter,
): DamageBoardRow[] {
  return rows.filter((r) => {
    if (f.championId !== "" && r.championId !== f.championId) return false;
    if (f.abilityId !== "" && r.abilityId !== f.abilityId) return false;
    if (f.version !== "" && r.version !== f.version) return false;
    if (f.minPctOfMaxHp > 0) {
      const p = pctOfMaxHp(r);
      // ⚠️ 不知道的那些**被濾掉**,⛔ 不是當成 0 也⛔ 不是通通留下 ——
      // 這個過濾器問的是「有沒有超過門檻」,而舊資料回答不了。
      if (p === null || p < f.minPctOfMaxHp) return false;
    }
    return true;
  });
}

/** 一隻英雄在目前過濾結果內的佔比。 */
export interface ChampionShare {
  championId: string;
  /** 上榜筆數 */
  count: number;
  totalDamage: number;
  /** totalDamage / 過濾結果全體 totalDamage × 100;全體為 0 時是 0 */
  sharePct: number;
}

/** 比例分布(owner:「比例分布」)。依 totalDamage 降冪,同值依 id 升冪。 */
export function championShares(rows: readonly DamageBoardRow[]): ChampionShare[] {
  const byId = new Map<string, ChampionShare>();
  let grand = 0;
  for (const r of rows) {
    let s = byId.get(r.championId);
    if (!s) {
      s = { championId: r.championId, count: 0, totalDamage: 0, sharePct: 0 };
      byId.set(r.championId, s);
    }
    s.count += 1;
    s.totalDamage += r.damage;
    grand += r.damage;
  }
  const out = [...byId.values()];
  for (const s of out) s.sharePct = grand > 0 ? (s.totalDamage / grand) * 100 : 0;
  return out.sort((a, b) =>
    b.totalDamage !== a.totalDamage
      ? b.totalDamage - a.totalDamage
      : a.championId < b.championId
        ? -1
        : 1,
  );
}

/** 目前過濾結果的一頁(1-based page)。 */
export function pageOf<T>(rows: readonly T[], page: number, perPage: number): T[] {
  const p = Math.max(1, Math.floor(page));
  return rows.slice((p - 1) * perPage, p * perPage);
}

/** 下拉選單的選項 —— 去重 + 升冪。 */
export function distinctValues(
  rows: readonly DamageBoardRow[],
  key: "championId" | "abilityId" | "version",
): string[] {
  return [...new Set(rows.map((r) => r[key]).filter((v) => v !== ""))].sort();
}
