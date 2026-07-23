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
 * panel makes (`pickAllowed`, `pickToCommitOnLock`) is a pure function. The
 * module-level singleton at the bottom is the thin shell the React panel shares
 * across remounts so a lock is not lost on a brief disconnect — exactly the
 * shape briefingGate uses.
 */

/** HUD store `phase` value for champion select (same constant briefingGate keys on). */
export const CHAMP_SELECT_PHASE = "champSelect";

export interface LockState {
  /** which match this lock belongs to; a change rearms it (a new match = unlocked) */
  matchId: string | null;
  /** the local player has committed their pick — the roster can no longer switch */
  locked: boolean;
}

/** A freshly armed lock (a new match starts unlocked). */
export const LOCK_INITIAL: LockState = { matchId: null, locked: false };

export interface LockInput {
  /** HUD store `phase` */
  phase: string;
  /** HUD store `phaseSecondsLeft` (whole seconds) */
  secondsLeft: number;
  /** HUD store `matchId` — rearms the lock when it changes */
  matchId: string;
}

export interface LockDecision {
  /** true = the local pick is locked this sample (roster/random/re-pick disabled) */
  locked: boolean;
  /** state to carry into the next sample */
  next: LockState;
}

function rearmFor(matchId: string): LockState {
  return { matchId, locked: false };
}

/**
 * Advance the lock with one (phase, secondsLeft, matchId) sample. Monotonic:
 * once locked it stays locked for the match. AUTO-LOCK ON TIMEOUT — when the
 * champ-select clock reaches 0, the pick is final (the server hands a random to
 * any still-empty seat, #130), so we reflect that as locked and stop offering a
 * switch that can no longer land.
 *
 * No "did I see the clock run?" guard is needed: the panel is only mounted while
 * phase === champSelect (HudRoot), and that phase always ENTERS with the full
 * clock (~60 s) in the same snapshot — champ-select is never observed at 0 s
 * except at the genuine timeout, which is exactly when auto-lock is correct.
 * Idempotent for a steady clock; never throws on a bogus clock.
 */
export function stepLock(prev: LockState, input: LockInput): LockDecision {
  // a new match clears the lock; a reconnect into the SAME match keeps it.
  const base = input.matchId !== prev.matchId ? rearmFor(input.matchId) : prev;

  // outside champ select there is nothing to lock; hold the state so the
  // same-match field survives (defensive — this phase is only left for good).
  if (input.phase !== CHAMP_SELECT_PHASE) return { locked: base.locked, next: base };

  const sec = Number.isFinite(input.secondsLeft) ? Math.max(0, Math.floor(input.secondsLeft)) : 0;
  const locked = base.locked || sec <= 0; // explicit lock OR the clock ran out
  const next: LockState = { ...base, locked };
  return { locked, next };
}

/** Commit the current pick (the 鎖定 button / auto-lock). Idempotent. */
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

// ---------------------------------------------------------------------------
// module-level singleton — survives a panel remount within the same match so a
// lock is not forgotten on a brief disconnect. The React panel drives it.
// ---------------------------------------------------------------------------

let current: LockState = LOCK_INITIAL;

/** Feed one sample; returns whether the local pick is locked now. */
export function observeLock(input: LockInput): boolean {
  const { locked, next } = stepLock(current, input);
  current = next;
  return locked;
}

/** Lock the current pick for the current match (idempotent). */
export function lockCurrentPick(): void {
  current = lockPick(current);
}

/** Test-only: forget the singleton so a fresh match starts unlocked. */
export function __resetLock(): void {
  current = LOCK_INITIAL;
}
