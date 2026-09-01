/**
 * ribbon-swing-trail (task #37): the RibbonTrail behaviour contract — a swing
 * leaves a crisp streak that is COMPLETELY gone within 0.25 s, an idle or
 * walking champion draws nothing at all, continuous max-attack-speed swinging
 * never accumulates, and repeated swings reuse one pooled mesh forever.
 *
 * These are DRIVEN-LOOP measurements (explicit nowMs/dtMs ticks), not
 * screenshots: a paused render loop freezes a short-lived effect mid-life,
 * which looks exactly like lingering (the trap task #33 fell into).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { RibbonDoc } from "@ggd/shared/content";
import { RibbonBudget, RibbonTrail, maxActiveRibbons } from "./RibbonTrail";
import {
  RIBBON_FADE_BUDGET_SEC,
  RIBBON_MAX_LIFESPAN_SEC,
  RIBBON_MAX_HALF_WIDTH,
  SWING_ON_SPEED,
} from "./ribbonMath";

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

/** a sword-trail doc shaped like the imported champion ones */
const SWORD: RibbonDoc = {
  id: "fx.test-sword",
  schema: "ribbon@1",
  widthAbove: 0.6,
  widthBelow: 0.6,
  lifespanSec: 0.35, // the value 40 of the 55 imported docs carry
  color: [1, 0.635, 0, 0.9],
  blendMode: "additive",
  anchorBone: "Sword",
};

const FRAME_MS = 1000 / 60;

interface Rig {
  root: TransformNode;
  weapon: TransformNode;
}

function makeRig(): Rig {
  const root = new TransformNode("champ-1", scene);
  const weapon = new TransformNode("1-Sword", scene);
  weapon.parent = root;
  weapon.position.set(0.8, 1.2, 0);
  return { root, weapon };
}

/** brightest vertex on the strip (0 = nothing on screen) */
function peakAlpha(trail: RibbonTrail): number {
  const c = trail.vertexColors;
  let peak = 0;
  for (let i = 3; i < c.length; i += 4) if (c[i]! > peak) peak = c[i]!;
  return peak;
}

/** brightest RGB channel (what an ADDITIVE ribbon actually puts on screen) */
function peakRgb(trail: RibbonTrail): number {
  const c = trail.vertexColors;
  let peak = 0;
  for (let i = 0; i < c.length; i += 4) {
    peak = Math.max(peak, c[i]!, c[i + 1]!, c[i + 2]!);
  }
  return peak;
}

/**
 * What scene.render() does for us in the real loop: world matrices are only
 * recomputed once per render id, so a driven loop has to refresh them itself
 * (root first — the child's world matrix is built from the parent's).
 */
function sync(rig: Rig): void {
  rig.root.computeWorldMatrix(true);
  rig.weapon.computeWorldMatrix(true);
}

/**
 * Drive the loop for `ms`, moving the weapon `speed` world-units/sec RELATIVE
 * to the root (a swing) and the root `rootSpeed` u/s (running). Returns the
 * clock it stopped at; `onTick` observes every frame.
 */
function drive(
  trail: RibbonTrail,
  rig: Rig,
  startMs: number,
  ms: number,
  opts: { speed?: number; rootSpeed?: number; onTick?: (t: number) => void; dtMs?: number } = {},
): number {
  const speed = opts.speed ?? 0;
  const rootSpeed = opts.rootSpeed ?? 0;
  const dt = opts.dtMs ?? FRAME_MS;
  let t = startMs;
  const end = startMs + ms;
  while (t < end) {
    t += dt;
    rig.weapon.position.x += (speed * dt) / 1000;
    rig.root.position.z += (rootSpeed * dt) / 1000;
    sync(rig);
    trail.tick(t, dt);
    opts.onTick?.(t);
  }
  return t;
}

describe("RibbonTrail swing trail (ribbon-swing-trail)", () => {
  it("clamps an authored 0.35s (or 2s) lifespan into the 刀光 budget", () => {
    cover("ribbon-swing-trail");
    const a = new RibbonTrail(scene, SWORD);
    expect(a.lifespanMs).toBe(RIBBON_MAX_LIFESPAN_SEC * 1000);
    const b = new RibbonTrail(scene, { ...SWORD, id: "fx.b", lifespanSec: 2 });
    expect(b.lifespanMs).toBe(RIBBON_MAX_LIFESPAN_SEC * 1000);
    // a doc already inside the budget is left exactly as authored
    const c = new RibbonTrail(scene, { ...SWORD, id: "fx.c", lifespanSec: 0.1 });
    expect(c.lifespanMs).toBeCloseTo(100);
    a.dispose();
    b.dispose();
    c.dispose();
  });

  it("a swing is COMPLETELY gone within 0.25s of the blade stopping", () => {
    cover("ribbon-swing-trail");
    const trail = new RibbonTrail(scene, SWORD);
    const rig = makeRig();
    trail.attachTo(rig.weapon, 0, rig.root);

    // …swing for 300ms at a real attack-arc speed
    const stoppedAt = drive(trail, rig, 0, 300, { speed: 12 });
    expect(trail.swinging).toBe(true);
    expect(trail.isVisible).toBe(true);
    expect(peakAlpha(trail)).toBeGreaterThan(0.5);
    expect(peakRgb(trail)).toBeGreaterThan(0.5); // additive: RGB is the fade

    // …then hold the blade still and watch it die
    let goneAt = Infinity;
    drive(trail, rig, stoppedAt, 1000, {
      speed: 0,
      onTick: (t) => {
        if (goneAt === Infinity && peakAlpha(trail) === 0 && peakRgb(trail) === 0) goneAt = t;
        if (goneAt !== Infinity) {
          // and it STAYS gone — no second wind from a re-opened gate
          expect(peakAlpha(trail)).toBe(0);
          expect(trail.isVisible).toBe(false);
        }
      },
    });
    expect(goneAt - stoppedAt).toBeLessThanOrEqual(RIBBON_FADE_BUDGET_SEC * 1000);
    expect(trail.swinging).toBe(false);
    expect(trail.isVisible).toBe(false);
    trail.dispose();
  });

  it("draws NOTHING while idle or walking (the old always-on light pollution)", () => {
    cover("ribbon-swing-trail");
    const trail = new RibbonTrail(scene, SWORD);
    const rig = makeRig();
    trail.attachTo(rig.weapon, 0, rig.root);

    // idle: the weapon bone sits still for 2 seconds
    let everVisible = false;
    let t = drive(trail, rig, 0, 2000, { onTick: () => (everVisible ||= trail.isVisible) });
    expect(everVisible).toBe(false);
    expect(peakAlpha(trail)).toBe(0);

    // walking: the champion runs at 6 u/s — the weapon moves through the WORLD
    // at full speed but not relative to the entity, so still no streak
    t = drive(trail, rig, t, 2000, {
      rootSpeed: 6,
      onTick: () => (everVisible ||= trail.isVisible),
    });
    expect(everVisible).toBe(false);
    expect(trail.swinging).toBe(false);
    expect(t).toBeGreaterThan(0);
    trail.dispose();
  });

  it("continuous max-attack-speed swinging NEVER accumulates", () => {
    cover("ribbon-swing-trail");
    const trail = new RibbonTrail(scene, SWORD);
    const rig = makeRig();
    trail.attachTo(rig.weapon, 0, rig.root);

    const SPEED = 14;
    const vertexCount = trail.vertexColors.length;
    const meshesBefore = scene.meshes.length;
    let maxLitExtent = 0;
    let maxLitVerts = 0;
    let t = 0;
    // 4 seconds of back-to-back swings (the blade never rests)
    for (let swing = 0; swing < 20; swing++) {
      t = drive(trail, rig, t, 200, {
        speed: swing % 2 === 0 ? SPEED : -SPEED,
        onTick: () => {
          const { litCount, extent } = litStrip(trail);
          maxLitVerts = Math.max(maxLitVerts, litCount);
          maxLitExtent = Math.max(maxLitExtent, extent);
        },
      });
    }
    // THE anti-pollution invariant: however long the champion keeps attacking,
    // the lit strip only ever covers ONE lifespan's worth of blade travel — it
    // does not grow into overlapping bands
    expect(maxLitExtent).toBeLessThanOrEqual(SPEED * RIBBON_MAX_LIFESPAN_SEC * 1.2);
    expect(maxLitVerts).toBeLessThanOrEqual(vertexCount / 8);
    // …and it cost nothing: one mesh, one buffer, forever
    expect(scene.meshes.length).toBe(meshesBefore);
    expect(trail.vertexColors.length).toBe(vertexCount);
    trail.dispose();
  });

  /** lit-sample count and the world-space extent they span */
  function litStrip(trail: RibbonTrail): { litCount: number; extent: number } {
    const c = trail.vertexColors;
    const n = c.length / 8; // samples (2 paths × rgba)
    const mesh = scene.meshes.find((m) => m.name === `ribbon-${trail.doc.id}`);
    const pos = mesh?.getVerticesData("position");
    let litCount = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      if (c[i * 4 + 3]! <= 0) continue;
      litCount++;
      if (!pos) continue;
      const x = pos[i * 3]!;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    return { litCount, extent: litCount > 0 && hi >= lo ? hi - lo : 0 };
  }

  it("brightness and width fall off monotonically along the strip", () => {
    cover("ribbon-swing-trail");
    const trail = new RibbonTrail(scene, SWORD);
    const rig = makeRig();
    trail.attachTo(rig.weapon, 0, rig.root);
    // a CONSTANT-speed swing → every sample carries the same swing weight, so
    // the only thing shaping the strip is age
    drive(trail, rig, 0, 400, { speed: 12 });

    const c = trail.vertexColors;
    const n = c.length / 8;
    const alphas: number[] = [];
    for (let i = 0; i < n; i++) alphas.push(c[i * 4 + 3]!);
    for (let i = 1; i < n; i++) {
      expect(alphas[i]!).toBeGreaterThanOrEqual(alphas[i - 1]!); // oldest → newest
    }
    expect(alphas[0]).toBe(0); // the tail edge is fully gone…
    expect(alphas[n - 1]!).toBeGreaterThan(0.5); // …the blade edge is hot
    // bottom path mirrors the top path exactly (same sample ages)
    for (let i = 0; i < n; i++) expect(c[(n + i) * 4 + 3]).toBe(c[i * 4 + 3]);
    trail.dispose();
  });

  it("keeps the trail the same LENGTH at 30, 60 and 144 fps", () => {
    cover("ribbon-swing-trail");
    const lit = (dtMs: number): number => {
      const trail = new RibbonTrail(scene, { ...SWORD, id: `fx.fps-${Math.round(dtMs)}` });
      const rig = makeRig();
      trail.attachTo(rig.weapon, 0, rig.root);
      // 400ms of a steady 12 u/s swing at this frame time
      drive(trail, rig, 0, 400, { speed: 12, dtMs });
      const span = litStrip(trail).extent;
      trail.dispose();
      return span;
    };
    // the ring advances on a wall clock, so ~0.2s of motion at every frame rate
    const at60 = lit(1000 / 60);
    for (const dt of [1000 / 30, 1000 / 144]) {
      const got = lit(dt);
      expect(got).toBeGreaterThan(at60 * 0.6);
      expect(got).toBeLessThan(at60 * 1.4);
    }
    // and that length is the lifespan's worth of travel, not the ring's
    expect(at60).toBeGreaterThan(0);
    expect(at60).toBeLessThan(12 * RIBBON_MAX_LIFESPAN_SEC * 1.25);
  });

  it("caps concurrent live trails and steals the oldest", () => {
    cover("ribbon-swing-trail");
    const budget = new RibbonBudget();
    const trails: RibbonTrail[] = [];
    const rigs: Rig[] = [];
    for (let i = 0; i < maxActiveRibbons() + 4; i++) {
      const trail = new RibbonTrail(scene, { ...SWORD, id: `fx.t${i}` }, { budget });
      const rig = makeRig();
      trail.attachTo(rig.weapon, 0, rig.root);
      trails.push(trail);
      rigs.push(rig);
    }
    let t = 0;
    for (let i = 0; i < trails.length; i++) {
      // stagger the swings so "oldest" is well defined
      t = drive(trails[i]!, rigs[i]!, t, 100, { speed: SWING_ON_SPEED * 3 });
    }
    expect(budget.activeCount).toBeLessThanOrEqual(maxActiveRibbons());
    // the first-opened trails were the ones stolen
    expect(trails[0]!.swinging).toBe(false);
    expect(trails[trails.length - 1]!.swinging).toBe(true);
    for (const tr of trails) tr.dispose();
  });

  it("re-seeds on attach so a POOLED trail never shows a stale streak", () => {
    cover("ribbon-swing-trail");
    const trail = new RibbonTrail(scene, SWORD);
    const a = makeRig();
    trail.attachTo(a.weapon, 0, a.root);
    const t = drive(trail, a, 0, 300, { speed: 12 });
    expect(trail.isVisible).toBe(true);

    // returned to the pool and handed to a different champion far away
    trail.detach();
    expect(trail.isVisible).toBe(false);
    const b = makeRig();
    b.root.position.set(40, 0, 40);
    trail.attachTo(b.weapon, t, b.root);
    trail.tick(t + FRAME_MS, FRAME_MS);
    // no bridge streak across the map: nothing is lit until the new blade moves
    expect(peakAlpha(trail)).toBe(0);
    expect(trail.isVisible).toBe(false);
    trail.dispose();
  });

  it("caps absurd authored widths at a blade arc", () => {
    cover("ribbon-swing-trail");
    // godie-niya authored 3.86 world units per side — a wall, not a weapon
    const trail = new RibbonTrail(scene, {
      ...SWORD,
      id: "fx.wide",
      widthAbove: 3.858,
      widthBelow: 3.863,
    });
    const rig = makeRig();
    trail.attachTo(rig.weapon, 0, rig.root);
    drive(trail, rig, 0, 200, { speed: 12 });
    const mesh = scene.meshes.find((m) => m.name === "ribbon-fx.wide")!;
    expect(mesh).toBeDefined();
    const ys = mesh.getVerticesData("position")!;
    let maxY = -Infinity;
    let minY = Infinity;
    for (let i = 1; i < ys.length; i += 3) {
      maxY = Math.max(maxY, ys[i]!);
      minY = Math.min(minY, ys[i]!);
    }
    expect(maxY - minY).toBeLessThanOrEqual(RIBBON_MAX_HALF_WIDTH * 2 + 1e-6);
    trail.dispose();
  });
});
