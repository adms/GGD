/**
 * 傷害排行榜 (#636) —— owner:
 *
 *   > 「顯示被哪個人哪招傷害最高 比例分布 並在後台顯示」
 *   > 「可以用 Redis 做,排名可以容納十萬筆,並且記錄第幾回合、英雄、裝備、
 *   >  技能、傷害、時間戳記、版本」
 *
 * ── 形狀 ─────────────────────────────────────────────────────────────────────
 * sim 每一次施放都進 `MatchLedger`(誰、哪招、打了多少);這裡是 host 側的
 * 收斂點:一場收尾時取 top 單發(`topDamageCasts`,純推導),補上 sim 裡刻意
 * 沒有的兩格(ts = host 時鐘、version = build stamp),寫進一個全域 Redis
 * zset(score = damage),然後**修剪尾端**讓它永遠 ≤ cap(十萬)。
 *
 * ── 口徑(GH#1015)—— ⭐ 這是「**技能施放**」的排行,⛔ 不是「全部傷害」的排行 ──
 * 一列 = 一次 `abilityCast`。普攻沒有「一次施放」這個單位,所以它**結構上**進不了
 * 這張表(`MatchController.ledgerObserve` 的 `damage` 分支只把掛得到 cast handle 的
 * 傷害 credit 進 cast 列;普攻 / hook / mark 走 `ledger.uncast`)。
 * ⇒ 「前 100 名全是技能」是這個口徑的**同義反覆**,⛔ 不是「技能比普攻強」的證據。
 * ⭐ 所以 API 回應自己帶著 {@link DAMAGE_BOARD_CALIBER},後台那一頁把它印出來 ——
 * 一張表的分母要寫在每一個讀它的地方旁邊,⛔ 不能只藏在這個檔頭。
 *
 * ── 永遠 fail-open ───────────────────────────────────────────────────────────
 * 與 content bus 同一條規矩:Redis 是加速器不是依賴。沒有 Redis、連不上、
 * 密碼錯、寫到一半斷線 —— 這一場的排行榜資料**丟掉**,比賽與收尾流程完全
 * 不受影響({@link publishMatchDamageBoard} 永不 throw、自帶 deadline)。
 * 它也因此**永遠不可以**被任何東西 await 在關鍵路徑上以外的地方。
 *
 * ── 後台開關(owner 常設:自己判斷但留一鍵 rollback)────────────────────────
 * `GGD_DAMAGE_BOARD=0` 整個關掉;`GGD_DAMAGE_BOARD_CAP` / `GGD_DAMAGE_BOARD_TOP`
 * 蓋掉兩個預設。⚠️ 進一步的 admin config 三住處(server-ops 那一族)在
 * 柵欄外,見 docs/_reports 的 K1 報告 —— 這裡先給 env 這一格,語意不變。
 */
import type { ServerResponse } from "node:http";
import {
  topDamageCasts,
  type MatchLedgerSnapshot,
} from "@ggd/shared/sim/stats/matchLedger";
import { parseRedisAddr } from "../config/contentBus";
import { buildStamp } from "../replay/fingerprint";
import { RedisCommands, type RedisCommandClient } from "./redisCommands";

/**
 * zset 的一個 member(JSON 字串)。owner 點名的七格全在:
 * round / championId / items / abilityId / damage / ts / version。
 * `matchId`+`castId` 讓 member 全域唯一 —— zset 的 member 是集合,兩場裡
 * 恰好位元相同的兩筆會被當成同一筆,唯一鍵把這個洞關掉。
 */
export interface DamageBoardEntry {
  /** 第幾回合 */
  round: number;
  championId: string;
  /** 施放當下持有的道具(itemId 升冪) */
  items: string[];
  abilityId: string;
  /** "Q" / "W" / "E" / "R" / "EX" / "PASSIVE" —— ⛔ 永遠不是 `"basic"`(見檔頭「口徑」;GH#1015) */
  slot: string;
  /** 這一次施放打出的總傷害(對英雄 + 對小怪) */
  damage: number;
  /** epoch ms —— host 的時鐘(sim 裡刻意沒有時鐘) */
  ts: number;
  /**
   * build 版本 —— `buildStamp()`（`replay/fingerprint.ts`）的結果。
   *
   * ⛔⛔ **這裡本來寫著「dev 是 `dev-<pid>` 那一族」，而那是假的**（GH#949，第三守則）：
   * `buildStamp()` 的回退值是**光禿禿的 `"dev"`**，⛔ 沒有任何後綴。
   * `dev-xxxxxxxx` 是 `matchId`／`accountId`（`rooms/MatchRoom.ts`），
   * ⭐ **完全不同的東西** —— 而那句話會讓下一個人以為「dev 帶著 pid，所以分得出場次」。
   *
   * ⚠️ 看到 `"dev"` 代表**這台沒有版本戳**（見 `../buildHealth.ts`），
   * ⛔ 不是「這是開發版」。
   */
  version: string;
  matchId: string;
  seatId: number;
  /** 帳本內單調序號 —— (matchId, castId) 是唯一鍵 */
  castId: number;
  /** 施放的絕對 tick(事後對 replay 用) */
  tick: number;
  /**
   * ⭐ GH#658 —— 這一次施放打在**單一英雄**身上的最大一擊。
   * ⚠️ **可缺席**:#658 之前寫進 zset 的每一筆都沒有這兩格,而那些 member
   * 仍然要讀得出來(`isDamageBoardEntry` 因此**不**檢查它們)。後台看到缺席
   * 要畫「—」,⛔ 不是 0 —— 0 是一個真的百分比。
   */
  victimDamage?: number;
  /** 上面那一擊命中當下,那個目標的最大生命。缺席/0 = 不知道。 */
  victimMaxHp?: number;
  /**
   * ⭐ GH#914 —— 這一次施放**命中幾個英雄 / 幾隻小怪**。
   *
   * ⚠️ ⭐ **兩個數字刻意分開**（owner 逐字要的）：一發掃過 30 隻殭屍與一發打中
   * 3 個英雄是**完全不同的事件** ⇒ ⛔ 加起來會把它們混成同一件事。
   * ⭐ 而它讓這張榜第一次可比：`damage` 是**總傷害**，
   * ⇒ ⛔ AoE 與單體爆發在同一欄裡根本不能比；有了命中數才算得出「每目標傷害」。
   *
   * ⚠️ **可缺席**：這一格之前寫進 zset 的每一筆都沒有它 ⇒ 後台畫「—」，⛔ 不是 0
   * （0 會讓舊資料看起來像「一個人都沒打中」）。
   */
  heroHits?: number;
  mobHits?: number;
  /** ⭐ 施放當下的等級。缺席 ⇒ 舊資料（⛔ 畫「—」，不是 0）。 */
  casterLevel?: number;
}

/** 全域排行榜的 zset key。改 schema 就 bump 版本後綴,舊 key 自然老死。 */
export const DAMAGE_BOARD_KEY = "ggd:damage-board:v1";

/**
 * ⭐ GH#1015 —— 這張榜的**口徑**,跟著每一次 `/_internal/damage-board` 回應一起送出。
 *
 * 後台頁不自己寫這句話(那會是第二個住處,而且會漂),它印伺服器送來的這一份。
 *  - `unit`:一列是什麼 —— 一次技能施放(⛔ 不是一發封包、⛔ 不是一個玩家)。
 *  - `damageSpace`:`damage` 欄是哪個空間 —— `damage` 事件的 `amount`(護盾後實際扣血,
 *    英雄＋小怪)。⚠️ 與計分板 `damageDealt`(減傷後、護盾前、只對敵方英雄)**不是**同一個空間。
 *  - `excludes`:結構上進不了這張表的傷害來源家族(見 matchLedger.ts `uncastFamilyOf`)。
 *    普攻的總量要看對戰紀錄 final 行的 `uncastDamage`(family `"basic"`)。
 */
export const DAMAGE_BOARD_CALIBER = Object.freeze({
  unit: "abilityCast" as const,
  damageSpace: "damageEventAmount" as const,
  excludes: Object.freeze(["basic", "hook", "mark"] as const),
  note: "技能施放排行:一列 = 一次技能施放;普攻 / 道具與被動的觸發(hook)/ 免死標記(mark)結構上不在這張表。普攻總量看對戰紀錄的 uncastDamage(basic)。",
});
export type DamageBoardCaliber = typeof DAMAGE_BOARD_CALIBER;
/** owner:「排名可以容納十萬筆」。 */
export const DEFAULT_DAMAGE_BOARD_CAP = 100_000;
/** 一場最多寫幾筆 top 單發 —— 全寫是把一場幾千次施放倒進全域榜,沒有意義。 */
export const DEFAULT_PER_MATCH_TOP = 100;

/** 與 `contentBusEnabled` 同一個形狀:預設開,`0/off/false/no` 關。 */
export function damageBoardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.GGD_DAMAGE_BOARD ?? "").trim().toLowerCase();
  return !(v === "0" || v === "off" || v === "false" || v === "no");
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number((raw ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function damageBoardCap(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.GGD_DAMAGE_BOARD_CAP, DEFAULT_DAMAGE_BOARD_CAP);
}

export function damageBoardPerMatchTop(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.GGD_DAMAGE_BOARD_TOP, DEFAULT_PER_MATCH_TOP);
}

/** 一場的 top 單發 → 排行榜條目(host 補 ts / version)。純函式,決定性看 ts。 */
export function buildDamageBoardEntries(
  snap: MatchLedgerSnapshot,
  args: { top: number; ts: number; version: string },
): DamageBoardEntry[] {
  return topDamageCasts(snap, args.top).map((c) => ({
    round: c.round,
    championId: c.championId,
    items: c.items,
    abilityId: c.abilityId,
    slot: c.slot,
    damage: c.damage,
    ts: args.ts,
    version: args.version,
    matchId: snap.matchId,
    seatId: c.seatId,
    castId: c.castId,
    tick: c.tick,
    // GH#658 —— 兩個**原始事實**;百分比由後台推導(`pctOfVictimMaxHp`)。
    victimDamage: c.victimDamage,
    victimMaxHp: c.victimMaxHp,
    heroHits: c.heroHits,
    mobHits: c.mobHits,
    casterLevel: c.casterLevel,
  }));
}

/**
 * 寫入 + 修剪,兩個都是一條指令:
 *  - `ZADD key score member …`(一次批量,不是 N 次來回)
 *  - `ZREMRANGEBYRANK key 0 -(cap+1)` —— zset 依 score 升冪,rank 0 是最小,
 *    移掉 [0, -(cap+1)] 之後**恰好**剩 score 最高的 cap 筆;元素數 ≤ cap 時
 *    stop 解析成負秩,Redis 定義為 no-op,所以不用先 ZCARD 再決定。
 */
export async function writeDamageBoard(
  client: RedisCommandClient,
  entries: readonly DamageBoardEntry[],
  cap: number = DEFAULT_DAMAGE_BOARD_CAP,
): Promise<void> {
  if (entries.length === 0) return;
  const zadd: string[] = ["ZADD", DAMAGE_BOARD_KEY];
  for (const e of entries) zadd.push(String(e.damage), JSON.stringify(e));
  await client.send(...zadd);
  await client.send("ZREMRANGEBYRANK", DAMAGE_BOARD_KEY, "0", String(-(cap + 1)));
}

/**
 * 一場收尾的入口 —— MatchRoom 在 `statsRecorder.finish()` 旁邊呼叫(一行)。
 * 永不 throw、永不掛住:任何失敗(含超過 deadline)回 false 並丟掉這一場的
 * 資料。回傳值只給測試與 log 用,呼叫端**不准**根據它改變比賽流程。
 */
export async function publishMatchDamageBoard(
  snap: MatchLedgerSnapshot,
  opts: {
    env?: NodeJS.ProcessEnv;
    now?: () => number;
    version?: string;
    /** 測試注入;預設從 REDIS_ADDR / REDIS_PASSWORD 開一條真連線 */
    clientFactory?: () => RedisCommandClient;
    deadlineMs?: number;
  } = {},
): Promise<boolean> {
  const env = opts.env ?? process.env;
  if (!damageBoardEnabled(env)) return false;
  const entries = buildDamageBoardEntries(snap, {
    top: damageBoardPerMatchTop(env),
    ts: (opts.now ?? Date.now)(),
    version: opts.version ?? buildStamp(),
  });
  if (entries.length === 0) return true; // 沒打出任何傷害的一場 —— 沒事可寫
  let client: RedisCommandClient | null = null;
  try {
    client = opts.clientFactory
      ? opts.clientFactory()
      : (() => {
          const { host, port } = parseRedisAddr(env.REDIS_ADDR);
          return new RedisCommands({ host, port, password: env.REDIS_PASSWORD || undefined });
        })();
    const deadline = new Promise<never>((_, reject) => {
      const t = setTimeout(
        () => reject(new Error("damage-board: deadline exceeded")),
        opts.deadlineMs ?? 5_000,
      );
      t.unref?.();
    });
    await Promise.race([writeDamageBoard(client, entries, damageBoardCap(env)), deadline]);
    return true;
  } catch (err) {
    // 盡力而為:排行榜少一場,比賽不受影響。與 match-stats recorder 同一句話。
    console.error(`[damage-board] write failed for ${snap.matchId}; this match's rows are dropped (the match is unaffected)`, err);
    return false;
  } finally {
    client?.close();
  }
}

// ── 讀取(後台那一頁經由 platform proxy 讀的形狀)──────────────────────────

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function isDamageBoardEntry(v: unknown): v is DamageBoardEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.round === "number" &&
    typeof e.championId === "string" &&
    isStringArray(e.items) &&
    typeof e.abilityId === "string" &&
    typeof e.damage === "number" &&
    typeof e.ts === "number" &&
    typeof e.version === "string" &&
    typeof e.matchId === "string"
  );
}

/**
 * 依 damage 降冪讀一段。`ZREVRANGE`(不用 6.2 才有的 `ZRANGE … REV`,host 的
 * Redis 版本不歸我們管)。壞掉的 member(手動塞的、舊 schema)直接跳過 ——
 * 一筆垃圾不可以讓整頁空白。
 */
export async function readDamageBoard(
  client: RedisCommandClient,
  opts: { offset?: number; count?: number } = {},
): Promise<{ total: number; rows: DamageBoardEntry[] }> {
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const count = Math.min(1_000, Math.max(1, Math.floor(opts.count ?? 100)));
  const totalRaw = await client.send("ZCARD", DAMAGE_BOARD_KEY);
  const raw = await client.send(
    "ZREVRANGE",
    DAMAGE_BOARD_KEY,
    String(offset),
    String(offset + count - 1),
  );
  const rows: DamageBoardEntry[] = [];
  if (Array.isArray(raw)) {
    for (const m of raw) {
      if (typeof m !== "string") continue;
      try {
        const parsed: unknown = JSON.parse(m);
        if (isDamageBoardEntry(parsed)) rows.push(parsed);
      } catch {
        /* 跳過垃圾 member */
      }
    }
  }
  return { total: typeof totalRaw === "number" ? totalRaw : rows.length, rows };
}

/**
 * `/_internal/damage-board` 的 handler 本體 —— index.ts 掛上去只要一行
 * (與 /_internal/replays 同一個佈局:不是公開路由,後台經 platform 的
 * admin-authenticated proxy 進來)。失敗回 200 + 空列表而不是 5xx:
 * 這一頁是唯讀報表,Redis 掛了顯示「目前沒有資料」比讓後台整頁爆紅誠實。
 */
export async function serveDamageBoard(
  res: ServerResponse,
  opts: {
    offset?: number;
    count?: number;
    env?: NodeJS.ProcessEnv;
    clientFactory?: () => RedisCommandClient;
  } = {},
): Promise<void> {
  const env = opts.env ?? process.env;
  let client: RedisCommandClient | null = null;
  let payload: { total: number; rows: DamageBoardEntry[] } = { total: 0, rows: [] };
  try {
    client = opts.clientFactory
      ? opts.clientFactory()
      : (() => {
          const { host, port } = parseRedisAddr(env.REDIS_ADDR);
          return new RedisCommands({ host, port, password: env.REDIS_PASSWORD || undefined });
        })();
    payload = await readDamageBoard(client, { offset: opts.offset, count: opts.count });
  } catch (err) {
    console.error("[damage-board] read failed; serving an empty board", err);
  } finally {
    client?.close();
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}
