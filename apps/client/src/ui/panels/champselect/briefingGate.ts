/**
 * briefingGate — decides whether the 10-second RULES BRIEFING overlay is showing
 * during champion select, and for how long (task #76).
 *
 * WHY IT IS SELF-CALIBRATING. The client is only ever told `phaseSecondsLeft`
 * (RoomStore derives it from `phaseTicksLeft`); the phase LENGTH is never sent
 * over the wire. So the gate cannot key on a config value — it infers "did I
 * join at the top of champ select?" from the highest clock it has seen:
 *
 *   firstObserved   = the max phaseSecondsLeft seen since entering champ select
 *   enteredNearStart = firstObserved >= NEAR_START_SEC  ("I was here at the top")
 *   elapsed          = firstObserved - secondsLeft
 *   active           = enteredNearStart && elapsed < WINDOW_SEC && !dismissed
 *
 * Consequences, all intended:
 *   • fresh player (≈60 s left) → briefing for the first 10 s.
 *   • reconnect still near the top (≈55 s) → briefing resumes for its remainder.
 *   • LATE join / reconnect at 20 s left → firstObserved < NEAR_START_SEC → NO
 *     briefing at all: it would otherwise eat half the pick time.
 *   • the phase length is irrelevant — a 45 s or 90 s champ select still shows
 *     the same first-10-s briefing, degrading gracefully around the one tunable
 *     (NEAR_START_SEC). Publishing the phase length in the snapshot would make
 *     this config-exact; that is a server change outside this task's ownership.
 *
 * `dismissed` sticks for the rest of the match (keyed on matchId) so pressing
 * 跳過 — or just starting to browse the roster — makes the skip survive a
 * reconnect. A NEW match (matchId change) rearms everything.
 *
 * Pure + node-testable: `stepBriefing` is a plain reducer; the module-level
 * singleton below is the thin shell the React panel shares across remounts so a
 * dismiss is not lost when the panel unmounts on a brief disconnect.
 */

/**
 * "I joined at the top of champ select" threshold, in seconds remaining.
 *
 * MUST stay below `champSelectSec` (content/config/config.match.json) or this
 * gate is dead code. It was 55 while champ select was 60 s; #167 shortened the
 * phase to **40 s** and this constant was not moved, so `firstObserved >= 55`
 * became unsatisfiable and THE BRIEFING NEVER SHOWED AGAIN — silently, for every
 * player, since #167. A playtest caught it: champ select rendered the bare
 * 「點選英雄查看詳情與 3D 模型」 prompt with no rules briefing at all.
 *
 * 30 = "joined within the first 10 s of a 40 s select", which pairs with
 * BRIEFING_WINDOW_SEC below.
 *
 * This coupling is fragile by construction: the phase length is never put on the
 * wire, so this file cannot verify itself against the real config. Publishing
 * `phaseTotalTicks` in the snapshot would make this gate config-exact and retire
 * the hazard — worth doing before a third phase-length change.
 */
export const BRIEFING_NEAR_START_SEC = 30;

/** How long the briefing stays up once champ select begins, in seconds. */
export const BRIEFING_WINDOW_SEC = 10;

/** HUD store `phase` value for champion select. */
export const CHAMP_SELECT_PHASE = "champSelect";

export interface BriefingState {
  /** which match this state belongs to; a change rearms the whole gate */
  matchId: string | null;
  /** highest phaseSecondsLeft seen this champ select (0 = nothing seen yet) */
  firstObserved: number;
  /** the player skipped the briefing (跳過 or first roster interaction) */
  dismissed: boolean;
}

/** A freshly armed gate (nothing observed, nothing dismissed). */
export const BRIEFING_INITIAL: BriefingState = { matchId: null, firstObserved: 0, dismissed: false };

export interface BriefingInput {
  /** HUD store `phase` */
  phase: string;
  /** HUD store `phaseSecondsLeft` (whole seconds) */
  secondsLeft: number;
  /** HUD store `matchId` — rearms the gate when it changes */
  matchId: string;
}

export interface BriefingDecision {
  /** true = show the briefing overlay this sample */
  active: boolean;
  /** state to carry into the next sample */
  next: BriefingState;
}

function rearmFor(matchId: string): BriefingState {
  return { matchId, firstObserved: 0, dismissed: false };
}

/**
 * Advance the gate with one (phase, secondsLeft, matchId) sample. Idempotent for
 * a steady clock; monotonic `firstObserved`. Never throws on a bogus clock.
 */
export function stepBriefing(prev: BriefingState, input: BriefingInput): BriefingDecision {
  // a new match wipes the dismiss + the observed clock; a reconnect into the
  // SAME match keeps them (so a skip stays skipped).
  const base = input.matchId !== prev.matchId ? rearmFor(input.matchId) : prev;

  // outside champ select there is no briefing; hold the state so the same-match
  // fields survive (this phase is only ever left for good, but be defensive).
  if (input.phase !== CHAMP_SELECT_PHASE) return { active: false, next: base };

  const sec = Number.isFinite(input.secondsLeft) ? Math.max(0, Math.floor(input.secondsLeft)) : 0;
  const firstObserved = Math.max(base.firstObserved, sec);
  const next: BriefingState = { ...base, firstObserved };

  const enteredNearStart = firstObserved >= BRIEFING_NEAR_START_SEC;
  const elapsed = firstObserved - sec;
  // sec > 0 keeps the overlay off at expiry (the clock parked at 0 is the
  // hand-off to the server auto-pick, not a moment to read rules).
  const active = enteredNearStart && !next.dismissed && sec > 0 && elapsed < BRIEFING_WINDOW_SEC;

  return { active, next };
}

/** Mark the briefing dismissed for the rest of this match (跳過 / first browse). */
export function dismissBriefing(state: BriefingState): BriefingState {
  return { ...state, dismissed: true };
}

// ---------------------------------------------------------------------------
// module-level singleton — survives a panel remount within the same match so a
// dismiss is not forgotten on a brief disconnect. The React panel drives it.
// ---------------------------------------------------------------------------

let current: BriefingState = BRIEFING_INITIAL;

/** Feed one sample; returns whether the briefing is active now. */
export function observeBriefing(input: BriefingInput): boolean {
  const { active, next } = stepBriefing(current, input);
  current = next;
  return active;
}

/** Dismiss the briefing for the current match (idempotent). */
export function dismissCurrentBriefing(): void {
  current = dismissBriefing(current);
}

/** Test-only: forget the singleton so a fresh match starts armed. */
export function __resetBriefing(): void {
  current = BRIEFING_INITIAL;
}
