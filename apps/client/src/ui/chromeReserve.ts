/**
 * chromeReserve — task #107's safe-area contract, extended OFF the match screen.
 *
 * WHY THIS EXISTS
 * ---------------
 * `hud/hudLayout` already solves this inside a match: chrome declares a corner
 * slot (#42) and panels declare an edge (#107), so nothing lands on anything
 * else. But that registry only governs the in-match HUD. The persistent audio
 * cluster (ui/AudioToggle) is `position: fixed`, PORTALED to <body> at Z_TOP,
 * and rides above EVERY screen — auth, lobby, codex, asset console, champ
 * select, settlement. On the platform screens there is no HUD stack at all, so
 * nothing reserved the pixels it occupies and the lobby header's rightmost
 * controls (⚙ Settings / Logout) rendered UNDERNEATH it: unreadable and partly
 * unclickable at 1546px wide.
 *
 * WHY A CSS CUSTOM PROPERTY, NOT A CONSTANT AND NOT REACT CONTEXT
 * --------------------------------------------------------------
 * The cluster's width is NOT a constant. It is a measured row of conditional
 * controls, and the moment it gains or loses one, any hard-coded
 * `padding-right: 220px` (which ui/codex/CodexPage.tsx really did carry) is
 * silently wrong — the exact regression this module exists to make impossible.
 *
 * So the cluster PUBLISHES the box it occupies and consumers READ it:
 *
 *   AudioToggle ──ResizeObserver──▶ documentElement.style
 *                                     --ggd-chrome-top-right-w
 *                                     --ggd-chrome-top-right-h
 *                                          │
 *          every screen with top-right chrome ──▶ padding-right: max(…, var(…))
 *
 * A CSS variable on `:root` is the cheapest mechanism that actually spans the
 * gap here, because the publisher and the consumers do not share a React tree:
 *   • the publisher is portaled OUT of the screen switch (deliberately — it
 *     must survive auth → lobby → match without remounting), so props cannot
 *     reach a consumer and context would have to be hoisted above the portal
 *     AND re-read by every screen;
 *   • consumers include plain CSS files (ui/mobile.css) and inline styles in
 *     unrelated subtrees, several of which are themselves portals/overlays;
 *   • the style engine applies the value with ZERO React re-renders — a resize
 *     does not re-render the lobby, it just re-lays-out the header;
 *   • it degrades safely: `var(--x, <fallback>px)` reserves a derived default
 *     during SSR / first paint / a browser with no ResizeObserver.
 *
 * The number published is a GUTTER measured from the viewport's right edge
 * (`viewportWidth − clusterLeft`), not the cluster's bare width, so it already
 * folds in `env(safe-area-inset-right)` and the corner gap. A consumer never
 * has to re-derive the inset — which is the same "own the inset in exactly one
 * place" rule hudLayout states for `#hud-root`.
 *
 * WHAT IS MEASURED: the PERSISTENT button group only, not the expanded slider
 * tray. The tray is a transient, user-invoked, Escape-dismissable popover that
 * opens leftward over content and is gone on the next tap; reserving room for
 * it would reflow every header the instant a player touched 🎚. The contract
 * is "no persistent chrome may be covered" — the buttons are the persistent
 * chrome.
 */
import { AUDIO_BTN_SIZE, AUDIO_CLUSTER_BUTTONS, AUDIO_MENU_TOP, audioButtonsWidth } from "./audioClusterLayout";
import { HUD_EDGE } from "./hud/hudLayout";

/** Gutter (px) between the viewport's right edge and persistent top-right chrome. */
export const CHROME_TOP_RIGHT_W = "--ggd-chrome-top-right-w";
/** Distance (px) from the viewport's top edge to the BOTTOM of that chrome. */
export const CHROME_TOP_RIGHT_H = "--ggd-chrome-top-right-h";

/**
 * Pre-measurement fallbacks. DERIVED from the cluster's own geometry module —
 * never typed in by hand — so they stay right by construction, and they only
 * ever apply for the one frame before the first ResizeObserver callback (or
 * forever in a non-DOM render, where nothing is on screen to collide anyway).
 */
export const TOP_RIGHT_FALLBACK_W = HUD_EDGE + audioButtonsWidth(AUDIO_CLUSTER_BUTTONS);
export const TOP_RIGHT_FALLBACK_H = AUDIO_MENU_TOP + AUDIO_BTN_SIZE;

/** The part of a DOMRect this contract needs. */
export interface ChromeBox {
  readonly left: number;
  readonly bottom: number;
}

/** The published pair, in px. */
export interface ChromeReserve {
  /** gutter from the viewport's RIGHT edge (includes safe-area + corner gap) */
  readonly w: number;
  /** distance from the viewport's TOP edge down to the chrome's bottom */
  readonly h: number;
}

/**
 * PURE: measured viewport box → published reserve. Rounded UP: a fractional
 * layout (zoom, device pixel ratio) must never under-reserve by a hairline.
 */
export function chromeReserveFromBox(box: ChromeBox, viewportWidth: number): ChromeReserve {
  return {
    w: Math.max(0, Math.ceil(viewportWidth - box.left)),
    h: Math.max(0, Math.ceil(box.bottom)),
  };
}

export interface TopRightReserveOptions {
  /**
   * px the CONSUMER's own box is already inset from the viewport's right edge
   * (e.g. the lobby header sits inside a container with `padding: 16`, so 16px
   * of the gutter is already there and must not be double-counted).
   */
  outerInset?: number;
  /** px of padding the consumer wants regardless of the cluster (its own gutter). */
  min?: number;
}

/**
 * PURE: what `topRightReserve()`'s CSS resolves to for a given published value.
 * The two functions are kept in lock-step by chromeReserve.test.ts, which
 * evaluates the CSS string and compares — so the test asserts the SHIPPED
 * expression, not a re-implementation of it.
 *
 * `published = null` models "not measured yet" and uses the derived fallback.
 */
export function topRightReservePx(
  published: number | null | undefined,
  opts: TopRightReserveOptions = {},
): number {
  const w = published ?? TOP_RIGHT_FALLBACK_W;
  return Math.max(opts.min ?? 0, w - (opts.outerInset ?? 0));
}

/**
 * The consumer-side CSS value: a `padding-right` (or `margin-right`) that
 * tracks the measured cluster and never drops below the consumer's own gutter.
 */
export function topRightReserve(opts: TopRightReserveOptions = {}): string {
  const min = opts.min ?? 0;
  const outer = opts.outerInset ?? 0;
  const v = `var(${CHROME_TOP_RIGHT_W}, ${TOP_RIGHT_FALLBACK_W}px)`;
  return outer === 0 ? `max(${min}px, ${v})` : `max(${min}px, calc(${v} - ${outer}px))`;
}

export interface TopRightClearOptions {
  /** px of clearance below the chrome. */
  gap?: number;
  /** px the consumer wants regardless. */
  min?: number;
}

/**
 * PURE: the VERTICAL half — the first y a consumer may paint at if it wants to
 * pass UNDER the top-right chrome instead of beside it (a full-width toast
 * rail, for instance).
 */
export function topRightClearPx(
  published: number | null | undefined,
  opts: TopRightClearOptions = {},
): number {
  const h = published ?? TOP_RIGHT_FALLBACK_H;
  return Math.max(opts.min ?? 0, h + (opts.gap ?? 0));
}

/** The CSS value matching `topRightClearPx`. */
export function topRightClear(opts: TopRightClearOptions = {}): string {
  const min = opts.min ?? 0;
  const gap = opts.gap ?? 0;
  const v = `var(${CHROME_TOP_RIGHT_H}, ${TOP_RIGHT_FALLBACK_H}px)`;
  return gap === 0 ? `max(${min}px, ${v})` : `max(${min}px, calc(${v} + ${gap}px))`;
}

/** Just enough of an element for this module to measure it. */
export interface ChromeMeasureTarget {
  getBoundingClientRect(): ChromeBox;
}

/** Just enough of a style declaration to publish onto. */
export interface ChromeStyleTarget {
  setProperty(name: string, value: string): void;
}

/**
 * Everything this module touches outside itself. Injected so the whole
 * publish loop — measure, write, react to a resize — is exercisable in the
 * client's `node` vitest environment, which has no DOM.
 */
export interface ChromeReserveEnv {
  root: ChromeStyleTarget;
  /** CSS px of the layout viewport (documentElement.clientWidth — excludes the scrollbar). */
  viewportWidth(): number;
  /** viewport-level changes: resize, orientation, safe-area flips. */
  onViewportChange(cb: () => void): () => void;
  /** element-size changes (ResizeObserver); omitted when unavailable. */
  onElementResize?(el: ChromeMeasureTarget, cb: () => void): () => void;
}

/** PURE-ish: measure once and write both properties. Returns what it wrote. */
export function publishChromeReserve(
  target: ChromeMeasureTarget,
  env: ChromeReserveEnv,
): ChromeReserve {
  const reserve = chromeReserveFromBox(target.getBoundingClientRect(), env.viewportWidth());
  env.root.setProperty(CHROME_TOP_RIGHT_W, `${reserve.w}px`);
  env.root.setProperty(CHROME_TOP_RIGHT_H, `${reserve.h}px`);
  return reserve;
}

/**
 * Keep the published reserve in sync with `el` until the returned function is
 * called. Two triggers, both required:
 *   • ResizeObserver — the cluster gaining/losing a control changes its SIZE;
 *   • viewport events — an orientation flip changes `env(safe-area-inset-*)`
 *     and therefore the cluster's POSITION without changing its size, which a
 *     ResizeObserver alone would never report.
 *
 * There is no feedback loop: the observed element is anchored to the viewport
 * (`position: fixed`), so the header reflow this triggers cannot move it.
 */
export function observeChromeReserve(
  el: ChromeMeasureTarget | null | undefined,
  env: ChromeReserveEnv | null,
): () => void {
  if (!el || !env) return () => {};
  const measure = (): void => {
    publishChromeReserve(el, env);
  };
  measure();
  const stops = [env.onViewportChange(measure)];
  if (env.onElementResize) stops.push(env.onElementResize(el, measure));
  return () => {
    for (const stop of stops) stop();
  };
}

/**
 * The real browser environment, or null when there is no DOM (SSR / node
 * tests) so `observeChromeReserve` degrades to a no-op and consumers keep the
 * derived fallback.
 */
export function browserChromeEnv(): ChromeReserveEnv | null {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const root = document.documentElement;
  if (!root) return null;
  return {
    root: root.style,
    // clientWidth, not innerWidth: it excludes a classic scrollbar, which is
    // the same coordinate space getBoundingClientRect() reports in — mixing
    // the two would make the reserve jitter as a page gains/loses a scrollbar.
    viewportWidth: () => root.clientWidth || window.innerWidth,
    onViewportChange: (cb) => {
      window.addEventListener("resize", cb);
      window.addEventListener("orientationchange", cb);
      return () => {
        window.removeEventListener("resize", cb);
        window.removeEventListener("orientationchange", cb);
      };
    },
    onElementResize:
      typeof ResizeObserver === "function"
        ? (el, cb) => {
            const ro = new ResizeObserver(() => cb());
            ro.observe(el as unknown as Element);
            return () => ro.disconnect();
          }
        : undefined,
  };
}
