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
import { loadModelLodManifest, setModelLodTier } from "./render/modelLod";
import { withContentVersion } from "./content/assetVersion";
import { CONTENT_BASE_URL } from "./content/bootContent";
import { bindGoreToSettings } from "./vfx/goreSettings";
import { perfBus } from "./perfBus";
import { ensureContentLoaded, isContentReady } from "./content/bootContent";
import { initCursor } from "./cursor";
import { ReplayApp, parseReplayHash } from "./ui/replay/ReplayApp";
import "./ui/mobile.css";
import "./ui/buttonFx.css"; // shared JRPG + cyber-glow button skin (one import for the app)
import "./cursor/cursor.css"; // JRPG cursor set (task #54a); gated to fine pointers

initCursor(); // apply the persisted JRPG cursor size to <html> before first paint
initRenderConfig(); // load the persisted quality override (legacy mobile tier)
initSettings(); // first-boot auto-detect → recommended preset (item 6)
qualityController.init(); // subscribe the render seam to settings/adaptive changes
// MODEL LOD (task #115): the graphics preset picks WHICH .glb is fetched, not
// just how it is drawn. Subscribed here (not inside AssetManager) because there
// is one tier for the whole app and several scenes build their own AssetManager.
setModelLodTier(qualityController.getParams().modelLod);
qualityController.subscribe((p) => setModelLodTier(p.modelLod));
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

let app: GameApp | null = null;

function startMatch(): void {
  const { match } = appStore.getState();
  if (!match || app) return;
  // Never start the sim/render against a half-populated registry. If the
  // background content load has not finished yet, this no-ops; the
  // ensureContentLoaded().then callback below re-invokes startMatch the moment
  // the registries are ready (ScreenBody shows MatchContentGate meanwhile).
  if (!isContentReady()) return;
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

// Boot ordering (login-speed pass): the login/auth screen needs NO game
// content, so it must NOT wait on the 1441-doc content load. We therefore:
//   1. wire the GameApp lifecycle to the platform store's `screen`,
//   2. paint the app shell (AuthScreen / lobby) IMMEDIATELY — first paint no
//      longer blocks on content,
//   3. load the FULL content set (93+ champions) in the BACKGROUND. Only the
//      content-dependent flow (entering a match) is gated on readiness:
//      startMatch defers until the registries are populated, and ScreenBody
//      shows MatchContentGate meanwhile. By the time a user logs in and clicks
//      play the ~190KB load is almost always already done, so the gate is
//      usually invisible.
// On load failure loadAllContent registers the sela/thorne skeleton so the game
// still boots; we surface that as a non-fatal warning here (never a first-paint
// blocker).
function boot(): void {
  // Registered BEFORE the first render so a later match transition is never
  // missed. main.tsx's subscription fires ahead of React's own store
  // subscription, so GameApp is created before the HUD mounts (unchanged).
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

  // Paint the shell now — AuthScreen (or, for a returning session, the lobby)
  // is interactive on first paint, without awaiting any content.
  root.render(<AppRoot />);

  // Fire-and-track the content load. The readiness signal (content/bootContent)
  // flips when it settles; ScreenBody + startMatch observe it.
  void ensureContentLoaded().then((res) => {
    // The LOD index rides the content version, so it is fetched AFTER the boot
    // publishes it — that is what makes it `immutable` instead of a per-boot
    // revalidation, and no model can be requested before content is ready
    // anyway. A failure here just leaves every path resolving to itself.
    void loadModelLodManifest(CONTENT_BASE_URL, withContentVersion);
    if (res.ok) {
      // transport is load-bearing telemetry: "per-doc" means content/bundle.json
      // was missing/stale, so this boot paid 1,454 requests instead of 1.
      console.info(
        `[client] content loaded: ${res.championCount} champions (${res.contentVersion}) via ${res.transport ?? "?"}` +
          (res.transportReason ? ` — bundle unavailable: ${res.transportReason}` : ""),
      );
    } else {
      console.warn(
        `[client] content load failed (${res.error}); falling back to skeleton (${res.championCount} champions)`,
      );
    }
    // If the player already reached the match screen while content was still
    // loading, launch the deferred match now that the registries are populated.
    startMatch();
  });
}

// REPLAY VIEWER ENTRY (task #175). When the URL carries `#replay=<id>`, this is
// the owner following a 觀看回放 link from the admin console. Boot ONLY the
// replay viewer — which reuses GameApp's renderer against the "replay" room —
// instead of the normal login→lobby→match app, so the transport controls own
// the page and none of the platform boot flow runs.
//
// THIS IS A SECOND RENDER TREE, and that is a hazard, not a detail: anything
// mounted inside AppRoot does not exist here. Components that must be on every
// page belong in ui/GlobalChrome, which BOTH trees render — the audio toggle
// (#14) and the build stamp (#66) were mounted by hand in AppRoot and were
// therefore missing from this page entirely (defect P0-6(b)). The guard
// ui/globalChrome.test.ts walks the `root.render(` sites below and fails if a
// tree (or a new third one) does not carry it.
const replayParams = parseReplayHash(typeof location !== "undefined" ? location.hash : "");
if (replayParams) {
  root.render(<ReplayApp id={replayParams.id} ticket={replayParams.ticket} />);
} else {
  boot();
}
