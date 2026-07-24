/**
 * VersionBadge — a tiny, unobtrusive build stamp pinned to the BOTTOM of every
 * screen (task #66). Mounted ONCE in AppRoot, above the screen switch, so the
 * same badge rides over login, lobby, champ-select AND a live match — every
 * screenshot is therefore traceable back to the exact build it was taken on.
 *
 * WHERE THE STAMP COMES FROM. It is injected at BUILD TIME by vite's `define`
 * (see apps/client/vite.config.ts): `import.meta.env.VITE_BUILD_STAMP` = the
 * short git sha + the build date. There is NO git call at runtime — the browser
 * never shells out; it only reads the string baked into the bundle. When the
 * var was never injected (a build with no git, or plain vitest which does not
 * run the define), `resolveStamp` falls back to "dev".
 *
 * ...AND WHY THAT WAS NOT ENOUGH (playtest P8: badge stuck at `7d1bb37` while
 * HEAD was far ahead). TWO separate defects produced that one symptom, and both
 * follow from `define` being a compile-time substitution evaluated ONCE:
 *
 *   1. UNDER THE DEV SERVER THE DEFINE NEVER LANDS AT ALL. Vite owns
 *      `import.meta.env` in serve mode and synthesizes it per request, so a
 *      `define` keyed on `import.meta.env.VITE_BUILD_STAMP` is not substituted
 *      there. MEASURED on :39527: the badge's first paint read `undefined` and
 *      fell back to "dev". A dev screenshot carried NO build identity whatsoever.
 *   2. A BUILT BUNDLE FREEZES AT ITS BUILD. That is correct by construction —
 *      but a bundle built at 7d1bb37 and served for days keeps saying 7d1bb37
 *      no matter how far the repo moves, which is exactly what a stale deploy
 *      looks like from the outside. The badge was not lying there; it was
 *      reporting a stale artifact honestly.
 *
 * The fix targets (1), the one that is a bug: `useLiveStamp` polls the dev-only
 * route `/__ggd-build-stamp` (registered by `liveBuildStamp()` with
 * `apply:"serve"`, so it does not exist in prod) and shows what the dev server
 * reports. Still no git in the browser — the dev server runs it, on the dev
 * machine. Every failure mode (no route, non-2xx, blank body, fetch absent,
 * unmounted) falls back to the baked literal, so the badge can never be worse
 * off than before. For (2) the badge now tells the truth loudly instead: a
 * deployed page showing an old sha IS an old deploy, and that is the signal.
 *
 * WHY IT CANNOT GET IN THE WAY. The box is `position:fixed` at the very bottom
 * edge, `pointer-events:none` (it can never swallow a click) and sits at a LOW
 * z-index — below #hud-root (z 10) and every overlay — so it renders under, not
 * over, any interactive chrome. It hugs the bottom-centre strip where no HUD or
 * lobby control lives, and is `aria-hidden` so it is not announced.
 */
import { useEffect, useState } from "react";
import { TEXT_DIM } from "./theme";

/** Shown when no build stamp was injected (no git, or under vitest). */
export const BUILD_STAMP_FALLBACK = "dev";

/**
 * Resolve a raw injected stamp to what the badge should display. Pure, so the
 * fallback is testable without depending on whatever `import.meta.env` holds in
 * a given runtime.
 */
export function resolveStamp(raw: string | undefined): string {
  return typeof raw === "string" && raw.trim().length > 0 ? raw : BUILD_STAMP_FALLBACK;
}

/** The build stamp baked in by vite (`VITE_BUILD_STAMP`), or "dev". */
export function buildStamp(): string {
  return resolveStamp(import.meta.env.VITE_BUILD_STAMP);
}

/** Dev-server route serving a FRESHLY computed stamp (vite `liveBuildStamp`). */
export const LIVE_STAMP_ROUTE = "/__ggd-build-stamp";
/** How often dev re-asks. A commit lands every few minutes at most; one local
 *  `git rev-parse` every 15 s is free, and prod never polls at all. */
export const LIVE_STAMP_POLL_MS = 15_000;

/**
 * Decide what the badge shows given the baked literal and whatever the dev route
 * last returned. Pure, so the precedence rule is testable without a network:
 * a non-empty live stamp wins (it is the fresher fact); anything else — no
 * route, an error page, a blank body — leaves the baked stamp untouched.
 */
export function preferLiveStamp(baked: string, live: string | null): string {
  return typeof live === "string" && live.trim().length > 0 ? live.trim() : baked;
}

/**
 * The stamp to display. In a production build this is a constant — the `define`
 * literal, no effect body worth running. In dev it polls the dev-server route so
 * a long-lived server stops reporting the commit it booted on.
 */
function useLiveStamp(baked: string): string {
  const dev = import.meta.env.DEV === true;
  const [live, setLive] = useState<string | null>(null);
  useEffect(() => {
    if (!dev || typeof fetch !== "function") return;
    let alive = true;
    const poll = (): void => {
      fetch(LIVE_STAMP_ROUTE, { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : null))
        .then((text) => {
          // Guard against an SPA fallback handing back index.html rather than a
          // stamp: a real stamp is one short line, never markup.
          if (!alive || text === null || text.length > 64 || text.includes("<")) return;
          setLive(text);
        })
        .catch(() => undefined); // dev server gone → keep the baked literal
    };
    poll();
    const id = setInterval(poll, LIVE_STAMP_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [dev]);
  return preferLiveStamp(baked, live);
}

/** Pure, prop-driven view — the render target for tests. */
export function VersionBadgeView({ stamp }: { stamp: string }): React.JSX.Element {
  return (
    <div
      data-ggd-version-badge
      aria-hidden
      style={{
        position: "fixed",
        bottom: 2,
        left: "50%",
        transform: "translateX(-50%)",
        // Below #hud-root (z 10) and every overlay: it renders UNDER interactive
        // chrome, never over it, and pointer-events:none keeps it click-through.
        zIndex: 1,
        pointerEvents: "none",
        fontSize: 10,
        lineHeight: 1,
        letterSpacing: "0.3px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        color: TEXT_DIM,
        opacity: 0.55,
        userSelect: "none",
        whiteSpace: "nowrap",
        // Respect the phone's bottom safe-area so it clears the home indicator.
        marginBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {stamp}
    </div>
  );
}

export function VersionBadge(): React.JSX.Element {
  return <VersionBadgeView stamp={useLiveStamp(buildStamp())} />;
}
