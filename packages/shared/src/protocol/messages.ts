/** Client<->server message names + payloads (Colyseus onMessage channel). */
import type { Order, Command, AbilitySlot } from "../sim/intents";
import type { Vec2 } from "../sim/math/vec2";
import type { PlayerMatchStats } from "../sim/stats/matchStats";
import type { Grade } from "../sim/stats/rating";

export const MSG = {
  // client -> server
  INPUT: "input", // continuous + discrete, seq-stamped
  SELECT_CHAMPION: "selectChampion",
  CHEAT: "cheat", // dev-only offline testing aid (server hard-gates on dev mode)
  // server -> client (events; state rides the schema)
  EVENT: "event", // sim events fanout {type, tick, data}
  REJECT: "reject", // {seq?, reason}
  PHASE: "phase", // {phase, round}
} as const;

export interface InputMessage {
  seq: number;
  order?: Order;
  aim?: Vec2;
  commands?: Command[];
}

export interface SelectChampionMessage {
  championId: string;
}

/**
 * Offline cheat commands (single-player testing aid). Sent on the MSG.CHEAT
 * channel and applied to the SENDER's own seat only. The server hard-gates
 * these to dev mode (no PLATFORM_GAME_SHARED_SECRET + devCheats flag on) and
 * NEVER trusts the client's "offline" claim — see cheatGate.ts.
 */
export type Cheat =
  | { kind: "setLevel"; level: number } // 1..18
  | { kind: "grantGold"; amount: number }
  | { kind: "grantMCoin"; amount: number } // no wallet in-sim → no-op server-side
  | { kind: "maxAbilities" } // learn + max Q/W/E/R (R past the round gate)
  | { kind: "rankAbility"; slot: AbilitySlot } // rank one slot (R bypasses gate)
  | { kind: "giveItem"; itemId: string } // grantItemFree into the first open slot
  | { kind: "swapChampion"; championId: string } // despawn + respawn same seat/team/pos
  | { kind: "fullHeal" } // hp + mana to full, revive
  | { kind: "godMode"; enabled: boolean } // invuln: hp/mana topped off every tick
  | { kind: "zeroCooldown"; enabled: boolean } // 0 CD 釋放: abilities never on cooldown
  | { kind: "resetCooldowns" } // one-shot cooldown refresh
  | { kind: "killEnemies" } // kill all enemy champions in my zone (fast-forward)
  | { kind: "spawnFlower" } // spawn a healing flower in my zone (flower testing)
  | { kind: "skipPhase" } // force intermission→combat / end the round
  | { kind: "rerollOffers" }; // re-roll this seat's open augment/weapon offers

export interface CheatMessage {
  cheat: Cheat;
}

export interface EventMessage {
  type: string;
  tick: number;
  data: Record<string, unknown>;
}

/**
 * Victory-settlement event type broadcast on the MSG.EVENT channel once the
 * match ends (phase -> matchEnd). Carries the full per-player scoreboard, grade
 * and per-match rank so the client can render the settlement screen + ranking
 * table. `pointsDelta` / `tierBefore` / `tierAfter` are OPTIONAL — the game
 * server leaves them undefined; the platform/ranked layer fills them in on the
 * leaderboard screen (the client's "查看戰績變化" flow).
 */
export const SETTLEMENT_EVENT = "matchSettlement" as const;

/**
 * Per-team settlement broadcast the moment a team is ELIMINATED mid-match
 * (task #193). Same `MatchSettlement` payload shape as {@link SETTLEMENT_EVENT},
 * but it fires while the match is still running for the surviving teams, so a
 * player whose team's life is gone can see their evaluation screen BEFORE they
 * choose to leave — rather than being dropped straight to the lobby. `winnerTeam`
 * is -1 (undecided) until the final `matchSettlement` at matchEnd. The client
 * records it into the same settlement slot and only surfaces it on the
 * leave-flow for a player whose own team is out (see ui/panels/leaveSettlement).
 *
 * It is a DISTINCT event name on purpose: a prior attempt reused an event key
 * the client never handled ("a dead key at matchEnd"), so the card never
 * arrived. This constant is imported by BOTH the server broadcaster and the
 * client handler, so the wire key can never drift between them again.
 */
export const TEAM_SETTLEMENT_EVENT = "teamSettlement" as const;

export interface SettlementPlayer {
  seatId: number;
  accountId: string;
  /** champion id (content key) for the portrait */
  champ: string;
  teamId: number;
  /** champion role (drives the role-normalised grade) */
  role: string;
  grade: Grade;
  /** 1..N placement across ALL players in the match */
  rank: number;
  stats: PlayerMatchStats;
  /** ranked-ladder deltas — filled by the platform layer, not the game server */
  pointsDelta?: number;
  tierBefore?: string;
  tierAfter?: string;
}

export interface MatchSettlement {
  matchId: string;
  /** team id that placed 1st (winner), or -1 if undecided */
  winnerTeam: number;
  perPlayer: SettlementPlayer[];
}
