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
 * PadFocusNav BELONGS HERE (task #197/#222). "A pad drives the WHOLE UI flow"
 * is a ubiquity claim of exactly the shape above, and it was mounted by hand in
 * AppRoot — so the replay page, the one surface with nothing BUT buttons and no
 * keyboard guarantee, could not be driven by a pad at all. It self-gates (it
 * stands down for the champion in live combat) and is renderless, so being on
 * every tree costs a rAF poll and nothing else. Declaring it here also means a
 * future third tree inherits pad navigation with no edit, which is the whole
 * point of this file.
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
import { PadFocusNav } from "./PadFocusNav";
import { PingChip } from "./PingChip";
import { VersionBadge } from "./VersionBadge";

export function GlobalChrome(): React.JSX.Element {
  return (
    <>
      {/* ⚠️ 這段註解不能以小寫的 "global " 開頭。eslint 把任何 block comment
          的開頭當成全域宣告指令去解析（連 JSX 裡的也算），原本那句
          「global music/SFX quick-toggle: portals to body」於是被讀成
          「宣告一個叫 portals 的全域變數」，整個檔案 FATAL。
          App-wide music/SFX quick-toggle: portals to <body>, so it rides ABOVE
          the screen switch, the in-match HUD and the replay transport bar. */}
      <AudioToggle />
      {/* build stamp: fixed, bottom-pinned, click-through, low z-index — every
          screenshot (including a replay screenshot) names the build it came from. */}
      <VersionBadge />
      {/* #272: the player's ping, 「跟版本號一樣都一直畫面上」. Same mechanism as
          the badge for the same reason (body portal + click-through + confined
          to the reserved bottom band), taking the LEFT end of that strip. It
          belongs HERE and not in AppRoot's MatchOverlay because "always" has to
          include the lobby and the replay page; it hides itself whenever there
          is no authoritative stream to describe. */}
      <PingChip />
      {/* #197/#222: roving DOM focus + the shared focus glow, on EVERY tree —
          renderless, self-gating (it defers to the champion in live combat). */}
      <PadFocusNav />
    </>
  );
}
