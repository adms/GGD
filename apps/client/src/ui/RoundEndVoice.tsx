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
 * Headless: it owns no DOM, only the trigger. A champion with no quote clip yet
 * is a silent skip (playChampionQuote self-gates + degrades to silence).
 */
import { useEffect, useRef } from "react";
import { hudStore, useHud } from "../net/RoomStore";
import { roundEndQuoteChampion } from "./panels/settlementModel";
import { playChampionQuote } from "../audio/nameVoice";
import { playContextualVoice } from "../audio/contextualVoice";

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
    const { seats, teams } = hudStore.getState();
    const champ = roundEndQuoteChampion(seats, teams);
    if (champ) {
      void playChampionQuote(champ).catch(() => {});
      // the round winner's own cloned 勝利宣言, beside the 名言 (client-only cosmetic;
      // a hero with no generated pack simply no-ops).
      playContextualVoice(champ, "victory");
    }
  }, [phase]);
  return null;
}
