/**
 * ContentGate — the non-blocking readiness seam between the fast-booting app
 * shell and the one flow that truly needs the full content set: entering a
 * match. Boot paints login/lobby immediately and streams the ~190KB roster in
 * the BACKGROUND (main.tsx + content/bootContent); this exposes that progress
 * to React as a plain boolean plus a small placeholder to show at the gate.
 *
 * Nothing on the login/lobby screens waits on this — the login form, map-select
 * and "Play offline" button are all interactive on first paint. Only the match
 * screen holds (MatchContentGate) until the registries are populated, so the HUD
 * and sim never mount against a half-loaded registry.
 */
import { useSyncExternalStore } from "react";
import { getContentBootSnapshot, subscribeContentBoot } from "../../content/bootContent";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

/**
 * React signal: true once the content registries are populated (full set OR the
 * skeleton fallback — either way the game can run). Backed by the React-free
 * observable in content/bootContent so the arch gate (React only under ui/*)
 * stays satisfied. The third arg is the server/static-markup snapshot — client
 * vitest renders components on the server, which requires it.
 */
export function useContentReady(): boolean {
  const snapshot = useSyncExternalStore(
    subscribeContentBoot,
    getContentBootSnapshot,
    getContentBootSnapshot,
  );
  return snapshot.phase === "ready";
}

/**
 * The small "entering the battle" placeholder shown when the match screen is
 * reached before the background content load has finished. In practice the load
 * completes long before a user logs in and clicks play, so this is usually never
 * seen — it exists so the match transition degrades to a lightweight loading
 * state instead of blocking first paint or throwing on an empty registry.
 */
export function MatchContentGate(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="match-content-gate"
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
        font: "14px system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      載入中…
      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6 }}>準備進入戰場</div>
    </div>
  );
}
