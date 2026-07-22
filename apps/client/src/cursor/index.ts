/**
 * cursor — the JRPG mouse cursor and its size setting (task #54a). Framework-
 * free by design, the same call as audio/: plain DOM + pure modules, so it is
 * unit-testable without a browser and importable from any layer (the React
 * adapter lives in ui/useCursor.ts, per the client architecture gate).
 *
 *   cursorTheme    pure: the variants, the PNG size ladder, asset paths and
 *                  hotspots — the ONE place a filename or pixel coordinate lives
 *   cursorSettings persisted S/M/L/XL preference (localStorage `ggd.cursor`)
 *   applyCursor    the only DOM-touching part: writes the size onto <html> as
 *                  CSS custom properties that cursor.css consumes
 *
 * THIS BARREL IS THE AGREED SEAM for the size picker, which is rendered by the
 * top audio cluster (ui/AudioToggle.tsx) rather than by this module. Everything
 * a picker needs is right here — no cursor state belongs in the component:
 *
 *   CURSOR_SIZE_OPTIONS   the option list to render ({ value, label, px })
 *   getCursorSize()       the current step
 *   setCursorSize(size)   select a step — persists + applies instantly
 *   cursorSettings        the store, for subscribe() / reset()
 *
 * React callers should prefer `ui/useCursor` → `useCursorSize()`, which returns
 * `{ size, setSize, options }` already wired to the store.
 */
export * from "./cursorTheme";
export * from "./cursorSettings";
export * from "./applyCursor";

import { cursorSettings } from "./cursorSettings";
import type { CursorSize } from "./cursorTheme";

/** The player's current cursor size step. */
export function getCursorSize(): CursorSize {
  return cursorSettings.getSize();
}

/**
 * Select a cursor size. Persists to localStorage and applies to the live page
 * on the next style pass — no reload, no remount.
 */
export function setCursorSize(size: CursorSize): void {
  cursorSettings.setSize(size);
}
