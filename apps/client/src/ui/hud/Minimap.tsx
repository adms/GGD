/**
 * Minimap — global awareness for the FIXED battle camera, rebuilt to LoL's
 * spec (task #58).
 *
 * WHAT WAS WRONG. The first pass drew translucent zone circles and bare 2-4px
 * dots on an empty field. Dots on nothing are unreadable: there is no landmark
 * to judge a position against, no way to tell WHO a dot is, and no way to tell
 * where you are currently looking. LoL's minimap works because of three things
 * this had none of — a terrain picture, champion PORTRAITS, and the camera
 * viewport box.
 *
 * THE THREE LAYERS (bottom to top)
 *   1. TERRAIN — the arena's own collision truth (zone discs, rim, obstacles,
 *      spawn pads) baked ONCE into an offscreen canvas by ./minimapTerrain and
 *      blitted every frame; rebuilt only when the map/size/dpr/yaw changes.
 *   2. CHAMPIONS + OBJECTS — circular w3x portraits (the same icons the
 *      shop/HUD use, with the same "no icon → fall back" rule), ringed in the
 *      team colour. Self is bigger with a white ring + chevron; the dead fade
 *      to hollow rings; a champion with no portrait draws a team-coloured
 *      disc. Healing flowers (task #22) are small leaf-green pips.
 *   3. CAMERA VIEWPORT BOX — the real camera frustum projected onto the ground
 *      plane (./minimapMath `cameraGroundQuad` fed by frameBus.cameraView,
 *      which render/CameraRig reads straight off its live camera).
 *
 * ORIENTATION is the rig's own yaw (frameBus.cameraView.yawRad, derived from
 * the camera transform), falling back to the derived CAMERA_YAW_RAD constant —
 * never a hardcoded angle. Up on the map is up on screen.
 *
 * PLACEMENT comes from the HUD corner registry (ui/hud/hudLayout): bottom-right
 * on desktop like LoL, top-left on touch like Wild Rift — see the `minimap`
 * slot for why phone landscape cannot use the bottom-right corner.
 *
 * PERF. Imperative 2D-canvas redraw at ~20 Hz off the frameBus — the same
 * per-frame seam the world-anchor HUD reads — so entity positions never touch
 * React state (client-08). Only discrete phase/visibility gating is React.
 */
import { useEffect, useRef } from "react";
import type { Order } from "@ggd/shared/sim/intents";
import { useHud, hudStore } from "../../net/RoomStore";
import { frameBus, type ArenaZoneCircle } from "../../frameBus";
import { FIRE_RING_SEC } from "../../audio/scene";
import { hudActions } from "../actions";
import { HudSlot, hudTouch } from "./HudSlot";
import { hudSlotHeight, hudSlotWidth } from "./hudLayout";
import { PANEL_BG, PANEL_BORDER, teamCss } from "../theme";
import {
  boundsForZone,
  cameraGroundQuad,
  clampToZones,
  dotColorFor,
  inLocalZone,
  mapToWorld,
  markerSpecFor,
  worldToMap,
  zoneIndexAt,
  CAMERA_YAW_RAD,
  type MapBounds,
} from "./minimapMath";
import { TerrainCache, terrainKey } from "./minimapTerrain";
import { portraitCache } from "./minimapIcons";

/**
 * Redraw interval (20 Hz). DELIBERATELY NOT tied to the snapshot rate: this is
 * a CPU budget for a canvas blit, not a data cadence. It was described as "the
 * snapshot rate" back when both happened to be 20 Hz; the broadcast is now
 * 30 Hz and the map still redraws at 20, which is the right call on the
 * owner's phone. The old map redrew at 12 Hz,
 * which was fine for dots but visibly steps the camera BOX while panning —
 * that box moves continuously, unlike the entities. One blit plus a few dozen
 * shapes is cheap enough to afford the extra 8 frames a second.
 */
const REDRAW_MS = 50;
/** panel chrome around the canvas (padding + 1px border, both sides) */
const PANEL_INSET = 12;
/** the desktop map the marker sizes in minimapMath were tuned against */
const REFERENCE_SIZE = 196;

const CAMERA_BOX = "rgba(255, 255, 255, 0.85)";
const CAMERA_BOX_FILL = "rgba(255, 255, 255, 0.06)";
const DANGER_RIM = "#ff6a3d";
/** revive circle held by an enemy standing in it (matches the world VFX tint) */
const CONTEST_RING = "#ff9e29";

/** Per-entity death timestamps, so dead markers can fade instead of popping. */
type DeadSince = Map<number, number>;

/** Draw the camera's real ground-plane frustum as a viewport rectangle. */
function drawCameraBox(
  ctx: CanvasRenderingContext2D,
  bounds: MapBounds,
  sizePx: number,
  yaw: number,
): void {
  const view = frameBus.cameraView;
  if (!view) return;
  const quad = cameraGroundQuad(view);
  if (!quad) return;
  ctx.beginPath();
  quad.points.forEach((p, i) => {
    const m = worldToMap(p.x, p.z, bounds, sizePx, yaw);
    if (i === 0) ctx.moveTo(m.x, m.y);
    else ctx.lineTo(m.x, m.y);
  });
  ctx.closePath();
  ctx.fillStyle = CAMERA_BOX_FILL;
  ctx.fill();
  ctx.strokeStyle = CAMERA_BOX;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/**
 * Late-round pressure cue: for the final FIRE_RING_SEC of combat the zone rims
 * pulse. NOTE this mirrors the audio director's tension window (the same
 * constant drives the "fireRing" BGM bed) — the sim has no shrinking-ring
 * entity, so the map must not draw one.
 */
function drawDangerRim(
  ctx: CanvasRenderingContext2D,
  bounds: MapBounds,
  sizePx: number,
  yaw: number,
  nowMs: number,
  onlyZone: number | null,
): void {
  const hud = hudStore.getState();
  if (hud.phase !== "combat") return;
  const left = hud.phaseSecondsLeft;
  if (!(left > 0) || left > FIRE_RING_SEC) return;
  const zones = frameBus.arenaZones;
  if (!zones) return;
  const urgency = 1 - left / FIRE_RING_SEC; // 0 at the window's start → 1 at 0s
  const pulse = 0.35 + 0.45 * urgency * (0.6 + 0.4 * Math.sin(nowMs / 220));
  const s = sizePx / Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, pulse));
  ctx.strokeStyle = DANGER_RIM;
  ctx.lineWidth = 2 + 2 * urgency;
  zones.forEach((z, i) => {
    if (!(z.r > 0)) return;
    if (onlyZone !== null && i !== onlyZone) return; // local duel zone only (task #67)
    const c = worldToMap(z.x, z.z, bounds, sizePx, yaw);
    ctx.beginPath();
    ctx.arc(c.x, c.y, z.r * s, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
}

/** One champion marker: portrait (or team disc) + team ring, self chevron. */
function drawChampion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  anchor: { championId: string; teamId: number; color?: string },
  spec: NonNullable<ReturnType<typeof markerSpecFor>>,
): void {
  ctx.save();
  ctx.globalAlpha = spec.alpha;

  if (spec.style === "dead") {
    // hollow ring — "this champion is down", still readable as their team
    ctx.strokeStyle = spec.ringColor;
    ctx.lineWidth = spec.ringWidth;
    ctx.beginPath();
    ctx.arc(x, y, spec.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const portrait = portraitCache.portraitFor(anchor.championId);
  ctx.beginPath();
  ctx.arc(x, y, spec.radius, 0, Math.PI * 2);
  if (portrait) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(portrait, x - spec.radius, y - spec.radius, spec.radius * 2, spec.radius * 2);
    ctx.restore();
  } else {
    // FALLBACK (never blank): a team-coloured disc with a darker core, so an
    // icon-less champion still reads as a champion of that team.
    ctx.fillStyle = spec.color;
    ctx.fill();
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.arc(x, y, spec.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // team ring (self gets the bright white one over a team-coloured backing)
  if (spec.style === "self") {
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = spec.ringWidth + 2;
    ctx.beginPath();
    ctx.arc(x, y, spec.radius + spec.ringWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = spec.ringColor;
  ctx.lineWidth = spec.ringWidth;
  ctx.beginPath();
  ctx.arc(x, y, spec.radius, 0, Math.PI * 2);
  ctx.stroke();

  if (spec.style === "self") {
    // chevron above the ring — find yourself without hunting for the ring hue
    const top = y - spec.radius - spec.ringWidth - 1;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x, top - 4.5);
    ctx.lineTo(x - 4, top + 0.5);
    ctx.lineTo(x + 4, top + 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Revive circles (task #84) — a team-tinted ring at the circle's TRUE world
 * radius with a clockwise progress arc, drawn UNDER the champion markers so a
 * teammate standing in it is never hidden by it. This is the "where do I run"
 * cue: the dead player is spectating a fixed camera and the minimap is the
 * only place that shows the rescue point relative to the whole zone.
 *
 * Zone scoping is deliberately parameterised (`onlyZone`) rather than
 * hardcoded — task #67 is narrowing the whole map to the local duel zone, and
 * this hands it the seam instead of a second thing to rip out.
 */
function drawReviveCircles(
  ctx: CanvasRenderingContext2D,
  bounds: MapBounds,
  sizePx: number,
  yaw: number,
  scale: number,
  onlyZone: number | null,
): void {
  const s = sizePx / Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  for (const c of frameBus.reviveCircles) {
    if (onlyZone !== null && c.zone !== onlyZone) continue;
    const p = worldToMap(c.worldX, c.worldZ, bounds, sizePx, yaw);
    // the ring is small in world units, so enforce a legibility floor in px
    const r = Math.max(4 * scale, c.radius * s);
    const color = c.contested ? CONTEST_RING : teamCss(c.teamId);
    ctx.save();
    // Flat alpha: the ring used to fade toward its expiry, but it no longer has
    // one (task #196), so a live circle always reads at full strength.
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * scale;
    ctx.setLineDash([3 * scale, 2 * scale]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // progress arc: solid, thicker, from 12 o'clock clockwise
    if (c.progress > 0) {
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2.4 * scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + c.progress * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * The duel zone the LOCAL champion currently stands in (task #67) — the map
 * shows ONLY this one 3v3, never the whole four-zone arena. Derived from the
 * live anchor position (not a fixed seat→zone table) so it stays correct even
 * if a mode ever moves a player between zones. Null when there is no local
 * champion resolved yet (pre-spawn / spectating / before the entity id lands),
 * and the callers then fall back to the whole-arena view.
 */
function localZoneIndex(zones: ArenaZoneCircle[] | null): number | null {
  const localEntityId = hudStore.getState().localEntityId;
  if (localEntityId === null || !zones) return null;
  const me = frameBus.champions.get(localEntityId);
  if (!me) return null;
  return zoneIndexAt({ x: me.worldX, z: me.worldZ }, zones);
}

/** One throttled frame: terrain blit → danger rim → camera box → markers. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  terrain: TerrainCache,
  sizePx: number,
  dpr: number,
  deadSince: DeadSince,
  nowMs: number,
): void {
  ctx.clearRect(0, 0, sizePx, sizePx);
  const zones = frameBus.arenaZones;
  // task #67: narrow the whole map to the LOCAL player's own duel zone. Bounds,
  // terrain, markers and the danger rim are all scoped to it; a null zone
  // (spectating / pre-spawn) degrades to the whole-arena view.
  const localZone = localZoneIndex(zones);
  const bounds = boundsForZone(zones, localZone);
  if (!zones || !bounds) return;
  // orientation: the rig's measured yaw, else the derived fixed-rig constant
  const yaw = frameBus.cameraView?.yawRad ?? CAMERA_YAW_RAD;
  // terrain bakes only the zone(s) the map actually shows — a single disc when
  // scoped, so the other three 3v3s never bleed into the baked background
  const shownZones = localZone !== null && zones[localZone] ? [zones[localZone]!] : zones;

  // --- 1) baked terrain background -----------------------------------------
  const image = terrain.imageFor({
    key: terrainKey(frameBus.arenaId, shownZones, sizePx, dpr, yaw),
    zones: shownZones,
    bounds,
    sizePx,
    dpr,
    yawRad: yaw,
  });
  if (image) ctx.drawImage(image, 0, 0, sizePx, sizePx);

  drawDangerRim(ctx, bounds, sizePx, yaw, nowMs, localZone);

  // --- 2) entities ---------------------------------------------------------
  const localEntityId = hudStore.getState().localEntityId;
  const scale = sizePx / REFERENCE_SIZE;
  // revive circles paint UNDER the champion markers (a ring must never hide
  // the teammate who is standing in it) — scoped to the local zone (task #67)
  drawReviveCircles(ctx, bounds, sizePx, yaw, scale, localZone);
  for (const a of frameBus.champions.values()) {
    // task #67: only the local player's own duel zone is on the map — a
    // champion (or flower) fighting in another 3v3 is filtered out entirely
    if (!inLocalZone(a.worldX, a.worldZ, zones, localZone)) continue;
    const p = worldToMap(a.worldX, a.worldZ, bounds, sizePx, yaw);
    if (a.teamId < 0) {
      // neutral healing flower (task #22) — a small glowing green pip
      if (!a.alive) continue; // consumed flowers vanish immediately
      const r = 2.6 * scale;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = dotColorFor(a.teamId, a.color);
      ctx.shadowColor = dotColorFor(a.teamId, a.color);
      ctx.shadowBlur = 6 * scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    if (!a.alive) {
      let since = deadSince.get(a.entityId);
      if (since === undefined) {
        since = nowMs;
        deadSince.set(a.entityId, since);
      }
      const spec = markerSpecFor(a, localEntityId, { scale, deadAgeMs: nowMs - since });
      if (spec) drawChampion(ctx, p.x, p.y, a, spec);
      continue;
    }
    deadSince.delete(a.entityId); // respawned
    const spec = markerSpecFor(a, localEntityId, { scale });
    if (spec) drawChampion(ctx, p.x, p.y, a, spec);
  }

  // --- 3) camera viewport box, LAST ----------------------------------------
  // LoL paints it under the champion icons, but LoL's box is many times an
  // icon's size. Ours is not: at the default closest dolly the visible ground
  // is ~11-21 world units on a ~140-unit map, i.e. about the width of the self
  // marker — drawn underneath, it disappears behind your own portrait exactly
  // when you need it. It is a 1.5px outline, so painting it on top costs no
  // marker legibility and keeps "where am I looking" always readable.
  drawCameraBox(ctx, bounds, sizePx, yaw);

  // prune fade-state for entities that left the bus (map teardown/restart)
  for (const id of deadSince.keys()) {
    if (!frameBus.champions.has(id)) deadSince.delete(id);
  }
}

export function Minimap(): React.JSX.Element | null {
  const connected = useHud((s) => s.connected);
  const phase = useHud((s) => s.phase);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const deadSinceRef = useRef<DeadSince>(new Map());
  const terrainRef = useRef<TerrainCache>(new TerrainCache());

  const touch = hudTouch();
  // Full-screen panels own champ select / settlement; the map only aids play.
  // INTERMISSION is now its own scene entirely — a dusk market, not the arena
  // (task #38) — so a minimap of a battlefield nobody is standing in would be
  // both meaningless and, floating over the merchant, actively confusing. The
  // map is an ARENA instrument; it goes away with the arena.
  const visible =
    connected && phase !== "champSelect" && phase !== "matchEnd" && phase !== "intermission";
  const panelW = hudSlotWidth("minimap", touch);
  const panelH = hudSlotHeight("minimap", touch);
  const sizePx = Math.min(panelW, panelH) - PANEL_INSET;

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const terrain = terrainRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(sizePx * dpr);
    canvas.height = Math.round(sizePx * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let last = 0;
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      if (now - last < REDRAW_MS) return;
      last = now;
      drawFrame(ctx, terrain, sizePx, dpr, deadSinceRef.current, now);
    };
    raf = requestAnimationFrame(loop);
    // the baked terrain deliberately OUTLIVES this effect: its key already
    // covers size/dpr/map/yaw, so a phase toggle (intermission ⇄ combat) reuses
    // the existing image instead of repainting it. It dies with the component.
    return () => cancelAnimationFrame(raf);
  }, [visible, sizePx]);

  /** Canvas-relative click → world point (exact inverse of the projection). */
  const worldAt = (ev: React.PointerEvent | React.MouseEvent): { x: number; z: number } | null => {
    const zones = frameBus.arenaZones;
    // MUST match drawFrame's zone scoping (task #67): the map draws the local
    // player's own zone, so a click has to invert against the SAME single-zone
    // bounds or it would resolve to the wrong world point.
    const bounds = boundsForZone(zones, localZoneIndex(zones));
    if (!bounds) return null;
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width <= 0) return null;
    const yaw = frameBus.cameraView?.yawRad ?? CAMERA_YAW_RAD;
    // the canvas is square and CSS-sized to sizePx, but read the real rect so
    // a browser zoom / scaled layout still maps clicks correctly
    const mx = ((ev.clientX - rect.left) / rect.width) * sizePx;
    const my = ((ev.clientY - rect.top) / rect.height) * sizePx;
    return mapToWorld(mx, my, bounds, sizePx, yaw);
  };

  if (!visible) return null;

  // TOUCH: the map is display-only. The floating joystick is spawned by a touch
  // anywhere on the LEFT HALF of #game-canvas (see input/TouchInput) — which is
  // exactly where the map now lives — so making it tappable would swallow
  // movement input. Peeking is a desktop affordance anyway: on a phone the
  // camera is one thumb-drag from anywhere.
  const interactive = !touch;

  return (
    <HudSlot
      slot="minimap"
      interactive={interactive}
      style={{
        boxSizing: "border-box",
        width: panelW,
        height: panelH,
        padding: 5,
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 10,
        // no browser pan/zoom gesture on the map (matches #game-canvas)
        touchAction: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="minimap"
        style={{
          display: "block",
          width: sizePx,
          height: sizePx,
          borderRadius: 6,
          cursor: interactive ? "crosshair" : "default",
        }}
        onPointerDown={
          interactive
            ? (ev) => {
                if (ev.button !== 0) return; // right button is handled below
                const p = worldAt(ev);
                if (p) hudActions.focusWorld(p); // camera-only peek
              }
            : undefined
        }
        onPointerMove={
          interactive
            ? (ev) => {
                if ((ev.buttons & 1) === 0) return; // drag-to-scrub, like LoL
                const p = worldAt(ev);
                if (p) hudActions.focusWorld(p);
              }
            : undefined
        }
        onContextMenu={
          interactive
            ? (ev) => {
                ev.preventDefault(); // no browser menu over the map
                const p = worldAt(ev);
                if (!p) return;
                // clamp into the nearest zone so a click on the padding is
                // still a legal destination, then use the normal order seam
                const target = clampToZones(p, frameBus.arenaZones);
                const order: Order = { kind: "move", point: { x: target.x, z: target.z } };
                hudActions.sendOrder(order);
              }
            : undefined
        }
      />
    </HudSlot>
  );
}
