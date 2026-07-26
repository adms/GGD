/**
 * VersionBadge — the build stamp, on EVERY screen of the game client (task #66,
 * repaired by #245).
 *
 * WHERE THE STAMP COMES FROM. It is injected at BUILD TIME by vite's `define`
 * (see apps/client/vite.config.ts): `import.meta.env.VITE_BUILD_STAMP` = the
 * short git sha (+ `-dirty`) and the build date, resolved by
 * apps/client/dev/buildStamp.ts. There is NO git call at runtime — the browser
 * never shells out; it only reads the string baked into the bundle. When the
 * var was never injected (plain vitest, which does not run the define), the
 * shared `resolveStamp` falls back to the honest label "dev".
 *
 * ...AND WHY THAT WAS NOT ENOUGH, TWICE.
 *
 * (1) PLAYTEST P8 — THE DEV SERVER FROZE THE STAMP. `define` is a compile-time
 * substitution and vite owns `import.meta.env` in serve mode, so under the dev
 * server the define never lands at all (MEASURED on :39527: the badge's first
 * paint read `undefined` and fell back to "dev"), and even where it does land it
 * freezes on the commit the server booted with. `useLiveStamp` polls the
 * dev-only route `/__ggd-build-stamp` (registered by `liveBuildStamp()` with
 * `apply:"serve"`, so it does not exist in prod) and shows what the dev server
 * reports. Still no git in the browser — the dev server runs it, on the dev
 * machine. Every failure mode (no route, non-2xx, blank body, an SPA fallback
 * handing back index.html, fetch absent, unmounted) falls back to the baked
 * literal, so the badge can never be worse off than before.
 *
 * (2) TASK #245 — IT WAS IN THE DOM AND INVISIBLE ON THE SCREENS THAT MATTER.
 * #66 mounted the badge INSIDE `#hud-root` at `z-index: 1`, deliberately "below
 * #hud-root (z 10) and every overlay". `#hud-root` carries `z-index: 10` and so
 * opens a stacking context: everything the HUD paints — including every
 * full-screen panel — outranks a child at z 1. WALKED, screen by screen:
 *
 *   surface            covering layer                                   verdict
 *   ─────────────────  ──────────────────────────────────────────────  ────────
 *   login / lobby      nothing over the bottom strip                    visible
 *   champion select    centred card, clears the corners (#107 row)      visible
 *   battle HUD         ability bar at `bottom: 14`; touch arc at 40     visible
 *   shop / intermission MerchantShop left card, z 40, min(45vw,560px)   COVERED
 *                       full height — eats the badge's left half on any
 *                       viewport under ~1240px
 *   settlement         MatchEndPanel `inset: 0`, z 40, opaque wash      COVERED
 *   leave-settlement   LeaveSettlementOverlay, z HUD_Z.modal            COVERED
 *   pause / codex /    PauseMenu + the hash-routed overlays, z modal    COVERED
 *   credits / assets
 *   loading / rotate   MatchLoadingOverlay z 60, RotateOverlay z 100    COVERED
 *
 * The end-of-match screenshot — the single most-reported screen — carried no
 * build identity at all. So the badge now paints ABOVE everything
 * (`VERSION_BADGE_Z`) and escapes `#hud-root` through a <body> portal, exactly
 * as the audio cluster does for the same reason.
 *
 * WHY THAT CANNOT GET IN THE WAY (the #107 contract, respected not bypassed):
 *   • `pointer-events: none` — it can never swallow a click, at any z-index.
 *     Raising z is therefore incapable of breaking a control.
 *   • it is confined to `VERSION_BADGE_BAND_PX` (10px) of the bottom edge — the
 *     gutter `HUD_EDGE` already keeps empty for every corner slot. That band is
 *     DECLARED in ui/hud/hudLayout.ts (`hudStampBandRect`) and enforced by
 *     ui/hud/versionBadgeBand.test.ts, which fails if any slot or docked panel
 *     ever reaches into it. It is a reservation, not an assumption.
 *   • `aria-hidden`, so it is never announced.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  BUILD_STAMP_FALLBACK,
  LIVE_STAMP_POLL_MS,
  LIVE_STAMP_ROUTE,
  isPlausibleLiveStamp,
  preferLiveStamp,
  resolveStamp,
  versionBadgeStyle,
} from "@ggd/shared/versionBadge";

// Re-exported so the client's own tests and any consumer keep one import site.
export {
  BUILD_STAMP_FALLBACK,
  LIVE_STAMP_POLL_MS,
  LIVE_STAMP_ROUTE,
  preferLiveStamp,
  resolveStamp,
};

/** The build stamp baked in by vite (`VITE_BUILD_STAMP`), or "dev". */
export function buildStamp(): string {
  return resolveStamp(import.meta.env.VITE_BUILD_STAMP);
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
          if (!alive || !isPlausibleLiveStamp(text)) return;
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
    // The two data-* attributes are written literally (JSX cannot take a
    // computed attribute name without losing type-checking); versionBadge
    // .test.ts asserts they equal VERSION_BADGE_ATTR / VERSION_BADGE_APP_ATTR,
    // so the shared constants stay the single source of truth for the guards.
    <div data-ggd-version-badge data-ggd-version-badge-app="client" aria-hidden style={versionBadgeStyle()}>
      {stamp}
    </div>
  );
}

export function VersionBadge(): React.JSX.Element {
  const view = <VersionBadgeView stamp={useLiveStamp(buildStamp())} />;
  // Portal to <body> so we escape #hud-root's stacking context (z-index 10) and
  // ride above the in-match HUD, the shop card and the settlement panel on every
  // screen. Same mechanism, and the same reason, as ui/AudioToggle.tsx. In a
  // non-DOM env (vitest's `node` environment / SSR) fall back to inline
  // rendering so the view is still assertable.
  if (typeof document !== "undefined" && document.body) {
    return createPortal(view, document.body);
  }
  return view;
}
