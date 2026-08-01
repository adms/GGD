/**
 * 殭屍王的小地圖標記 (task #262) —— the guard for 「王要看得見」的另一半.
 *
 * WHAT THIS IS DEFENDING AGAINST, concretely. v0.9.11 shipped the king with a
 * 降臨橫幅 and a 分紅結算 panel and NO map presence at all, because `KIND_MOB`
 * fails `hasOverheadBar()` and therefore never becomes a `ChampionAnchor` —
 * exactly 失敗形態②「算出來了但從沒送到客戶端」, one layer further down: the
 * king was on the wire the whole time and no map consumer ever asked for it.
 *
 * SO THE ASSERTIONS ARE ABOUT DRAWING, NOT ABOUT FIELDS. `drawBossMarker`
 * returns whether it painted and takes a ctx we can record, so every test below
 * ends at 「it really issued arc() at the projected pixel」 rather than 「the spec
 * object has a radius property」 (失敗形態⑦, 掃屬性代替掃行為).
 *
 * THE LAST TEST RUNS THE SHIPPED FRAME. `Minimap.drawFrame` is exported purely
 * so this file can call the REAL per-frame function — the one the component
 * actually schedules — against a recording ctx. Testing only `drawBossMarker`
 * in isolation would leave the exact hole this task exists to close: a marker
 * that works and is never invoked.
 *
 * MUTATION RECORD (2026-07-30, all five re-run by hand — see the task report):
 *   1. delete the `drawBossMarker(...)` call from Minimap.tsx's drawFrame    → RED
 *   2. `bossMarkerSpecFor` → `return null` unconditionally                   → RED
 *   3. drop the zone cull (`marker.zone !== localZone` branch)               → RED
 *   4. `drawBossMarker` returns true without issuing any ctx call            → RED
 *   5. `clearWorldAnchors` stops clearing `frameBus.mobBoss`                 → RED
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { MobBossMarker } from "../../frameBus";
import { frameBus, clearWorldAnchors } from "../../frameBus";
import { drawFrame } from "./Minimap";
import {
  bossMarkerSpecFor,
  bossPulseAt,
  drawBossMarker,
  BOSS_MARKER_COLOR,
  BOSS_PULSE_MS,
  type BossMarkerCtx,
} from "./minimapBossMarker";

const KING: MobBossMarker = {
  entityId: 77,
  zone: 1,
  worldX: 4,
  worldZ: -6,
  hpPct: 1,
  // #247 —— 長血條要真實數字,小地圖的紅點不讀它們,但型別是同一個 marker。
  hp: 276944,
  maxHp: 276944,
};

/** Records every 2D call so a test can assert what was actually painted. */
function recorder(): BossMarkerCtx & { calls: { op: string; args: number[] }[] } {
  const calls: { op: string; args: number[] }[] = [];
  const log =
    (op: string) =>
    (...args: unknown[]): void => {
      calls.push({ op, args: args.filter((a): a is number => typeof a === "number") });
    };
  return {
    calls,
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    shadowColor: "",
    shadowBlur: 0,
    save: log("save"),
    restore: log("restore"),
    beginPath: log("beginPath"),
    arc: log("arc"),
    fill: log("fill"),
    stroke: log("stroke"),
    moveTo: log("moveTo"),
    lineTo: log("lineTo"),
    closePath: log("closePath"),
  } as unknown as BossMarkerCtx & { calls: { op: string; args: number[] }[] };
}

/**
 * A fuller recorder for `Minimap.drawFrame`, which touches more of the 2D API
 * than the marker does (clearRect / gradients / text / transforms).
 */
function frameCtx(): { calls: { op: string; args: number[] }[] } & Record<string, unknown> {
  const calls: { op: string; args: number[] }[] = [];
  const log =
    (op: string) =>
    (...args: unknown[]): unknown => {
      calls.push({ op, args: args.filter((a): a is number => typeof a === "number") });
      return undefined;
    };
  const ops = [
    "save", "restore", "beginPath", "arc", "fill", "stroke", "moveTo", "lineTo",
    "closePath", "clearRect", "fillRect", "strokeRect", "rect", "drawImage",
    "translate", "rotate", "scale", "setTransform", "resetTransform", "clip",
    "fillText", "strokeText", "setLineDash", "ellipse", "quadraticCurveTo",
    "bezierCurveTo", "arcTo",
  ];
  const ctx: Record<string, unknown> = {
    calls,
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    shadowColor: "",
    shadowBlur: 0,
    globalCompositeOperation: "source-over",
    canvas: { width: 196, height: 196 },
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => null,
  };
  for (const op of ops) ctx[op] = log(op);
  return ctx as { calls: { op: string; args: number[] }[] } & Record<string, unknown>;
}

/** A projection with a deliberately non-identity mapping, so a test that only */
/** compares world coordinates cannot accidentally pass. */
const toMap = (wx: number, wz: number): { x: number; y: number } => ({
  x: 100 + wx * 3,
  y: 50 - wz * 3,
});

describe("殭屍王 minimap marker (#262) — the king is actually painted", () => {
  it("PAINTS: a live king in the local zone really issues arcs at its projected px", () => {
    cover("mobboss-minimap-marker");
    const ctx = recorder();
    const spec = bossMarkerSpecFor(KING, 1, 0, 1);
    expect(spec).not.toBeNull();

    expect(drawBossMarker(ctx, spec, toMap)).toBe(true);

    const arcs = ctx.calls.filter((c) => c.op === "arc");
    // halo + solid pip
    expect(arcs.length).toBe(2);
    for (const a of arcs) {
      // (4, -6) → (112, 68) under `toMap` — the marker is where the king is,
      // not at the map origin.
      expect(a.args[0]).toBe(112);
      expect(a.args[1]).toBe(68);
    }
    // the halo is strictly outside the pip, or there is no ping to see
    expect(arcs[1]!.args[2]).toBeLessThan(arcs[0]!.args[2]!);
    expect(ctx.calls.some((c) => c.op === "fill")).toBe(true);
    expect(ctx.calls.some((c) => c.op === "stroke")).toBe(true);
    // save/restore balance — a leaked shadowBlur would smear the whole map
    expect(ctx.calls.filter((c) => c.op === "save").length).toBe(1);
    expect(ctx.calls.filter((c) => c.op === "restore").length).toBe(1);
  });

  it("PAINTS NOTHING when there is no king — and says so", () => {
    cover("mobboss-minimap-marker");
    const ctx = recorder();
    expect(bossMarkerSpecFor(null, 1, 0, 1)).toBeNull();
    expect(drawBossMarker(ctx, null, toMap)).toBe(false);
    expect(ctx.calls).toEqual([]);
  });

  it("ZONE CULL (#67): a king in ANOTHER duel zone is not on your map", () => {
    cover("mobboss-minimap-marker");
    const ctx = recorder();
    const spec = bossMarkerSpecFor({ ...KING, zone: 2 }, 1, 0, 1);
    expect(spec).toBeNull();
    expect(drawBossMarker(ctx, spec, toMap)).toBe(false);
    expect(ctx.calls).toEqual([]);
    // …but the SAME king is drawn for the player whose zone it is,
    // so this is a cull and not a permanent "never draw".
    expect(bossMarkerSpecFor({ ...KING, zone: 2 }, 2, 0, 1)).not.toBeNull();
    // and a whole-arena spectator (localZone -1) sees it wherever it is
    expect(bossMarkerSpecFor({ ...KING, zone: 2 }, -1, 0, 1)).not.toBeNull();
  });

  it("the halo PULSES — two different frames paint two different radii", () => {
    cover("mobboss-minimap-marker");
    const tight = bossMarkerSpecFor(KING, 1, 0, 1)!;
    const wide = bossMarkerSpecFor(KING, 1, BOSS_PULSE_MS / 2, 1)!;
    expect(bossPulseAt(0)).toBe(0);
    expect(bossPulseAt(BOSS_PULSE_MS / 2)).toBe(1);
    expect(bossPulseAt(BOSS_PULSE_MS)).toBe(0); // wraps
    expect(wide.haloRadius).toBeGreaterThan(tight.haloRadius);
    // the solid pip does NOT breathe — only the halo does, so the king's
    // position never looks like it is moving
    expect(wide.radius).toBe(tight.radius);
  });

  it("a nearly-dead king reads differently: the halo swings wider at low hp", () => {
    cover("mobboss-minimap-marker");
    const peak = BOSS_PULSE_MS / 2;
    const full = bossMarkerSpecFor({ ...KING, hpPct: 1 }, 1, peak, 1)!;
    const dying = bossMarkerSpecFor({ ...KING, hpPct: 0.05 }, 1, peak, 1)!;
    expect(dying.haloRadius).toBeGreaterThan(full.haloRadius);
    // out-of-range hp is clamped, never propagated into a NaN radius
    for (const hp of [-3, 42, Number.NaN]) {
      const s = bossMarkerSpecFor({ ...KING, hpPct: hp }, 1, peak, 1)!;
      expect(Number.isFinite(s.haloRadius)).toBe(true);
      expect(s.hpPct).toBeGreaterThanOrEqual(0);
      expect(s.hpPct).toBeLessThanOrEqual(1);
    }
  });

  it("scales with the map: a phone-sized map gets a proportionally smaller king", () => {
    cover("mobboss-minimap-marker");
    const desktop = bossMarkerSpecFor(KING, 1, 0, 1)!;
    const phone = bossMarkerSpecFor(KING, 1, 0, 0.6)!;
    expect(phone.radius).toBeCloseTo(desktop.radius * 0.6, 6);
    // a nonsense scale must not produce an invisible or NaN marker
    expect(bossMarkerSpecFor(KING, 1, 0, 0)!.radius).toBe(desktop.radius);
  });

  it("uses the 殭屍王 crimson, not a team colour", () => {
    cover("mobboss-minimap-marker");
    expect(bossMarkerSpecFor(KING, 1, 0, 1)!.color).toBe(BOSS_MARKER_COLOR);
  });

  it("THE BUS SLOT IS REAL AND IS CLEARED ON TEARDOWN", () => {
    cover("mobboss-minimap-marker");
    // The producer half: `GameApp.updateFrameBus` writes here and `Minimap`
    // reads here. If the slot vanished or stopped being cleared, the map would
    // keep painting a skull at the king's last position through the whole
    // intermission.
    frameBus.mobBoss = { ...KING };
    expect(frameBus.mobBoss).not.toBeNull();
    clearWorldAnchors();
    expect(frameBus.mobBoss).toBeNull();
  });

  it("THE SHIPPED MINIMAP FRAME PAINTS IT — not just the helper in isolation", () => {
    cover("mobboss-minimap-marker");
    // ③ 「可以從渲染樹刪掉但測試還是全綠」: every assertion above passes against a
    // Minimap that never calls drawBossMarker at all. This one runs the real
    // `drawFrame` and counts what reaches the canvas with and without a king,
    // so deleting the call site is the difference between green and red.
    frameBus.arenaZones = [{ x: 0, z: 0, r: 24 }];
    frameBus.arenaId = "test-arena";
    frameBus.champions.clear();
    frameBus.reviveCircles.length = 0;
    frameBus.cameraView = null;

    // A terrain cache that bakes nothing: `drawFrame` skips the blit when
    // `imageFor` returns null, which keeps this test off the canvas backend.
    const terrain = { imageFor: () => null } as unknown as Parameters<typeof drawFrame>[1];

    const run = (): number => {
      const ctx = frameCtx();
      drawFrame(ctx as unknown as CanvasRenderingContext2D, terrain, 196, 1, new Map(), 0);
      return ctx.calls.filter((c) => c.op === "arc").length;
    };

    frameBus.mobBoss = null;
    const without = run();

    frameBus.mobBoss = { ...KING, zone: 0 };
    const withKing = run();

    // the king's halo + pip are two arcs the frame did not issue before
    expect(withKing - without).toBe(2);
    clearWorldAnchors();
  });
});
