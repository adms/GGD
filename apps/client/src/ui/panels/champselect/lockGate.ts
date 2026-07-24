/**
 * lockGate — the CLIENT-side champion LOCK for champ-select (the 「已鎖定」/🔒
 * flow). Sits beside briefingGate as the other bit of purely-local champ-select
 * UI state the panel keeps across remounts.
 *
 * WHY A LOCK AT ALL. Picks used to be pure last-write-wins with NO commit step,
 * so the player could keep clicking a different champion right up to the buzzer
 * and there was no visible "this is final" state. This module adds the missing
 * commit: the local player presses 鎖定 (or the clock runs out) and their pick
 * FREEZES — the roster grid, the 🎲 random button and every re-pick stop landing,
 * and the panel shows a 🔒 已鎖定 badge.
 *
 * ── THE PRE-ROLL SNAPSHOT BUG (playtest P1: 「locked onto NOTHING」) ───────────
 * The first version auto-locked on `secondsLeft <= 0` on the strength of a
 * comment claiming champ-select is "never observed at 0 s except at the genuine
 * timeout". That is false. `MatchState`'s schema constructor defaults are
 * `phase = "champSelect"` and `phaseTicksLeft = 0` (packages/shared/src/protocol
 * /schema.ts), and `MatchRoom.onCreate` publishes the room state — matchId,
 * mapId, seed, combatEnvJson — BEFORE the tick loop's first `projectSnapshot`
 * ever writes `phaseTicksLeft`. `GameApp.connect()` then feeds that state
 * straight in (`this.onStatePatch(room.state)` right after join). So the very
 * first sample the panel sees is a REAL matchId with `phase = "champSelect"` and
 * `secondsLeft = 0` — indistinguishable, to the old rule, from the buzzer.
 * Because the lock is monotonic, that one pre-roll sample latched the seat
 * LOCKED before the player had picked anything, and no later snapshot could
 * clear it: 🔒 已鎖定 LOCKED with an empty champion, for the whole phase.
 *
 * The gate is therefore SELF-CALIBRATING, exactly like briefingGate: a zero
 * clock only counts as an expiry once a RUNNING clock (`secondsLeft > 0`) has
 * actually been observed this champ-select (`clockSeen`). A zero before that is
 * a pre-roll/uninitialised snapshot and is ignored.
 *
 * ── NEVER LOCKED ONTO NOTHING ────────────────────────────────────────────────
 * The second half of P1: even at a GENUINE timeout, freezing a seat that has no
 * champion produced the 「… 🔒」 dead end — the player is told the pick is final
 * while nothing is named. The decision is no longer a bare boolean but a
 * `LockStatus`:
 *
 *   "open"          — nothing is committed; the roster is live.
 *   "awaiting-auto" — the pick is frozen but the seat has NO champion yet: the
 *                     server's `autoPickAndSpawn` is about to hand one over.
 *                     The panel says so instead of claiming a lock.
 *   "locked"        — frozen onto a REAL, NAMED champion. STRUCTURALLY
 *                     impossible with an empty pick, which is the invariant the
 *                     bar asks for.
 *
 * and `autoAssigned` flags the case where that champion arrived from the server
 * rather than from the player, so the panel can say 「已為你隨機選擇：X」 rather
 * than silently pretending the player chose it.
 *
 * CLIENT-SIDE ONLY (by design, for now). This is the fix for the reported bug —
 * a normal player can no longer switch after locking. It does NOT yet stop a
 * crafted client, and OTHER players do not see the lock: enforcing it needs a
 * server `locked` flag on the seat (MatchController.selectChampion refusing a
 * pick from a locked seat, plus the snapshot bit) — a documented follow-up in
 * apps/game-server, owned by another wave.
 *
 * #130 (the onboarding trap: an unlocked player spawns dead/spectator round 1).
 * The lock NEVER invents or clears a pick. Locking freezes whatever the player
 * currently has; the auto-lock at timeout does the same, and a genuinely-empty
 * pick is still filled by the server's existing random auto-pick — so nobody
 * ends up champion-less because of the lock.
 *
 * Pure + node-testable: `stepLock` is a plain reducer and every decision the
 * panel makes (`pickAllowed`, `pickToCommitOnLock`, `lockBanner`) is a pure
 * function. The module-level singleton at the bottom is the thin shell the React
 * panel shares across remounts so a lock is not lost on a brief disconnect —
 * exactly the shape briefingGate uses.
 */

/** HUD store `phase` value for champion select (same constant briefingGate keys on). */
export const CHAMP_SELECT_PHASE = "champSelect";

export interface LockState {
  /** which match this lock belongs to; a change rearms it (a new match = unlocked) */
  matchId: string | null;
  /** the local player pressed 鎖定 — the roster can no longer switch */
  locked: boolean;
  /**
   * a RUNNING champ-select clock (`secondsLeft > 0`) has been observed this
   * match. Until it has, a zero clock is a PRE-ROLL snapshot (see the header),
   * never an expiry — this single bit is what stops the 「locked onto nothing」
   * trap at its source.
   */
  clockSeen: boolean;
  /**
   * the clock expired while the local seat still had NO champion, so whatever
   * champion turns up next came from the server's random auto-pick, not from
   * the player. Latched so the panel can keep explaining it after the fact.
   */
  expiredEmpty: boolean;
}

/** A freshly armed lock (a new match starts unlocked, with nothing observed). */
export const LOCK_INITIAL: LockState = {
  matchId: null,
  locked: false,
  clockSeen: false,
  expiredEmpty: false,
};

export interface LockInput {
  /** HUD store `phase` */
  phase: string;
  /** HUD store `phaseSecondsLeft` (whole seconds) */
  secondsLeft: number;
  /** HUD store `matchId` — rearms the lock when it changes */
  matchId: string;
  /** the LOCAL seat's championId ("" = the player has not picked anything yet) */
  pick: string;
}

/**
 * How the champ-select commit reads right now.
 *   open          → the roster is live, nothing is committed.
 *   awaiting-auto → frozen with no champion; the server is about to assign one.
 *   locked        → frozen onto a real, named champion.
 */
export type LockStatus = "open" | "awaiting-auto" | "locked";

export interface LockDecision {
  /** true = the local pick is frozen this sample (roster/random/re-pick disabled) */
  locked: boolean;
  /** the three-way status the panel renders (never "locked" without a champion) */
  status: LockStatus;
  /** the frozen champion came from the server auto-pick, not the player's click */
  autoAssigned: boolean;
  /** state to carry into the next sample */
  next: LockState;
}

function rearmFor(matchId: string): LockState {
  return { matchId, locked: false, clockSeen: false, expiredEmpty: false };
}

/**
 * Advance the lock with one (phase, secondsLeft, matchId, pick) sample.
 * Monotonic: once locked it stays locked for the match.
 *
 * AUTO-LOCK ON TIMEOUT — when the champ-select clock reaches 0 AFTER having been
 * seen running, the pick is final (the server hands a random to any still-empty
 * seat, #130), so we reflect that and stop offering a switch that can no longer
 * land. A zero clock that was never preceded by a running one is the pre-roll
 * snapshot documented in the header and is deliberately ignored — that is the
 * P1 fix. Same for a bogus (NaN/∞) clock: it is not evidence the phase ended.
 *
 * Idempotent for a steady clock; never throws.
 */
export function stepLock(prev: LockState, input: LockInput): LockDecision {
  // a new match clears the lock; a reconnect into the SAME match keeps it.
  const base = input.matchId !== prev.matchId ? rearmFor(input.matchId) : prev;
  const pick = typeof input.pick === "string" ? input.pick : "";

  // outside champ select there is nothing to lock; hold the state so the
  // same-match field survives (defensive — this phase is only left for good).
  if (input.phase !== CHAMP_SELECT_PHASE) return decide(base.locked, base, pick);

  const valid = Number.isFinite(input.secondsLeft);
  const sec = valid ? Math.max(0, Math.floor(input.secondsLeft)) : -1;
  // `clockSeen` is the self-calibration: only a POSITIVE clock proves the phase
  // is really running, and only then can a later 0 mean "the buzzer went".
  const clockSeen = base.clockSeen || sec > 0;
  const expired = clockSeen && valid && sec <= 0;

  const frozen = base.locked || expired;
  const next: LockState = {
    ...base,
    clockSeen,
    // latch the moment the buzzer caught the player with no champion
    expiredEmpty: base.expiredEmpty || (expired && pick === ""),
  };
  return decide(frozen, next, pick);
}

/**
 * Fold (frozen, state, pick) into the panel's status. The ONE place the
 * 「never locked onto nothing」 invariant lives: `status === "locked"` requires a
 * non-empty champion, so no combination of inputs can render 🔒 已鎖定 over an
 * empty seat.
 */
function decide(frozen: boolean, next: LockState, pick: string): LockDecision {
  const status: LockStatus = !frozen ? "open" : pick === "" ? "awaiting-auto" : "locked";
  return {
    locked: frozen,
    status,
    autoAssigned: status === "locked" && next.expiredEmpty,
    next,
  };
}

/** Commit the current pick (the 鎖定 button). Idempotent. */
export function lockPick(state: LockState): LockState {
  return { ...state, locked: true };
}

// ---------------------------------------------------------------------------
// pure decisions the panel makes off the lock (shared with the tests, so the
// "you cannot switch after locking" contract is a checkable fact, not a literal
// buried in a disabled={} prop)
// ---------------------------------------------------------------------------

/**
 * Would a roster / 🎲 / re-pick click be SENT to the server? Every pick entry
 * point in the panel funnels through this: true before the lock (the player can
 * still change their mind), false after (the pick is frozen).
 */
export function pickAllowed(locked: boolean): boolean {
  return !locked;
}

/**
 * The champion to COMMIT when locking. Locking freezes whatever the player
 * currently has — it never invents or clears a pick (#130). An empty pick stays
 * empty here and is filled only by the server's existing random auto-pick, so
 * the lock alone can never leave anyone champion-less.
 */
export function pickToCommitOnLock(currentPick: string): string {
  return currentPick;
}

/** What the panel shows about the commit. `null` = say nothing (still picking). */
export interface LockBanner {
  /** which visual treatment: a waiting note, the random hand-over, or the lock */
  tone: "waiting" | "auto" | "locked";
  text: string;
}

/**
 * The one sentence the panel puts in front of the player about their commit.
 * Pure so the bar — 「never a silent 『… 🔒』」 — is a checkable fact: a "locked"
 * status with no champion NAME degrades to the waiting note rather than
 * announcing a lock onto nothing.
 */
export function lockBanner(
  status: LockStatus,
  autoAssigned: boolean,
  championName: string,
): LockBanner | null {
  const name = championName.trim();
  if (status === "open") return null;
  if (status === "awaiting-auto" || name === "") {
    return { tone: "waiting", text: "⏳ 時間到 — 系統正在為你隨機選一隻英雄…" };
  }
  if (autoAssigned) return { tone: "auto", text: `🎲 已為你隨機選擇：${name}` };
  return { tone: "locked", text: `🔒 已鎖定：${name}` };
}

// ---------------------------------------------------------------------------
// module-level singleton — survives a panel remount within the same match so a
// lock is not forgotten on a brief disconnect. The React panel drives it.
// ---------------------------------------------------------------------------

let current: LockState = LOCK_INITIAL;

/** Feed one sample; returns the full decision (status + autoAssigned + locked). */
export function observeLock(input: LockInput): LockDecision {
  const decision = stepLock(current, input);
  current = decision.next;
  return decision;
}

/** Lock the current pick for the current match (idempotent). */
export function lockCurrentPick(): void {
  current = lockPick(current);
}

/** Test-only: forget the singleton so a fresh match starts unlocked. */
export function __resetLock(): void {
  current = LOCK_INITIAL;
}
