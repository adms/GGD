/**
 * IntermissionStage — the component boundary around `render/intermission`.
 *
 * The @babylonjs import stays behind the render seam (client-08); this file
 * owns only the <canvas>, the scene's lifecycle, and the three pieces of HUD
 * state the market reacts to: which team's banner flies, which champion stands
 * at the counter, and a completed purchase — on which the merchant plays his
 * `Interact` gesture AND the player's own hero plays a victory/attack reaction.
 *
 * LAYERING. The canvas is portalled to <body> at z-index 7 — above
 * `#anchor-layer` (5), whose world-anchored HP bars belong to the ARENA and
 * would otherwise float over the market, and below `#hud-root` (10), so the
 * shop card and the rest of the HUD stay on top. While it is up the arena's own
 * draw is suppressed (`hudActions.setArenaRenderSuppressed`) so the machine is
 * not painting two full 3D scenes at once; the arena's sim, network and view
 * sync keep running, so leaving the market is seamless.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IntermissionScene } from "../render/intermission/IntermissionScene";
import { useHud } from "../net/RoomStore";
import { hudActions } from "./actions";

/** Cross-fade in from black so the scene swap is a cut TO something, not a flash. */
const FADE_MS = 280;

export function IntermissionStage(): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<IntermissionScene | null>(null);
  const [ready, setReady] = useState(false);

  const teamId = useHud((s) => {
    if (s.localSeatId === null) return -1;
    return s.seats.find((v) => v.seatId === s.localSeatId)?.teamId ?? -1;
  });
  const championId = useHud((s) =>
    s.localSeatId === null ? "" : (s.seats.find((v) => v.seatId === s.localSeatId)?.championId ?? ""),
  );
  // a COMPLETED purchase makes the merchant hand something over
  const purchaseSeq = useHud((s) => (s.shopEvent?.kind === "bought" ? s.shopEvent.seq : 0));

  // ---- scene lifecycle (once per mount = once per intermission) ------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    hudActions.setArenaRenderSuppressed(true);
    const scene = new IntermissionScene(canvas, { teamId });
    sceneRef.current = scene;
    // ease the shot in from further back while the merchant waves you over
    scene.playEnterTransition(() => setReady(true));
    // belt-and-braces: reveal even if the scene never reports (it guarantees
    // exactly-once, including on dispose — this is only for a stalled tab).
    const reveal = setTimeout(() => setReady(true), FADE_MS * 4);
    return () => {
      clearTimeout(reveal);
      sceneRef.current = null;
      scene.dispose();
      hudActions.setArenaRenderSuppressed(false);
    };
    // teamId/championId are applied by the effects below, not by remounting the
    // whole scene — a banner swap must not rebuild the market.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setTeam(teamId);
  }, [teamId]);

  // ---- the player's own hero at the counter --------------------------------
  useEffect(() => {
    if (!championId) return;
    const model = hudActions.localChampionModel();
    if (!model) return;
    void sceneRef.current?.setChampion(model.glbPath, model.scale, model.modelKey);
  }, [championId]);

  // ---- a completed purchase: merchant hands it over, YOUR hero celebrates ---
  useEffect(() => {
    if (purchaseSeq <= 0) return;
    sceneRef.current?.playGesture("interact");
    sceneRef.current?.playChampionReaction();
  }, [purchaseSeq]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "absolute", inset: 0, zIndex: 7, pointerEvents: "none" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", outline: "none" }}
      />
      {/* the fade sits OVER the canvas and lifts once the scene has eased in */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#0b0e14",
          opacity: ready ? 0 : 1,
          transition: `opacity ${FADE_MS}ms ease-out`,
          pointerEvents: "none",
        }}
      />
    </div>,
    document.body,
  );
}
