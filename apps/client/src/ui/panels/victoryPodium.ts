/**
 * victoryPodium — 回合勝利頒獎台的 PURE 選擇器 (GH#257).
 *
 * owner 2026-08-02:
 * > 「回合勝利顯示的 3d model 只顯示最後活下來順序的三位
 * >   並且標上 黃金 白銀 黃銅 的皇冠 圖案」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 這一支只做「挑人 + 排序」,名次規則本身在 shared
 * ═══════════════════════════════════════════════════════════════════════════
 * 誰活得比較久是 `@ggd/shared/sim/stats/roundSurvival` 的 `rankSurvival` 算的,
 * 這裡一格都不算。理由和 `roundVictory.ts` 對 `gradeRound` 的理由一樣:兩個
 * 畫面各排一份,同一個回合就會給出兩份不同的金銀銅,而玩家分不出哪一份是真的。
 *
 * 這一支負責的是**範圍**:哪些座位有資格站上台。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 勝方隊伍**不自己判**,一律走 `roundEndQuoteChampion`
 * ═══════════════════════════════════════════════════════════════════════════
 * 那一支已經處理了兩件用別的方法一定會漏的事:
 *   · **輪空**(#173):輪空隊伍每個座位都是 alive:false / roundKills:0 /
 *     roundDeaths:0,而且從來沒發過 death 事件 —— 和被瞬間團滅的隊伍在快照上
 *     一模一樣。只有 `TeamState.roundOutcome` 分得出來。
 *   · **決勝回合**:那一拍屬於全場結算的正面特寫(#93/#25),`roundEndQuoteChampion`
 *     在那一回合回傳 null,所以回合頒獎台不會和它疊在一起。
 * 在這裡自己寫一份「找出 roundOutcome === WON 的隊伍」就是把那兩個修正分叉出去,
 * 而分叉之後只有其中一份會被繼續維護。
 */
import {
  DEFAULT_VICTORY_PODIUM,
  type VictoryPodiumPolicy,
} from "@ggd/shared/content/schema/victoryPodium";
import { rankSurvival, type SurvivalSeat } from "@ggd/shared/sim/stats/roundSurvival";
import { medalForPlace, type CrownMedal } from "../../render/victoryCrown";
import { roundEndQuoteChampion, type RoundSeatView, type RoundTeamView } from "./settlementModel";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";

/**
 * 頒獎台看得到的座位。`RoundSeatView` 加上 GH#257 的那一格。
 *
 * `roundDeathTick` 是 OPTIONAL 的,理由和 `RoomStore.SeatView` 上那一格一樣:
 * 手刻的 fixture(以及還沒升級的伺服器)省略它就是在說「這一回合沒倒過」,
 * 而那正是缺席該有的意思 —— 於是舊快照會退化成「全員平手,照擊殺數排」,
 * 不是退化成一個空的頒獎台。
 */
export type PodiumSeatView = RoundSeatView & { roundDeathTick?: number };

export interface PodiumEntry {
  seatId: number;
  teamId: number;
  championId: string;
  /** 1-based 名次:1 = 活到最後 */
  place: number;
  /** 金 / 銀 / 銅;第四名以後是 null(站得上台但沒有冠) */
  medal: CrownMedal | null;
  /** 這一位是被 `podiumFill: "opponents"` 補上來的(不是勝方成員) */
  filler: boolean;
}

/** `RoundSeatView` → 名次規則吃的形狀。 */
function toSurvivalSeat(s: PodiumSeatView): SurvivalSeat {
  return {
    seatId: s.seatId,
    teamId: s.teamId,
    championId: s.championId,
    alive: s.alive,
    roundKills: s.roundKills,
    roundDeathTick: s.roundDeathTick ?? 0,
  };
}

/**
 * MVP 的 championId → 他**那一個座位**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼 `seats.find((s) => s.championId === mvp)` 是一個缺陷
 * ═══════════════════════════════════════════════════════════════════════════
 * `MatchController` 的英雄抽選**有放回** —— 沒有任何唯一性閘,所以同一支英雄可以
 * 同時出現在兩隊。`hud.seats` 依 seatId 排序,於是撞名時 `find` 回傳的是**最小
 * seatId 的那一個**,而那一個常常在敗方。後果是整串的:
 *
 *   · `mvpSeat.teamId` 變成敗方 → `winnerTeam` 範圍把整個頒獎台翻成輸家,
 *     金冠戴在一個已經倒下的人頭上;
 *   · 撞名落在**輪空**隊伍時 `inScope` 是空的 → podium 空 → 呼叫端退回
 *     `roundWinnerTeamChampions` → 畫面上**一頂皇冠都沒有**。
 *
 * 這裡只修**消歧義**,不重排名次:候選限縮成「championId 相同的座位」之後,
 * 依隊伍的回合結果分層 —— 有隊伍 WON 就只認 WON 的那一層,否則認打過的那一層。
 * `roundEndQuoteChampion`(→`roundLeaderChampion`)的規則本來就是「有贏家先看
 * 贏家」,所以這個分層和它同向;而**沒有撞名時這個函式和舊的 `find` 逐字同解**。
 *
 * ⚠️ 真正的修法是讓 `settlementModel` 直接交出座位(`roundEndQuoteSeat`),
 * 因為 `roundWinnerTeamChampions`(`settlementModel.ts`)與 `GameApp.roundWinnerModelDoc`
 * 各自有一份一模一樣的 `find`。那兩個檔不在這一條線的範圍內,已列進交辦。
 * 同層之間仍然用最小 seatId 收尾 —— 純粹為了決定性,不是因為它有意義。
 */
export function mvpSeatFor(
  seats: readonly PodiumSeatView[],
  teams: readonly RoundTeamView[],
  mvp: string,
): PodiumSeatView | undefined {
  const outcomeOf = new Map(teams.map((t) => [t.teamId, t.roundOutcome]));
  const tier = (s: PodiumSeatView): number => {
    const o = outcomeOf.get(s.teamId);
    if (o === ROUND_OUTCOME.WON) return 0;
    if (o === ROUND_OUTCOME.FOUGHT || o === ROUND_OUTCOME.LOST) return 1;
    return 2; // 輪空 (NONE) / 名單還沒對上的隊伍
  };
  let best: PodiumSeatView | undefined;
  for (const s of seats) {
    if (s.championId !== mvp) continue;
    if (!best || tier(s) < tier(best)) best = s;
  }
  return best;
}

/** 這一回合真的上場過的座位(輪空 / 已淘汰的隊伍不算)。 */
function foughtThisRound(
  seats: readonly PodiumSeatView[],
  teams: readonly RoundTeamView[],
): PodiumSeatView[] {
  const fought = new Set(
    teams.filter((t) => t.roundOutcome !== ROUND_OUTCOME.NONE).map((t) => t.teamId),
  );
  return seats.filter((s) => s.championId && fought.has(s.teamId));
}

/**
 * 這一回合的頒獎台,第一名在最前面。空陣列 = 這一拍不該演
 * (觀戰 / 輪空 / 決勝回合 —— 全部由 `roundEndQuoteChampion` 回傳 null 表示)。
 *
 * `cfg` 預設是 `DEFAULT_VICTORY_PODIUM`(＝出貨的保險絲)。**出貨呼叫端不吃這個
 * 預設** —— `render/RoundWinnerStage.planRoundWinnerShow` 傳的是
 * `victoryPodiumPolicy()`,也就是 `content/config/victory-podium.json` 經
 * `resolveVictoryPodium` 解出來的那一份。這個預設只在「內容還沒載/載壞了」
 * 以及測試裡出現。
 */
export function roundVictoryPodium(
  seats: readonly PodiumSeatView[],
  teams: readonly RoundTeamView[],
  cfg: VictoryPodiumPolicy = DEFAULT_VICTORY_PODIUM,
): PodiumEntry[] {
  // 勝方是誰,不自己判(見檔頭)。null = 這一拍不演。
  const mvp = roundEndQuoteChampion(seats, teams);
  if (!mvp) return [];
  // 座位鍵是 seatId,不是 championId —— 見 `mvpSeatFor` 的檔頭(英雄抽選有放回)。
  const mvpSeat = mvpSeatFor(seats, teams, mvp);
  if (!mvpSeat) return [];

  const size = Math.max(0, Math.floor(cfg.podiumSize));
  if (size === 0) return [];

  const fought = foughtThisRound(seats, teams);
  const inScope =
    cfg.podiumScope === "allFought" ? fought : fought.filter((s) => s.teamId === mvpSeat.teamId);

  const primary = rankSurvival(inScope.map(toSurvivalSeat)).slice(0, size);
  const entries: PodiumEntry[] = primary.map((r, i) => ({
    seatId: r.seat.seatId,
    teamId: r.seat.teamId,
    championId: r.seat.championId,
    place: i + 1,
    medal: medalForPlace(i + 1),
    filler: false,
  }));

  // 湊不滿時補人。`shrink` 就到此為止 —— 一個空的台階讀起來像 bug,而少一個人
  // 的畫面仍然是正確的。`opponents` 才去撈其餘上場座位裡活最久的。
  if (entries.length < size && cfg.podiumFill === "opponents") {
    const taken = new Set(entries.map((e) => e.seatId));
    const rest = rankSurvival(
      fought.filter((s) => !taken.has(s.seatId)).map(toSurvivalSeat),
    ).slice(0, size - entries.length);
    for (const r of rest) {
      const place = entries.length + 1;
      entries.push({
        seatId: r.seat.seatId,
        teamId: r.seat.teamId,
        championId: r.seat.championId,
        place,
        medal: medalForPlace(place),
        filler: true,
      });
    }
  }

  return entries;
}
