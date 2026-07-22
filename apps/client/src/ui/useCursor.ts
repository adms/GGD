/**
 * useCursor — React binding for the (framework-free) cursor module. Lives under
 * ui/ for the same reason ui/useAudio.ts does: the client architecture gate
 * keeps React imports out of every non-ui layer, so cursor/ stays plain DOM +
 * pure modules and the adapter sits here.
 *
 * Nothing here runs per frame — `useCursorSize` re-renders only when the player
 * actually picks a different size.
 */
import { useSyncExternalStore } from "react";
import {
  CURSOR_SIZE_OPTIONS,
  cursorSettings,
  setCursorSize,
  type CursorSize,
  type CursorSizeOption,
} from "../cursor";

export interface CursorSizeControl {
  /** the active step */
  size: CursorSize;
  /** select a step — persists and applies instantly */
  setSize: (size: CursorSize) => void;
  /** the four steps to render ({ value, label, px }) */
  options: readonly CursorSizeOption[];
}

/**
 * Everything a cursor-size picker needs, in one hook. Intended consumer: the
 * size control in the top audio cluster.
 *
 *   const { size, setSize, options } = useCursorSize();
 */
export function useCursorSize(): CursorSizeControl {
  const size = useSyncExternalStore(
    (cb) => cursorSettings.subscribe(cb),
    () => cursorSettings.getSize(),
    () => cursorSettings.getSize(),
  );
  return { size, setSize: setCursorSize, options: CURSOR_SIZE_OPTIONS };
}
