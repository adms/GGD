/**
 * RoundEndVoice — task #139, moment 3. At each ROUND-end settlement the round's
 * RANK-1 champion speaks its famous quote (名言). The trigger is the phase EDGE
 * into `resolution` (the "Round over" beat), which only ever follows a combat
 * round — so it never fires on the pre-game (round-1) intermission, and fires
 * exactly once per round.
 *
 * Every client resolves the leader from the SAME authoritative schema state
 * (team lives / eliminated / placement, then seat), so all players hear the SAME
 * clip — the winner's line — with nothing broadcast. The match-deciding round is
 * skipped here (roundEndQuoteChampion returns null): that round-end IS the match
 * end, whose settlement plays the LOCAL player's own quote (MatchEndPanel).
 *
 * Headless: it owns no DOM, only the trigger.
 */
import { useEffect, useRef } from "react";
import { hudStore, useHud } from "../net/RoomStore";
import { roundEndQuoteChampion } from "./panels/settlementModel";
import { championNameVoice, playChampionQuote } from "../audio/nameVoice";
import { playContextualVoice } from "../audio/contextualVoice";
import { playRoundTaunt } from "../audio/victoryTaunt";
import {
  DEFAULT_VICTORY_PODIUM,
  type VictoryRoundWinLine,
} from "@ggd/shared/content/schema/victoryPodium";

/**
 * 這一支要驅動的三個播放器。**注入是為了可測**:client 的 vitest 跑在 node env,
 * 沒有 `Audio`,而 `useEffect` 在 `renderToStaticMarkup` 下根本不會跑 —— 把決策
 * 留在元件的閉包裡,結果就是稽核實測的那一句:全 repo 沒有任何測試引用
 * `roundWinLine` / `quoteEnabled`,**整段刪掉不會紅**(失敗形態 ③)。
 */
export interface RoundEndVoicePorts {
  /** 名言。回傳 false = 這位英雄還沒有名言剪輯(`audio/nameVoice` 自己判)。 */
  playQuote: (championId: string) => Promise<boolean>;
  /** 嘲諷。回合正常路徑由 `render/RoundWinnerStage` 放,這裡只在退回時用。 */
  playTaunt: (championId: string, round: number) => Promise<unknown>;
  /** 該英雄自己的勝利宣言(client-only cosmetic;沒有生成包就 no-op)。 */
  playContextual: (championId: string, ctx: "victory") => void;
}

/** 出貨的那一組。 */
export const ROUND_END_VOICE_PORTS: RoundEndVoicePorts = {
  playQuote: (championId) => playChampionQuote(championId),
  playTaunt: (championId, round) => playRoundTaunt(championId, round),
  playContextual: (championId, ctx) => playContextualVoice(championId, ctx),
};

/**
 * 回合結束時第一名發聲 —— GH#256 的決策點在這一支落地。
 *
 * `mode` 是 `victory.roundWinLine`(`content/schema/victoryPodium`),不是常數:
 *
 *   `taunt` 只放嘲諷 → 這裡**不放名言**(嘲諷是舞台的事)。
 *   `quote` 只放名言 → 舞台已經把嘲諷關掉了,所以這位英雄沒有名言剪輯時
 *           **必須在這裡退回嘲諷**,否則「打開一個欄位」換到的是一片安靜,
 *           那比沒有這個欄位更糟。
 *   `both`  預設,也是現行出貨行為:名言 t=0(這裡)+ 嘲諷 t=2200ms(舞台)。
 *           不需要退回 —— 嘲諷本來就會放。
 *
 * ⚠️ 名言的擁有者是這一支而不是舞台,是刻意的:舞台在模型還沒載好、整個不出現的
 * 那幾拍會完全沉默,把名言搬進去等於讓「模型載不到」順手把語音也一起靜音
 * (失敗形態 ②)。兩邊讀的是同一個政策物件,所以決策仍然只有一處。
 *
 * 勝利宣言(`playContextual`)不受 `mode` 管:它是英雄自己的反應,不是「回合勝利
 * 的台詞」那一格在講的東西。
 */
export function speakRoundEnd(
  championId: string,
  round: number,
  mode: VictoryRoundWinLine = DEFAULT_VICTORY_PODIUM.roundWinLine,
  ports: RoundEndVoicePorts = ROUND_END_VOICE_PORTS,
): Promise<void> {
  // ⚠️ 名言先「開始」再放勝利宣言,兩者在同一個 tick 出發 —— `playQuote` 內部要
  // await 一次 `quotes.json` 的 fetch,如果在這裡 await 它,勝利宣言就會被一次
  // 網路往返延後。回傳的 promise 只給測試用來等 fallback 落地。
  const line =
    mode === "quote" || mode === "both"
      ? (async () => {
          const played = await ports.playQuote(championId).catch(() => false);
          if (!played && mode === "quote") {
            await ports.playTaunt(championId, round).catch(() => {});
          }
        })()
      : Promise.resolve();
  ports.playContextual(championId, "victory");
  return line.catch(() => {});
}

export function RoundEndVoice(): null {
  const phase = useHud((s) => s.phase);
  const prevPhase = useRef<string>("");
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = phase;
    // fire once, only on the EDGE into the round-end "Round over" phase
    if (phase !== "resolution" || was === "resolution") return;
    // read the current teams/seats straight from the store so the leader is the
    // one settled THIS round, with no stale-closure / dep-churn re-fire risk
    const { seats, teams, round } = hudStore.getState();
    const champ = roundEndQuoteChampion(seats, teams);
    if (champ) void speakRoundEnd(champ, round ?? 0).catch(() => {});
    // GH#583 —— **E1**：離開結算那一拍就把名言掐掉。素材量到 mean 2.4s / max 9.99s,
    // 而在此之前它會整句講完、跨過商店、跨過離開房間,而且**沒有任何按鈕停得掉**
    // (它走 HTMLAudioElement,⛔ 不吃 `stopSustainedSfx` / `stopAllVoices` / 場景切換)。
    // ⚠️ cleanup 在**進入** resolution 那一次也會先跑一遍(React 先清舊 effect),
    // 所以它同時保證了「新的一句開始前,舊的一句已經停了」。
    return () => championNameVoice.cancel();
  }, [phase]);
  return null;
}
