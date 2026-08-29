/**
 * cooldownView — the ONE cooldown read the three HUD variants share (task #219,
 * playtest 「技能冷卻進度不容易從圖示上看到」).
 *
 * ---------------------------------------------------------------------------
 * THE ROOT CAUSE THIS MODULE EXISTS TO KILL
 * ---------------------------------------------------------------------------
 * The sim scales cooldown SECONDS by the live combat-env factor:
 *
 *     abilitySystem.ts  cdSecs = def.cooldown[rank-1] * (1 - cdr) * env.cooldown
 *
 * and `content/config/combat-env.json` currently ships `cooldown: 0.2`. Every
 * HUD surface, meanwhile, divided the REMAINING seconds by the RAW AUTHORED
 * cooldown — five independent inline copies of the same three lines. So the
 * progress fraction could never exceed 0.20: on a 52px tile that is a ~10px
 * band at the very bottom, which is exactly where the tile's name scrim already
 * sits. The indicator was not "hard to see", it was geometrically hidden inside
 * another overlay for its entire life.
 *
 * This is the same class of defect `ui/displayFinal` was built for (#125,
 * 數字可信): the tooltip beside the tile already routes 冷卻 through
 * `factor: "cooldown"` while the sweep did not. The fix is to pass the
 * ENV-SCALED max in — `displayFinal(base, "cooldown", env)` at the React call
 * site — and to have exactly one place that turns (ticks, max) into chrome.
 *
 * PURITY. Nothing here imports React, the RoomStore, or displayFinal
 * (displayFinal pulls React + zustand at module scope and would drag them into
 * the node-env unit tests). It takes numbers and returns numbers + plain style
 * objects, so the whole cooldown read is testable without a DOM.
 *
 * KNOWN RESIDUAL (documented, not hidden): `Stat.CooldownReduction` shrinks the
 * real cooldown further, and the client is not told a seat's CDR. A player with
 * 20% CDR therefore sees the wipe begin at 80% rather than 100%. That is honest
 * and self-correcting (the fraction is clamped and still reaches 0 exactly when
 * the ability is ready); the exact fix is a `cooldownMax` field beside
 * `cooldowns` on the seat wire projection, logged as a follow-up.
 */
import { TICK_HZ } from "@ggd/shared/constants";
import type { CSSProperties } from "react";
import { predictedCooldownTicks, type CooldownPredictKey } from "./cooldownPredict";

/** Below this many seconds the number shows one decimal (see `cooldownLabel`). */
export const SUBSEC_AT = 3;

/** How long the "it just came off cooldown" bloom lasts (ms). */
export const READY_FLASH_MS = 340;

export interface CooldownView {
  /** remaining cooldown, seconds */
  cdSecs: number;
  /** progress 0..1 — 1 = just cast, 0 = ready. Clamped. */
  frac: number;
  /** the number painted on the tile ("13" / "2.9"); "" when ready */
  label: string;
  /** true while the ability is still cooling down */
  onCd: boolean;
}

/** Wire ticks → seconds. The one place `/ TICK_HZ` is written for cooldowns. */
export function cooldownSeconds(cdTicks: number): number {
  if (!Number.isFinite(cdTicks) || cdTicks <= 0) return 0;
  return cdTicks / TICK_HZ;
}

/**
 * Progress fraction. `maxSecs` MUST be the env-scaled final (the seconds the
 * sim actually charged), not the authored base — see the header. A missing /
 * non-positive max degrades to "full while it is running" rather than to a
 * silent 0, because an invisible indicator is the bug being fixed here.
 */
export function cooldownFrac(cdSecs: number, maxSecs: number): number {
  if (!(cdSecs > 0)) return 0;
  if (!Number.isFinite(maxSecs) || maxSecs <= 0) return 1;
  return Math.max(0, Math.min(1, cdSecs / maxSecs));
}

/**
 * The number on the tile. Whole seconds while there is time to read them, ONE
 * DECIMAL under `SUBSEC_AT` — the pre-fix `Math.ceil` alone froze a "1" on the
 * tile for a whole second and hid all sub-second progress, which is half of why
 * the last moments of a cooldown read as "stuck".
 */
export function cooldownLabel(cdSecs: number): string {
  if (!(cdSecs > 0)) return "";
  if (cdSecs > SUBSEC_AT) return String(Math.ceil(cdSecs));
  return cdSecs.toFixed(1);
}

/** The whole cooldown read for one tile. */
export function cooldownView(cdTicks: number, maxSecs: number): CooldownView {
  const cdSecs = cooldownSeconds(cdTicks);
  return {
    cdSecs,
    frac: cooldownFrac(cdSecs, maxSecs),
    label: cooldownLabel(cdSecs),
    onCd: cdSecs > 0,
  };
}

/** True exactly on the frame a cooldown finishes (…>0 → 0), never on 0 → 0. */
export function isReadyEdge(prev: number, next: number): boolean {
  return prev > 0 && !(next > 0);
}

// ---------------------------------------------------------------- chrome ----
// Every `position: "absolute"` the #219 change introduces lives HERE, not in
// the HUD surfaces: `ui/hud/hudLayout.test.ts`'s corner guard scans
// AbilityBar/TouchControls for a positioned style that pins BOTH axes, and a
// helper module keeps those files free of new positioned literals entirely.

/** Dark wedge colour — at least as opaque as the rect it replaces (0.78). */
const WIPE = "rgba(6, 8, 14, 0.86)";
/** Flat dim over the WHOLE tile, so "not ready" reads even at 5% remaining. */
const DIM = "rgba(6, 8, 14, 0.34)";

/**
 * THE PROGRESS GEOMETRY — a radial wipe, deliberately NOT a bar.
 *
 * A wedge that rotates clockwise from 12 o'clock and shrinks to nothing is the
 * WC3/LoL/Dota convention every player already reads. It is also ORTHOGONAL to
 * the cast fill, which is a bottom-anchored linear RISE in blue/amber: the old
 * cooldown rect used that identical geometry, so a cooling tile and a
 * channelling tile said the same thing. Rotation vs rise, shrinking vs growing
 * — they can no longer be confused side by side.
 *
 * The flat dim is baked into the SAME background stack (still one element, one
 * paint) so a nearly-ready tile is still visibly not-ready.
 *
 * Needs a clipping parent (`overflow: "hidden"`), which every ability tile has.
 */
export function cooldownWipeStyle(frac: number): CSSProperties {
  const t = Math.max(0, Math.min(1, frac));
  return {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    background:
      `linear-gradient(${DIM}, ${DIM}), ` +
      `conic-gradient(from 0deg, ${WIPE} 0turn, ${WIPE} ${t.toFixed(4)}turn, rgba(0,0,0,0) ${t.toFixed(4)}turn)`,
    pointerEvents: "none",
  };
}

/**
 * THE NUMBER. The pre-fix number was `color:"#fff"` with no shadow and no
 * stroke, so once the sweep had fallen below the middle of the tile it sat
 * directly on a bright w3x icon and vanished — while `TileName` right beside it
 * carried a shadow. Same discipline here, plus `tabular-nums` so the extra
 * decimal under 3s cannot make the glyphs jitter.
 */
export function cooldownNumberStyle(fontSize: number): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize,
    lineHeight: 1,
    fontWeight: "bold",
    fontVariantNumeric: "tabular-nums",
    color: "#fff",
    textShadow: "0 0 3px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.95)",
    WebkitTextStroke: "0.6px rgba(0,0,0,0.7)",
    pointerEvents: "none",
  };
}

/**
 * THE READY MOMENT — a one-shot bloom on the frame the cooldown reaches 0, so
 * "it is back" is an event and not merely the absence of a number. The scale
 * animation is on this CHILD element; the tile's own `transform`/`filter` are
 * the press + deny-shake channel and are never touched.
 * Keyframes: `ui/cooldown.css` (`ggd-cd-ready`).
 */
export function cooldownReadyStyle(): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    background:
      "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.55), rgba(120,220,255,0.28) 45%, rgba(0,0,0,0) 70%)",
    animation: `ggd-cd-ready ${READY_FLASH_MS}ms ease-out forwards`,
    pointerEvents: "none",
  };
}
