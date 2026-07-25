/**
 * focusGlow — the APPLICATION half of the one shared focus treatment (#222).
 * The DECLARATION half is ./focusGlow.css (imported once, from main.tsx).
 *
 * WHY A MODULE AND NOT A `<FocusRing>` COMPONENT. Surfaces must not be able to
 * opt out by forgetting something. There is no component to forget to render
 * and no class to forget to add: a control glows because a DRIVER set this
 * attribute, or because the browser matched `:focus-visible`, and one global
 * stylesheet does the rest. A brand-new screen is covered the moment it renders
 * a `<button>`. What CAN drift is the set of drivers (today: ui/PadFocusNav and
 * the legacy ui/platform/DeviceLoginPanel path), and that is exactly what
 * ./focusGlow.test.ts pins.
 *
 * BUILT ON REAL DOM FOCUS. The attribute is a decoration ON TOP of a real
 * `el.focus()`, never a parallel visual-only state — so the pad drags the
 * accessibility cursor and the screen reader with it, and keyboard users get
 * the identical glow through `:focus-visible`.
 *
 * `doc` is injectable so this is testable under the client's `node` vitest env
 * (no DOM), the same idiom ui/buttonSfx.ts uses.
 */

/** The attribute the CSS keys on. Never write the literal string elsewhere. */
export const PAD_FOCUS_ATTR = "data-pad-focused";

type MinimalDoc = Pick<Document, "querySelectorAll">;

function resolveDoc(doc?: MinimalDoc): MinimalDoc | null {
  if (doc) return doc;
  return typeof document === "undefined" ? null : document;
}

/**
 * Drop the pad-focus glow from wherever it currently is. Safe to call with no
 * DOM (SSR / node tests) and safe to call repeatedly.
 */
export function clearPadFocus(doc?: MinimalDoc): void {
  const d = resolveDoc(doc);
  if (!d) return;
  d.querySelectorAll(`[${PAD_FOCUS_ATTR}]`).forEach((el) => el.removeAttribute(PAD_FOCUS_ATTR));
}

/**
 * Move the pad-focus glow onto `el` (exclusively — the previous holder is
 * cleared first, so the "THIS is what A will press" cue is never ambiguous).
 * Passing null/undefined just clears, which is what a driver wants when its
 * focusable set shrinks out from under it.
 */
export function applyPadFocus(el: Element | null | undefined, doc?: MinimalDoc): void {
  clearPadFocus(doc);
  el?.setAttribute(PAD_FOCUS_ATTR, "");
}
