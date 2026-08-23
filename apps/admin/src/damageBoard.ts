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
    });
  }
  return out;
}

/** 前 1000 筆(依 damage 降冪,server 端已排序)。 */
export async function fetchDamageBoard(count = 1_000): Promise<DamageBoardResp> {
  const raw = await api.request<unknown>(`/admin/damage-board?count=${count}`);
  return normalizeDamageBoard(raw);
}

/** 三格過濾器 —— "" = 不過濾。 */
export interface DamageBoardFilter {
  championId: string;
  abilityId: string;
  version: string;
}

export function filterDamageRows(
  rows: readonly DamageBoardRow[],
  f: DamageBoardFilter,
): DamageBoardRow[] {
  return rows.filter(
    (r) =>
      (f.championId === "" || r.championId === f.championId) &&
      (f.abilityId === "" || r.abilityId === f.abilityId) &&
      (f.version === "" || r.version === f.version),
  );
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
