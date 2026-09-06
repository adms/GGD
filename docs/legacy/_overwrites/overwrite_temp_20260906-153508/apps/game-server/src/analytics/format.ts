/**
 * 對戰事件記錄的**磁碟格式** (#207 · 伺服器端)。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼需要它
 * ─────────────────────────────────────────────────────────────────────────────
 * 量到的現況(2026-07-30,`data/replays/*.jsonl` 95 個檔):整批只有 **7 筆
 * championId,而且全部是 `godie-zombiex`** —— 那是小怪的模型 id,不是任何一個
 * 玩家選的英雄。回放檔記的是「輸入」(seed + intent),它**刻意**不記結果,因為
 * 結果是重跑出來的。所以那 95 場打完了,而這個專案對自己的遊戲仍然一無所知:
 * 沒有人知道哪隻英雄被選過、哪一支技能真的有人放、三選一的哪一張沒人要。
 * 每一次平衡調整都是憑感覺。
 *
 * 這個檔案是另一半:**結果**。一場一個檔,回合結束就寫一行,場末寫一行總結。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼不塞進回放檔
 * ─────────────────────────────────────────────────────────────────────────────
 * 回放的 header 是「重跑需要的全部輸入」,它的完整性是那個功能的全部;把衍生
 * 統計混進去會讓「這個欄位是不是重跑必需」變成一個要查的問題。而且兩者的
 * 保存期不同 —— 回放留 200 個檔 / 30 天(store.ts),統計要留得比那久很多,
 * 不然一個賽季的平衡資料會被回放的輪替一起刪掉。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 檔案佈局 —— JSONL,append-only,一列一筆
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   line 0      {"t":"match", …MatchStatsHeader}     開場就寫
 *   line 1..n   {"t":"round", …MatchStatsRoundLine}  每個回合結算寫一行
 *   last line   {"t":"final", …MatchStatsFinalLine}  場末寫(中斷的場次沒有)
 *
 * 和回放同一個理由選 JSONL:append-only(不必回頭改前面的位元組)、被砍掉的
 * 尾巴仍然可讀(伺服器中途死掉,前面每一個回合都還在)。
 *
 * ⚠️ **每一列都是 DELTA,不是累積快照。** round 行只帶「這一回合新增的」施放 /
 * 交易 / 三選一 / 成績。寫累積快照的話,一場 10 回合會把第 1 回合的資料寫 10
 * 次,而讀的人分不出「這一回合打了 500」和「到目前為止打了 500」—— 後者畫成圖
 * 只會單調上升,說不出玩家在哪一回合真的出現過。還原整場 = 把每一行接起來,
 * {@link foldMatchStats} 就是做這件事的。
 */
import type {
  AbilityCastRecord,
  AbilityUsage,
  ChampionPickRecord,
  ChampionRateStat,
  ItemTxnRecord,
  OfferChoiceStat,
  OfferRecord,
  RoundPlayerRecord,
  TeamScore,
  UncastDamageRecord,
  UncastDamageUsage,
  ZoneLineupRecord,
} from "@ggd/shared/sim/stats/matchLedger";

/**
 * 讀檔的人靠它判斷自己看不看得懂。加了必填欄位 / 改了列的形狀就 +1,
 * 讀取端**拒絕**未知版本,不猜。
 */
export const MATCH_STATS_FORMAT_VERSION = 1;

/** 一個座位,在開場那一刻。 */
export interface MatchStatsSeat {
  seatId: number;
  teamId: number;
  accountId: string;
  /** 對戰當下的顯示名 —— 所以這些檔和回放一樣是後台限定,不走公開路由。 */
  displayName: string;
  isBot: boolean;
}

/** line 0。開場就寫,所以一個當場崩掉的場次仍然留得下「誰在場上」。 */
export interface MatchStatsHeader {
  formatVersion: number;
  matchId: string;
  /** 牆鐘開場時間(只給人看,沒有任何東西讀它做判斷) */
  startedAt: string;
  seed: number;
  /** `cv_…`。同一份統計跨內容版本比較是沒有意義的,所以版本要跟著資料走。 */
  contentVersion: string;
  /** git short sha 或 "dev" —— 純程式改動的唯一訊號 */
  buildStamp: string;
  /** champ-select / 第一次中場的競技場 id */
  arenaId: string;
  seats: MatchStatsSeat[];
}

/**
 * 一個結算完的回合。**所有陣列都是這一回合新增的部分**(見檔頭的 DELTA 說明)。
 */
export interface MatchStatsRoundLine {
  round: number;
  /** 結算那一刻的絕對 tick */
  tick: number;
  /** 這一回合的戰鬥長度(tick)—— `RoundGradeContext.roundTicks` 的來源 */
  roundTicks: number;
  /**
   * 選角紀錄。**只有第 1 回合那一行有東西**(選角一場只發生一次),之後是空陣
   * 列。放在 round 行而不是 header,是因為 header 在 champ-select **之前**就寫
   * 出去了 —— 那時候還沒有人選好。
   */
  picks: ChampionPickRecord[];
  /** 這一回合每個 zone 的對局(決賽的多方混戰沒有,見 Recorder 檔頭) */
  lineups: ZoneLineupRecord[];
  /**
   * 這一回合**開始**的每一次技能施放。
   *
   * ⚠️ **列數是最終的,credit 欄位是寫出去那一刻的快照。** 一次施放的傷害是
   * 之後才到的(投射物飛出去、DoT 跳、AoE 分批結算),而回合結算之後仍然可能
   * 有幾發在空中。那些後到的 credit 會繼續累加在帳本裡,但這一行已經寫出去
   * 了 —— 所以 round 行的 `damageToHeroes` 之類是**下界**,而
   * {@link MatchStatsFinalLine.abilityUse} 才是這一場的權威總量。
   *
   * 為什麼不改成場末才一次寫完:那樣一場打到一半斷線的比賽會**一筆施放都沒
   * 有**,而那正是這個功能最需要撐住的情境(見 store.ts 的保存規則)。列數
   * 兩邊永遠一致,所以「每支技能放了幾次」在任何一邊都是對的;會差的只有
   * 「最後那幾 tick 的傷害算給誰」。`analytics.test.ts` 逐格釘住這個關係:
   * 列數必須相等,credit 只能是 final ≥ round 行的和。
   */
  casts: AbilityCastRecord[];
  itemTxns: ItemTxnRecord[];
  /** 這一回合結算掉的三選一 —— **沒選的那兩張在 `declined` 裡** */
  offers: OfferRecord[];
  /** 每個座位這一回合的成績(輪空的 `bye: true`) */
  players: RoundPlayerRecord[];
}

/** 場末總結。中斷的場次**沒有這一行** —— 這就是「這場沒打完」的判斷依據。 */
export interface MatchStatsFinalLine {
  endedAt: string;
  finalTick: number;
  rounds: number;
  /** 冠軍隊;-1 = 這場沒有決出冠軍 */
  winnerTeamId: number;
  /** #212 的團隊累積積分,和結算畫面同一支 `rankScore` */
  teams: TeamScore[];
  /** 整場聚合 —— 讀的人不必自己再折一次,但折出來必須一樣(測試釘住) */
  abilityUse: AbilityUsage[];
  offerChoices: OfferChoiceStat[];
  championRates: ChampionRateStat[];
}

export type MatchStatsLine =
  | ({ t: "match" } & MatchStatsHeader)
  | ({ t: "round" } & MatchStatsRoundLine)
  | ({ t: "final" } & MatchStatsFinalLine);

/** 一列 → 一行 JSONL(含換行)。 */
export function encodeStatsLine(line: MatchStatsLine): string {
  return JSON.stringify(line) + "\n";
}

/**
 * JSONL → 列。**容忍被截斷的最後一行** —— 伺服器被殺掉會留下半行,而它前面的
 * 每一個回合都仍然是完整可用的資料。中間出現壞行則是真的損毀,直接丟。
 */
export function decodeStatsLines(body: string): { lines: MatchStatsLine[]; truncated: boolean } {
  const out: MatchStatsLine[] = [];
  let truncated = false;
  const raw = body.split("\n");
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]!;
    if (s.length === 0) continue;
    try {
      out.push(JSON.parse(s) as MatchStatsLine);
    } catch {
      // 只有最後一行有資格是半寫的。
      if (i >= raw.length - 2) truncated = true;
      else throw new Error(`match-stats file is corrupt at line ${i + 1}`);
    }
  }
  return { lines: out, truncated };
}

/** {@link foldMatchStats} 的輸出 —— 一整場,從檔案還原回來的樣子。 */
export interface FoldedMatchStats {
  header: MatchStatsHeader;
  rounds: MatchStatsRoundLine[];
  final: MatchStatsFinalLine | null;
  /** 每一行的 `picks` 接起來 */
  picks: ChampionPickRecord[];
  lineups: ZoneLineupRecord[];
  casts: AbilityCastRecord[];
  itemTxns: ItemTxnRecord[];
  offers: OfferRecord[];
  players: RoundPlayerRecord[];
  /** 沒有 final 行 = 這場沒打完(伺服器中途死掉 / 房間被丟掉) */
  complete: boolean;
}

/**
 * 把 delta 行折回一整場。
 *
 * 這是**讀取端唯一該用的入口**:自己寫 `for (const l of lines)` 的人會忘記
 * `picks` 只在第一行、會忘記 final 行可能不存在,然後在自己的報表裡安靜地少
 * 掉一段。
 */
export function foldMatchStats(lines: readonly MatchStatsLine[]): FoldedMatchStats {
  const head = lines[0];
  if (!head || head.t !== "match") throw new Error("match-stats file has no header line");
  if (head.formatVersion !== MATCH_STATS_FORMAT_VERSION) {
    throw new Error(
      `match-stats format v${head.formatVersion} is not readable by this build (expects v${MATCH_STATS_FORMAT_VERSION})`,
    );
  }
  const out: FoldedMatchStats = {
    header: head,
    rounds: [],
    final: null,
    picks: [],
    lineups: [],
    casts: [],
    itemTxns: [],
    offers: [],
    players: [],
    complete: false,
  };
  for (const line of lines) {
    if (line.t === "round") {
      out.rounds.push(line);
      out.picks.push(...line.picks);
      out.lineups.push(...line.lineups);
      out.casts.push(...line.casts);
      out.itemTxns.push(...line.itemTxns);
      out.offers.push(...line.offers);
      out.players.push(...line.players);
    } else if (line.t === "final") {
      out.final = line;
      out.complete = true;
    }
  }
  return out;
}
