/**
 * vfx-projectile-comet (task #33): a projectile reads as a COMET — a bright
 * billboard head plus a stretched trail streaking BACKWARD along the flight
 * path, with pop-shrink sizes and a hot→cool 4-stop ramp instead of the old
 * faint constant-size updraft. The trail takes its color identity from the
 * projectile's own vfx doc (an icy bolt stays icy), pooled views restyle
 * without leaking textures, and dispose() never takes the shared textures
 * down with it. Runs on NullEngine.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { VfxDoc } from "@ggd/shared/content";
import { ProjectileView } from "./ProjectileView";

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

/** An ICE bolt: cold-white → blue → deep blue (color identity check). */
const ICE_DOC: VfxDoc = {
  id: "fx.test-ice-bolt",
  schema: "vfx@1",
  emitter: { shape: "point" },
  mode: "burst",
  burstCount: 30,
  lifetimeSec: { min: 0.15, max: 0.35 },
  size: { start: 0.5, end: 0 },
  color: { start: [0.55, 0.8, 1, 1], end: [0.1, 0.2, 0.5, 0] },
  colorStops: [
    [0, [0.9, 0.98, 1, 1]],
    [0.15, [0.35, 0.65, 1, 1]],
    [0.55, [0.12, 0.23, 0.35, 0.35]],
    [1, [0, 0, 0, 0]],
  ],
  blendMode: "additive",
  texture: "assets/textures/particles/magic_04.png",
};

function trailOf(view: ProjectileView): ParticleSystem {
  const ps = scene.particleSystems.find((p) => p.name.startsWith(view.mesh.name)) as ParticleSystem;
  expect(ps).toBeTruthy();
  return ps;
}

describe("ProjectileView comet (vfx-projectile-comet)", () => {
  it("builds a bright head + a stretched, pop-shrink, hot→cool trail", () => {
    cover("vfx-projectile-comet");
    const meshesBefore = scene.meshes.length;
    const view = new ProjectileView(scene);
    // the billboard glow AND the 3D body that gives the missile a silhouette
    expect(scene.meshes.length - meshesBefore).toBe(2);
    const trail = trailOf(view);

    // stretched billboards along velocity = the streak, not round puffs
    expect(trail.billboardMode).toBe(ParticleSystem.BILLBOARDMODE_STRETCHED);
    expect(trail.minScaleY).toBeGreaterThan(1);
    // short-lived embers that sag behind the head (no updraft)
    expect(trail.maxLifeTime).toBeLessThanOrEqual(0.35);
    expect(trail.gravity.y).toBeLessThan(0);
    // capacity is capped for overdraw discipline
    expect(trail.getCapacity()).toBeLessThanOrEqual(48);

    // size over life: pops large then shrinks to nothing (never constant)
    const sizes = trail.getSizeGradients()!;
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    expect(sizes[1]!.factor1).toBeGreaterThan(sizes[0]!.factor1);
    expect(sizes.at(-1)!.factor1).toBe(0);

    // color over life: white-hot core → tint → cooled → transparent
    const colors = trail.getColorGradients()!;
    expect(colors).toHaveLength(4);
    expect(colors[0]!.color1.r).toBeCloseTo(1);
    expect(colors[0]!.color1.a).toBeCloseTo(1);
    expect(colors.at(-1)!.color1.a).toBe(0);

    view.dispose();
    expect(scene.meshes.length).toBe(meshesBefore);
  });

  it("takes its color identity from the projectile's vfx doc", () => {
    cover("vfx-projectile-comet");
    const view = new ProjectileView(scene);
    const trail = trailOf(view);
    view.activate(ICE_DOC);

    // the ramp's full-tint stop IS the doc's tint — an ice bolt stays icy
    const tinted = trail.getColorGradients()!.find((g) => g.gradient > 0 && g.gradient < 0.2)!;
    expect(tinted.color1.r).toBeCloseTo(0.35);
    expect(tinted.color1.g).toBeCloseTo(0.65);
    expect(tinted.color1.b).toBeCloseTo(1);
    // …while the core stop stays white-hot for the bright head read
    const core = trail.getColorGradients()![0]!;
    expect(core.color1.r).toBeCloseTo(1);
    expect(core.color1.b).toBeCloseTo(1);
    // the doc's own texture drives the trail
    expect(trail.particleTexture?.name).toContain("magic_04.png");

    view.dispose();
  });

  it("streaks BACKWARD along the motion delta", () => {
    cover("vfx-projectile-comet");
    const view = new ProjectileView(scene);
    const trail = trailOf(view);
    view.activate(null);

    view.setPose(0, 0); // first pose: no delta yet
    view.setPose(2, 0); // …now travelling +x
    expect(view.mesh.position.x).toBe(2);
    // both emit directions point back down -x (dot with travel < 0)
    expect(trail.direction1.x).toBeLessThan(0);
    expect(trail.direction2.x).toBeLessThan(0);

    view.setPose(2, 4); // turn: now travelling +z
    expect(trail.direction1.z).toBeLessThan(0);
    expect(trail.direction2.z).toBeLessThan(0);

    view.dispose();
  });

  it("flies a real 3D body NOSE-FIRST along the travel direction", () => {
    cover("vfx-projectile-comet");
    const view = new ProjectileView(scene);
    view.activate(null, "bolt");
    const body = scene.meshes.find((m) => m.name.endsWith("-body"))!;
    expect(body).toBeTruthy();
    // solid geometry, not another billboard: it must NOT face the camera
    expect(body.billboardMode).toBe(0);
    expect(body.getTotalVertices()).toBeGreaterThan(0);

    view.setPose(0, 0); // no delta yet
    view.setPose(3, 0); // travelling +x
    expect(view.bodyPivot.position.x).toBe(3);
    // yaw maps the pivot's +Z onto the travel dir → +x is a quarter turn
    expect(view.bodyPivot.rotation.y).toBeCloseTo(Math.PI / 2, 6);

    view.setPose(3, 5); // now travelling +z → no yaw
    expect(view.bodyPivot.rotation.y).toBeCloseTo(0, 6);

    view.setPose(3, 0); // reverse, travelling -z
    expect(Math.abs(view.bodyPivot.rotation.y)).toBeCloseTo(Math.PI, 6);
    view.dispose();
  });

  it("reshapes the body when a pooled view is reused for another projectile", () => {
    cover("vfx-projectile-comet");
    const own = new Scene(engine);
    const view = new ProjectileView(own);
    view.activate(null, "bolt");
    const boltVerts = own.meshes.find((m) => m.name.endsWith("-body"))!.getTotalVertices();

    view.deactivate();
    view.activate(null, "orb");
    const bodies = own.meshes.filter((m) => m.name.endsWith("-body"));
    expect(bodies).toHaveLength(1); // the old body is disposed, not stacked
    expect(bodies[0]!.getTotalVertices()).not.toBe(boltVerts);

    // same shape again allocates nothing
    const before = own.meshes.length;
    view.deactivate();
    view.activate(null, "orb");
    expect(own.meshes.length).toBe(before);

    view.dispose();
    expect(own.meshes.filter((m) => m.name.startsWith("proj-"))).toHaveLength(0);
    own.dispose();
  });

  it("pools cleanly: activate/deactivate gate the mesh + emitter", () => {
    cover("vfx-projectile-comet");
    const view = new ProjectileView(scene);
    const trail = trailOf(view);
    expect(view.mesh.isEnabled()).toBe(false); // constructed hidden

    let stops = 0;
    const origStop = trail.stop.bind(trail);
    trail.stop = (...a: Parameters<typeof origStop>) => (stops++, origStop(...a));

    view.activate(null);
    expect(view.mesh.isEnabled()).toBe(true);
    expect(trail.isStarted()).toBe(true);
    view.deactivate();
    expect(view.mesh.isEnabled()).toBe(false);
    expect(stops).toBe(1);

    // aim it hard along -x, then recycle the view for a new cast
    view.setPose(0, 0);
    view.setPose(-6, 0);
    expect(trail.direction1.x).toBeGreaterThan(0.5); // streaking back toward +x
    view.deactivate();

    // reuse: neither the stale motion delta NOR the streak it aimed may carry
    // over — the view teleports across the map between casts
    view.activate(ICE_DOC);
    expect(trail.direction1.x).toBeCloseTo(-0.2); // back to the neutral cone
    expect(trail.direction2.y).toBeCloseTo(-0.2);
    view.setPose(50, 50);
    expect(trail.direction1.x).toBeCloseTo(-0.2); // first pose = no delta yet
    view.dispose();
  });

  it("shares textures across pooled views and never disposes them with one view", () => {
    cover("vfx-projectile-comet");
    // own scene: the texture cache is per-scene, so a shared one would carry
    // the other tests' loads
    const own = new Scene(engine);
    const a = new ProjectileView(own);
    const afterFirst = own.textures.length; // head sprite + fallback trail
    expect(afterFirst).toBeGreaterThan(0);

    // a second pooled view loads NOTHING new
    const b = new ProjectileView(own);
    expect(own.textures.length).toBe(afterFirst);

    b.activate(ICE_DOC);
    const withIce = own.textures.length;
    expect(withIce).toBe(afterFirst + 1); // the doc texture, loaded once…
    a.activate(ICE_DOC);
    expect(own.textures.length).toBe(withIce); // …and reused by the pool
    b.activate(ICE_DOC); // re-activating the same doc reloads nothing
    expect(own.textures.length).toBe(withIce);

    // disposing one pooled view must not yank the textures the other draws
    const bTrail = own.particleSystems.find((p) => p.name.startsWith(b.mesh.name))!;
    a.dispose();
    expect(own.textures.length).toBe(withIce);
    expect(bTrail.particleTexture).toBeTruthy();
    b.dispose();
    expect(own.textures.length).toBe(withIce);
    own.dispose();
  });
});
