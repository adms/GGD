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
import { HudErrorBoundary } from "../HudErrorBoundary";
import { HudBoundaryGroup, type HudBoundaryLabels } from "../HudBoundaryGroup";
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
import { GamepadDiagnostics } from "../GamepadDiagnostics";
import { LinkRoute } from "./LinkRoute";
import { useHud } from "../../net/RoomStore";
import { useContentReady, MatchContentGate } from "./ContentGate";
import { Btn } from "./widgets";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

/**
 * `MatchOverlay` 十個成員的位置名。理由與寫法同 `HudRoot` 的 `HUD_LABELS`
 * （出貨 bundle 裡函式名被 esbuild 改掉了，`type.name` 取不到東西）。
 * ⚠️ `HudRoot` 那一格叫「比賽介面」是刻意的：它自己裡面還有一層更細的
 * `HudBoundaryGroup`，走到這一層代表 `HudRoot` 本體（不是某個面板）炸了。
 */
const OVERLAY_LABELS: HudBoundaryLabels = new Map<unknown, string>([
  [HudRoot, "比賽介面"],
  [Minimap, "小地圖"],
  [RotateOverlay, "轉向提示"],
  [FpsPill, "FPS 顯示"],
  [PerfOverlay, "效能疊層"],
  [SettingsCorner, "設定"],
  [PauseMenu, "選單"],
  [LeaveSettlementOverlay, "離場結算"],
  [CheatConsole, "作弊主控台"],
  // 裸 <div data-hud-slot="leave"> —— 用槽位字串當 key（見 hudBoundaryLabel）。
  ["leave", "離開按鈕"],
]);

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
    // 每個成員各自一層 boundary（見 ../HudBoundaryGroup）。外層 ScreenBody 還有
    // 一個包整棵樹的 boundary 當最後一道網 —— 這一層讓「小地圖炸了」不會連
    // 商店和血條一起帶走。resetKey 用 matchEpoch：換一場就重試壞掉的那些。
    <HudBoundaryGroup labels={OVERLAY_LABELS} resetKey={matchEpoch} retryScope="match">
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
    </HudBoundaryGroup>
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
      {/* 用手機登入 approval page (#197/#199): the phone lands on /link?code=…
          from the handheld's QR and approves here. A path overlay, so it opens
          over any screen without touching the screen machine. */}
      <LinkRoute />
      {/* The audio quick-toggle (#14), the build stamp (#66) and the pad focus
          layer (#197/#222). Declared in ../GlobalChrome, NOT inline here, because
          this is not the only render tree: `#replay=` boots ReplayApp instead of
          AppRoot, and each of these was missing there for exactly as long as it
          was mounted by hand (defect P0-6(b)). Both trees render the same
          component now — mounting a chrome member here again is a drift the
          ui/surfaceParity.test.ts guard fails on. */}
      <GlobalChrome />
      {/* task #197 — the on-screen pad wake/mapping diagnostic for a
          keyboard-less handheld. AppRoot-only: it self-gates on the platform
          screen machine and has nothing to say on the replay page. */}
      <GamepadDiagnostics />
    </>
  );
}

function ScreenBody({ screen }: { screen: string }): React.JSX.Element {
  // boundary 的重置鍵：換一場就重新掛載比賽介面再試一次。
  // ⚠️ 沒有它，一次例外會讓介面在**這個分頁剩下的時間**都是壞的。
  const matchEpoch = useApp((s) => s.matchEpoch);
  // Entering a match is the ONE transition that truly needs the full content
  // set. Content streams in the background from first paint, so by the time a
  // user logs in and clicks play it is almost always ready; if not, hold a
  // lightweight placeholder here rather than mounting the HUD/sim (main.tsx
  // likewise defers GameApp creation until this is ready).
  const contentReady = useContentReady();
  switch (screen) {
    case "match":
      // ⚠️ 這個 boundary 是 2026-08-02 那個「介面永久消失」缺陷的止血點，
      // 不是裝飾。React 18 在 render 期間吃到未捕捉例外會**卸載整個 root**，
      // 而 `main.tsx` 的 `root.render` 只在開機呼叫一次 —— 所以在此之前，
      // 比賽中任何一個 HUD 元件丟例外，玩家的介面就**這個分頁剩下的時間都是死的**
      // （owner 實測：「下一場戰鬥也是 介面沒有再回來了」）。
      // 有了它，React 只卸載這一棵子樹，root 活著，而 `matchEpoch` 一變就重試。
      return contentReady ? (
        <HudErrorBoundary label="比賽介面" resetKey={matchEpoch} retryScope="match">
          <MatchOverlay />
        </HudErrorBoundary>
      ) : (
        <MatchContentGate />
      );
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
