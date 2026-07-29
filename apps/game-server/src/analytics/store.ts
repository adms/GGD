/**
 * 對戰統計檔的**存放**:寫在哪、怎麼列、什麼時候刪。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼不和回放共用一個目錄 / 一套保存規則
 * ─────────────────────────────────────────────────────────────────────────────
 * 回放的規則是「留最新 200 個檔,超過 30 天就刪」(replay/store.ts)。共用那條
 * 規則等於讓一個賽季的平衡資料被回放的輪替一起刪掉 —— 而平衡資料的價值正好和
 * 它的長度成正比:一百場的選取率沒有意義,一千場才有。
 *
 * ⚠️ 我一開始在這裡寫「統計檔比回放小兩個數量級」。**那是猜的,而且是錯的。**
 * 量完之後:回放 ~60 KB(gzip 過),統計 231 KB(沒壓縮)—— 統計是**比較大**的
 * 那一個。留著這句話免得下一個人照著那個錯誤的量級去定上限。
 *
 * 所以:自己的目錄、自己的上限,而且兩個都可以用環境變數調。
 *
 * **上限是從量到的大小推出來的,不是拍腦袋的。** 一場 12 人 10 回合的完整記錄
 * 量到 **231,563 bytes**(10 個 round 行、767 次施放、36 次三選一、120 筆
 * 每回合成績 —— `analytics.test.ts` 每次跑都把這個數字印出來)。所以
 *
 *   2000 場 × ~230 KB ≈ **460 MB**
 *
 * 是預設的磁碟天花板。刻意**不壓縮**(回放檔會 gzip):這一份要能被 `jq` /
 * `grep` 直接讀,後台報表與臨時查數都靠它,而 460 MB 換那個便利性是划算的。
 * 覺得不划算的人有 `GGD_MATCH_STATS_MAX_FILES`。
 *
 * ⚠️ **後台欄位沒有做,這是刻意的缺口。** 專案第一守則是「所有功能後台可調」,
 * 而一個後台欄位要同時落在 `content/config/*.json` + `packages/shared` 的 Zod
 * schema + `apps/admin`。這一批的分工把那三處都劃給別的 lane(這一支只准動
 * `apps/game-server/src/**`),所以這裡先用**環境變數**當旋鈕 —— 和
 * `GGD_REPLAY_DIR` 同一個既有慣例,不是新發明。三處都補齊的欄位清單寫在
 * {@link MATCH_STATS_KNOBS},下一個能碰 shared/admin 的 lane 照著搬。
 *
 * PRIVACY。統計檔帶玩家顯示名(和回放一樣),所以不從任何公開路由讀得到。
 */
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeStatsLines,
  foldMatchStats,
  type FoldedMatchStats,
  type MatchStatsLine,
} from "./format";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * 後台化清單 —— 給下一個能碰 `content/` + `packages/shared` + `apps/admin`
 * 的 lane。每一格的 id 就是它今天的環境變數名,語意一字不改。
 *
 * ⚠️ 這不是註解式的許願:它是一份**被測試讀的**清單
 * (`analytics.test.ts` 逐格比對它和 {@link matchStatsRetention} 的實際行為),
 * 所以這裡少一格 / 名字打錯,測試會紅。
 */
export const MATCH_STATS_KNOBS = Object.freeze([
  { env: "GGD_MATCH_STATS", kind: "bool", def: true, what: "整個功能的開關;關掉 = 一場都不寫" },
  { env: "GGD_MATCH_STATS_DIR", kind: "path", def: "<repo>/data/match-stats", what: "檔案寫到哪" },
  { env: "GGD_MATCH_STATS_MAX_FILES", kind: "int", def: 2000, what: "保留幾場(舊的先刪);×230KB ≈ 460MB" },
  { env: "GGD_MATCH_STATS_MAX_AGE_DAYS", kind: "int", def: 365, what: "保留幾天" },
] as const);

/** 保存規則的實際生效值。 */
export interface MatchStatsRetention {
  enabled: boolean;
  dir: string;
  maxFiles: number;
  maxAgeDays: number;
}

/**
 * 讀一個非負整數環境變數。**壞值退回預設,不是退回 0** —— `MAX_FILES=abc`
 * 靜默變成 0 會把整個目錄刪光,那是一個「設定打錯 = 資料全毀」的陷阱。
 * 0 本身是合法的(0 天 = 每次都清),所以只有 NaN / 負數 / 非整數才退回。
 */
function envInt(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.warn(`[match-stats] ${name}="${raw}" is not a non-negative integer; using ${def}`);
    return def;
  }
  return n;
}

/** 目前生效的保存規則(每次呼叫都重讀 env —— 測試要換目錄)。 */
export function matchStatsRetention(): MatchStatsRetention {
  return {
    // 只有明確寫 "0" / "false" 才關。沒設 = 開,因為「預設不記錄」正是這個
    // 專案已經付過一次代價的那個狀態(95 場回放,7 筆 championId)。
    enabled: process.env.GGD_MATCH_STATS !== "0" && process.env.GGD_MATCH_STATS !== "false",
    dir: process.env.GGD_MATCH_STATS_DIR ?? join(REPO_ROOT, "data", "match-stats"),
    maxFiles: envInt("GGD_MATCH_STATS_MAX_FILES", 2000),
    maxAgeDays: envInt("GGD_MATCH_STATS_MAX_AGE_DAYS", 365),
  };
}

/** `GGD_MATCH_STATS_DIR`,否則 `<repo>/data/match-stats`。 */
export function matchStatsDir(): string {
  return matchStatsRetention().dir;
}

/**
 * 檔名安全的場次 id。matchId 來自平台(ULID)或 dev 路徑(`dev-xxxxxxxx`),
 * 是一個曾經跨過網路的值拼出來的路徑片段,所以清洗而不是信任。
 */
export function safeStatsId(matchId: string): string {
  const cleaned = matchId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 96);
  return cleaned.length > 0 ? cleaned : "unnamed";
}

export function statsPath(dir: string, id: string): string {
  return join(dir, `${id}.jsonl`);
}

/** 開一個 append 串流(順便建目錄)。 */
export async function openStatsStream(id: string): Promise<WriteStream> {
  const dir = matchStatsDir();
  await mkdir(dir, { recursive: true });
  return createWriteStream(statsPath(dir, id), { flags: "a" });
}

/** 讀回一整場並折成 {@link FoldedMatchStats}。找不到就 throw。 */
export async function loadMatchStats(matchId: string): Promise<FoldedMatchStats> {
  const path = statsPath(matchStatsDir(), safeStatsId(matchId));
  const body = await readFile(path, "utf8");
  const { lines } = decodeStatsLines(body);
  return foldMatchStats(lines);
}

/** 後台「對戰紀錄」列表的一列。 */
export interface MatchStatsSummary {
  id: string;
  matchId: string;
  startedAt: string;
  endedAt: string | null;
  /** 沒有 final 行 = 這場沒打完 */
  complete: boolean;
  bytes: number;
  rounds: number;
  contentVersion: string;
  buildStamp: string;
  winnerTeamId: number | null;
  /** 這場真的被選出來打的英雄(去重、排序)—— 就是現況統計裡「7 筆」的那一格 */
  championIds: string[];
}

function summarise(id: string, bytes: number, lines: MatchStatsLine[]): MatchStatsSummary {
  const folded = foldMatchStats(lines);
  const champs = new Set<string>();
  for (const p of folded.picks) if (p.championId) champs.add(p.championId);
  return {
    id,
    matchId: folded.header.matchId,
    startedAt: folded.header.startedAt,
    endedAt: folded.final?.endedAt ?? null,
    complete: folded.complete,
    bytes,
    rounds: folded.final?.rounds ?? folded.rounds.length,
    contentVersion: folded.header.contentVersion,
    buildStamp: folded.header.buildStamp,
    winnerTeamId: folded.final?.winnerTeamId ?? null,
    championIds: [...champs].sort(),
  };
}

/** 每一場,最新的在前。目錄不存在讀成空的。 */
export async function listMatchStats(): Promise<MatchStatsSummary[]> {
  const dir = matchStatsDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: MatchStatsSummary[] = [];
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    try {
      const path = join(dir, name);
      const [body, st] = await Promise.all([readFile(path, "utf8"), stat(path)]);
      const { lines } = decodeStatsLines(body);
      out.push(summarise(name.slice(0, -".jsonl".length), st.size, lines));
    } catch {
      // 半寫 / 損毀的一個檔不該讓整份列表爆掉
    }
  }
  out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  return out;
}

/**
 * 套用保存規則,回傳被刪掉的 id。`skipIds` 是**正在寫**的場次,永遠不動。
 */
export async function pruneMatchStats(skipIds: readonly string[] = []): Promise<string[]> {
  const rule = matchStatsRetention();
  let names: string[];
  try {
    names = await readdir(rule.dir);
  } catch {
    return [];
  }
  const skip = new Set(skipIds);
  const files: { id: string; mtime: number }[] = [];
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    const id = name.slice(0, -".jsonl".length);
    if (skip.has(id)) continue;
    try {
      const st = await stat(join(rule.dir, name));
      files.push({ id, mtime: st.mtimeMs });
    } catch {
      /* 在我們腳下消失了 */
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const cutoff = Date.now() - rule.maxAgeDays * 86_400_000;
  const doomed = files.filter((f, idx) => idx >= rule.maxFiles || f.mtime < cutoff);
  const deleted: string[] = [];
  for (const f of doomed) {
    try {
      await rm(join(rule.dir, `${f.id}.jsonl`));
      deleted.push(f.id);
    } catch {
      /* 已經不在了 */
    }
  }
  return deleted;
}
