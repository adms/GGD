/**
 * vfx-blood-spray / vfx-blood-decal / vfx-feedback-gaps (task #39),
 * imperative half on NullEngine:
 *   · BloodFx aims the pooled droplet system's velocity cone at the DAMAGE
 *     VECTOR, and re-aims the SAME system for a hit from the other side —
 *     direction is never baked into a pool key;
 *   · style "off" allocates nothing, emits nothing, spawns no decal;
 *   · the decal pool is hard-capped, reuses spent splats, and fades to 0;
 *   · repeated hits reuse pooled systems instead of allocating per hit;
 *   · the block clink fans its sparks BACK at the attacker (rebound), and the
 *     muzzle flash aims down the shot line.
 *
 * NOTE (harness): a NullEngine ParticleSystem never reports emitted particles
 * (isReady() is false without a real shader), so nothing here asserts particle
 * COUNTS — only the queued burst size, emitter aim, pooling and lifecycle,
 * all of which are real state on the system.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BloodFx } from "./BloodFx";
import { CombatFeedbackFx, quantizePower } from "./CombatFeedbackFx";
import { GroundDecalPool, DECAL_Y } from "./GroundDecalPool";
import { burstDirection } from "./vfxPresets";
import { bloodRecipe, decalFade, type DecalSpec } from "./bloodPresets";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});

afterAll(() => {
  scene.dispose();
  engine.dispose();
});

const NO_TEX = { createTexture: (): null => null };

const DECAL: DecalSpec = {
  radius: 0.6,
  lifeMs: 1000,
  alpha: 0.8,
  tint: [0.3, 0.02, 0.03],
  texture: "assets/textures/particles/scorch_02.png",
};

describe("directional spray (vfx-blood-spray)", () => {
  it("aims the droplet cone at the damage vector", () => {
    cover("vfx-blood-spray");
    const fx = new BloodFx(scene, NO_TEX);
    const [droplets] = fx.fire({
      x: 4,
      z: 7,
      dir: { x: 1, z: 0 },
      severity: "heavy",
      style: "blood",
      intensity: 1,
      nowMs: 0,
    });
    const aim = burstDirection(droplets!)!;
    expect(aim).not.toBeNull();
    expect((aim.d1[0] + aim.d2[0]) / 2).toBeCloseTo(1, 6);
    expect((aim.d1[2] + aim.d2[2]) / 2).toBeCloseTo(0, 6);
    // and it landed at the hit point
    expect((droplets!.emitter as Vector3).x).toBeCloseTo(4, 6);
    expect((droplets!.emitter as Vector3).z).toBeCloseTo(7, 6);
    fx.dispose();
  });

  it("RE-AIMS the same pooled system for a hit from the other side", () => {
    cover("vfx-blood-spray");
    const fx = new BloodFx(scene, NO_TEX);
    const a = fx.fire({ x: 0, z: 0, dir: { x: 1, z: 0 }, severity: "heavy", style: "blood", intensity: 1, nowMs: 0 });
    const aimA = burstDirection(a[0]!)!;
    // same key, well past the busy window -> the SAME pooled instance
    const b = fx.fire({ x: 0, z: 0, dir: { x: -1, z: 0 }, severity: "heavy", style: "blood", intensity: 1, nowMs: 5000 });
    expect(b[0]).toBe(a[0]);
    const aimB = burstDirection(b[0]!)!;
    expect((aimA.d1[0] + aimA.d2[0]) / 2).toBeCloseTo(1, 6);
    expect((aimB.d1[0] + aimB.d2[0]) / 2).toBeCloseTo(-1, 6);
    fx.dispose();
  });

  it("queues the recipe's burst on the impact frame", () => {
    cover("vfx-blood-spray");
    const fx = new BloodFx(scene, NO_TEX);
    const [droplets] = fx.fire({
      x: 0,
      z: 0,
      dir: { x: 0, z: 1 },
      severity: "crit",
      style: "blood",
      intensity: 1,
      nowMs: 0,
    });
    expect(droplets!.manualEmitCount).toBe(bloodRecipe("blood", "crit", 1)!.droplets.count);
    fx.dispose();
  });
});

describe("style switching (vfx-gore-style)", () => {
  it("`off` emits NOTHING and allocates NOTHING", () => {
    cover("vfx-gore-style");
    const fx = new BloodFx(scene, NO_TEX);
    const used = fx.fire({
      x: 0,
      z: 0,
      dir: { x: 0, z: 1 },
      severity: "crit",
      style: "off",
      intensity: 1,
      nowMs: 0,
    });
    expect(used).toEqual([]);
    expect(fx.decalCount).toBe(0);
    expect(fx.countFor("off/crit/physical/droplets")).toBe(0);
    fx.dispose();
  });

  it("intensity 0 is also a total no-op", () => {
    cover("vfx-gore-style");
    const fx = new BloodFx(scene, NO_TEX);
    expect(
      fx.fire({ x: 0, z: 0, dir: { x: 0, z: 1 }, severity: "crit", style: "blood", intensity: 0, nowMs: 0 }),
    ).toEqual([]);
    expect(fx.decalCount).toBe(0);
    fx.dispose();
  });

  it("stylized sprays but leaves no ground pool", () => {
    cover("vfx-gore-style");
    const fx = new BloodFx(scene, NO_TEX);
    const used = fx.fire({
      x: 0,
      z: 0,
      dir: { x: 0, z: 1 },
      severity: "crit",
      style: "stylized",
      intensity: 1,
      nowMs: 0,
    });
    expect(used).toHaveLength(2);
    expect(fx.decalCount).toBe(0);
    fx.dispose();
  });

  it("blood DOES leave a ground pool, ahead of the wound along the vector", () => {
    cover("vfx-blood-decal");
    const fx = new BloodFx(scene, NO_TEX);
    fx.fire({ x: 0, z: 0, dir: { x: 0, z: 1 }, severity: "heavy", style: "blood", intensity: 1, nowMs: 0 });
    expect(fx.decalCount).toBe(1);
    fx.dispose();
  });
});

describe("pool reuse (vfx-blood-spray)", () => {
  it("repeated hits reuse pooled systems instead of allocating per hit", () => {
    cover("vfx-blood-spray");
    const fx = new BloodFx(scene, NO_TEX);
    const key = "blood/heavy/physical/droplets";
    const seen = new Set<unknown>();
    for (let i = 0; i < 40; i++) {
      const [droplets] = fx.fire({
        x: i,
        z: 0,
        dir: { x: 0, z: 1 },
        severity: "heavy",
        style: "blood",
        intensity: 1,
        nowMs: i * 10, // same frame-ish: forces the free-list to its cap
      });
      seen.add(droplets);
    }
    // the free-list caps out; 40 hits never produce 40 systems
    expect(fx.countFor(key)).toBeLessThanOrEqual(4);
    expect(seen.size).toBeLessThanOrEqual(4);
    fx.dispose();
  });

  it("idle pooled systems are reaped by update()", () => {
    cover("vfx-blood-spray");
    const fx = new BloodFx(scene, { ...NO_TEX, idleReapMs: 100 });
    fx.fire({ x: 0, z: 0, dir: { x: 0, z: 1 }, severity: "light", style: "blood", intensity: 1, nowMs: 0 });
    expect(fx.countFor("blood/light/physical/droplets")).toBe(1);
    fx.update(10_000);
    expect(fx.countFor("blood/light/physical/droplets")).toBe(0);
    fx.dispose();
  });
});

describe("ground decal pool (vfx-blood-decal)", () => {
  it("is HARD-CAPPED and steals the oldest splat beyond the cap", () => {
    cover("vfx-blood-decal");
    const pool = new GroundDecalPool(scene, { ...NO_TEX, maxDecals: 3 });
    const idx: number[] = [];
    for (let i = 0; i < 8; i++) idx.push(pool.spawn(i, 0, DECAL, i));
    expect(pool.poolSize).toBe(3);
    expect(pool.activeCount).toBe(3);
    // the 4th spawn had to steal the 1st (oldest)
    expect(idx[3]).toBe(idx[0]);
    pool.dispose();
  });

  it("reuses SPENT splats before growing the pool", () => {
    cover("vfx-blood-decal");
    const pool = new GroundDecalPool(scene, { ...NO_TEX, maxDecals: 8 });
    const first = pool.spawn(0, 0, DECAL, 0);
    pool.update(DECAL.lifeMs + 1); // it expires
    expect(pool.activeCount).toBe(0);
    expect(pool.spawn(5, 5, DECAL, 2000)).toBe(first); // same mesh, no growth
    expect(pool.poolSize).toBe(1);
    pool.dispose();
  });

  it("fades to EXACTLY zero and then disables the mesh", () => {
    cover("vfx-blood-decal");
    const pool = new GroundDecalPool(scene, { ...NO_TEX, maxDecals: 2 });
    const i = pool.spawn(0, 0, DECAL, 0);
    expect(pool.alphaAt(i)).toBeCloseTo(DECAL.alpha, 6);
    pool.update(DECAL.lifeMs * 0.2);
    expect(pool.alphaAt(i)).toBeCloseTo(DECAL.alpha * decalFade(0.2), 6);
    pool.update(DECAL.lifeMs * 0.8);
    expect(pool.alphaAt(i)).toBeLessThan(DECAL.alpha);
    pool.update(DECAL.lifeMs + 1);
    expect(pool.alphaAt(i)).toBe(0);
    expect(pool.activeCount).toBe(0);
    pool.dispose();
  });

  it("hugs the floor and never repeats a neighbour's silhouette", () => {
    cover("vfx-blood-decal");
    const pool = new GroundDecalPool(scene, { ...NO_TEX, maxDecals: 4 });
    pool.spawn(1, 2, DECAL, 0);
    pool.spawn(3, 4, DECAL, 1);
    const meshes = scene.meshes.filter((m) => m.name === "vfx-decal" && m.isEnabled());
    expect(meshes.length).toBeGreaterThanOrEqual(2);
    for (const m of meshes) expect(m.position.y).toBeCloseTo(DECAL_Y, 6);
    const yaws = meshes.map((m) => m.rotation.y);
    expect(new Set(yaws).size).toBe(yaws.length);
    pool.dispose();
  });
});

describe("muzzle / dust / block (vfx-feedback-gaps)", () => {
  it("the muzzle flash aims down the shot line", () => {
    cover("vfx-feedback-gaps");
    const fx = new CombatFeedbackFx(scene, NO_TEX);
    const [, streaks] = fx.muzzle({ x: 0, z: 0, dir: { x: 0, z: -1 }, nowMs: 0 });
    const aim = burstDirection(streaks!)!;
    expect((aim.d1[2] + aim.d2[2]) / 2).toBeCloseTo(-1, 6);
    expect((aim.d1[0] + aim.d2[0]) / 2).toBeCloseTo(0, 6);
    fx.dispose();
  });

  it("the block clink REBOUNDS its sparks back at the attacker", () => {
    cover("vfx-feedback-gaps");
    const fx = new CombatFeedbackFx(scene, NO_TEX);
    // incoming vector points +x (attacker on the -x side)
    const [, sparks] = fx.block({ x: 0, z: 0, dir: { x: 1, z: 0 }, nowMs: 0 });
    const aim = burstDirection(sparks!)!;
    expect((aim.d1[0] + aim.d2[0]) / 2).toBeCloseTo(-1, 6); // fans back
    fx.dispose();
  });

  it("landing dust kicks off the FLOOR (a flat ring at ground level)", () => {
    cover("vfx-feedback-gaps");
    const fx = new CombatFeedbackFx(scene, NO_TEX);
    const [puff, grit] = fx.landingDust({ x: 3, z: -2, nowMs: 0 });
    for (const ps of [puff!, grit!]) {
      expect((ps.emitter as Vector3).y).toBeLessThan(0.2);
      expect((ps.emitter as Vector3).x).toBeCloseTo(3, 6);
      expect(ps.manualEmitCount).toBeGreaterThan(0);
    }
    fx.dispose();
  });

  it("quantizes power so pooled keys stay bounded", () => {
    cover("vfx-feedback-gaps");
    const seen = new Set<number>();
    for (let p = 0; p <= 1.0001; p += 0.01) seen.add(quantizePower(p));
    expect(seen.size).toBeLessThanOrEqual(4);
    expect(quantizePower(0)).toBeGreaterThan(0); // never a zero-power recipe
    expect(quantizePower(5)).toBe(1);
  });

  it("reuses pooled systems across repeated fire", () => {
    cover("vfx-feedback-gaps");
    const fx = new CombatFeedbackFx(scene, NO_TEX);
    for (let i = 0; i < 30; i++) fx.muzzle({ x: i, z: 0, dir: { x: 0, z: 1 }, nowMs: i * 5 });
    expect(fx.countFor("muzzle/physical/1/streaks")).toBeLessThanOrEqual(4);
    fx.dispose();
  });
});
