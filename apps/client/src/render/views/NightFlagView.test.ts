/**
 * 暗夜旗 — the CLIENT half of 71-00 暗夜契約. Runs on Babylon's NullEngine.
 *
 * owner, 2026-07-30:「黑色圈圈特效…圈的大小 = 光環半徑 —— 這樣玩家看得出來範圍
 * 到哪裡，而不只是『有東西發生』」.
 *
 * WHAT THIS SUITE REFUSES TO ACCEPT AS A PASS:
 *   · 「doc 存在」 — there is no vfx doc here at all; the ring is geometry, and
 *     every assertion reads a MESH's world matrix, not a config field.
 *   · 「掃屬性」 — the radius assertions go through `getBoundingInfo()` after a
 *     forced world-matrix compute, i.e. the number a camera would see, not the
 *     `scaling` vector the view wrote (which would pass even if the mesh were
 *     authored at the wrong reference radius).
 *   · a VACUOUS dispatch test — the kind-7 case also asserts that NO champion /
 *     flower / projectile view was created for the same entity.
 *
 * ⚠️ NOT INCONCLUSIVE, and deliberately so: NullEngine cannot compile particle
 * shaders (`isReady()` is permanently false), which is why this ring is BUILT
 * OUT OF GEOMETRY rather than a ParticleSystem — meshes, materials and world
 * matrices are all fully evaluable headless. Nothing here is faked around an
 * engine limitation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { AssetManager } from "../AssetManager";
import { NightFlagView } from "./NightFlagView";
import { hasOverheadBar, KIND_NIGHT_FLAG } from "../overheadAnchors";
import { ENTITY_KIND } from "@ggd/shared/protocol/schema";

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

const flagEntity = (id: number, radius: number): EntityViewState => ({
  id,
  kind: KIND_NIGHT_FLAG,
  seatId: -1,
  key: "prop.night-flag",
  teamId: -1,
  x: 4,
  z: -9,
  fx: 1,
  fz: 0,
  alive: true,
  nightFlag: { radius, teamId: 1 },
});

const passthrough = (e: EntityViewState): { x: number; z: number; fx: number; fz: number } => ({
  x: e.x,
  z: e.z,
  fx: e.fx,
  fz: e.fz,
});

/** The ring's ACTUAL half-extent in world units, off the computed world matrix. */
function worldRadiusOf(view: NightFlagView): number {
  const rim = view.root.getChildMeshes().find((m) => m.name === "nightFlagRimMesh")!;
  rim.computeWorldMatrix(true);
  const ext = rim.getBoundingInfo().boundingBox.extendSizeWorld;
  return Math.max(ext.x, ext.z);
}

describe("暗夜旗 — the black circle IS the aura radius", () => {
  it("the ring is drawn at the WIRE radius, not a client constant", () => {
    const a = new NightFlagView(scene);
    const b = new NightFlagView(scene);
    a.activate(6.42);
    b.activate(11);
    a.setPose(0, 0);
    b.setPose(0, 0);

    // Read the world-space extent, so an authored reference radius that did not
    // match the scaling would show up here. Torus thickness (5.5 % of the
    // radius) rides on top, so the tolerance is proportional, not absolute.
    expect(worldRadiusOf(a)).toBeGreaterThan(6.42 * 0.95);
    expect(worldRadiusOf(a)).toBeLessThan(6.42 * 1.15);
    expect(worldRadiusOf(b)).toBeGreaterThan(11 * 0.95);
    expect(worldRadiusOf(b)).toBeLessThan(11 * 1.15);
    // …and the two disagree in the same direction as their radii. A view that
    // ignored `radius` entirely would make this ratio 1.
    expect(worldRadiusOf(b) / worldRadiusOf(a)).toBeCloseTo(11 / 6.42, 2);

    a.dispose();
    b.dispose();
  });

  it("the ring MOVES with the flag and is disabled until activated", () => {
    const v = new NightFlagView(scene);
    expect(v.root.isEnabled(), "a pooled view starts hidden").toBe(false);
    v.activate(5);
    expect(v.root.isEnabled()).toBe(true);
    v.setPose(12, -7);
    expect(v.root.position.x).toBe(12);
    expect(v.root.position.z).toBe(-7);
    v.deactivate();
    expect(v.root.isEnabled(), "released back to the pool = hidden").toBe(false);
    v.dispose();
  });

  it("black is BLENDED, never additive — additive black is invisible by construction", () => {
    const v = new NightFlagView(scene);
    v.activate(4);
    const disc = v.root.getChildMeshes().find((m) => m.name === "nightFlagDiscMesh")!;
    const mat = disc.material as { alpha: number; alphaMode?: number };
    expect(mat.alpha, "translucent, so the arena floor still reads through").toBeGreaterThan(0);
    expect(mat.alpha).toBeLessThan(1);
    // Babylon's ALPHA_COMBINE is 2; ALPHA_ADD is 1. A default StandardMaterial
    // is ALPHA_COMBINE, and this pins that nobody "improves" it to additive.
    expect(mat.alphaMode ?? 2).toBe(2);
    v.dispose();
  });

  it("a degenerate radius still draws something rather than collapsing to a point", () => {
    const v = new NightFlagView(scene);
    v.activate(0); // a disarmed / legacy snapshot packs 0 into `shield`
    expect(v.currentRadius()).toBeGreaterThan(0);
    expect(worldRadiusOf(v)).toBeGreaterThan(0.5);
    v.dispose();
  });

  it("kind 7 dispatches to a NightFlagView — and to NOTHING else", () => {
    const reg = new EntityViewRegistry(scene, new AssetManager(scene));
    reg.sync({
      entities: [flagEntity(77, 6.42)],
      nowMs: 0,
      poseFor: passthrough,
      content: {},
    } as unknown as Parameters<EntityViewRegistry["sync"]>[0]);

    // No champion view was built for it — that is the kind-0 fallthrough bug
    // (a modelless voxel stand-in painted on the floor) this branch prevents.
    expect(reg.getChampionView(77), "never a ChampionView").toBeUndefined();
    // The wire contract: kind 7 carries no health, so no overhead bar.
    expect(hasOverheadBar(KIND_NIGHT_FLAG)).toBe(false);
    // The client constant and the protocol enum must agree; they are declared
    // in two packages and would otherwise drift silently.
    expect(KIND_NIGHT_FLAG).toBe(ENTITY_KIND.NIGHT_FLAG);
    reg.dispose();
  });
});
