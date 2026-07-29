/**
 * teamLedger — 團隊累積積分 (#212), 跨回合累計, **一個來源兩處讀**.
 *
 * owner: 「回合顯示勝利：需要顯示自己隊伍 3d model 與打得好的評價建議及
 *         團隊累積積分」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. 為什麼它是 client 的一份帳,而不是讀伺服器的欄位
 * ═══════════════════════════════════════════════════════════════════════════
 * 因為**線上沒有這個數字**。逐條查過:
 *
 *   `TeamState.roundWins`   有,但那是「贏了幾場」不是積分,而且它**沒有被投影
 *                           進 `TeamView`**(net/RoomStore.ts)—— 目前只有
 *                           GameApp 直接讀原始 state 餵給 victoryTrigger。
 *   `rankScore` (#25)       是結算畫面的積分,但它吃 `PlayerMatchStats`,那份
 *                           資料整場只在 `matchSettlement` 這一則 one-shot
 *                           事件裡到過客戶端一次 —— 回合中拿不到。
 *   `TeamState.placement`   名次,不是積分;而且它是結果不是累積。
 *
 * 所以「跨回合累計的團隊積分」在 v0.9.12 的線路上**不存在**,client 只能自己記。
 * 這是刻意的取捨而不是疏忽,代價寫在下面 §3,要根治得在 `SeatState` 上加欄位
 * (Colyseus `defineTypes` 是 APPEND-ONLY,所以那是一條不可逆的決定,不該由這
 * 一支面板順手做)。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2. 「兩處讀同一來源」是這個檔案存在的唯一理由
 * ═══════════════════════════════════════════════════════════════════════════
 * 回合勝利畫面 (#212) 與結算畫面 (#25) 都要顯示同一個團隊積分。要讓兩個畫面
 * 印出同一個數字,唯一可靠的做法是**兩邊呼叫同一支函式**;各自從各自手邊的
 * 資料算一次,遲早會在某一回合分岔,而玩家沒有辦法分辨哪一個是真的
 * (這就是 `statPathSnapshotOf` 檔頭在講的同一件事)。
 *
 * 所以:{@link teamStandings} 是唯一的計算處,`RoundVictoryPanel` 與
 * `TeamPointsBlock`(掛在 MatchEndPanel)都只是它的 renderer。
 * `roundVictory.test.ts` 用**渲染出來的字串**斷言兩個畫面印出同一個數,不是
 * 比兩個函式的回傳值 —— 回傳值一樣而畫面印別的東西是形態⑤。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 3. 已知代價(誠實揭露,不要在 UI 上假裝沒有)
 * ═══════════════════════════════════════════════════════════════════════════
 *   · **重連會失去先前回合。** 帳在記憶體裡,重整頁面就沒了。{@link roundsSeen}
 *     因此是公開的:面板印「累積 N 回合」,玩家看得出來這一份帳只涵蓋幾場。
 *   · **只記錄「面板有出現」的回合。** 回合勝利畫面沒有掛上(觀戰、沒有座位)
 *     那一回合就不會進帳。
 *   · **同一回合重複記錄不會重複計分** —— {@link record} 以 round 為鍵覆寫,
 *     所以 React 重新 render、phase 抖動、或同一個 resolution 被走兩次都不會
 *     讓積分翻倍。這是這個檔案裡最重要的一行。
 *
 * 決定性:內部只有一個以 round 為鍵的 Map,每一次讀取都**先把 key 排序**再走
 * (sim/** 的規矩,這裡不是 sim 但同樣的理由:Map 迭代順序依插入順序,重連或
 * 亂序記錄會讓同一組資料排出不同的名次)。
 */

/** 一個座位在一個回合賺到的積分。 */
export interface TeamLedgerEntry {
  seatId: number;
  teamId: number;
  /** 這一回合的分數,已經是整數點數(見 roundVictory.roundVictoryPoints) */
  points: number;
}

/** 一隊到目前為止的累積積分。 */
export interface TeamStanding {
  teamId: number;
  /** 跨回合總和 */
  points: number;
  /** 升冪 */
  seatIds: number[];
  /** 這一隊每個成員的累積積分,和 `seatIds` 同索引 */
  memberPoints: number[];
}

class TeamLedger {
  private matchId = "";
  /** round → 那一回合每個座位的進帳。以 round 為鍵 = 冪等。 */
  private readonly byRound = new Map<number, TeamLedgerEntry[]>();

  /**
   * 換一場就整份丟掉。用 matchId 當守衛而不是靠呼叫端記得清空:忘記清空的
   * 後果是「上一場的積分跟著進下一場」,而那是一個看起來完全合理的數字。
   */
  private ensureMatch(matchId: string): void {
    if (this.matchId === matchId) return;
    this.matchId = matchId;
    this.byRound.clear();
  }

  /**
   * 記一個回合。**以 round 為鍵覆寫**,所以同一回合記幾次都只算一次
   * (見 §3 —— 這一行是「積分不會翻倍」的全部理由)。
   */
  record(matchId: string, round: number, entries: readonly TeamLedgerEntry[]): void {
    this.ensureMatch(matchId);
    if (!Number.isFinite(round) || round <= 0) return;
    this.byRound.set(round, entries.map((e) => ({ ...e })));
  }

  /** 這一份帳涵蓋幾個回合 —— 面板要印它,玩家才知道帳的範圍。 */
  roundsSeen(): number {
    return this.byRound.size;
  }

  /** 已記錄的回合編號,升冪。 */
  roundNumbers(): number[] {
    return [...this.byRound.keys()].sort((a, b) => a - b);
  }

  /** 一個回合的原始進帳(測試與除錯用)。 */
  entriesFor(round: number): TeamLedgerEntry[] {
    return (this.byRound.get(round) ?? []).map((e) => ({ ...e }));
  }

  /**
   * 每一隊的累積積分,**分數高的在前,同分照 teamId 升冪**。
   * 這是唯一的計算處(§2)。
   */
  standings(): TeamStanding[] {
    const teams = new Map<number, { points: number; members: Map<number, number> }>();
    for (const round of this.roundNumbers()) {
      for (const e of this.byRound.get(round) ?? []) {
        let t = teams.get(e.teamId);
        if (!t) {
          t = { points: 0, members: new Map() };
          teams.set(e.teamId, t);
        }
        t.points += e.points;
        t.members.set(e.seatId, (t.members.get(e.seatId) ?? 0) + e.points);
      }
    }
    const out: TeamStanding[] = [];
    for (const teamId of [...teams.keys()].sort((a, b) => a - b)) {
      const t = teams.get(teamId)!;
      const seatIds = [...t.members.keys()].sort((a, b) => a - b);
      out.push({
        teamId,
        points: t.points,
        seatIds,
        memberPoints: seatIds.map((s) => t.members.get(s) ?? 0),
      });
    }
    out.sort((a, b) => (b.points !== a.points ? b.points - a.points : a.teamId - b.teamId));
    return out;
  }

  /** 一隊的累積積分;沒有進過帳的隊伍是 0(不是 undefined)。 */
  pointsOf(teamId: number): number {
    return this.standings().find((t) => t.teamId === teamId)?.points ?? 0;
  }

  /** 測試用:把帳整個歸零。 */
  clear(): void {
    this.matchId = "";
    this.byRound.clear();
  }
}

/**
 * 這個 client 的那一份帳。單例,因為它記的是「這台機器這一場看到的東西」,
 * 而回合畫面與結算畫面是同一台機器上的兩個畫面。
 */
export const teamLedger = new TeamLedger();

/** 兩個畫面共用的排行列。**任何一邊自己再算一次就是 bug。** */
export function teamStandings(): TeamStanding[] {
  return teamLedger.standings();
}

/** 面板印的那一行字。共用,所以兩個畫面連格式都不會分岔。 */
export function formatTeamPoints(points: number): string {
  return `${Math.round(points)} 分`;
}

/** 「累積 N 回合」——帳的範圍,§3 要求它必須看得見。 */
export function formatLedgerScope(rounds: number): string {
  return rounds > 0 ? `累積 ${rounds} 回合` : "尚無回合資料";
}
