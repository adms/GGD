/**
 * padFocusNav — the PURE core of "a pad drives the menus too" (task #197).
 *
 * The combat pad map (input/GamepadInput) is about aiming a champion; NONE of it
 * helps on the login form, the lobby, champ-select, the shop or a modal. Those
 * are ordinary DOM: a grid of <button>s with no roving focus and, on many of
 * them, no focus ring at all. This module turns a pad into a focus driver:
 *
 *   • {@link PadMenuNav} reads the first connected pad each poll and emits
 *     discrete {@link NavAction}s — a D-pad/stick nudge is `up/down/left/right`,
 *     the A button is `activate`, the B button is `back`. It handles edge
 *     detection (a press is one event, not one per frame) and stick auto-repeat
 *     (an initial delay, then a steady rate — hold-to-scroll without a machine-gun
 *     first frame). Direction comes from the STICK (axes 0/1) as well as the
 *     D-pad, and activate/back from buttons 0/1, because those are the inputs a
 *     NON-standard-mapping pad is still most likely to report where expected —
 *     the fragile part of a weird mapping is the shoulder/menu block, not the
 *     left stick or the bottom-row face buttons.
 *
 *   • {@link pickSpatial} is the geometry: given the focused element's rect, the
 *     candidate rects and a direction, pick the best next element. A weighted
 *     Manhattan score (primary-axis travel + a heavy cross-axis penalty) gives
 *     the row/column behaviour a player expects on both a form and a grid.
 *
 * Everything here is node-testable off plain rects and injected pad snapshots —
 * the React controller (ui/PadFocusNav) owns the DOM (querying focusables,
 * moving focus, the ring) and calls into this.
 */
import type { PadInfo } from "./gamepadDetect";

export type NavDir = "up" | "down" | "left" | "right";
export type NavAction = NavDir | "activate" | "back";

/** A screen-space rectangle (getBoundingClientRect shape). */
export interface FocusRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Stick deflection past which a menu nudge registers (looser than combat). */
export const STICK_NAV_THRESHOLD = 0.5;
/** How long a held direction waits before it starts repeating. */
export const NAV_INITIAL_DELAY_MS = 420;
/** Steady repeat interval once a held direction has started repeating. */
export const NAV_REPEAT_MS = 140;

/** Face button A — "activate the focused control" (standard index 0). */
export const NAV_ACTIVATE_BTN = 0;
/** Face button B — "back / close the current scope" (standard index 1). */
export const NAV_BACK_BTN = 1;
/** D-pad indices in the standard mapping (up, down, left, right). */
export const NAV_DPAD = { up: 12, down: 13, left: 14, right: 15 } as const;

/**
 * Match phases in which the PAD IS DRIVING A CHAMPION, so the menu focus layer
 * must stay OUT of the way — a D-pad tap should aim the hero, not hunt a button,
 * and A should cast, not click. Every other phase (champ-select, intermission,
 * match-end) is menu-shaped and the focus layer owns the pad there. A modal or
 * overlay open ON TOP of live combat (pause, settings, a hash overlay) flips it
 * back to the menu layer regardless — see {@link focusNavActive}.
 */
export const COMBAT_LIVE_PHASES: ReadonlySet<string> = new Set([
  "combat",
  "resolution",
  "connecting",
]);

/**
 * Should the DOM focus-nav layer own the pad right now? PURE, so the one rule
 * that decides "menu vs champion" is testable without a browser.
 *
 *  • Off the match screen (auth / lobby / store) it is ALWAYS the menus.
 *  • A visible modal/overlay scope ALWAYS captures the pad, even mid-combat.
 *  • Otherwise it is the menus unless the champion is live (COMBAT_LIVE_PHASES).
 */
export function focusNavActive(opts: {
  screen: string;
  phase: string;
  hasScope: boolean;
}): boolean {
  if (opts.screen !== "match") return true;
  if (opts.hasScope) return true;
  return !COMBAT_LIVE_PHASES.has(opts.phase);
}

/**
 * Given the candidate modal/overlay scopes present in the DOM (each an explicit
 * `priority` and its `order` in document order), which one is on top? Highest
 * priority wins; document order breaks a tie, later element on top — the same
 * rule the browser paints them by. Returns -1 for an empty list (no modal → the
 * whole screen is the scope). PURE — the DOM controller supplies the descriptors.
 */
export function pickActiveScope(scopes: readonly { priority: number; order: number }[]): number {
  let best = -1;
  let bestP = -Infinity;
  let bestO = -Infinity;
  for (let i = 0; i < scopes.length; i++) {
    const s = scopes[i]!;
    if (s.priority > bestP || (s.priority === bestP && s.order >= bestO)) {
      bestP = s.priority;
      bestO = s.order;
      best = i;
    }
  }
  return best;
}

// ------------------------------------------------- B = back, but never OUT --

/**
 * Labels B is allowed to press when a scope declares no explicit
 * `data-pad-back`. DISMISSAL WORDS ONLY. The original list also carried
 * `離開|leave`, which is how task #271 happened: with no modal open the pad's
 * scope is `document.body`, and the top-right Leave chip (`title="leave the
 * match"`, text `Leave`) was the first match in the whole document. One tap of
 * B — no focus, no A, no prompt — ended the match. In champSelect and in every
 * intermission the focus layer is live, so this fired constantly; with the shop
 * open the first B closed the shop and the second one hit Leave, which is the
 * "B backs out one level" reflex every pad player has.
 */
export const BACK_ALLOW_RE = /取消|關閉|收起|返回|back|close|cancel|dismiss|✕|×|╳/i;

/**
 * …and the VETO, which beats the allow-list. A back button is a courtesy; it
 * must never be able to do something the player cannot undo. `返回大廳`
 * contains `返回`, so without this the settlement card's and MatchEndPanel's
 * "return to lobby" would still be one blind press of B.
 *
 * Anything genuinely destructive should ALSO be reachable only by focusing it
 * and pressing A — that is the deliberate-movement half of #271 — so this list
 * is the safety net, not the design.
 */
export const BACK_VETO_RE = /離開|退出|返回大廳|投降|放棄|解散|刪除|leave|exit|quit|abandon|surrender|delete/i;

/**
 * Index of the control B should press, given each candidate's accessible text
 * (aria-label + title + textContent, concatenated by the caller), or -1 when
 * nothing here is a safe back control.
 *
 * PURE so it can be tested at all: the DOM half lives in ui/PadFocusNav, which
 * the client's `node` vitest env cannot render, and this heuristic — not any
 * key binding — was the actual one-press exit. See ui/PadFocusNav.findBackControl.
 */
export function backControlIndex(labels: readonly string[]): number {
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i] ?? "";
    if (BACK_VETO_RE.test(label)) continue;
    if (BACK_ALLOW_RE.test(label)) return i;
  }
  return -1;
}

function center(r: FocusRect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * Index of the natural STARTING focus among candidates: the top-most, then
 * left-most element. Used when a nav nudge arrives and nothing in the scope is
 * focused yet (the first press just lands focus somewhere sensible).
 */
export function initialFocusIndex(candidates: readonly FocusRect[]): number {
  let best = -1;
  let bestY = Infinity;
  let bestX = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    if (c.y < bestY - 4 || (Math.abs(c.y - bestY) <= 4 && c.x < bestX)) {
      bestY = c.y;
      bestX = c.x;
      best = i;
    }
  }
  return best;
}

/**
 * Best candidate to move to from `from` in direction `dir`, or -1 when nothing
 * lies that way. A candidate qualifies only if its centre is genuinely on the
 * requested side (past a 1px epsilon, so an exactly-aligned neighbour on the
 * perpendicular axis is never mistaken for "right"). Among the qualifiers the
 * lowest weighted-Manhattan score wins: distance along the travel axis plus the
 * cross-axis offset weighted ×3, which keeps focus in the same row/column unless
 * nothing there qualifies.
 */
export function pickSpatial(from: FocusRect, candidates: readonly FocusRect[], dir: NavDir): number {
  const f = center(from);
  const horizontal = dir === "left" || dir === "right";
  const sign = dir === "right" || dir === "down" ? 1 : -1;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = center(candidates[i]!);
    const primary = horizontal ? (c.x - f.x) * sign : (c.y - f.y) * sign;
    if (primary <= 1) continue; // not on the requested side
    const cross = horizontal ? Math.abs(c.y - f.y) : Math.abs(c.x - f.x);
    const score = primary + cross * 3;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** First connected pad in a getGamepads-style list (menu nav is single-user). */
export function firstConnectedPad(pads: readonly (PadInfo | null)[]): PadInfo | null {
  for (const p of pads) if (p?.connected) return p;
  return null;
}

function buttonDown(pad: PadInfo, index: number): boolean {
  return pad.buttons[index]?.pressed === true;
}

/**
 * The dominant menu direction this frame, from the LEFT STICK (axes 0/1) OR the
 * D-pad, or null inside the deadzone. The stick and D-pad are summed so either
 * works; the larger absolute axis wins so a diagonal resolves to one move.
 */
export function readNavDirection(pad: PadInfo, threshold = STICK_NAV_THRESHOLD): NavDir | null {
  let x = pad.axes[0] ?? 0;
  let y = pad.axes[1] ?? 0;
  if (buttonDown(pad, NAV_DPAD.left)) x -= 1;
  if (buttonDown(pad, NAV_DPAD.right)) x += 1;
  if (buttonDown(pad, NAV_DPAD.up)) y -= 1;
  if (buttonDown(pad, NAV_DPAD.down)) y += 1;
  if (Math.abs(x) >= Math.abs(y)) {
    if (Math.abs(x) < threshold) return null;
    return x > 0 ? "right" : "left";
  }
  if (Math.abs(y) < threshold) return null;
  return y > 0 ? "down" : "up";
}

/**
 * Stateful reader: one poll → the discrete nav actions that happened since the
 * last poll. Owns edge detection for A/B and auto-repeat for the held direction,
 * so the DOM controller only has to react to clean events.
 */
export class PadMenuNav {
  private prevActivate = false;
  private prevBack = false;
  private heldDir: NavDir | null = null;
  private nextRepeatMs = 0;

  /** Forget all held state (e.g. when the focus scope changes under us). */
  reset(): void {
    this.prevActivate = false;
    this.prevBack = false;
    this.heldDir = null;
    this.nextRepeatMs = 0;
  }

  read(pads: readonly (PadInfo | null)[], nowMs: number): NavAction[] {
    const pad = firstConnectedPad(pads);
    if (!pad) {
      this.reset();
      return [];
    }
    const events: NavAction[] = [];

    const activate = buttonDown(pad, NAV_ACTIVATE_BTN);
    if (activate && !this.prevActivate) events.push("activate");
    this.prevActivate = activate;

    const back = buttonDown(pad, NAV_BACK_BTN);
    if (back && !this.prevBack) events.push("back");
    this.prevBack = back;

    const dir = readNavDirection(pad);
    if (dir === null) {
      this.heldDir = null;
      this.nextRepeatMs = 0;
    } else if (dir !== this.heldDir) {
      // fresh direction: fire once now, then wait the initial delay
      this.heldDir = dir;
      this.nextRepeatMs = nowMs + NAV_INITIAL_DELAY_MS;
      events.push(dir);
    } else if (nowMs >= this.nextRepeatMs) {
      this.nextRepeatMs = nowMs + NAV_REPEAT_MS;
      events.push(dir);
    }
    return events;
  }
}
