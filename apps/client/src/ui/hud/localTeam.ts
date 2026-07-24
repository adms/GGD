/**
 * ui/hud/localTeam — the ONE answer to "is the local player's team out of the
 * match?", so the three surfaces that ask it cannot disagree.
 *
 * It is a three-hop lookup — localSeatId → that seat's teamId → that team's
 * `eliminated` flag — with two independent ways to be unknown (no seat yet
 * during connect/champ-select, no team row yet on the first patch). Written
 * inline it is four lines that LOOK obvious and quietly differ: one caller
 * defaults an unknown to `false`, the next forgets the seat may be null, a
 * third reads `placement` instead of `eliminated`.
 *
 * That already cost this project once. Task #70's shop gate and the HUD panel
 * registry both needed it, and the shop's own copy is what shipped the bug the
 * owner reported as 「我的意思是團隊生命已經沒了 整個遊戲都輸了 不是輸了回合」 — a
 * team with no lives left was still being offered a shop it could never buy
 * from. Now the exit gate (#193) is a third caller, so the definition moves
 * here before there are three copies instead of two.
 *
 * UNKNOWN IS NOT ELIMINATED. Every degenerate input answers `false`, and that
 * direction is deliberate: a false negative costs a player a settlement screen
 * they could have seen, a false positive locks a LIVE player out of their own
 * match behind a results screen. The safe error is the one that keeps playing.
 */
import { useHud } from "../../net/RoomStore";

/**
 * The local player's teamId, or null when it is not knowable yet (no seat
 * assigned, or the seat carries no team).
 */
export function useLocalTeamId(): number | null {
  return useHud((s) => {
    if (s.localSeatId === null) return null;
    return s.seats.find((v) => v.seatId === s.localSeatId)?.teamId ?? null;
  });
}

/**
 * True when the local player's team has spent ALL its team lives — 整個遊戲都輸了,
 * not 輸了一個回合. False whenever that cannot be established (see the header on
 * why unknown resolves to "still in it").
 *
 * The state this reads is the server's own `teams[].eliminated`, which is the
 * same field the sim uses to stop scheduling the team into rounds — so the HUD
 * can never believe a team is out while the match still expects it to fight.
 */
export function useLocalTeamEliminated(): boolean {
  return useHud((s) => {
    if (s.localSeatId === null) return false;
    const t = s.seats.find((v) => v.seatId === s.localSeatId)?.teamId;
    if (t === undefined) return false;
    return s.teams.find((v) => v.teamId === t)?.eliminated ?? false;
  });
}
