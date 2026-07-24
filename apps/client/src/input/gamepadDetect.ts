/**
 * gamepadDetect — the "why can't my handheld press anything?" layer (task #197).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THE TWO REAL BLOCKERS, AND WHY A DIAGNOSTIC IS THE FIX
 * ════════════════════════════════════════════════════════════════════════════
 * The combat pad system already polls `navigator.getGamepads()` every frame, so
 * the classic "we forgot to listen for `gamepadconnected`" is NOT the problem.
 * Two lower-level facts are:
 *
 *  1. WAKE. Chrome (and every Chromium-based browser) returns a NULL entry for a
 *     connected pad until that pad produces its first input — a privacy measure
 *     so a page cannot fingerprint idle hardware. On the owner's WIN11 handheld
 *     the built-in pad is therefore invisible to `getGamepads()` on a fresh
 *     login screen, and there is nothing on screen telling him the one thing
 *     that fixes it: press any button once. {@link gamepadWakeHintVisible} drives
 *     that hint; the poll below re-checks after the wake with no reload.
 *
 *  2. MAPPING. The combat button map is hard-coded to the W3C "standard" layout
 *     (A=0, B=1, … LB=4, RB=5, LT=6, RT=7). A pad whose `Gamepad.mapping` is not
 *     "standard" (an empty string, or "xr-standard") may report a DIFFERENT
 *     button order, so those indices land on the wrong faces and the pad "does
 *     random things". We cannot silently guess an unknown device's order, but we
 *     CAN say so out loud — {@link readPadDiagnostics} surfaces `id / mapping /
 *     buttons.length` so the state is visible instead of mysterious, and the
 *     menu focus-nav (input/padFocusNav) leans on the near-universal
 *     stick + buttons 0/1 rather than the fragile d-pad indices.
 *
 * PURE + node-testable: everything here takes an injected `pads` array (the same
 * `PadState` fakes the rest of the input layer uses), so no test needs real
 * hardware or a live `navigator`.
 */
import type { PadState } from "./GamepadInput";

/** The W3C canonical value of `Gamepad.mapping` for a known-good layout. */
export const STANDARD_MAPPING = "standard";

/** One connected pad, described for the on-screen diagnostic. */
export interface PadDiagnostic {
  /** index into `navigator.getGamepads()` */
  index: number;
  /** the device's self-reported id string (make/model, VID/PID) */
  id: string;
  /** `Gamepad.mapping`: "standard" is trusted; anything else may be mis-ordered */
  mapping: string;
  /** number of buttons the pad exposes (a standard pad has 17) */
  buttonCount: number;
  /** number of axes the pad exposes (a standard pad has 4) */
  axisCount: number;
  /** true when `mapping === "standard"` — the hard-coded BTN indices are safe */
  trusted: boolean;
}

/**
 * A richer pad view than `PadState`, matching the fields a real `Gamepad`
 * carries. The extra fields are optional so the existing `PadState` fakes (which
 * have only `connected/axes/buttons`) still satisfy it — an undetailed fake then
 * reports empty id / unknown mapping, which is exactly what an un-introspectable
 * pad should read as.
 */
export interface PadInfo extends PadState {
  index?: number;
  id?: string;
  mapping?: string;
}

/** Is `Gamepad.mapping` the trusted "standard" layout? */
export function padMappingTrusted(pad: Pick<PadInfo, "mapping">): boolean {
  return pad.mapping === STANDARD_MAPPING;
}

/**
 * Describe every CONNECTED pad. Nulls (unwoken/absent slots) and disconnected
 * pads are dropped — a diagnostic must only report hardware that actually
 * answered. `index` falls back to the array position when the fake pad carries
 * none, so the row is still identifiable.
 */
export function readPadDiagnostics(pads: readonly (PadInfo | null)[]): PadDiagnostic[] {
  const out: PadDiagnostic[] = [];
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    if (!pad?.connected) continue;
    const mapping = pad.mapping ?? "";
    out.push({
      index: pad.index ?? i,
      id: pad.id ?? "",
      mapping,
      buttonCount: pad.buttons.length,
      axisCount: pad.axes.length,
      trusted: mapping === STANDARD_MAPPING,
    });
  }
  return out;
}

/** Any connected pad at all? (a woken pad is a detected pad). */
export function hasConnectedPad(pads: readonly (PadInfo | null)[]): boolean {
  return pads.some((p) => p?.connected === true);
}

/** Any connected pad whose mapping we cannot trust (buttons may be mis-ordered)? */
export function hasUntrustedMapping(pads: readonly (PadInfo | null)[]): boolean {
  return readPadDiagnostics(pads).some((d) => !d.trusted);
}

/**
 * Should the "press any button to wake your pad" hint be shown?
 *
 * The hint exists for exactly one situation: a keyboard-less player is staring
 * at a screen that will not respond because their pad has not woken. So it shows
 * only when (a) NO pad has woken yet — the moment one does, the detail chip
 * replaces it — and (b) the player has not already proven they have a working
 * non-pad input by interacting. A keyboard/mouse user dismisses it with their
 * first keystroke or click; a pad-only user cannot, so it stays until they press
 * a button. `touch` suppresses it outright: a phone has no pad to wake.
 */
export function gamepadWakeHintVisible(opts: {
  pads: readonly (PadInfo | null)[];
  interacted: boolean;
  touch: boolean;
}): boolean {
  if (opts.touch || opts.interacted) return false;
  return !hasConnectedPad(opts.pads);
}

/** Truncate a long device id for a compact chip, keeping the informative head. */
export function shortPadId(id: string, max = 32): string {
  const trimmed = id.trim();
  if (trimmed.length === 0) return "unknown pad";
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}
