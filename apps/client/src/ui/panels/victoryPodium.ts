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
 * `cfg` 預設是 `DEFAULT_VICTORY_PODIUM`,也就是**目前實際生效的值**。
 * 那一份還沒有接上 `content/config` 與後台(見 `victoryPodium.ts` 的檔頭),
 * 所以這個參數現在只有測試在餵 —— 接完之後呼叫端改傳 ContentDb 讀出來的政策
 * 就好,這一支一行都不用動。
 */
export function roundVictoryPodium(
  seats: readonly PodiumSeatView[],
  teams: readonly RoundTeamView[],
  cfg: VictoryPodiumPolicy = DEFAULT_VICTORY_PODIUM,
): PodiumEntry[] {
  // 勝方是誰,不自己判(見檔頭)。null = 這一拍不演。
  const mvp = roundEndQuoteChampion(seats, teams);
  if (!mvp) return [];
  const mvpSeat = seats.find((s) => s.championId === mvp);
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
