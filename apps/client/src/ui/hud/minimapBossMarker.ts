/**
 * 殭屍王的小地圖標記 (task #262) —— the other half of 「王要看得見」.
 *
 * THE GAP THIS CLOSES. v0.9.11 gave the king a 降臨橫幅 and a 分紅結算 panel, and
 * both work. Neither tells you WHERE IT IS. The banner is a top-of-screen
 * announcement that fades; after it goes, a 10×-size, 100×-hp creep is walking
 * around a zone you may not be looking at, and the only way to find it is to
 * sweep the camera. The map this is ported from did not have that problem —
 * `war3map.j:11824` calls `PingMinimapLocForForce(GetPlayersAll(), …, 3.00)` in
 * the very same block that spawns the king, one line after `SetHeroLevelBJ`.
 * This is that ping, except it is not a 3-second flash: it persists for as long
 * as the king is alive, because ours is a battlefield objective you hunt rather
 * than an ambush you are warned about once.
 *
 * WHY IT IS NOT A CHAMPION ANCHOR — see `frameBus.MobBossMarker`. In short: the
 * mob cull that keeps 50 zombies off the map is correct and stays; the king gets
 * exactly one dedicated slot.
 *
 * SPLIT INTO SPEC + DRAW ON PURPOSE. `bossMarkerSpecFor` decides EVERYTHING
 * observable — whether to draw at all, how big, how bright, how hard it pulses —
 * and returns plain numbers, so the decisions are testable without a canvas.
 * `drawBossMarker` then does nothing but issue 2D calls from that spec, and it
 * RETURNS whether it painted, so a test can catch the failure where the spec is
 * computed correctly and then nothing is ever drawn (失敗形態 ②).
 */
import type { MobBossMarker } from "../../frameBus";

/** 殭屍王 crimson — deliberately unlike any team colour and unlike the fire ring. */
export const BOSS_MARKER_COLOR = "#ff2d55";
/** the bone-white rim that makes the pip readable on the dark terrain bake */
export const BOSS_MARKER_RIM = "#ffe9ee";

/** Base pip radius in px at the reference (196px desktop) map. */
const BASE_RADIUS = 5.2;
/** How far past the pip the halo reaches at full pulse, in px. */
const HALO_REACH = 6.5;
/** One full pulse cycle, ms. ~1.1Hz — a heartbeat, not a strobe. */
export const BOSS_PULSE_MS = 900;

/** Everything the draw step needs. Pure numbers; no canvas, no time. */
export interface BossMarkerSpec {
  worldX: number;
  worldZ: number;
  /** solid pip radius, px */
  radius: number;
  /** outer halo radius, px — always > radius, breathes with `pulse` */
  haloRadius: number;
  /** 0..1 triangle wave; 0 = halo at its tightest, 1 = widest */
  pulse: number;
  /** 0..1 remaining health, so a nearly-dead king reads differently */
  hpPct: number;
  color: string;
  rimColor: string;
}

/**
 * A 0..1 TRIANGLE wave. Deliberately not `Math.sin`: a triangle is exactly
 * predictable at its endpoints and midpoint, so a test can assert 0, 1 and 0.5
 * at named times instead of comparing floats against a transcendental. (This is
 * client code — `sim/purity.test.ts` does not reach here — so the choice is
 * about testability, not about the purity ban.)
 */
export function bossPulseAt(nowMs: number, periodMs: number = BOSS_PULSE_MS): number {
  if (!(periodMs > 0) || !Number.isFinite(nowMs)) return 0;
  const t = ((nowMs % periodMs) + periodMs) % periodMs; // never negative
  const half = periodMs / 2;
  return t < half ? t / half : 2 - t / half;
}

/**
 * The king's marker for this frame, or null when nothing should be drawn.
 *
 * RETURNS NULL, AND EACH null IS A DIFFERENT REAL CASE:
 *   · no king on the field (`marker` is null — the bus clears it on teardown and
 *     on death, so "alive" needs no separate flag here);
 *   · the king is fighting in ANOTHER duel zone. Task #67 scopes the whole map to
 *     the local player's zone, and an objective you cannot reach must not appear
 *     on a map that shows only where you can go. `localZone < 0` (spectating the
 *     whole arena) shows it regardless, matching `bossVisibleInZone`.
 */
export function bossMarkerSpecFor(
  marker: MobBossMarker | null,
  localZone: number,
  nowMs: number,
  scale: number = 1,
): BossMarkerSpec | null {
  if (!marker) return null;
  if (localZone >= 0 && marker.zone >= 0 && marker.zone !== localZone) return null;

  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const pulse = bossPulseAt(nowMs);
  const hpPct = Math.max(0, Math.min(1, Number.isFinite(marker.hpPct) ? marker.hpPct : 1));
  const radius = BASE_RADIUS * s;
  return {
    worldX: marker.worldX,
    worldZ: marker.worldZ,
    radius,
    // The halo BREATHES WIDER AS THE KING DIES: at full health it swings over
    // the bottom half of the reach, and by execute range it uses the whole of
    // it. So "the thing is nearly down" is legible from the map alone, which is
    // the moment every player wants to know about.
    haloRadius: radius + HALO_REACH * s * (0.5 + 0.5 * (1 - hpPct)) * (0.35 + 0.65 * pulse),
    pulse,
    hpPct,
    color: BOSS_MARKER_COLOR,
    rimColor: BOSS_MARKER_RIM,
  };
}

/** The 2D subset this module needs — keeps the test's fake honest and small. */
export type BossMarkerCtx = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "beginPath"
  | "arc"
  | "fill"
  | "stroke"
  | "moveTo"
  | "lineTo"
  | "closePath"
> & {
  globalAlpha: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  shadowColor: string;
  shadowBlur: number;
};

/**
 * Paint the king. Returns TRUE when it actually drew something.
 *
 * The boolean is not decoration: without it a caller could hold a perfectly
 * correct spec and paint nothing, and every assertion about the spec would still
 * pass. `Minimap.tsx` ignores the value; the guard reads it.
 *
 * `toMap` is the caller's world→map projection (yaw, bounds and size all live in
 * `Minimap.tsx`), so this module never has to know the map's geometry.
 */
export function drawBossMarker(
  ctx: BossMarkerCtx,
  spec: BossMarkerSpec | null,
  toMap: (worldX: number, worldZ: number) => { x: number; y: number },
): boolean {
  if (!spec) return false;
  const p = toMap(spec.worldX, spec.worldZ);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;

  ctx.save();

  // 1) the breathing halo — this is the part that catches the eye in peripheral
  //    vision, which is the whole job of a ping.
  ctx.globalAlpha = 0.28 + 0.32 * spec.pulse;
  ctx.strokeStyle = spec.color;
  ctx.lineWidth = 2 * (spec.radius / BASE_RADIUS);
  ctx.beginPath();
  ctx.arc(p.x, p.y, spec.haloRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 2) the solid pip, glowing, so it stays findable when the halo is at its
  //    dimmest.
  ctx.globalAlpha = 1;
  ctx.shadowColor = spec.color;
  ctx.shadowBlur = 8 * (spec.radius / BASE_RADIUS);
  ctx.fillStyle = spec.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, spec.radius, 0, Math.PI * 2);
  ctx.fill();

  // 3) a bone-white crown: three spikes, so at a glance it is a KING and not
  //    another neutral objective pip (the flower and the guardian are both plain
  //    discs, and #262's king must not read as "another harvest flower").
  ctx.shadowBlur = 0;
  ctx.strokeStyle = spec.rimColor;
  ctx.lineWidth = 1.4 * (spec.radius / BASE_RADIUS);
  const r = spec.radius;
  ctx.beginPath();
  ctx.moveTo(p.x - r, p.y + r * 0.55);
  ctx.lineTo(p.x - r, p.y - r * 0.35);
  ctx.lineTo(p.x - r * 0.5, p.y + r * 0.1);
  ctx.lineTo(p.x, p.y - r * 0.75);
  ctx.lineTo(p.x + r * 0.5, p.y + r * 0.1);
  ctx.lineTo(p.x + r, p.y - r * 0.35);
  ctx.lineTo(p.x + r, p.y + r * 0.55);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
  return true;
}
