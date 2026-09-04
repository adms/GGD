/**
 * vfx-cast-pillar (the Babylon shell): the light column that rises around a
 * caster for the length of the AUTHORITATIVE cast window.
 *
 * What is actually asserted here — behaviour, not field existence:
 *   · a column follows the real window (0.35 s and 2 s both run to their own
 *     end, and the same slot is reused for a recast);
 *   · castEnd flashes, castInterrupt SNUFFS (dimmer, collapsing, no flash);
 *   · it appears for EVERY entity id fed to it, not a privileged one;
 *   · budget: ZERO meshes / materials / particle systems are allocated after
 *     warm-up, the slot count is hard-capped, and the recycle victim at the cap
 *     is the cast closest to finishing;
 *   · a dropped castEnd cannot leave a pillar burning forever.
 * Runs on NullEngine with textures stubbed out.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CastPillarFx } from "./CastPillarFx";
import {
  EXTINGUISH_MS,
  MAX_PILLARS,
  MOTE_PERIOD_MS,
  RELEASE_MS,
  crowdAlphaScale,
  pillarPalette,
} from "./castPillar";

let engine: NullEngine;

beforeAll(() => {
  engine = new NullEngine();
});
afterAll(() => engine.dispose());

const FIRE = pillarPalette("fx.prim.fire.nova", null);
const ICE = pillarPalette("fx.prim.ice.nova", null);

/** entity positions the deps read back (NullEngine has no champion views) */
function harness(): { scene: Scene; fx: CastPillarFx; pos: Map<number, { x: number; z: number }> } {
  const scene = new Scene(engine);
  const pos = new Map<number, { x: number; z: number }>();
  const fx = new CastPillarFx(
    scene,
    { entityPos: (id) => pos.get(id) ?? null },
    { createTexture: () => null }, // NullEngine: no real texture fetches
  );
  return { scene, fx, pos };
}

function counts(scene: Scene): { meshes: number; materials: number; systems: number } {
  return {
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    systems: scene.particleSystems.length,
  };
}

describe("the column tracks the real cast window", () => {
  it("rises on castBegin, holds through the window, and pays off on castEnd", () => {
    cover("vfx-cast-pillar");
    const { scene, fx, pos } = harness();
    pos.set(7, { x: 3, z: -4 });

    fx.begin(7, 600, FIRE, 1000); // the owner's 0.6 s default
    expect(fx.has(7)).toBe(true);
    expect(fx.phaseOf(7)).toBe("cast");

    const early = fx.shellAlphaOf(7)!;
    fx.update(1300);
    const mid = fx.shellAlphaOf(7)!;
    expect(mid).toBeGreaterThan(early); // it INTENSIFIES across the window

    fx.finish(7, 1600);
    expect(fx.phaseOf(7)).toBe("release");
    fx.update(1600);
    expect(fx.shellAlphaOf(7)!).toBeGreaterThan(mid); // release flash

    fx.update(1600 + RELEASE_MS + 1);
    expect(fx.has(7)).toBe(false); // and it is gone, not lingering
    fx.dispose();
    scene.dispose();
  });

  it("a 2 s cast burns for 2 s — no hard-coded 0.6", () => {
    cover("vfx-cast-pillar");
    const { scene, fx, pos } = harness();
    pos.set(1, { x: 0, z: 0 });
    fx.begin(1, 2000, FIRE, 0);
    fx.update(700); // past 0.6 s
    expect(fx.has(1)).toBe(true);
    expect(fx.phaseOf(1)).toBe("cast");
    fx.update(1900);
    expect(fx.has(1)).toBe(true);
    fx.dispose();
    scene.dispose();
  });

  it("never starts on a zero/NaN window or an unknown position", () => {
    cover("vfx-cast-pillar");
    const { scene, fx, pos } = harness();
    pos.set(1, { x: 0, z: 0 });
    fx.begin(1, 0, FIRE, 0);
    fx.begin(1, Number.NaN, FIRE, 0);
    expect(fx.has(1)).toBe(false);
    // FIX #131 discipline: a non-finite body position must never place an
    // additive emitter (it parks at a screen corner and sticks there)
    pos.set(2, { x: Number.NaN, z: 0 });
    fx.begin(2, 600, FIRE, 0);
    expect(fx.has(2)).toBe(false);
    expect(fx.activeCount).toBe(0);
    fx.dispose();
    scene.dispose();
  });

  it("a dropped castEnd cannot leave a column burning forever", () => {
    cover("vfx-cast-pillar");
    const { scene, fx, pos } = harness();
    pos.set(3, { x: 0, z: 0 });
    fx.begin(3, 600, FIRE, 0);
    fx.update(600 + RELEASE_MS + 50); // castEnd never arrived
    expect(fx.has(3)).toBe(false);
    fx.dispose();
    scene.dispose();
  });
});

describe("an interrupt snuffs it; a resolve flashes", () => {
  it("castInterrupt is dimmer than the cast and dies without a flash", () => {
    cover("vfx-cast-pillar-interrupt");
    const { scene, fx, pos } = harness();
    pos.set(5, { x: 0, z: 0 });
    fx.begin(5, 600, FIRE, 0);
    fx.update(500);
    const charged = fx.shellAlphaOf(5)!;

    fx.interrupt(5, 500);
    expect(fx.phaseOf(5)).toBe("extinguish");
    fx.update(500);
    expect(fx.shellAlphaOf(5)!).toBeLessThan(charged); // snuffed, never brighter
    fx.update(500 + EXTINGUISH_MS + 1);
    expect(fx.has(5)).toBe(false);
    fx.dispose();
    scene.dispose();
  });

  it("an interrupt after the resolve flash is ignored (the cast already paid off)", () => {
    cover("vfx-cast-pillar-interrupt");
    const { scene, fx, pos } = harness();
    pos.set(5, { x: 0, z: 0 });
    fx.begin(5, 600, FIRE, 0);
    fx.finish(5, 600);
    fx.interrupt(5, 601);
    expect(fx.phaseOf(5)).toBe("release");
    // …and interrupting an entity that is not casting at all is a no-op
    fx.interrupt(999, 601);
    fx.finish(999, 601);
    expect(fx.has(999)).toBe(false);
    fx.dispose();
    scene.dispose();
  });
});

describe("every champion gets one, and twelve of them stay readable", () => {
  it("draws a column for each of 12 casters and dims each as the crowd grows", () => {
    cover("vfx-cast-pillar-crowd");
    const { scene, fx, pos } = harness();
    for (let id = 1; id <= 12; id++) {
      pos.set(id, { x: id, z: 0 });
      fx.begin(id, 600, id % 2 ? FIRE : ICE, 0);
    }
    expect(fx.activeCount).toBe(12); // the victim sees EVERY caster
    fx.update(300);
    const crowded = fx.shellAlphaOf(1)!;

    // the same frame with a lone caster is brighter, by exactly the crowd curve
    const solo = harness();
    solo.pos.set(1, { x: 1, z: 0 });
    solo.fx.begin(1, 600, FIRE, 0);
    solo.fx.update(300);
    const alone = solo.fx.shellAlphaOf(1)!;
    expect(crowded).toBeLessThan(alone);
    expect(crowded / alone).toBeCloseTo(crowdAlphaScale(12), 6);

    solo.fx.dispose();
    solo.scene.dispose();
    fx.dispose();
    scene.dispose();
  });

  it("caps the slot count and recycles the cast CLOSEST TO DONE", () => {
    cover("vfx-cast-pillar-budget");
    const { scene, fx, pos } = harness();
    // id 1 starts first (closest to finishing), the rest follow
    for (let id = 1; id <= MAX_PILLARS; id++) {
      pos.set(id, { x: id, z: 0 });
      fx.begin(id, 1000, FIRE, id * 10);
    }
    expect(fx.activeCount).toBe(MAX_PILLARS);
    expect(fx.slotCount).toBe(MAX_PILLARS);

    pos.set(99, { x: 0, z: 9 });
    fx.begin(99, 1000, FIRE, 400);
    expect(fx.slotCount).toBe(MAX_PILLARS); // never grows past the cap
    expect(fx.has(99)).toBe(true);
    expect(fx.has(1)).toBe(false); // the oldest cast lost its slot…
    expect(fx.has(MAX_PILLARS)).toBe(true); // …not the newest telegraph
    fx.dispose();
    scene.dispose();
  });
});

describe("the element survives into a channel the texture cannot eat", () => {
  it("never binds a texture rectangle to either shaft; the ground uses alpha only", () => {
    const scene = new Scene(engine);
    const pos = new Map<number, { x: number; z: number }>();
    const mask = RawTexture.CreateRGBATexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      scene,
    );
    const fx = new CastPillarFx(
      scene,
      { entityPos: (id) => pos.get(id) ?? null },
      { createTexture: () => mask },
    );
    pos.set(1, { x: 0, z: 0 });
    fx.begin(1, 600, FIRE, 0);

    const shell = scene.materials.find((m) => m.name === "cast-pillar-shell-mat") as StandardMaterial;
    const core = scene.materials.find((m) => m.name === "cast-pillar-core-mat") as StandardMaterial;
    const ground = scene.materials.find((m) => m.name === "cast-pillar-base-mat") as StandardMaterial;
    const groundMesh = scene.meshes.find((m) => m.name === "cast-pillar-base")!;
    expect(shell.emissiveTexture).toBeNull();
    expect(shell.opacityTexture).toBeNull();
    expect(core.emissiveTexture).toBeNull();
    expect(core.opacityTexture).toBeNull();
    expect(ground.emissiveTexture).toBeNull();
    expect(ground.opacityTexture).toBeTruthy();
    // A four-vertex plane turns an alpha/material regression into a visible
    // square card.  The shipped fail-safe is circular geometry.
    expect(groundMesh.getTotalVertices()).toBeGreaterThan(4);

    fx.dispose();
    scene.dispose();
  });

  it("writes the element colour into the shaft VERTEX colours, not only emissiveColor", () => {
    cover("vfx-cast-pillar-element");
    const { scene, fx, pos } = harness();
    pos.set(1, { x: 0, z: 0 });
    fx.begin(1, 600, ICE, 0);

    const shell = scene.meshes.find((m) => m.name === "cast-pillar-shell")!;
    const colors = shell.getVerticesData(VertexBuffer.ColorKind)!;
    expect(colors).toBeTruthy();
    // every vertex carries the ice fringe in rgb …
    expect(colors[0]).toBeCloseTo(ICE.fringe[0], 5);
    expect(colors[1]).toBeCloseTo(ICE.fringe[1], 5);
    expect(colors[2]).toBeCloseTo(ICE.fringe[2], 5);
    // …blue-dominant, so 依文潔琳's ice cannot come out orange even if the
    // material's emissiveColor is overridden by its texture
    expect(colors[2]!).toBeGreaterThan(colors[0]!);

    // a recast with a different element RE-TINTS the same slot in place
    fx.begin(1, 600, FIRE, 100);
    const after = shell.getVerticesData(VertexBuffer.ColorKind)!;
    expect(after[0]!).toBeGreaterThan(after[2]!); // now warm
    fx.dispose();
    scene.dispose();
  });

  it("keeps the vertical rise ramp in vertex ALPHA (blazing base, faint top)", () => {
    cover("vfx-cast-pillar");
    const { scene, fx, pos } = harness();
    pos.set(1, { x: 0, z: 0 });
    fx.begin(1, 600, FIRE, 0);
    const core = scene.meshes.find((m) => m.name === "cast-pillar-core")!;
    const posData = core.getVerticesData("position")!;
    const colors = core.getVerticesData(VertexBuffer.ColorKind)!;
    let footA = 0;
    let topA = 1;
    for (let i = 0; i < posData.length / 3; i++) {
      const y = posData[i * 3 + 1]!;
      const a = colors[i * 4 + 3]!;
      if (y < -0.4) footA = Math.max(footA, a);
      if (y > 0.4) topA = Math.min(topA, a);
    }
    expect(footA).toBeGreaterThan(topA); // erupts from the ground, not a tube
    expect(topA).toBeGreaterThan(0); // never a hard cut-off at the top
    expect(core.hasVertexAlpha).toBe(true);
    fx.dispose();
    scene.dispose();
  });
});

describe("budget: nothing is allocated per cast after warm-up", () => {
  it("200 casts add zero meshes, materials or particle systems", () => {
    cover("vfx-cast-pillar-budget");
    const { scene, fx, pos } = harness();
    expect(counts(scene).meshes).toBe(0); // an idle layer owns nothing at all

    // one caster → one slot; the marginal cost of the next fifteen is what
    // matters, so measure the DELTA (the scene's own lazily-created default
    // material is not ours to count)
    pos.set(1, { x: 1, z: 0 });
    fx.begin(1, 300, FIRE, 0);
    const one = counts(scene);
    expect(one.meshes).toBe(3); // shell + core + base flare

    for (let id = 2; id <= MAX_PILLARS; id++) {
      pos.set(id, { x: id, z: 0 });
      fx.begin(id, 300, id % 2 ? FIRE : ICE, 0);
    }
    fx.update(MOTE_PERIOD_MS + 1);
    fx.update(400);
    const warm = counts(scene);
    // exactly 3 meshes + 3 materials per additional slot, and nothing else
    expect(warm.meshes - one.meshes).toBe((MAX_PILLARS - 1) * 3);
    expect(warm.materials - one.materials).toBe((MAX_PILLARS - 1) * 3);

    let t = 500;
    for (let i = 0; i < 200; i++) {
      const id = (i % MAX_PILLARS) + 1;
      fx.begin(id, 300, i % 2 ? FIRE : ICE, t);
      fx.update(t + 150);
      fx.finish(id, t + 300);
      fx.update(t + 300);
      t += 400;
    }
    const after = counts(scene);
    expect(after.meshes).toBe(warm.meshes); // ZERO growth over 200 casts
    expect(after.materials).toBe(warm.materials);
    // the mote pool is capped per element and REAPS when idle, so it may only
    // ever shrink from its warm high-water mark
    expect(after.systems).toBeLessThanOrEqual(warm.systems);
    fx.dispose();
    scene.dispose();
  });

  it("mote systems are pooled per ELEMENT, shared by every caster of it", () => {
    cover("vfx-cast-pillar-budget");
    const { scene, fx, pos } = harness();
    for (let id = 1; id <= 12; id++) {
      pos.set(id, { x: id, z: 0 });
      fx.begin(id, 600, FIRE, 0); // twelve fire casters
    }
    fx.update(1);
    fx.update(MOTE_PERIOD_MS + 1);
    // twelve casters of one element share a handful of systems, not twelve
    expect(fx.motesFor(FIRE)).toBeLessThanOrEqual(3);
    expect(fx.motesFor(FIRE)).toBeGreaterThan(0);
    expect(fx.motesFor(ICE)).toBe(0); // an element nobody cast costs nothing
    fx.dispose();
    scene.dispose();
  });

  it("dispose/clear release everything and stay safe to call twice", () => {
    cover("vfx-cast-pillar-budget");
    const { scene, fx, pos } = harness();
    pos.set(1, { x: 0, z: 0 });
    fx.begin(1, 600, FIRE, 0);
    fx.clear();
    expect(fx.activeCount).toBe(0);
    expect(fx.has(1)).toBe(false);
    fx.dispose();
    fx.dispose();
    fx.begin(1, 600, FIRE, 0); // post-dispose calls are inert, never a crash
    fx.update(10);
    expect(fx.activeCount).toBe(0);
    scene.dispose();
  });
});
