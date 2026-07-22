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
 * WHY IT CANNOT GET IN THE WAY. The box is `position:fixed` at the very bottom
 * edge, `pointer-events:none` (it can never swallow a click) and sits at a LOW
 * z-index — below #hud-root (z 10) and every overlay — so it renders under, not
 * over, any interactive chrome. It hugs the bottom-centre strip where no HUD or
 * lobby control lives, and is `aria-hidden` so it is not announced.
 */
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
  return <VersionBadgeView stamp={buildStamp()} />;
}
