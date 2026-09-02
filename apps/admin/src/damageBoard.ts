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
import { DEFAULT_ONE_SHOT_PCT_OF_MAX_HP } from "@ggd/shared/content";
import { api, getOverlayDoc, getShippedDoc } from "./api";

/** GH#658 的門檻住在這一份 config 的這一格。 */
export const DAMAGE_RULES_DOC_ID = "damage-rules";
const ONE_SHOT_FIELD = "oneShotPctOfMaxHp";

/** 一份 `config.damage-rules@1` 文件裡的門檻;讀不到回 `null`(⛔ 不是出貨值)。 */
export function readOneShotThreshold(doc: unknown): number | null {
  if (typeof doc !== "object" || doc === null) return null;
  const v = (doc as Record<string, unknown>)[ONE_SHOT_FIELD];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * 目前**生效**的門檻:耐久覆蓋層 → repo 的出貨檔 → 程式裡的出貨常數。
 *
 * ⚠️ 順序就是 config 的生效順序(覆蓋層蓋掉 `content/config/`)——
 * 後台那一頁標紅的界線必須和 owner 在「傷害規則」那一頁看到的是同一個數字,
 * ⛔ 不可以自己抄一份(第〇·四守則)。三層都讀不到就退回出貨常數並繼續 ——
 * 一頁唯讀報表不該因為一個設定端點慢了就整頁爆紅。
 */
export async function fetchOneShotThreshold(): Promise<number> {
  try {
    const ov = readOneShotThreshold(await getOverlayDoc("config", DAMAGE_RULES_DOC_ID));
    if (ov !== null) return ov;
  } catch {
    /* fail-open —— 見上面 */
  }
  try {
    const sh = readOneShotThreshold((await getShippedDoc("config", DAMAGE_RULES_DOC_ID)).doc);
    if (sh !== null) return sh;
  } catch {
    /* fail-open */
  }
  return DEFAULT_ONE_SHOT_PCT_OF_MAX_HP;
}

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
  /**
   * ⭐ GH#914 —— 命中幾個英雄 / 幾隻小怪。
   * ⚠️ ⭐ **兩個刻意分開**（owner 逐字）：一發掃 30 隻殭屍與一發打中 3 個英雄
   * 是**完全不同的事件**。⛔ 缺席 = `null`（舊資料），⛔ 不是 0。
   */
  heroHits: number | null;
  mobHits: number | null;
  /** ⭐ 施放當下的等級。⛔ 缺席 = `null`（舊資料），⛔ 不是 0。 */
  casterLevel: number | null;
}

/**
 * GH#658 —— 「這一發佔了目標多少血」。**推導**,⛔ 不存第二份(第〇·四守則)。
 *
 * ⚠️ 回 `null` 而不是 0:舊資料沒有這兩格。0 是一個**真的**百分比,
 * 拿它代表「不知道」會讓每一筆舊列看起來都像沒打到人(#658 逐字點名的坑)。
 */
/**
 * ⭐ GH#914 —— **每目標傷害** ＝ 總傷害 ÷ 命中數。
 *
 * ⚠️ ⭐ 它是**推導欄**（⛔ 不存）：存一份就是第二個住處，而它必然與
 * `damage` / `heroHits` / `mobHits` 漂掉。
 *
 * ⛔ 命中數缺席或為 0 ⇒ `null`（⛔ 不可以除以 0，⛔ 也不是 `damage` 本身）。
 * ⭐ 分母是**英雄＋小怪**：這一欄問的是「一發平均打多痛」，
 * ⇒ 兩種目標都算（⛔ 而「打的是誰」由旁邊那兩欄分開回答）。
 */
export function damagePerTarget(
  r: Pick<DamageBoardRow, "damage" | "heroHits" | "mobHits">,
): number | null {
  if (r.heroHits === null && r.mobHits === null) return null;
  const n = (r.heroHits ?? 0) + (r.mobHits ?? 0);
  return n > 0 ? r.damage / n : null;
}

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
      // ⭐ GH#914 —— 三個新欄位，⚠️ 缺席一律 `null`（⛔ 不是 0）：
      //   0 會讓舊資料看起來像「一個人都沒打中」或「等級 0」。
      heroHits: typeof e.heroHits === "number" && Number.isFinite(e.heroHits) ? e.heroHits : null,
      mobHits: typeof e.mobHits === "number" && Number.isFinite(e.mobHits) ? e.mobHits : null,
      casterLevel:
        typeof e.casterLevel === "number" && Number.isFinite(e.casterLevel) ? e.casterLevel : null,
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

// ---------------------------------------------------------------------------
// 🔀 GH#914 —— 每一欄都排得動
// ---------------------------------------------------------------------------

/**
 * ⭐⭐ **一列一欄的描述表** —— ⛔ 不是十個 `if`。
 *
 * ── ⛔ 在此之前 ─────────────────────────────────────────────────────────
 * 表頭是**一個純字串陣列**：
 * `["#","傷害","佔目標血量","英雄","技能","槽位","回合","裝備","版本","時間"]`
 * ⇒ ⭐ 它連「哪一欄對應哪一個欄位」都不知道，⛔ 所以排序無從掛起。
 *
 * ── ⭐ 為什麼是一張表（第零守則⑨：N 個同型 = K 個模板 + 一張表）─────────
 * 十欄 × 排序 ＝ 十段幾乎一樣的比較程式。⇒ ⭐ 一個 `cmp` 介面 ＋ 一張表。
 * ⛔ 加第十一欄時不會有人「忘記讓它可排序」——它沒有那個選項。
 *
 * ── ⚠️ ⭐ 缺席一律排**最後**（⛔ 不論升冪降冪）────────────────────────
 * 舊資料沒有 `heroHits` / `casterLevel`。把 `null` 當 0 排會讓它們
 * **擠在升冪的最前面**，看起來像「一個人都沒打中的爛技能」。
 * ⭐ 而排最後是唯一誠實的答案：**不知道 ≠ 最小**。
 */
export interface DamageBoardColumn {
  readonly key: string;
  readonly label: string;
  /** ⭐ 排序鍵；`null` = 這一列沒有這個值（⇒ 永遠排最後）。 */
  readonly sortKey: (r: DamageBoardRow) => number | string | null;
  /** ⛔ 不可排序的欄（例如「#」序號）。 */
  readonly sortable?: false;
}

/** ⭐ 出貨的欄位表 —— 顯示順序就是這個順序。 */
export const DAMAGE_BOARD_COLUMNS: readonly DamageBoardColumn[] = Object.freeze([
  { key: "idx", label: "#", sortKey: () => null, sortable: false },
  // ⭐ owner 要「命中所有敵人累積總傷害」—— ⚠️ 而那**就是這一欄**
  //   （`damageBoard.ts` 的註解逐字：「這一次施放打出的**總傷害**」）。
  //   ⇒ ⛔ 不新增第二欄（第〇·四守則），⭐ 只把標題講清楚。
  { key: "damage", label: "傷害（全目標累積）", sortKey: (r) => r.damage },
  { key: "pct", label: "佔目標血量", sortKey: (r) => pctOfMaxHp(r) },
  // ⭐ entry 早就有 `victimDamage`，⛔ 而畫面從來沒顯示它 ——
  //   ⚠️ 百分比**藏住了絕對值**：「佔 40%」在 3,000 血與 30,000 血的人身上差十倍。
  { key: "topHit", label: "單體最大一擊", sortKey: (r) => r.victimDamage },
  { key: "heroHits", label: "命中英雄", sortKey: (r) => r.heroHits },
  { key: "mobHits", label: "命中小怪", sortKey: (r) => r.mobHits },
  { key: "perTarget", label: "每目標傷害", sortKey: (r) => damagePerTarget(r) },
  { key: "championId", label: "英雄", sortKey: (r) => r.championId },
  { key: "abilityId", label: "技能", sortKey: (r) => r.abilityId },
  { key: "slot", label: "槽位", sortKey: (r) => r.slot },
  { key: "level", label: "等級", sortKey: (r) => r.casterLevel },
  { key: "round", label: "回合", sortKey: (r) => r.round },
  { key: "items", label: "裝備", sortKey: (r) => r.items.length },
  { key: "matchId", label: "同場", sortKey: (r) => r.matchId },
  { key: "version", label: "版本", sortKey: (r) => r.version },
  { key: "ts", label: "時間", sortKey: (r) => r.ts },
]);

export type SortDir = "asc" | "desc";

/**
 * ⭐ 依某一欄排序（**穩定**）。
 *
 * ⚠️ ⭐ **`null` 永遠在最後**，⛔ 不論 `dir` —— 見上面那段。
 *
 * ⚠️ ⭐ **穩定性不是這裡給的**（誠實記著）：`Array.prototype.sort` 從 ES2019
 * 起**規格就保證穩定** ⇒ 下面那幾個 `a.i - b.i` 是**多餘的**。
 * 突變驗過：拿掉它們 → **仍然綠**。
 * ⭐ 留著只是把「同分要保持輸入序」這個意圖寫出來，
 * ⛔ 而它**不是**一道防線 —— 不要在讀這段時以為有東西在守它。
 */
export function sortDamageRows(
  rows: readonly DamageBoardRow[],
  columnKey: string,
  dir: SortDir,
): DamageBoardRow[] {
  const col = DAMAGE_BOARD_COLUMNS.find((c) => c.key === columnKey);
  if (col === undefined || col.sortable === false) return [...rows];
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, k: col.sortKey(r) }))
    .sort((a, b) => {
      if (a.k === null && b.k === null) return a.i - b.i;
      if (a.k === null) return 1; // ⭐ 缺席排最後（⛔ 不吃 sign）
      if (b.k === null) return -1;
      if (typeof a.k === "string" || typeof b.k === "string") {
        const x = String(a.k);
        const y = String(b.k);
        return x === y ? a.i - b.i : (x < y ? -1 : 1) * sign;
      }
      return a.k === b.k ? a.i - b.i : (a.k - b.k) * sign;
    })
    .map((x) => x.r);
}
