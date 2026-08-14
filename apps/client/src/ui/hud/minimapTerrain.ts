/**
 * minimapTerrain — the minimap's BAKED base layer.
 *
 * WHY: the old minimap drew translucent zone circles + bare dots on an empty
 * field, so there was nothing to read a position AGAINST. LoL's minimap is
 * legible because the markers sit on a picture of the map. Here that picture is
 * the arena's own collision truth, drawn top-down: the zone discs, the rim, the
 * blocking obstacles the sim collides against (task #29 audited these per
 * arena) and the two spawn pads of each zone.
 *
 * HOW: the terrain never changes while a map is loaded, so it is rendered ONCE
 * into an offscreen canvas and blitted every frame. `terrainKey` is the cache
 * identity (arena + geometry + size + dpr + yaw); when it changes the canvas is
 * repainted, and only then.
 *
 * The GEOMETRY is derived by `terrainShapes`, a pure world→map function that is
 * unit-tested in node; the painter below only strokes/fills what it returns.
 */
import type { ArenaZoneCircle } from "../../frameBus";
import { CAMERA_YAW_RAD, mapScale, worldToMap, type MapBounds } from "./minimapMath";

/** One baked terrain primitive, already in map-canvas px. */
export type TerrainShape =
  | { kind: "zone"; x: number; y: number; r: number }
  // ⭐ GH#324 —— 矩形可玩範圍與有厚度的牆。⛔ 不用圓近似（見 frameBus 的註解）。
  | { kind: "zoneRect"; x: number; y: number; w: number; h: number }
  | { kind: "boxWall"; x: number; y: number; w: number; h: number }
  | { kind: "obstacle"; x: number; y: number; r: number }
  | { kind: "wall"; x1: number; y1: number; x2: number; y2: number; width: number }
  | { kind: "spawn"; x: number; y: number; r: number; side: number };

/** Minimum painted radius (px) so a 0.5-unit pebble never vanishes entirely. */
const MIN_OBSTACLE_PX = 1.6;
/** Spawn pad marker radius (px) — a small pip per spawn point. */
const SPAWN_PIP_PX = 2.2;

/**
 * World geometry → map-space shapes, in paint order (zones, then the obstacles
 * and spawn pads inside them). Pure: no canvas, no DOM.
 */
export function terrainShapes(
  zones: readonly ArenaZoneCircle[],
  bounds: MapBounds,
  sizePx: number,
  yawRad: number = CAMERA_YAW_RAD,
): TerrainShape[] {
  const s = mapScale(bounds, sizePx);
  const out: TerrainShape[] = [];
  for (const z of zones) {
    if (!(z.r > 0)) continue;
    const c = worldToMap(z.x, z.z, bounds, sizePx, yawRad);
    if (z.rect !== undefined) {
      out.push({
        kind: "zoneRect",
        x: c.x,
        y: c.y,
        w: z.rect.halfW * 2 * s,
        h: z.rect.halfD * 2 * s,
      });
    } else {
      out.push({ kind: "zone", x: c.x, y: c.y, r: z.r * s });
    }
  }
  for (const z of zones) {
    if (!(z.r > 0)) continue;
    for (const ob of z.obstacles ?? []) {
      if (ob.kind === "circle") {
        const p = worldToMap(ob.x, ob.z, bounds, sizePx, yawRad);
        out.push({ kind: "obstacle", x: p.x, y: p.y, r: Math.max(MIN_OBSTACLE_PX, ob.r * s) });
      } else if (ob.kind === "box") {
        const p = worldToMap(ob.x, ob.z, bounds, sizePx, yawRad);
        out.push({
          kind: "boxWall",
          x: p.x,
          y: p.y,
          w: Math.max(MIN_OBSTACLE_PX, ob.halfW * 2 * s),
          h: Math.max(MIN_OBSTACLE_PX, ob.halfD * 2 * s),
        });
      } else {
        const a = worldToMap(ob.ax, ob.az, bounds, sizePx, yawRad);
        const b = worldToMap(ob.bx, ob.bz, bounds, sizePx, yawRad);
        out.push({ kind: "wall", x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: MIN_OBSTACLE_PX });
      }
    }
    (z.spawns ?? []).forEach((side, si) => {
      for (const sp of side) {
        const p = worldToMap(sp.x, sp.z, bounds, sizePx, yawRad);
        out.push({ kind: "spawn", x: p.x, y: p.y, r: SPAWN_PIP_PX, side: si });
      }
    });
  }
  return out;
}

/**
 * Cache identity of a baked terrain image. Two renders with the same key are
 * pixel-identical, so the canvas is only repainted when this string changes —
 * i.e. on a map swap, a resize, a DPR change or a camera-yaw change.
 */
export function terrainKey(
  arenaId: string | null,
  zones: readonly ArenaZoneCircle[] | null,
  sizePx: number,
  dpr: number,
  yawRad: number,
): string {
  if (!zones || zones.length === 0) return "";
  // arenaId alone is not enough: the skeleton fallback and a hot-reloaded doc
  // can both report the same id, so the zone geometry is folded in as well.
  const geom = zones
    .map(
      (z) =>
        `${z.x},${z.z},${z.r},${z.obstacles?.length ?? 0},${(z.spawns ?? []).reduce((n, s) => n + s.length, 0)}`,
    )
    .join("|");
  return `${arenaId ?? "?"}#${geom}@${sizePx}x${dpr.toFixed(2)}y${yawRad.toFixed(4)}`;
}

// --- palette (dark slate ground, lit rim, darker pillars — reads at 1:1) ----
const GROUND_FILL = "#1b2334";
const GROUND_EDGE = "rgba(150, 176, 232, 0.75)";
const GROUND_INNER = "rgba(120, 148, 205, 0.18)";
const OBSTACLE_FILL = "#39456080";
const OBSTACLE_EDGE = "rgba(158, 178, 222, 0.5)";
const SPAWN_FILL = ["rgba(120, 190, 255, 0.75)", "rgba(255, 150, 120, 0.75)"] as const;

/**
 * Paint the baked shapes into a 2D context sized `sizePx` square (the caller
 * has already applied the DPR transform). Dumb on purpose — every decision that
 * could be wrong lives in `terrainShapes`.
 */
export function paintTerrain(
  ctx: CanvasRenderingContext2D,
  shapes: readonly TerrainShape[],
  sizePx: number,
): void {
  ctx.clearRect(0, 0, sizePx, sizePx);
  // ⭐ GH#324 —— 矩形可玩範圍。⛔ 畫在圓盤那一圈**之前**，兩者互斥（一個分區
  // 只會產出其中一種），分開兩個迴圈只是為了讓每一段的樣式自成一體。
  for (const s of shapes) {
    if (s.kind !== "zoneRect") continue;
    ctx.fillStyle = GROUND_FILL;
    ctx.fillRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
    ctx.strokeStyle = GROUND_INNER;
    ctx.lineWidth = Math.max(2, Math.min(s.w, s.h) * 0.04);
    ctx.strokeRect(
      s.x - s.w / 2 + ctx.lineWidth / 2,
      s.y - s.h / 2 + ctx.lineWidth / 2,
      s.w - ctx.lineWidth,
      s.h - ctx.lineWidth,
    );
    ctx.strokeStyle = GROUND_EDGE;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
  }
  for (const s of shapes) {
    if (s.kind !== "zone") continue;
    // ground disc + a soft inner ring so the rim reads as a wall, not a line
    ctx.fillStyle = GROUND_FILL;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = GROUND_INNER;
    ctx.lineWidth = Math.max(2, s.r * 0.06);
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(0, s.r - ctx.lineWidth / 2), 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = GROUND_EDGE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // ⭐ 有厚度的牆。⛔ 不用圓近似 —— 一面 24 格寬的牆壓成外接圓就變成一顆大圓圈。
  for (const s of shapes) {
    if (s.kind !== "boxWall") continue;
    ctx.fillStyle = OBSTACLE_FILL;
    ctx.strokeStyle = OBSTACLE_EDGE;
    ctx.lineWidth = 1;
    ctx.fillRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
    ctx.strokeRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
  }
  for (const s of shapes) {
    if (s.kind === "obstacle") {
      ctx.fillStyle = OBSTACLE_FILL;
      ctx.strokeStyle = OBSTACLE_EDGE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (s.kind === "wall") {
      ctx.strokeStyle = OBSTACLE_EDGE;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    } else if (s.kind === "spawn") {
      ctx.fillStyle = SPAWN_FILL[s.side % SPAWN_FILL.length]!;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Lazily-baked terrain image. `imageFor` returns a canvas ready to blit,
 * repainting only when the cache key changes (map swap / resize / DPR / yaw).
 */
export class TerrainCache {
  private key = "";
  private canvas: HTMLCanvasElement | null = null;
  /** repaint counter — the invalidation test asserts against this */
  paints = 0;

  /** Current cache key (""/no terrain baked yet). */
  get currentKey(): string {
    return this.key;
  }

  imageFor(args: {
    key: string;
    zones: readonly ArenaZoneCircle[];
    bounds: MapBounds;
    sizePx: number;
    dpr: number;
    yawRad: number;
    /** injected in tests; defaults to a real <canvas> */
    createCanvas?: () => HTMLCanvasElement;
  }): HTMLCanvasElement | null {
    if (!args.key) return null;
    if (this.canvas && this.key === args.key) return this.canvas;
    const canvas =
      args.createCanvas?.() ?? (typeof document === "undefined" ? null : document.createElement("canvas"));
    if (!canvas) return null;
    canvas.width = Math.max(1, Math.round(args.sizePx * args.dpr));
    canvas.height = canvas.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(args.dpr, 0, 0, args.dpr, 0, 0);
    paintTerrain(ctx, terrainShapes(args.zones, args.bounds, args.sizePx, args.yawRad), args.sizePx);
    this.canvas = canvas;
    this.key = args.key;
    this.paints++;
    return canvas;
  }

  dispose(): void {
    this.canvas = null;
    this.key = "";
  }
}
