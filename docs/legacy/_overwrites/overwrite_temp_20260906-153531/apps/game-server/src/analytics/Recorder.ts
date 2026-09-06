/**
 * MatchStatsRecorder —— 把 `ctl.ledger` **真的寫到磁碟**的那一端 (#207)。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這個檔案存在的唯一理由
 * ─────────────────────────────────────────────────────────────────────────────
 * #207 最容易犯的失敗形態是第②種:**算出來了但從沒送達**。`MatchController`
 * 一場打完之後,`ctl.ledger` 裡躺著完整的選角 / 每一次施放 / 三選一的三張 /
 * 每回合名次 —— 而如果沒有人把它寫出去,那些資料在房間 dispose 的那一毫秒全部
 * 消失,**而且每一條讀 `ctl.ledger` 的測試仍然全綠**。
 *
 * 所以:寫檔被抽成 `MatchStatsSink` 這個可以拔掉的東西,而
 * `analytics.test.ts` 的每一條斷言都從 `loadMatchStats()`(檔案)讀回來。
 * 拔掉這裡的 `push(...)`,那些測試會紅;讀記憶體的測試不會。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 成本約束
 * ─────────────────────────────────────────────────────────────────────────────
 * 和 replay/Recorder.ts 同一條規矩:**tick path 不做同步 I/O**。差別是這裡連
 * tick path 都不在 —— 只有回合結算(10 回合 = 10 次)和場末各寫一次,所以連
 * 500ms 的 flush 計時器都不需要,`stream.write()` 本身就是非阻塞的。串流出錯
 * 就自我停用,比賽照打:一份壞掉的統計檔絕不能弄壞一場真的在打的比賽。
 */
import type { WriteStream } from "node:fs";
import type { MatchController, MatchStatsSink } from "../match/MatchController";
import {
  MATCH_STATS_FORMAT_VERSION,
  encodeStatsLine,
  type MatchStatsHeader,
  type MatchStatsLine,
} from "./format";
import { openStatsStream, pruneMatchStats, matchStatsRetention, safeStatsId } from "./store";
import {
  aggregateAbilityUse,
  aggregateChampionRates,
  aggregateOfferChoices,
  aggregateUncastDamage,
} from "@ggd/shared/sim/stats/matchLedger";

/** 正在寫的場次 —— 保存規則永遠不能刪到它們。 */
const liveStats = new Set<string>();

export class MatchStatsRecorder implements MatchStatsSink {
  readonly id: string;
  private stream: WriteStream | null = null;
  private disabled = false;
  private closed = false;
  /** 已經寫出去的 pick 數 —— 選角只發生一次,所以只有第一行帶得到它們。 */
  private picksWritten = 0;
  private castsWritten = 0;
  /** GH#1015 —— `uncast` 列的游標，與 `castsWritten` 同一個規則。 */
  private uncastWritten = 0;
  private lineupsWritten = 0;
  private itemTxnsWritten = 0;
  private offersWritten = 0;
  private roundsWritten = 0;
  private lastTick = 0;

  private constructor(matchId: string) {
    this.id = safeStatsId(matchId);
  }

  /**
   * 開一個 recorder 並寫入 header。任何失敗(目錄不可寫、磁碟滿)回 null ——
   * 記錄是盡力而為,比賽不是。
   */
  static async open(matchId: string, header: Omit<MatchStatsHeader, "formatVersion">): Promise<MatchStatsRecorder | null> {
    if (!matchStatsRetention().enabled) return null;
    const rec = new MatchStatsRecorder(matchId);
    // 絕不讓兩個 writer 共用一個檔。id 是從 matchId 推導的,平台的 ULID 是唯一
    // 的但 dev 路徑會自己造隨機後綴 —— 撞到的話兩場會交錯寫進同一個 .jsonl,
    // 而且先寫完的那一場會把另一場從 `liveStats` 刪掉(連保存規則的保護一起
    // 拿掉)。同步保留 id,所以兩個並行的 open 不會都通過這個判斷。
    if (liveStats.has(rec.id)) {
      console.error(`[match-stats] "${rec.id}" is already being written; refusing a second writer (the match is unaffected)`);
      return null;
    }
    liveStats.add(rec.id);
    try {
      rec.stream = await openStatsStream(rec.id);
    } catch (err) {
      liveStats.delete(rec.id);
      console.error(`[match-stats] could not open a file for ${matchId}; this match will not be analysed`, err);
      return null;
    }
    rec.stream.on("error", (err) => {
      if (rec.disabled) return;
      rec.disabled = true;
      console.error(`[match-stats] write failed for ${matchId}; recording stopped (the match is unaffected)`, err);
    });
    rec.push({ t: "match", formatVersion: MATCH_STATS_FORMAT_VERSION, ...header });
    return rec;
  }

  // ---------- MatchStatsSink -------------------------------------------------

  /**
   * 一個回合結算完 → 寫一行。
   *
   * 每一個陣列都是**這一回合新增的那一段**(從上次寫到現在的尾巴),不是整份
   * 快照 —— 見 format.ts 檔頭的 DELTA 說明。用「已寫出去幾筆」當游標,而不是
   * 用 round 欄位過濾:一次施放可能跨回合邊界被 credit(投射物在結算後才落
   * 地),用 round 過濾會讓那一筆兩邊都不屬於,永遠寫不出去。
   */
  onRoundSettled(ctl: MatchController, round: number, roundTicks: number): void {
    if (this.disabled || this.closed) return;
    const snap = ctl.ledger.snapshot();
    this.lastTick = ctl.world.tick;
    this.push({
      t: "round",
      round,
      tick: ctl.world.tick,
      roundTicks,
      picks: snap.picks.slice(this.picksWritten),
      lineups: snap.lineups.slice(this.lineupsWritten),
      casts: snap.casts.slice(this.castsWritten),
      itemTxns: snap.itemTxns.slice(this.itemTxnsWritten),
      offers: snap.offers.slice(this.offersWritten),
      players: snap.rounds.slice(this.roundsWritten),
    });
    this.picksWritten = snap.picks.length;
    this.lineupsWritten = snap.lineups.length;
    this.castsWritten = snap.casts.length;
    this.itemTxnsWritten = snap.itemTxns.length;
    this.offersWritten = snap.offers.length;
    this.roundsWritten = snap.rounds.length;
  }

  // ---------- lifecycle ------------------------------------------------------

  /**
   * 寫 final 行並關檔。可以安全地呼叫兩次。
   *
   * ⚠️ 它同時**補寫最後一段尾巴**:最後一個回合結算之後仍然會有事情發生
   * (決賽的最後一次 credit、結算時算出來的團隊積分),那些在最後一次
   * `onRoundSettled` 之後才進帳本。少了這一段,冠軍那一場的資料會缺一角。
   */
  async finish(ctl: MatchController): Promise<void> {
    if (this.closed) return;
    const snap = ctl.ledger.snapshot();
    // 尾巴 —— 只有還有東西沒寫時才寫,免得每一場都多一行空的 round。
    const tailSizes =
      snap.picks.length - this.picksWritten +
      (snap.lineups.length - this.lineupsWritten) +
      (snap.casts.length - this.castsWritten) +
      (snap.itemTxns.length - this.itemTxnsWritten) +
      (snap.offers.length - this.offersWritten) +
      (snap.rounds.length - this.roundsWritten);
    if (tailSizes > 0) {
      this.push({
        t: "round",
        round: ctl.phase.round,
        tick: ctl.world.tick,
        roundTicks: 0,
        picks: snap.picks.slice(this.picksWritten),
        lineups: snap.lineups.slice(this.lineupsWritten),
        casts: snap.casts.slice(this.castsWritten),
        itemTxns: snap.itemTxns.slice(this.itemTxnsWritten),
        offers: snap.offers.slice(this.offersWritten),
        players: snap.rounds.slice(this.roundsWritten),
      });
      this.picksWritten = snap.picks.length;
      this.lineupsWritten = snap.lineups.length;
      this.castsWritten = snap.casts.length;
      this.itemTxnsWritten = snap.itemTxns.length;
      this.offersWritten = snap.offers.length;
      this.roundsWritten = snap.rounds.length;
    }
    let winner = -1;
    for (const [teamId, place] of ctl.placements) if (place === 1) winner = teamId;
    this.push({
      t: "final",
      endedAt: new Date().toISOString(),
      finalTick: ctl.world.tick,
      rounds: ctl.phase.round,
      winnerTeamId: winner,
      teams: snap.teams,
      // 聚合和逐筆事件**都**寫。逐筆才是資料,聚合是給後台直接畫表用的 ——
      // 而測試會拿檔案裡的逐筆自己折一次,和這裡寫的聚合逐格比對,所以這兩份
      // 分岔的那一天會被抓到,而不是變成兩個都言之鑿鑿的數字。
      abilityUse: aggregateAbilityUse(snap.casts),
      offerChoices: aggregateOfferChoices(snap.offers),
      championRates: aggregateChampionRates(snap.picks, snap.rounds),
    });
    await this.close();
    if (this.disabled) return;
    liveStats.delete(this.id);
    try {
      const deleted = await pruneMatchStats([...liveStats]);
      if (deleted.length > 0) console.log(`[match-stats] retention pruned ${deleted.length} old record(s)`);
    } catch (err) {
      console.error("[match-stats] retention prune failed", err);
    }
  }

  /**
   * 沒有 final 行就收工 —— 房間在 matchEnd 之前被丟掉。已經寫出去的每一個回合
   * 都還在,而且完整可讀:一場打到第 6 回合斷線的比賽,那 6 回合的平衡資料仍然
   * 是真的。
   */
  async abandon(): Promise<void> {
    if (this.closed) return;
    await this.close();
    liveStats.delete(this.id);
  }

  private async close(): Promise<void> {
    this.closed = true;
    const s = this.stream;
    this.stream = null;
    if (!s) return;
    await new Promise<void>((resolve) => s.end(resolve));
  }

  private push(line: MatchStatsLine): void {
    if (this.disabled || this.closed || !this.stream) return;
    this.stream.write(encodeStatsLine(line));
  }

  /** 最後寫出去的那一 tick —— 診斷用。 */
  get writtenThroughTick(): number {
    return this.lastTick;
  }
}

/** 正在寫的場次 id(保存規則要跳過它們)。 */
export function liveStatsIds(): string[] {
  return [...liveStats];
}
