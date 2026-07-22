/**
 * cursor/applyCursor — the ONLY DOM-touching part of the cursor feature.
 *
 * HOW A SIZE IS APPLIED (instantly, no reload, no stylesheet swap): the three
 * cursor images live in CSS custom properties on <html>, and cursor.css only
 * ever *consumes* them (`cursor: var(--ggd-cursor-default), default`). Picking a
 * size rewrites those three properties; the browser recomputes `cursor` on the
 * next style pass and the pointer changes under the player's hand mid-move.
 *
 * WHY CUSTOM PROPERTIES INSTEAD OF 12 STATIC CSS RULES (3 variants × 4 sizes,
 * each keyed off a root class): the hotspot has to be re-derived per size, and
 * hand-writing it in both cursorTheme.ts and cursor.css is exactly the kind of
 * duplicated magic number that silently drifts. Here cursorTheme is the only
 * place a pixel coordinate exists.
 *
 * Every entry point is DOM-safe: the client's vitest env is `node`, and
 * input/InputCapture (which drives the combat variant) is constructed there
 * against a fake element with no `document` in scope.
 */
import { cursorCssValue, cursorCssVar, CURSOR_VARIANTS, type CursorSize } from "./cursorTheme";
import { cursorSettings } from "./cursorSettings";

/** Attribute that ARMS cursor.css. Absent ⇒ the native cursor, untouched. */
export const CURSOR_ROOT_ATTR = "data-ggd-cursor";

/** Attribute carrying the active size step (a CSS/test hook; not read by CSS). */
export const CURSOR_SIZE_ATTR = "data-ggd-cursor-size";

/** Attribute carrying a transient in-combat variant ("attack"). */
export const CURSOR_VARIANT_ATTR = "data-ggd-cursor-variant";

/**
 * Minimal structural view of <html> — so the resolver can be exercised against
 * a recording fake in the node test env. A real HTMLElement satisfies it.
 */
export interface CursorRoot {
  style: { setProperty(name: string, value: string): void };
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/**
 * PURE: the custom-property block for one size — `{ "--ggd-cursor-default":
 * 'url("…") 1 1', … }`. This is the whole "resolved CSS" for a size; the test
 * gate compares two sizes' blocks to prove a size change actually reaches CSS.
 */
export function resolveCursorVars(size: CursorSize): Record<string, string> {
  const out: Record<string, string> = {};
  for (const variant of CURSOR_VARIANTS) out[cursorCssVar(variant)] = cursorCssValue(variant, size);
  return out;
}

/** Write one size's variables + size attribute onto a root element. */
export function applyCursorSize(size: CursorSize, root: CursorRoot): void {
  const vars = resolveCursorVars(size);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  root.setAttribute(CURSOR_SIZE_ATTR, size);
  // Armed LAST: cursor.css keys off this attribute, so the variables it reads
  // are guaranteed to exist by the time any rule can match. A `var()` with no
  // declaration makes `cursor` invalid-at-computed-value-time, which would drop
  // the player back to the inherited cursor for a frame.
  root.setAttribute(CURSOR_ROOT_ATTR, "on");
}

/** The live <html> element, or null outside a browser (node tests / SSR). */
function documentRoot(): CursorRoot | null {
  if (typeof document === "undefined") return null;
  return (document.documentElement as CursorRoot | null) ?? null;
}

let unsubscribe: (() => void) | null = null;

/**
 * Boot the cursor: apply the persisted size and keep <html> in sync with it.
 * Idempotent (safe under React StrictMode and Vite HMR re-execution) and a
 * no-op without a DOM. Returns a disposer that unsubscribes.
 *
 * NOTE there is no pointer-capability check here on purpose. cursor.css is
 * wrapped in `@media (hover: hover) and (pointer: fine)`, so on a touch device
 * none of the rules match, none of the PNGs are ever fetched, and a hybrid
 * device (iPad + trackpad, Surface) starts using the custom cursor the moment a
 * fine pointer appears — with no media-query listener to maintain.
 */
export function initCursor(): () => void {
  unsubscribe?.();
  unsubscribe = null;

  const root = documentRoot();
  if (!root) return () => {};

  applyCursorSize(cursorSettings.getSize(), root);
  const off = cursorSettings.subscribe((prefs) => applyCursorSize(prefs.size, root));
  unsubscribe = off;
  return () => {
    off();
    if (unsubscribe === off) unsubscribe = null;
  };
}

/**
 * Swap in a transient combat variant. `"attack"` turns the arena surface into
 * the reticle (the player has armed an attack-move); `null` restores the blade.
 * DOM-safe, so input/ can call it unconditionally.
 */
export function setCursorVariant(variant: "attack" | null): void {
  const root = documentRoot();
  if (!root) return;
  if (variant === null) root.removeAttribute(CURSOR_VARIANT_ATTR);
  else root.setAttribute(CURSOR_VARIANT_ATTR, variant);
}
