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
  EVENT_BATCH: "evbatch", // N events from ONE tick, in order (see EventBatchMessage)
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
  | { kind: "rerollOffers" } // re-roll this seat's open augment/weapon offers
  /**
   * 即時生成殭屍（GH#343，owner 2026-08-17「以及即時生成殭屍等特殊單位」）。
   *
   * `what` 逐字沿用 sim 的 {@link MobKind}（一般 / 特殊 / 殭屍王），⛔ 不另外發明
   * 一套 grunt/elite 的詞彙 —— 兩套名字之於同一件事，就是遲早會對不上的那種債。
   *
   * `count` 省略時走 `config.practice@1` 的「生怪指令的預設數量」。⚠️ 無論填多少，
   * 伺服器一律吃小怪波設定的**每區同時存活上限**，撞到就停：練習房不可以被自己
   * 生出來的怪打死（那會讓沙盒變成一個沒得練的地方）。
   */
  | { kind: "spawnMob"; what: "normal" | "special" | "boss"; count?: number };

export interface CheatMessage {
  cheat: Cheat;
}

export interface EventMessage {
  type: string;
  tick: number;
  data: Record<string, unknown>;
}

/**
 * MANY `EventMessage`s from ONE tick, in one Colyseus message.
 *
 * WHY. Every `broadcast(MSG.EVENT, …)` is one `ws.send()` PER CLIENT — colyseus
 * only queues messages while a client is still JOINING (`WebSocketClient.
 * enqueueRaw`, @colyseus/ws-transport 0.16.5), so a joined room does no
 * coalescing of its own. MEASURED on a real 12-socket room replaying a real
 * 900-tick sim: 8.7 fanned-out events/tick at the shipped mob cap is 98 WebSocket
 * frames per tick (2,947/s), and 353/tick (10,615/s) at 600 zombies/zone. Each
 * of those frames pays a colyseus envelope, a WS frame header, a socket write —
 * and, above `wsCompression`'s 256 B threshold, its own deflate job.
 *
 * SHAPE. `evs` is a positional pair per event so the field names are not repeated
 * N times, and the ARRAY ORDER IS THE DELIVERY ORDER — see `unpackEventBatch`.
 * `tick` is carried once because every event in a batch is from the same tick;
 * that is what makes batching latency-free, and it is why there is no
 * cross-tick mode (owner: 「不要跨 tick 合批」 — 順暢 over 省頻寬).
 */
export interface EventBatchMessage {
  /** the single tick every event in this batch was emitted on */
  tick: number;
  /** [type, data] pairs, IN EMISSION ORDER */
  evs: [string, Record<string, unknown>][];
}

/**
 * Batch → the exact `EventMessage` sequence the unbatched wire would have sent.
 *
 * THE ORDER IS THE CONTRACT. Sim events are causally linked (`castBegin` before
 * `castRejected`, `attackWindup` before `basicAttackHit`, `damage` before
 * `death`), and the client's drain applies them in arrival order. Any reshuffle
 * here — sorting, grouping by type, reversing — is a behaviour change even
 * though every event still arrives. `eventBatch.test.ts` mutates exactly that.
 *
 * Defensive on shape, not on content: a malformed pair is skipped rather than
 * throwing, because one bad entry must not take the whole tick's combat visuals
 * down with it.
 */
export function unpackEventBatch(msg: EventBatchMessage): EventMessage[] {
  const out: EventMessage[] = [];
  if (!Array.isArray(msg?.evs)) return out;
  for (const pair of msg.evs) {
    if (!Array.isArray(pair) || typeof pair[0] !== "string") continue;
    out.push({ type: pair[0], tick: msg.tick, data: (pair[1] ?? {}) as Record<string, unknown> });
  }
  return out;
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
  /**
   * THE NUMBER ON THE SETTLEMENT SCREEN — `rankScore`, i.e. the very expression
   * `perMatchRanks` sorted on. Optional only because a pre-feature server does
   * not send it; the panel then shows the rank alone rather than inventing one.
   */
  score?: number;
  /**
   * The survival half of `score`, alone (owner, 2026-07-27: 「每回合 RANK 計算，
   * 存活下來的人額外 +200分」). Broken out so the settlement can SHOW why a
   * turtle out-placed a damage dealer — otherwise the bonus is invisible and
   * the player cannot tell it exists, which is this repo's #1 failure.
   */
  survivalBonus?: number;
  /** ranked-ladder deltas — filled by the platform layer, not the game server */
  pointsDelta?: number;
  tierBefore?: string;
  tierAfter?: string;
}

/**
 * ONE PLAYER'S CONTRIBUTION IN ONE ROUND — a DELTA, never a running total.
 *
 * This shape exists because per-round performance was, until now, unobtainable
 * anywhere in the system. `PlayerMatchStats` lives in SimWorld, is cumulative
 * from champion spawn and is never reset per round (roundReport.ts §2(a) says
 * so at length: 「there is no such number as "the damage I did this round"
 * anywhere in the system, server included」). The only per-round facts on the
 * wire were `SeatState.roundKills/roundDeaths` — four integers, no damage, no
 * healing, no mob kills. A per-round chart cannot be drawn from that.
 *
 * So MatchController snapshots the cumulative scoreboard at every combat settle
 * and ships the DIFFERENCE against the previous settle. Deltas rather than
 * running totals on purpose: a chart of cumulative damage only ever slopes up
 * and says nothing about which round a player actually showed up in.
 *
 * `hpRatio` is the exception and is deliberately NOT a delta — it is a level,
 * read off `Health` at the instant the round settled (0 when dead). It is the
 * 存活HP比例 the MVP formula rewards.
 */
export interface RoundStatDelta {
  seatId: number;
  /** hp / maxHp at the moment the round settled, clamped to [0,1]; 0 if dead. */
  hpRatio: number;
  kills: number;
  deaths: number;
  assists: number;
  /** damage to ENEMY CHAMPIONS only — recordDamage drops non-champion targets. */
  damageDealt: number;
  /** HP actually lost. Includes zombie damage (#215) — owner-accepted. */
  damageTaken: number;
  damageBlocked: number;
  healingDone: number;
  ccAppliedTicks: number;
  /** ticks alive while combat was live — how long you lasted THIS round. */
  timeAliveTicks: number;
  revivesPerformed: number;
  /** world.mobKills delta: 殭屍 this player put down this round (#215). */
  mobKills: number;
  /**
   * This seat's team drew the BYE (TeamState.roundOutcome === NONE) — it never
   * fought. Every counter above is 0 and hpRatio is 0, because enterCombat
   * parks a bye team's seats DEAD without emitting a death: byte-identical to
   * a team that was instantly wiped (#173 is the bug that proved it). Without
   * this flag the chart would plot a sat-out round as "ranked last, zero
   * damage" — a lie about play that never happened. Consumers must SKIP these
   * rounds rather than score them.
   */
  bye: boolean;
}

/** Every player's delta for one settled combat round. */
export interface RoundStatsEntry {
  /** 1-based round number this delta covers (PhaseMachine.round at settle). */
  round: number;
  players: RoundStatDelta[];
}

export interface MatchSettlement {
  matchId: string;
  /** team id that placed 1st (winner), or -1 if undecided */
  winnerTeam: number;
  perPlayer: SettlementPlayer[];
  /**
   * Per-round history, oldest round first — the input to the settlement's
   * 每回合戰績變化 chart. OPTIONAL because a pre-feature server (and every
   * hand-built test fixture) simply has no such field; the client falls back to
   * "no per-round data" rather than drawing a chart out of nothing.
   */
  rounds?: RoundStatsEntry[];
}
