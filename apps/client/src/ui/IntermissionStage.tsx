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
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Items } from "@ggd/shared/sim/content/registry";
import { IntermissionScene } from "../render/intermission/IntermissionScene";
import type { ShelfGoodInput } from "../render/intermission/shelfDisplay";
import {
  playRecessBell,
  startMarketAmbience,
  type MarketAmbienceHandle,
} from "../render/intermission/intermissionAudio";
import { useHud } from "../net/RoomStore";
import { hudActions } from "./actions";
import { audioSystem } from "../audio/AudioSystem";
import { playChampionSelectVoice } from "../audio/championVoice";
import { HeroReactionBubble } from "./HeroReactionBubble";
import { MerchantTipBox } from "./MerchantTipBox";
import { shopCatalogue } from "./panels/champSelectFilter";
import { INTERMISSION_Z, intermissionFocus, intermissionSurfaces } from "./panels/intermissionLayout";
import { groupCatalogue } from "./panels/shopGrouping";
import { useWhitelist } from "./panels/whitelist";

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

  // ---- WHO OWNS THE SCREEN (playtest P2, task #107) ------------------------
  // The ambient surfaces in this portal (the merchant's tip box) live OUTSIDE
  // #hud-root, so no container can tell them a modal choice is up. They read
  // the same pure rule the draft panel's own mount condition uses — a scalar
  // count, never the offers array, so a fresh-array-per-snapshot cannot
  // re-render the whole market 30× a second.
  const phase = useHud((s) => s.phase);
  const offerCount = useHud((s) => {
    if (s.localSeatId === null) return 0;
    return s.seats.find((v) => v.seatId === s.localSeatId)?.offers?.length ?? 0;
  });
  const surfaces = intermissionSurfaces(intermissionFocus({ phase, offerCount }));

  // ---- what is ON THE SHELVES (task #94) ----------------------------------
  // The stall's rack shows the SAME catalogue the card does — #70's finals,
  // the operator's whitelist applied, grouped by `groupCatalogue` — so the 3D
  // market and the panel can never disagree about what is for sale. The
  // champion's own inventory rides along so a good already in a slot goes dark
  // on the shelf, and comes back the moment it is sold (or a sale is undone).
  const { whitelist } = useWhitelist();
  // JSON key rather than the array itself: `seat.items` is a fresh array every
  // snapshot, and re-stocking the shelves 30× a second is pure churn.
  const ownedKey = useHud((s) => {
    if (s.localSeatId === null) return "";
    const seat = s.seats.find((v) => v.seatId === s.localSeatId);
    return seat ? seat.items.join("|") : "";
  });
  const shelfGoods = useMemo<ShelfGoodInput[]>(() => {
    const owned = new Set(ownedKey.split("|").filter(Boolean));
    const out: ShelfGoodInput[] = [];
    for (const shelf of groupCatalogue(shopCatalogue(Items.all(), whitelist))) {
      for (const item of shelf.items) {
        out.push({ itemId: item.id, shelf: shelf.id, owned: owned.has(item.id) });
      }
    }
    return out;
  }, [whitelist, ownedKey]);

  // ---- scene lifecycle (once per mount = once per intermission) ------------
  // A FRESH SCENE PER ROUND IS DELIBERATE. Re-opening the market used to
  // re-download its 13 prop .glbs (2,228,424 B, merchant.glb alone 1,598,564 B)
  // plus the team banner every single round; that waste now lives in
  // AssetManager's shared byte cache, so round 2+ rebuild with ZERO requests
  // (proved in render/intermission/assetReuse.test.ts) while everything below
  // still gets the clean slate it assumes.
  //
  // DO NOT "optimise" this into a long-lived scene without moving the entry
  // beat with it: `playEnterTransition` is what starts the camera ease AND the
  // merchant's wave, and the `reveal` timer below only makes sense because the
  // black cover starts opaque on a scene that has never been shown. A kept-alive
  // scene would also pin a second WebGL context, engine, shadow map and
  // post-process pipeline for the whole match — far more expensive than the
  // parse it saves.
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
    // ---- INTERMISSION AUDIO (tasks #124, #38) ----------------------------
    // The 下課打鐘 recess bell rings ONCE as the 備戰 window opens; the market
    // ざわめき murmur bed loops UNDER the scene the whole time. Both ride the SFX
    // bus via audioSystem.playSfx, so the SFX slider/mute and the #62 test-mode
    // silence gate apply — headless/background runs make no sound. The ambience
    // is a managed loop whose re-arm timer is cleared on dispose (no leak).
    playRecessBell(audioSystem);
    const ambience: MarketAmbienceHandle = startMarketAmbience(audioSystem);
    return () => {
      clearTimeout(reveal);
      ambience.stop();
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

  // ---- stock the stall's shelves, and re-stock as the inventory changes ----
  useEffect(() => {
    sceneRef.current?.setShelfGoods(shelfGoods);
  }, [shelfGoods]);

  // ---- the player's own hero at the counter --------------------------------
  useEffect(() => {
    if (!championId) return;
    const model = hudActions.localChampionModel();
    if (!model) return;
    void sceneRef.current?.setChampion(model.glbPath, model.scale, model.modelKey);
  }, [championId]);

  // ---- a completed purchase: merchant hands it over, YOUR hero RESPONDS -----
  // The owner asked that the hero react 「根據個性特色回應自己的想法 不只是擺出
  // 攻擊動作而已」. So: the merchant still hands it over; the hero's reaction
  // ANIMATION now biases to a celebration (a cheer/nod, NOT an attack swing —
  // `celebratoryOnly`, degrading to a satisfied squash-pop when a hero has no
  // cheer clip); the in-character LINE is surfaced by <HeroReactionBubble>; and,
  // as a silent-safe bonus, his own voice quip plays (the voice layer is
  // autoplay-/mute-/test-silence-gated — task #62 — so it makes NO sound in
  // headless runs or when muted).
  useEffect(() => {
    if (purchaseSeq <= 0) return;
    sceneRef.current?.playGesture("interact");
    sceneRef.current?.playChampionReaction({ celebratoryOnly: true });
    if (championId) void playChampionSelectVoice(championId);
    // championId is intentionally NOT a dep: only a genuine purchase pops this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseSeq]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "absolute", inset: 0, zIndex: INTERMISSION_Z.stage, pointerEvents: "none" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", outline: "none" }}
      />
      {/* the merchant's rotating tips box (task #148) — DOM ordered BEFORE the
          fade so the black cover hides it until the scene has eased in.
          `muted` while a 三選一 draft owns the screen: it fades out (never
          unmounts, so the rotation keeps its cadence) instead of sitting behind
          the card stack, which is the P2 「卡片直接蓋住商人提示框」 report. */}
      <MerchantTipBox muted={surfaces.ambientMuted} />
      {/* the player hero's OWN in-character reaction to a purchase (owner ask):
          anchored over him at the RIGHT of the counter, tail pointing at him */}
      <HeroReactionBubble championId={championId} purchaseSeq={purchaseSeq} />
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
