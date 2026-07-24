/**
 * AppRoot — top-level screen switch: boot → auth → lobby → match.
 * In-match it renders the existing HudRoot untouched, plus a "return to
 * lobby" overlay once the match ends (and a small leave control otherwise).
 * The imperative GameApp lifecycle is driven by main.tsx subscribing to
 * `screen` — React never touches the canvas.
 */
import { useEffect } from "react";
import { useApp } from "./store";
import { AuthScreen } from "./AuthScreen";
import { LobbyScreen } from "./LobbyScreen";
import { AudioDirector } from "../AudioDirector";
import { GlobalChrome } from "../GlobalChrome";
import { HudRoot } from "../HudRoot";
import { hudTouch } from "../hud/HudSlot";
import { hudSlotStyle } from "../hud/hudLayout";
import { Minimap } from "../hud/Minimap";
import { RotateOverlay } from "../RotateOverlay";
import { SettingsCorner } from "../SettingsCorner";
import { PerfOverlay, FpsPill } from "../PerfOverlay";
import { PauseMenu } from "../PauseMenu";
import { LeaveSettlementOverlay } from "../panels/LeaveSettlementOverlay";
import { useRequestLeave } from "../leaveFlow";
import { CheatConsole } from "../CheatConsole";
import { cheatsAvailable } from "../cheats";
import { CodexRoute } from "../codex/CodexRoute";
import { AssetConsoleRoute } from "../assets/AssetConsoleRoute";
import { CreditsRoute } from "./CreditsRoute";
import { PadFocusNav } from "../PadFocusNav";
import { GamepadDiagnostics } from "../GamepadDiagnostics";
import { useHud } from "../../net/RoomStore";
import { useContentReady, MatchContentGate } from "./ContentGate";
import { Btn } from "./widgets";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

function MatchOverlay(): React.JSX.Element {
  const phase = useHud((s) => s.phase);
  // #193: leaving routes through useRequestLeave — for a player whose team is
  // eliminated it shows the settlement screen first, otherwise it returns to the
  // lobby directly (the old behaviour). One shared callback, so the top-right
  // chip and the pause menu can never diverge.
  const requestLeave = useRequestLeave();
  const showCheats = useApp((s) => cheatsAvailable(s.match?.mode));
  // remount the cheat console on each Restart so its toggle state (god / 0-CD)
  // resets to match the fresh match/world rather than lingering from the old one
  const matchEpoch = useApp((s) => s.matchEpoch);
  const ended = phase === "matchEnd";

  return (
    <>
      <HudRoot />
      <Minimap />
      <RotateOverlay />
      <FpsPill />
      <PerfOverlay />
      <SettingsCorner />
      <PauseMenu />
      {/* #193: eliminated-player leave-flow — shows the evaluation screen before
          the lobby. Self-gates on the store's leaveGate; renders nothing during
          normal play. */}
      <LeaveSettlementOverlay />
      {showCheats && <CheatConsole key={matchEpoch} />}
      {/* When the match ends the full-screen settlement panel (MatchEndPanel)
          owns navigation (查看戰績變化 / 返回大廳); we only show the small "Leave"
          control during live play. */}
      {!ended && (
        // slot 0 of the top-right stack (ui/hud/hudLayout, tasks #42/#107):
        // DECLARED, not hard-coded, so the scoreboard and the <body>-portaled
        // audio cluster below it stack off the height this reserves.
        <div
          data-hud-slot="leave"
          style={{ ...hudSlotStyle("leave", hudTouch()), pointerEvents: "auto" }}
        >
          <Btn small title="leave the match" onClick={() => requestLeave()} style={{ opacity: 0.75 }}>
            Leave
          </Btn>
        </div>
      )}
    </>
  );
}

function BootScreen(): React.JSX.Element {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        padding: "14px 28px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 10,
        color: TEXT_MAIN,
      }}
    >
      Loading…
      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6 }}>checking session</div>
    </div>
  );
}

export function AppRoot(): React.JSX.Element {
  const screen = useApp((s) => s.screen);
  const boot = useApp((s) => s.boot);

  useEffect(() => {
    void boot();
    // boot once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* single audio conductor: boots the mixer, drives BGM for every screen
          (platform + match) and fires gameplay SFX. Render-less. */}
      <AudioDirector />
      <ScreenBody screen={screen} />
      {/* 內容圖鑑 (task #71): a hash-routed overlay (#codex) so it opens over the
          lobby AND over a live match without touching the screen machine. */}
      <CodexRoute />
      {/* 資產主控台 (#assets, task #101):供應商狀態 / 圖示覆蓋率 / 樣式規格 / 對照表 /
          費用. One console with sections rather than a route per asset question —
          #97's coverage bar is imported into it and #99's model budget has a
          declared section waiting. Same hash-overlay mechanism as the codex. */}
      <AssetConsoleRoute />
      {/* 版權聲明 (#credits): the login footer links here rather than printing
          the licence text over the artwork. Same hash-overlay mechanism as the
          codex, so it opens from any screen and is deep-linkable. */}
      <CreditsRoute />
      {/* The audio quick-toggle (#14) and the build stamp (#66). Declared in
          ../GlobalChrome, NOT inline here, because this is not the only render
          tree: `#replay=` boots ReplayApp instead of AppRoot, and both of these
          were missing there for exactly as long as they were mounted by hand
          (defect P0-6(b)). Both trees render the same component now. */}
      <GlobalChrome />
      {/* task #197 — a pad drives the WHOLE UI: roving DOM focus across every
          screen + modal (auth/lobby/store/champ-select/shop/draft/pause/…), and
          the on-screen wake/mapping diagnostic for a keyboard-less handheld. Both
          self-gate (the focus layer defers to the champion in live combat; the
          diagnostic hides on the match screen). */}
      <PadFocusNav />
      <GamepadDiagnostics />
    </>
  );
}

function ScreenBody({ screen }: { screen: string }): React.JSX.Element {
  // Entering a match is the ONE transition that truly needs the full content
  // set. Content streams in the background from first paint, so by the time a
  // user logs in and clicks play it is almost always ready; if not, hold a
  // lightweight placeholder here rather than mounting the HUD/sim (main.tsx
  // likewise defers GameApp creation until this is ready).
  const contentReady = useContentReady();
  switch (screen) {
    case "match":
      return contentReady ? <MatchOverlay /> : <MatchContentGate />;
    case "boot":
    case "auth":
    case "lobby":
    default:
      // .ggd-platform scopes the mobile stylesheet's >=44px touch targets
      // (ui/mobile.css) to the platform screens; desktop is unaffected.
      return (
        <div className="ggd-platform" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {screen === "boot" ? <BootScreen /> : screen === "auth" ? <AuthScreen /> : <LobbyScreen />}
        </div>
      );
  }
}
