/**
 * Pure decisions for the login background layer, split out of the React
 * component so they unit-test without a DOM or a GPU. The AuthScreen effect
 * consumes these to decide whether to even spin up the Babylon menu engine.
 */

/** Which layer sits behind the login card. */
export type BgMode = "scene" | "shimmer" | "static";

export interface MediaQueryLike {
  matches: boolean;
}

/**
 * True when the user asked the OS to minimise motion. Accepts an injected
 * matcher for tests; defaults to `window.matchMedia`. Never throws (old
 * WebViews reject unknown queries) — a failure reads as "no preference".
 */
export function prefersReducedMotion(
  match: ((q: string) => MediaQueryLike) | undefined = defaultMatcher(),
): boolean {
  if (!match) return false;
  try {
    return match("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Whether to attempt the animated 3D scene at all. When motion is reduced we
 * skip the engine entirely (no WebGL context, no render loop) and fall back to
 * the static gradient.
 */
export function shouldAnimateBackground(reduceMotion: boolean): boolean {
  return !reduceMotion;
}

function defaultMatcher(): ((q: string) => MediaQueryLike) | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return (q: string) => window.matchMedia(q);
}
