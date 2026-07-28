/**
 * zombieWaveModel — 「殭屍來襲提示 + 戰鬥中即時已擊殺數」 (task #258).
 *
 * owner, 2026-07-28: 「戰鬥開始殭屍出來是否有提示？並且提示已擊殺數量？」
 *
 * WHAT WAS ACTUALLY WRONG — and it was not a missing panel.
 *   • THE PROMPT: the roguelite wave system (#215) has shipped since round 3 of
 *     every match, and the ONLY place the word 殭屍 appeared in the whole client
 *     was the lobby's mode toggle (`ui/LobbyScreen.tsx`). In combat the zombies
 *     simply walked in. There was no banner, no sound cue, nothing.
 *   • THE COUNT: `world.mobKills` reached a client through exactly one path —
 *     `RoundStatDelta.mobKills`, assembled at ROUND SETTLE for the settlement
 *     progress chart. Mid-combat the number was NOT ON THE WIRE, so no HUD work
 *     could have shown it. `SeatState.mobKills` (protocol/schema.ts) is the
 *     first half of this task; this module is the second.
 *
 * TWO NUMBERS, TWO DIFFERENT SOURCES, ON PURPOSE:
 *   `alive` — mobs standing in YOUR duel zone, projected from the replicated
 *             entity map (`RoomStore.mobsAlive`). It is what drives 「來襲」,
 *             because a wave has arrived exactly when bodies appear.
 *   `kills` — YOUR match-cumulative tally, straight off the seat. It is the
 *             same counter `MobSystem` grants a level from, so the HUD number
 *             and the levels the player is being handed can never disagree.
 *
 * Everything here is a pure function over plain numbers, so the wording, the
 * gate and the alert window are testable in node without a DOM — the same shape
 * as `killComboModel` and `selfStatusModel`.
 */

/**
 * How long the 「殭屍來襲」 alert stays loud after a wave lands on an empty
 * floor. 3.5 s is long enough to be read mid-fight and short enough that it is
 * gone before the next wave (the shipped cadence is one wave every 2 s, but
 * only the 0→N transition re-arms it, so in practice it fires once per lull).
 */
export const ZOMBIE_ALERT_MS = 3500;

/** The two lines, exported so the tests cannot drift from the component. */
export const ZOMBIE_ALERT_TEXT = "殭屍來襲！";
export const ZOMBIE_LABEL = "殭屍";
export const ZOMBIE_KILLS_LABEL = "已擊殺";

export interface ZombieWaveInput {
  /** match phase, from the HUD store */
  phase: string;
  /** mobs alive in the LOCAL player's duel zone */
  alive: number;
  /** the local seat's match-cumulative 殭屍擊殺數 */
  kills: number;
  /** `performance.now()`-style stamp of the last 0→N surge, or null */
  surgeAtMs: number | null;
  nowMs: number;
}

export interface ZombieWaveView {
  /** true while the loud 「殭屍來襲！」 treatment is up */
  alerting: boolean;
  alive: number;
  kills: number;
  /** the readout, already formatted: 「殭屍 ×12」 */
  aliveText: string;
  /** 「已擊殺 34」 */
  killsText: string;
  /** the alert line, or "" when not alerting */
  alertText: string;
}

/**
 * The SURGE EDGE: when did a wave last land on an empty floor?
 *
 * Returns the new stamp given the previous alive-count and the current one.
 * Only 0 → N re-arms the alert — a wave that tops up an already-occupied floor
 * is not news, and re-arming on every spawn would leave 「殭屍來襲！」 on screen
 * permanently from round 3 onward (the shipped cadence is a wave every 2 s).
 *
 * Pure, and takes the clock as an argument, so the edge logic is testable
 * without faking timers.
 */
export function zombieSurgeAt(
  prevAlive: number,
  alive: number,
  prevSurgeAtMs: number | null,
  nowMs: number,
): number | null {
  if (alive > 0 && prevAlive <= 0) return nowMs;
  // the floor cleared: forget the stamp, so the NEXT wave alerts again
  if (alive <= 0) return null;
  return prevSurgeAtMs;
}

/**
 * What the readout shows, or `null` for "nothing at all".
 *
 * NULL IS A REAL ANSWER and it is most of the game: rounds 1-2 have no mob
 * waves at all, and a permanent 「殭屍 ×0 · 已擊殺 0」 in the corner of those
 * rounds is clutter that teaches the player to stop looking there.
 *
 * The readout SURVIVES the floor being cleared (`kills > 0` keeps it up) — the
 * owner asked for 「已擊殺數量」, and a tally that vanishes the moment you kill
 * the last zombie is the one moment you most want to read it.
 */
export function zombieWaveView(input: ZombieWaveInput): ZombieWaveView | null {
  // Combat only: a zombie counter over the shop card would be describing a
  // fight that is not happening.
  if (input.phase !== "combat") return null;
  const alive = Math.max(0, Math.trunc(input.alive));
  const kills = Math.max(0, Math.trunc(input.kills));
  if (alive === 0 && kills === 0) return null;
  const age = input.surgeAtMs === null ? Infinity : input.nowMs - input.surgeAtMs;
  // `age < 0` is a clock that ran backwards — treat it as "not alerting" rather
  // than as a stuck banner.
  const alerting = alive > 0 && age >= 0 && age < ZOMBIE_ALERT_MS;
  return {
    alerting,
    alive,
    kills,
    aliveText: `${ZOMBIE_LABEL} ×${alive}`,
    killsText: `${ZOMBIE_KILLS_LABEL} ${kills}`,
    alertText: alerting ? ZOMBIE_ALERT_TEXT : "",
  };
}
