/**
 * GlobalChrome — the components that must exist on EVERY page, in EVERY render
 * tree, whichever entry booted it.
 *
 * WHY THIS FILE EXISTS (defect P0-6(b), shape S9 in docs/_false-completions.md).
 * The client has TWO render trees, not one. `main.tsx` renders `<AppRoot/>`
 * normally, but when the URL carries `#replay=<id>` it renders `<ReplayApp/>`
 * INSTEAD — a completely separate tree that reuses GameApp's renderer against
 * the "replay" room. `AudioToggle` (task #14, "on every screen") and
 * `VersionBadge` (task #66, "pinned to the bottom of EVERY screen") were both
 * mounted inside `AppRoot`, so neither existed on the replay page.
 *
 * That page is not a corner: it is THE page the owner screenshots for playtest
 * feedback. It carried no build identity at all, and a replay with combat audio
 * could not be muted from the page it was playing on.
 *
 * A component that claims to be global cannot be mounted per-tree by hand —
 * that is exactly how it went missing. It is declared ONCE here, both trees
 * render `<GlobalChrome/>`, and a guard test (./globalChrome.test.ts) walks
 * every `root.render(` site in main.tsx and fails if a tree does not.
 *
 * DELIBERATELY NOT HERE, and why — these are AppRoot-only on purpose:
 *   • AudioDirector — it drives BGM off the platform store's `screen`, which a
 *     replay never enters (it stays at "boot"). Mounting it here would start
 *     lobby music under a recorded match. The replay page's audio is the
 *     renderer's own combat SFX, which AudioToggle already gates.
 *   • SettingsCorner / PauseMenu / Minimap / HudRoot — in-match chrome, mounted
 *     by MatchOverlay. A replay has its own transport controls instead.
 *   • CodexRoute / AssetConsoleRoute / CreditsRoute — hash-routed overlays, and
 *     the replay page's hash is already spoken for by `#replay=`.
 * The cursor and the mobile/safe-area stylesheets are NOT components: `main.tsx`
 * calls `initCursor()` and imports `mobile.css` / `cursor.css` at module scope,
 * before either tree renders, so both trees already have them.
 */
import { AudioToggle } from "./AudioToggle";
import { VersionBadge } from "./VersionBadge";

export function GlobalChrome(): React.JSX.Element {
  return (
    <>
      {/* global music/SFX quick-toggle: portals to <body>, so it rides ABOVE
          the screen switch, the in-match HUD and the replay transport bar. */}
      <AudioToggle />
      {/* build stamp: fixed, bottom-pinned, click-through, low z-index — every
          screenshot (including a replay screenshot) names the build it came from. */}
      <VersionBadge />
    </>
  );
}
