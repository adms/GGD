/**
 * Entry point — mounts the React AppRoot (auth → lobby → store → match) and
 * boots/disposes the imperative GameApp (Babylon canvas + network) as the
 * platform store enters/leaves the "match" screen. React never touches the
 * canvas; the two sides share only the Zustand stores (discrete) and the
 * frameBus (world anchors).
 */
import { createRoot } from "react-dom/client";
import { GameApp } from "./GameApp";
import { AppRoot } from "./ui/platform/AppRoot";
import { appStore } from "./ui/platform/store";
import { resetHudStore } from "./net/RoomStore";
import { initRenderConfig } from "./render/RenderConfig";
import { initSettings } from "./settings";
import { qualityController } from "./render/QualityController";
import { bindGoreToSettings } from "./vfx/goreSettings";
import { perfBus } from "./perfBus";
import { ensureContentLoaded } from "./content/bootContent";
import { initCursor } from "./cursor";
import "./ui/mobile.css";
import "./ui/buttonFx.css"; // shared JRPG + cyber-glow button skin (one import for the app)
import "./cursor/cursor.css"; // JRPG cursor set (task #54a); gated to fine pointers

initCursor(); // apply the persisted JRPG cursor size to <html> before first paint
initRenderConfig(); // load the persisted quality override (legacy mobile tier)
initSettings(); // first-boot auto-detect → recommended preset (item 6)
qualityController.init(); // subscribe the render seam to settings/adaptive changes
bindGoreToSettings(); // 濺血 style/intensity: settings -> vfx layer (task #39)

// dev-only introspection handle (mirrors Renderer's __ggdScene) — lets the
// dev harness read perf stats and script the adaptive manager. No gameplay
// path reads this; tree-shaken out of prod-mode bundles.
if (import.meta.env.DEV && typeof window !== "undefined") {
  void import("./settings").then(({ settingsStore }) => {
    (window as unknown as { __ggdPerf?: unknown }).__ggdPerf = {
      settingsStore,
      qualityController,
      perfBus,
    };
  });
}

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const hudEl = document.getElementById("hud-root")!;
// HMR-safe: reuse the one root across hot re-executions of this entry module
// (calling createRoot twice on the same container warns and double-mounts).
const rootHost = window as unknown as { __ggdRoot?: ReturnType<typeof createRoot> };
const root = rootHost.__ggdRoot ?? (rootHost.__ggdRoot = createRoot(hudEl));

/** Minimal boot placeholder shown while the full content set is fetched. */
function ContentLoadingScreen(): React.JSX.Element {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        padding: "14px 28px",
        borderRadius: 10,
        background: "#141824",
        border: "1px solid #2c3448",
        color: "#e6e9f0",
        font: "14px system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      Loading content…
      <div style={{ fontSize: 11, color: "#8a93a6", marginTop: 6 }}>fetching champions</div>
    </div>
  );
}

let app: GameApp | null = null;

function startMatch(): void {
  const { match } = appStore.getState();
  if (!match || app) return;
  resetHudStore();
  const platform = match.mode === "platform" && match.endpoint && match.seatTokens;
  app = new GameApp(canvas, {
    accountId: match.accountId ?? undefined,
    skinOverrides: match.skinOverrides,
    // couch play: platform mode gets one connection per seat token;
    // offline mode opens one dev connection per connected pad
    localPlayers: match.localPlayers,
    seatTokens: platform ? (match.seatTokens ?? undefined) : undefined,
    mapId: match.mapId ?? undefined,
  });
  app.start(); // render the arena immediately; entities appear once connected
  const join = platform ? app.connectPlatform(match.endpoint!, match.seatTokens!) : app.connect();
  join.catch((err) => {
    console.error("[client] failed to join match:", err);
    const message = err instanceof Error ? err.message : "connection failed";
    appStore.getState().matchJoinFailed(message); // → back to lobby/auth + toast
  });
}

function stopMatch(): void {
  if (!app) return;
  app.dispose();
  app = null;
  resetHudStore();
}

// Boot: load the FULL content set (93+ champions) into the sim/content
// registries BEFORE any champ-select UI renders or any match sim/prediction
// runs, so imported champions are selectable, predictable, and rendered. Fall
// back to the sela/thorne skeleton (with a warning) if the mount is unreachable.
async function boot(): Promise<void> {
  root.render(<ContentLoadingScreen />);
  const res = await ensureContentLoaded();
  if (res.ok) {
    console.info(
      `[client] content loaded: ${res.championCount} champions (${res.contentVersion})`,
    );
  } else {
    console.warn(
      `[client] content load failed (${res.error}); falling back to skeleton (${res.championCount} champions)`,
    );
  }

  appStore.subscribe((state, prev) => {
    if (state.screen === "match" && prev.screen !== "match") startMatch();
    else if (state.screen !== "match" && prev.screen === "match") stopMatch();
    else if (state.screen === "match" && state.matchEpoch !== prev.matchEpoch) {
      // Restart match: clean teardown, then a fresh GameApp. Offline that means
      // a new dev room = new SimWorld (battlefield cleared, round 1 fresh).
      stopMatch();
      startMatch();
    }
  });

  root.render(<AppRoot />);
}

void boot();
