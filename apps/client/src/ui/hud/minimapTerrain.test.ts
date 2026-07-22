/**
 * client-22 (hud-minimap-terrain): the minimap's baked base layer.
 *
 * Two things must hold. (1) GEOMETRY: the terrain is the arena's own collision
 * truth projected with the SAME world→map function as the markers, so a pillar
 * drawn on the map is exactly where the pillar the player bumps into is.
 * (2) CACHING: it is baked once and blitted, and it is re-baked exactly when
 * something that changes the picture changes — a map swap, a resize, a DPR
 * change or a camera-yaw change — and never otherwise.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { ArenaZoneCircle } from "../../frameBus";
import { boundsFromZones, worldToMap, mapScale } from "./minimapMath";
import { TerrainCache, terrainKey, terrainShapes } from "./minimapTerrain";

const SIZE = 196;

/** Two zones with a pillar and 2×1 spawns each — the PairedDuels shape. */
const ZONES: ArenaZoneCircle[] = [
  {
    x: -40,
    z: 0,
    r: 24,
    obstacles: [
      { kind: "circle", x: -40, z: 0, r: 2.5 },
      { kind: "segment", ax: -50, az: -6, bx: -50, bz: 6 },
    ],
    spawns: [[{ x: -56, z: 0 }], [{ x: -24, z: 0 }]],
  },
  { x: 40, z: 0, r: 24, obstacles: [{ kind: "circle", x: 40, z: 0, r: 0.4 }], spawns: [[], []] },
];

const bounds = () => boundsFromZones(ZONES)!;

describe("minimap terrain geometry (hud-minimap-terrain)", () => {
  it("projects zones/obstacles/spawns with the SAME transform as the markers", () => {
    cover("hud-minimap-terrain");
    const b = bounds();
    const shapes = terrainShapes(ZONES, b, SIZE);
    const s = mapScale(b, SIZE);

    const zoneShapes = shapes.filter((x) => x.kind === "zone");
    expect(zoneShapes).toHaveLength(2);
    const left = zoneShapes[0]!;
    const expected = worldToMap(-40, 0, b, SIZE);
    expect(left.x).toBeCloseTo(expected.x);
    expect(left.y).toBeCloseTo(expected.y);
    expect(left.r).toBeCloseTo(24 * s);

    // the central pillar lands on the zone centre, at its real radius
    const obstacles = shapes.filter((x) => x.kind === "obstacle");
    const pillar = obstacles.find((x) => Math.abs(x.r - 2.5 * s) < 1e-6);
    expect(pillar).toBeDefined();
    expect(pillar!.x).toBeCloseTo(expected.x);
    expect(pillar!.y).toBeCloseTo(expected.y);

    // wall segments survive as walls, with both endpoints projected
    const wall = shapes.filter((x) => x.kind === "wall")[0]!;
    expect(wall).toBeDefined();
    const a = worldToMap(-50, -6, b, SIZE);
    const c = worldToMap(-50, 6, b, SIZE);
    expect(wall.x1).toBeCloseTo(a.x);
    expect(wall.y1).toBeCloseTo(a.y);
    expect(wall.x2).toBeCloseTo(c.x);
    expect(wall.y2).toBeCloseTo(c.y);

    // one pip per spawn point, tagged with its side so the two read differently
    const spawns = shapes.filter((x) => x.kind === "spawn");
    expect(spawns).toHaveLength(2);
    expect(new Set(spawns.map((x) => x.kind === "spawn" && x.side))).toEqual(new Set([0, 1]));
  });

  it("keeps sub-unit props visible instead of shrinking them to nothing", () => {
    cover("hud-minimap-terrain");
    // the 0.4-unit pebble in zone 1 would be <1px; it is floored to a visible dot
    const shapes = terrainShapes(ZONES, bounds(), SIZE);
    for (const s of shapes) {
      if (s.kind === "obstacle") expect(s.r).toBeGreaterThanOrEqual(1.5);
    }
  });

  it("zones are painted before the things standing on them", () => {
    cover("hud-minimap-terrain");
    const shapes = terrainShapes(ZONES, bounds(), SIZE);
    const lastZone = shapes.map((s) => s.kind).lastIndexOf("zone");
    const firstProp = shapes.findIndex((s) => s.kind !== "zone");
    expect(firstProp).toBeGreaterThan(lastZone);
  });

  it("tolerates an arena with no obstacle/spawn data at all", () => {
    cover("hud-minimap-terrain");
    const bare: ArenaZoneCircle[] = [{ x: 0, z: 0, r: 10 }];
    const shapes = terrainShapes(bare, boundsFromZones(bare)!, SIZE);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.kind).toBe("zone");
    // a degenerate zone contributes nothing rather than a NaN circle
    expect(terrainShapes([{ x: 0, z: 0, r: 0 }], { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, SIZE)).toEqual([]);
  });
});

describe("minimap terrain cache (hud-minimap-terrain)", () => {
  it("the key changes exactly when the picture would change", () => {
    cover("hud-minimap-terrain");
    const base = terrainKey("arena.castle", ZONES, SIZE, 2, 0);
    expect(base).not.toBe("");
    // identical inputs → identical key (so nothing repaints)
    expect(terrainKey("arena.castle", ZONES, SIZE, 2, 0)).toBe(base);
    // every input that alters the bake must alter the key
    expect(terrainKey("arena.dota", ZONES, SIZE, 2, 0)).not.toBe(base);
    expect(terrainKey("arena.castle", ZONES, SIZE + 1, 2, 0)).not.toBe(base);
    expect(terrainKey("arena.castle", ZONES, SIZE, 1, 0)).not.toBe(base);
    expect(terrainKey("arena.castle", ZONES, SIZE, 2, Math.PI / 2)).not.toBe(base);
    // …including a same-id doc whose GEOMETRY changed (editor hot-reload)
    const moved = ZONES.map((z) => ({ ...z, x: z.x + 1 }));
    expect(terrainKey("arena.castle", moved, SIZE, 2, 0)).not.toBe(base);
    const fewerProps = [{ ...ZONES[0]!, obstacles: [] }, ZONES[1]!];
    expect(terrainKey("arena.castle", fewerProps, SIZE, 2, 0)).not.toBe(base);
    // no arena → no key → nothing to blit
    expect(terrainKey(null, null, SIZE, 2, 0)).toBe("");
    expect(terrainKey("arena.castle", [], SIZE, 2, 0)).toBe("");
  });

  it("bakes once and reuses it, then re-bakes on invalidation", () => {
    cover("hud-minimap-terrain");
    const cache = new TerrainCache();
    const painted: { w: number; h: number }[] = [];
    const createCanvas = (): HTMLCanvasElement => stubCanvas(painted);
    const args = (key: string, dpr = 2) => ({
      key,
      zones: ZONES,
      bounds: bounds(),
      sizePx: SIZE,
      dpr,
      yawRad: 0,
      createCanvas,
    });

    const k1 = terrainKey("arena.castle", ZONES, SIZE, 2, 0);
    const first = cache.imageFor(args(k1));
    expect(first).not.toBeNull();
    expect(cache.paints).toBe(1);
    expect(painted[0]).toEqual({ w: SIZE * 2, h: SIZE * 2 }); // DPR-scaled backing store

    // …twelve more frames of the same map cost nothing
    for (let i = 0; i < 12; i++) expect(cache.imageFor(args(k1))).toBe(first);
    expect(cache.paints).toBe(1);

    // map swap → exactly one repaint
    const k2 = terrainKey("arena.dota", ZONES, SIZE, 2, 0);
    const second = cache.imageFor(args(k2));
    expect(cache.paints).toBe(2);
    expect(second).not.toBe(first);
    expect(cache.currentKey).toBe(k2);

    // an empty key (no arena yet) yields nothing and paints nothing
    expect(cache.imageFor(args(""))).toBeNull();
    expect(cache.paints).toBe(2);

    // dispose forces the next frame to re-bake (match teardown / remount)
    cache.dispose();
    expect(cache.currentKey).toBe("");
    cache.imageFor(args(k2));
    expect(cache.paints).toBe(3);
  });
});

/** Minimal 2D-context stub: records the backing-store size, swallows the paint. */
function stubCanvas(painted: { w: number; h: number }[]): HTMLCanvasElement {
  const calls: string[] = [];
  const ctx = new Proxy(
    {
      canvas: null as unknown,
      setTransform: () => {},
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      moveTo: () => {},
      lineTo: () => {},
      fill: () => {},
      stroke: () => {},
      calls,
    },
    {
      get(target, prop) {
        const v = (target as Record<string | symbol, unknown>)[prop];
        if (typeof v === "function") {
          return (...a: unknown[]) => {
            calls.push(String(prop));
            return (v as (...x: unknown[]) => unknown)(...a);
          };
        }
        return v;
      },
      set() {
        return true; // fillStyle / lineWidth / lineCap assignments
      },
    },
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  // record the size AFTER TerrainCache sets it, via a one-shot microtask-free hook
  Object.defineProperty(canvas, "getContext", {
    value: () => {
      painted.push({ w: canvas.width, h: canvas.height });
      return ctx;
    },
  });
  return canvas;
}
