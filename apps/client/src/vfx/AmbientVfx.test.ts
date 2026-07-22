/**
 * ambient-binding-resolve (task #30): the AmbientVfx channel resolves
 * ambient-vfx config bindings for a modelKey into pooled particle emitters /
 * ribbon trails parented to the doc's anchorBone node (found by name under
 * the view root, with late re-resolution while the .glb streams in, and a
 * root fallback). attach is idempotent; detach/sweep return resources to the
 * pool. Runs on NullEngine.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// the QualityController singleton touches localStorage at import time (Node
// exposes a non-functional localStorage global) — stub the live params
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { VfxDoc, RibbonDoc } from "@ggd/shared/content";
import { AmbientVfx, type AmbientContentHooks } from "./AmbientVfx";
import { SWING_FULL_SPEED } from "./ribbonMath";
import { swingEmitScale, SWING_TRAIL_IDLE_RATE, SWING_TRAIL_MAX_LIFE_SEC } from "./swingTrailMath";

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

const GLOW_DOC: VfxDoc = {
  id: "fx.amb-glow",
  schema: "vfx@1",
  emitter: { shape: "point" },
  mode: "continuous",
  rate: 20,
  lifetimeSec: { min: 0.3, max: 0.6 },
  size: { start: 0.3, end: 0.1 },
  color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
  blendMode: "additive",
  anchorBone: "Bone_Chest",
  ambient: true,
};

const RIBBON_DOC: RibbonDoc = {
  id: "fx.amb-ribbon",
  schema: "ribbon@1",
  widthAbove: 0.3,
  widthBelow: 0.1,
  lifespanSec: 0.25,
  color: [1, 0.2, 0.2, 1],
  blendMode: "additive",
  anchorBone: "Bone_Weapon",
};

function hooks(bindings: Record<string, { vfx: string }[]>): AmbientContentHooks {
  return {
    bindingsFor: (key) => bindings[key] ?? [],
    vfxDocFor: (id) => (id === GLOW_DOC.id ? GLOW_DOC : null),
    ribbonDocFor: (id) => (id === RIBBON_DOC.id ? RIBBON_DOC : null),
  };
}

/** champion-view stand-in: root with a named glb-joint child. */
function makeRig(withBones: boolean): { root: TransformNode; chest: TransformNode | null } {
  const root = new TransformNode("champ-1", scene);
  if (!withBones) return { root, chest: null };
  const glb = new TransformNode("champ-1-glb", scene);
  glb.parent = root;
  const chest = new TransformNode("1-Bone_Chest", scene); // instantiation prefix
  chest.parent = glb;
  const weapon = new TransformNode("1-Bone_Weapon", scene);
  weapon.parent = glb;
  return { root, chest };
}

/** emitter meshes currently parented under `node` (transitively). */
function emittersUnder(node: TransformNode): Mesh[] {
  return node
    .getChildTransformNodes(false)
    .filter((n): n is Mesh => n instanceof Mesh && n.name.startsWith("ambient-"));
}

describe("AmbientVfx binding resolution (ambient-binding-resolve)", () => {
  it("attaches a particle emitter to the named anchor bone", () => {
    cover("ambient-binding-resolve");
    const ambient = new AmbientVfx(
      scene,
      hooks({ "champ.x": [{ vfx: GLOW_DOC.id }] }),
      { getScale: () => 1 },
    );
    const { root, chest } = makeRig(true);
    ambient.attach(1, "champ.x", root);
    expect(ambient.has(1)).toBe(true);
    const emitters = emittersUnder(chest!);
    expect(emitters).toHaveLength(1);
    expect(emitters[0]!.parent).toBe(chest);
    ambient.dispose();
  });

  it("falls back to the root and re-parents once the bone appears (async glb)", () => {
    cover("ambient-binding-resolve");
    const ambient = new AmbientVfx(
      scene,
      hooks({ "champ.x": [{ vfx: GLOW_DOC.id }] }),
      { getScale: () => 1 },
    );
    const { root } = makeRig(false); // no glb joints yet
    ambient.attach(1, "champ.x", root);
    const emitters = emittersUnder(root);
    expect(emitters).toHaveLength(1);
    expect(emitters[0]!.parent).toBe(root); // fallback
    ambient.tick(0, 16); // arms the rescan clock

    // the .glb lands: the named joint appears under the root
    const glb = new TransformNode("champ-1-glb", scene);
    glb.parent = root;
    const chest = new TransformNode("1-Bone_Chest", scene);
    chest.parent = glb;
    ambient.tick(600, 16); // past the rescan interval
    expect(emitters[0]!.parent).toBe(chest);
    ambient.dispose();
  });

  it("attaches ribbons, is idempotent, and pools on detach/sweep", () => {
    cover("ambient-binding-resolve");
    const ambient = new AmbientVfx(
      scene,
      hooks({ "champ.x": [{ vfx: GLOW_DOC.id }, { vfx: RIBBON_DOC.id }, { vfx: "fx.unauthored" }] }),
      { getScale: () => 1 },
    );
    const { root } = makeRig(true);
    const before = scene.meshes.length;
    ambient.attach(1, "champ.x", root);
    const afterAttach = scene.meshes.length;
    expect(afterAttach).toBeGreaterThan(before); // emitter mesh + ribbon mesh
    // idempotent: same (entity, modelKey, root) attaches nothing new
    ambient.attach(1, "champ.x", root);
    expect(scene.meshes.length).toBe(afterAttach);

    // sweep with the id kept → still attached
    ambient.sweep(new Set([1]));
    expect(ambient.has(1)).toBe(true);
    // sweep without it → detached, resources pooled (not disposed)
    ambient.sweep(new Set());
    expect(ambient.has(1)).toBe(false);
    expect(scene.meshes.length).toBe(afterAttach); // pooled, not destroyed

    // re-attach reuses the pooled resources (no new meshes)
    ambient.attach(2, "champ.x", root);
    expect(scene.meshes.length).toBe(afterAttach);
    ambient.dispose();
  });

  it("ticks ribbons and cycles ambient bursts without a bound model no-op", () => {
    cover("ambient-binding-resolve");
    const burstDoc: VfxDoc = { ...GLOW_DOC, id: "fx.amb-glow", mode: "burst", burstCount: 6 };
    // note: reuse GLOW_DOC id so hooks resolve it, but as a burst-mode doc
    const ambient = new AmbientVfx(
      scene,
      {
        bindingsFor: (key) => (key === "champ.x" ? [{ vfx: burstDoc.id }] : []),
        vfxDocFor: (id) => (id === burstDoc.id ? burstDoc : null),
        ribbonDocFor: () => null,
      },
      { getScale: () => 1 },
    );
    const { root } = makeRig(true);
    ambient.attach(1, "champ.x", root);
    ambient.tick(1000, 16); // first tick fires the burst
    const emitter = emittersUnder(root)[0]!;
    expect(emitter).toBeDefined();
    // unknown modelKey attaches nothing and never throws
    ambient.attach(9, "champ.unknown", new TransformNode("champ-9", scene));
    ambient.tick(1016, 16);
    ambient.dispose();
  });
});

/**
 * ambient-swing-gate (task #37): a weapon-bone particle emitter is a SWING
 * TRAIL. It must be retuned into the 刀光 budget when built and its emit rate
 * must follow the blade — a faint idle ember when the champion stands or
 * walks, full rate only during an actual arc. Driven-loop measurements: an
 * explicit nowMs/dtMs tick per frame, never a screenshot.
 */
describe("AmbientVfx weapon-trail swing gate (ambient-swing-gate)", () => {
  const FRAME_MS = 1000 / 60;

  /** rig whose bone can be swung relative to the root */
  function swingRig(): { root: TransformNode; bone: TransformNode } {
    const root = new TransformNode("champ-1", scene);
    const glb = new TransformNode("champ-1-glb", scene);
    glb.parent = root;
    const bone = new TransformNode("1-Bone_Chest", scene);
    bone.parent = glb;
    return { root, bone };
  }

  function sync(rig: { root: TransformNode; bone: TransformNode }): void {
    rig.root.computeWorldMatrix(true);
    rig.bone.parent!.computeWorldMatrix(true);
    rig.bone.computeWorldMatrix(true);
    for (const m of scene.meshes) m.computeWorldMatrix(true);
  }

  /** drive `ms` of frames moving the bone `speed` u/s and the root `rootSpeed`. */
  function drive(
    ambient: AmbientVfx,
    rig: { root: TransformNode; bone: TransformNode },
    startMs: number,
    ms: number,
    opts: { speed?: number; rootSpeed?: number } = {},
  ): number {
    let t = startMs;
    const end = startMs + ms;
    while (t < end) {
      t += FRAME_MS;
      rig.bone.position.x += ((opts.speed ?? 0) * FRAME_MS) / 1000;
      rig.root.position.z += ((opts.rootSpeed ?? 0) * FRAME_MS) / 1000;
      sync(rig);
      ambient.tick(t, FRAME_MS);
    }
    return t;
  }

  function trailSystem(): ParticleSystem {
    const ps = scene.particleSystems.find((p) => p.name.includes(GLOW_DOC.id));
    expect(ps).toBeDefined();
    return ps as ParticleSystem;
  }

  it("retunes the weapon-bone emitter into the 刀光 budget when it is built", () => {
    cover("ambient-swing-gate");
    const ambient = new AmbientVfx(scene, hooks({ "champ.x": [{ vfx: GLOW_DOC.id }] }), {
      getScale: () => 1,
    });
    ambient.attach(1, "champ.x", swingRig().root);
    const ps = trailSystem();
    // the doc authored 0.3–0.6 s; nothing on a blade may outlive the budget
    expect(GLOW_DOC.lifetimeSec.max).toBeGreaterThan(SWING_TRAIL_MAX_LIFE_SEC);
    expect(ps.maxLifeTime).toBeLessThanOrEqual(SWING_TRAIL_MAX_LIFE_SEC);
    // and the ramp has to actually reach nothing
    const grads = ps.getColorGradients()!;
    expect(grads[grads.length - 1]!.color1.a).toBe(0);
    ambient.dispose();
  });

  it("idles at an ember, opens on a swing, and is NOT fooled by walking", () => {
    cover("ambient-swing-gate");
    const ambient = new AmbientVfx(scene, hooks({ "champ.x": [{ vfx: GLOW_DOC.id }] }), {
      getScale: () => 1,
    });
    const rig = swingRig();
    ambient.attach(1, "champ.x", rig.root);
    const ps = trailSystem();
    const full = ps.emitRate / swingEmitScale(0); // the un-gated authored rate
    expect(full).toBeGreaterThan(1);

    // 1) standing still → the faint idle ember, never a trail
    let t = drive(ambient, rig, 0, 200);
    const idleRate = ps.emitRate;
    expect(idleRate).toBeLessThanOrEqual(Math.round(full * SWING_TRAIL_IDLE_RATE) + 1);

    // 2) RUNNING (root moves, bone rides along) → still the ember. World speed
    //    cannot separate a stroll from a swing; relative speed can.
    t = drive(ambient, rig, t, 300, { rootSpeed: 6 });
    expect(ps.emitRate).toBeLessThanOrEqual(idleRate + 1);

    // 3) a real arc → wide open
    t = drive(ambient, rig, t, 120, { speed: SWING_FULL_SPEED * 1.5 });
    expect(ps.emitRate).toBeGreaterThan(idleRate * 2);
    expect(ps.emitRate).toBeCloseTo(full, 0);

    // 4) blade stops → back to the ember on the very next frames
    t = drive(ambient, rig, t, 100);
    expect(ps.emitRate).toBeLessThanOrEqual(idleRate + 1);
    ambient.dispose();
  });

  it("reuses ONE pooled system across repeated swings — no unbounded growth", () => {
    cover("ambient-swing-gate");
    const ambient = new AmbientVfx(scene, hooks({ "champ.x": [{ vfx: GLOW_DOC.id }] }), {
      getScale: () => 1,
    });
    const rig = swingRig();
    ambient.attach(1, "champ.x", rig.root);
    const first = trailSystem();
    const systems = scene.particleSystems.length;
    const meshes = scene.meshes.length;

    // 40 attack-speed-capped swings: detach/attach cycles with arcs between
    let t = 0;
    for (let i = 0; i < 40; i++) {
      t = drive(ambient, rig, t, 100, { speed: SWING_FULL_SPEED * 2 });
      t = drive(ambient, rig, t, 60);
      ambient.detach(1);
      ambient.attach(1, "champ.x", rig.root);
    }
    expect(scene.particleSystems.length).toBe(systems); // pooled forever
    expect(scene.meshes.length).toBe(meshes);
    expect(trailSystem()).toBe(first); // literally the same instance
    // a re-attached pooled emitter starts at the ember, never mid-swing
    expect(first.emitRate).toBeLessThanOrEqual(
      Math.round((first.emitRate / swingEmitScale(0)) * SWING_TRAIL_IDLE_RATE) + 1,
    );
    ambient.dispose();
  });
});
