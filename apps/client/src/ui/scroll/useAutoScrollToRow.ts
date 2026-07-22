/**
 * useAutoScrollToRow — the React/DOM shell over ./autoScroll (task #36).
 *
 * Attach `listRef` to a scrollable list and `rowRef` to ONE row inside it, hand
 * the hook a `runKey` that identifies the run (the match id), and the list will
 * — exactly once per key — hold at the top, ease down until that row is
 * centered, and pulse it on arrival. The player stays in charge: the first
 * wheel / touch / drag / scroll-key input cancels the animation instantly and it
 * never re-triggers for that key. prefers-reduced-motion skips the animation
 * entirely and renders already-scrolled with a static highlight.
 *
 * All of the decision-making (geometry → plan, easing, cancel rules, the
 * once-per-match guard) lives in ./autoScroll and is unit-tested in the node
 * env; this file only measures the DOM, wires rAF/matchMedia, and exposes the
 * highlight state for the caller's JSX.
 */
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_HOLD_MS,
  OnceGuard,
  planRowAutoScroll,
  runAutoScroll,
  type AutoScrollDeps,
  type RowScrollGeometry,
} from "./autoScroll";

/** How long the arrival pulse runs (matches the keyframes below: 2 × 1.1 s). */
export const DEFAULT_PULSE_MS = 2200;

export type RowHighlight = "none" | "pulse" | "static";

export interface AutoScrollToRowOptions {
  /**
   * Identity of this run — the match id. Non-null arms exactly one auto-scroll;
   * null disarms (and re-arms the guard so the NEXT match gets its own shot).
   * Keep it null until both the list and the target row are actually rendered.
   */
  runKey: string | null;
  holdMs?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  pulseMs?: number;
}

export interface AutoScrollToRowHandle<L extends HTMLElement, R extends HTMLElement> {
  /** Scroll container (overflow-y: auto). */
  listRef: React.RefObject<L>;
  /** The row to reveal — the local player's row. */
  rowRef: React.RefObject<R>;
  /** "pulse" after arrival, "static" under reduced motion, else "none". */
  highlight: RowHighlight;
}

/** Row offset inside the scrollable CONTENT (independent of offsetParent). */
export function measureRowGeometry(list: HTMLElement, row: HTMLElement): RowScrollGeometry {
  const listRect = list.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  return {
    rowTop: rowRect.top - listRect.top + list.scrollTop,
    rowHeight: rowRect.height,
    viewportHeight: list.clientHeight,
    contentHeight: list.scrollHeight,
  };
}

/** OS "reduce motion" preference (false when matchMedia is unavailable). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * The pulse/static highlight keyframes. Render once inside the panel that uses
 * the hook (`<style>{AUTO_SCROLL_HIGHLIGHT_CSS}</style>`) — the rows carry the
 * class from `highlightClass()`.
 */
export const AUTO_SCROLL_HIGHLIGHT_CSS = `
@keyframes ggdRowPulse {
  0%   { box-shadow: 0 0 0 0 rgba(242,198,55,0.85); }
  60%  { box-shadow: 0 0 0 7px rgba(242,198,55,0); }
  100% { box-shadow: 0 0 0 0 rgba(242,198,55,0); }
}
.ggd-row-pulse { animation: ggdRowPulse 1.1s ease-out 2; }
.ggd-row-static { box-shadow: 0 0 0 2px rgba(242,198,55,0.8); }
@media (prefers-reduced-motion: reduce) {
  .ggd-row-pulse { animation: none; box-shadow: 0 0 0 2px rgba(242,198,55,0.8); }
}
`;

/** CSS class for a highlight state (empty string when there is none). */
export function highlightClass(h: RowHighlight): string {
  return h === "pulse" ? "ggd-row-pulse" : h === "static" ? "ggd-row-static" : "";
}

export function useAutoScrollToRow<
  L extends HTMLElement = HTMLDivElement,
  R extends HTMLElement = HTMLDivElement,
>(opts: AutoScrollToRowOptions): AutoScrollToRowHandle<L, R> {
  const listRef = useRef<L>(null);
  const rowRef = useRef<R>(null);
  const guard = useRef<OnceGuard>(new OnceGuard());
  const [highlight, setHighlight] = useState<RowHighlight>("none");

  const { runKey, holdMs = DEFAULT_HOLD_MS, minDurationMs, maxDurationMs, pulseMs = DEFAULT_PULSE_MS } = opts;

  useEffect(() => {
    // disarmed (no payload / row not rendered yet) → reset so the next match
    // gets its own single run.
    if (runKey === null) {
      guard.current.claim(null);
      return;
    }
    const list = listRef.current;
    const row = rowRef.current;
    if (!list || !row) return;
    // exactly once per match — a cancelled run never comes back either.
    if (!guard.current.claim(runKey)) return;

    const reduced = prefersReducedMotion();
    const plan = planRowAutoScroll(measureRowGeometry(list, row), {
      startScrollTop: 0,
      holdMs,
      reducedMotion: reduced,
      ...(minDurationMs !== undefined ? { minDurationMs } : {}),
      ...(maxDurationMs !== undefined ? { maxDurationMs } : {}),
    });

    if (plan.kind === "jump") {
      // reduced motion: already scrolled, static highlight, no listeners.
      list.scrollTop = plan.scrollTop;
      setHighlight("static");
      return;
    }

    let pulseTimer: ReturnType<typeof setTimeout> | null = null;
    const pulse = (): void => {
      setHighlight("pulse");
      pulseTimer = setTimeout(() => setHighlight("none"), pulseMs);
    };

    if (plan.kind === "skip") {
      // the row is readable where the list already sits — highlight only.
      pulse();
      return () => {
        if (pulseTimer !== null) clearTimeout(pulseTimer);
      };
    }

    let settled = false; // arrived, or the player took over — either way, done
    const deps: AutoScrollDeps = {
      now: () => performance.now(),
      requestFrame: (cb) => requestAnimationFrame(cb),
      cancelFrame: (h) => cancelAnimationFrame(h),
      keyTarget: typeof window === "undefined" ? null : window,
      onArrive: () => {
        settled = true;
        pulse();
      },
      onCancel: () => {
        settled = true;
      },
    };
    const stop = runAutoScroll(list, plan, deps);

    return () => {
      stop();
      if (pulseTimer !== null) clearTimeout(pulseTimer);
      // Torn down mid-flight by React (StrictMode double-effect / HMR) rather
      // than by the player or by arriving → hand the key back so the remount
      // still gets its one run. A cancelled or completed run stays claimed.
      if (!settled) guard.current.claim(null);
    };
  }, [runKey, holdMs, minDurationMs, maxDurationMs, pulseMs]);

  return { listRef, rowRef, highlight };
}
