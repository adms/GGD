/**
 * task #59 — WhirlwindFx: the whirlwind that WC3 gated on ONE sequence and the
 * glb shipped always-on. These tests pin the two halves of the bug report:
 * it must be ABSENT in idle/run and PRESENT + ROTATING while casting.
 * Runs on NullEngine (createTexture: () => null skips image decode).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// the QualityController singleton touches localStorage at import time (Node
// exposes a non-functional localStorage global) — stub the live params
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  WhirlwindFx,
  WHIRLWIND_BINDINGS,
  MAX_ACTIVE_WHIRLWINDS,
  spinAngle,
  envelopeAlpha,
  funnelRadius,
  stateActive,
  debrisSpec,
  type WhirlwindBinding,
  type WhirlwindState,
} from "./WhirlwindFx";

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
const ZORO = "imported.heromusashimiyamoto";
const BINDING = WHIRLWIND_BINDINGS[ZORO]!;

/** A champion root with the model's real WC3 attachment joint under it. */
function makeRig(name: string): { root: TransformNode; bone: TransformNode } {
  const root = new TransformNode(name, scene);
  const bone = new TransformNode(`${name}-whirlWindDummy`, scene);
  bone.parent = root;
  return { root, bone };
}

function fx(bindings?: Record<string, WhirlwindBinding>): WhirlwindFx {
  return new WhirlwindFx(scene, { ...NO_TEX, getScale: () => 1, ...(bindings ? { bindings } : {}) });
}

describe("pure math", () => {
  it("spinAngle wraps into [0, 2π) and advances with time", () => {
    expect(spinAngle(0, 7.5)).toBe(0);
    expect(spinAngle(100, 7.5)).toBeCloseTo(0.75, 6);
    const full = (2 * Math.PI * 1000) / 7.5;
    expect(spinAngle(full, 7.5)).toBeLessThan(1e-6);
    expect(spinAngle(full * 3.25, 7.5)).toBeGreaterThanOrEqual(0);
    expect(spinAngle(1000, -7.5)).toBeGreaterThanOrEqual(0);
    expect(spinAngle(1000, -7.5)).toBeLessThan(Math.PI * 2);
  });

  it("envelopeAlpha ramps in, holds, then ramps out", () => {
    expect(envelopeAlpha(0, 0, Infinity, 0.1)).toBe(0);
    expect(envelopeAlpha(50, 0, Infinity, 0.1)).toBeCloseTo(0.5, 6);
    expect(envelopeAlpha(100, 0, Infinity, 0.1)).toBe(1);
    expect(envelopeAlpha(5000, 0, Infinity, 0.1)).toBe(1); // holds while gated
    expect(envelopeAlpha(1050, 0, 1000, 0.1)).toBeCloseTo(0.5, 6);
    expect(envelopeAlpha(1100, 0, 1000, 0.1)).toBe(0);
    expect(envelopeAlpha(9999, 0, 1000, 0.1)).toBe(0);
  });

  it("envelopeAlpha never exceeds the rise when released mid-fade-in", () => {
    // released 20ms into a 100ms fade: must not jump to full
    expect(envelopeAlpha(20, 0, 20, 0.1)).toBeCloseTo(0.2, 6);
    expect(envelopeAlpha(60, 0, 20, 0.1)).toBeLessThanOrEqual(0.6);
  });

  it("funnelRadius interpolates bottom→top and clamps", () => {
    expect(funnelRadius(0, 0.3, 1.0)).toBeCloseTo(0.3, 6);
    expect(funnelRadius(1, 0.3, 1.0)).toBeCloseTo(1.0, 6);
    expect(funnelRadius(0.5, 0.3, 1.0)).toBeCloseTo(0.65, 6);
    expect(funnelRadius(-3, 0.3, 1.0)).toBeCloseTo(0.3, 6);
    expect(funnelRadius(7, 0.3, 1.0)).toBeCloseTo(1.0, 6);
  });

  it("debris burst stays inside the toolkit's overdraw discipline", () => {
    const spec = debrisSpec(BINDING);
    expect(spec.count).toBeLessThanOrEqual(80);
    expect(spec.lifetimeSec.max).toBeLessThanOrEqual(0.6);
    expect(spec.blend).toBe("alpha");
    expect(spec.flatRing).toBeDefined();
  });
});

describe("Zoro's binding matches the source MDX intent", () => {
  it("anchors at the WC3 attachment point the stripper preserved", () => {
    expect(BINDING.anchorBone).toBe("whirlWindDummy");
  });

  it("is gated on cast ONLY — never idle/run/death", () => {
    expect(stateActive(BINDING, "cast")).toBe(true);
    for (const s of ["idle", "run", "hurt", "death"] as WhirlwindState[]) {
      expect(stateActive(BINDING, s)).toBe(false);
    }
  });

  it("actually spins", () => {
    expect(Math.abs(BINDING.spinRadPerSec)).toBeGreaterThan(1);
  });

  it("is sized to engulf a 1.7u hero, not the lane (WC3 shipped 2.6u radius)", () => {
    expect(BINDING.topRadius).toBeLessThan(1.5);
    expect(BINDING.height).toBeLessThanOrEqual(1.7);
  });

  it("WhirlwindFx.handles only knows bound models", () => {
    expect(WhirlwindFx.handles(ZORO)).toBe(true);
    expect(WhirlwindFx.handles("imported.herosaber")).toBe(false);
  });
});

describe("state gate (the bug report, verbatim)", () => {
  it("builds NOTHING while the champion only ever idles or runs", () => {
    const w = fx();
    const { root } = makeRig("idle-only");
    for (let t = 0; t < 2000; t += 16) {
      w.sync(1, ZORO, root, t % 500 < 250 ? "idle" : "run", t);
      w.tick(t, 16);
    }
    expect(w.has(1)).toBe(false);
    expect(w.activeCount).toBe(0);
    w.dispose();
  });

  it("appears on cast, rotates while held, and disappears after release", () => {
    const w = fx();
    const { root, bone } = makeRig("caster");

    // idle: absent
    w.sync(2, ZORO, root, "idle", 0);
    w.tick(0, 16);
    expect(w.has(2)).toBe(false);

    // cast begins: pinned to the real joint's world position and enabled
    bone.position.set(0.4, 1.3, -0.2);
    w.sync(2, ZORO, root, "cast", 100);
    w.tick(100, 16);
    expect(w.has(2)).toBe(true);
    expect(w.activeCount).toBe(1);
    const pivot = scene.transformNodes.find((n) => n.name === "whirlwind-pivot")!;
    expect(pivot.position.x).toBeCloseTo(0.4, 5);
    expect(pivot.position.y).toBeCloseTo(1.3 + BINDING.yOffset, 5);
    expect(pivot.position.z).toBeCloseTo(-0.2, 5);

    // ROTATION: the yaw must actually change frame to frame
    const funnel = scene.meshes.find((m) => m.name === "whirlwind-outer")!;
    const angles: number[] = [];
    for (let t = 116; t < 500; t += 16) {
      w.sync(2, ZORO, root, "cast", t);
      w.tick(t, 16);
      angles.push(funnel.rotation.y);
    }
    expect(new Set(angles.map((a) => a.toFixed(4))).size).toBeGreaterThan(5);
    expect(angles.some((a, i) => i > 0 && a !== angles[i - 1])).toBe(true);

    // release: the envelope closes and the meshes go dormant
    for (let t = 500; t < 900; t += 16) {
      w.sync(2, ZORO, root, "idle", t);
      w.tick(t, 16);
    }
    expect(w.activeCount).toBe(0);
    expect(funnel.parent && (funnel.parent as TransformNode).isEnabled()).toBe(false);
    w.dispose();
  });

  it("re-arms cleanly when a second cast lands during the fade-out tail", () => {
    const w = fx();
    const { root } = makeRig("re-arm");
    w.sync(3, ZORO, root, "cast", 0);
    w.tick(0, 16);
    for (let t = 16; t < 200; t += 16) {
      w.sync(3, ZORO, root, "cast", t);
      w.tick(t, 16);
    }
    w.sync(3, ZORO, root, "idle", 200); // release
    w.tick(200, 16);
    w.sync(3, ZORO, root, "cast", 216); // re-cast inside the tail
    w.tick(216, 16);
    expect(w.activeCount).toBe(1);
    w.dispose();
  });

  it("caps simultaneous whirlwinds", () => {
    const w = fx();
    for (let i = 0; i < MAX_ACTIVE_WHIRLWINDS + 4; i++) {
      const { root } = makeRig(`cap-${i}`);
      w.sync(100 + i, ZORO, root, "cast", 0);
    }
    w.tick(0, 16);
    expect(w.activeCount).toBeLessThanOrEqual(MAX_ACTIVE_WHIRLWINDS);
    w.dispose();
  });
});

describe("world-upright anchoring (the flopping-funnel regression)", () => {
  it("stays vertical and unmirrored under a rotated, mirrored attachment joint", () => {
    // Live measurement that motivated this: parenting the pivot to the joint
    // left the funnel within 15° of upright in only 30.4% of enabled frames,
    // tilting all the way to 180° (wide end down), because `whirlWindDummy` is
    // animated AND the MDX→glTF conversion mirrors its basis.
    const w = fx();
    const { root, bone } = makeRig("mirrored-joint");
    bone.position.set(0.2, 1.4, 0.1);
    bone.rotation.set(1.1, 0.7, -0.9);
    bone.scaling.set(1, -1, 1); // determinant < 0 — a flip, not a rotation

    w.sync(21, ZORO, root, "cast", 0);
    w.tick(0, 16);
    const outer = scene.meshes.find((m) => m.name === "whirlwind-outer")!;
    outer.computeWorldMatrix(true);
    const m = outer.getWorldMatrix().m;
    // rows 0..2 are the world basis; row 1 is UP — must be exactly world +Y
    expect(m[4]).toBeCloseTo(0, 5);
    expect(m[5]).toBeCloseTo(1, 5);
    expect(m[6]).toBeCloseTo(0, 5);
    // ...while still sitting on the joint, and above it, never below
    expect(m[12]).toBeCloseTo(0.2, 5);
    expect(m[14]).toBeCloseTo(0.1, 5);
    expect(m[13]).toBeGreaterThan(1.4);
    w.dispose();
  });

  it("keeps following the joint after it moves (the hero walks mid-cast)", () => {
    const w = fx();
    const { root, bone } = makeRig("moving-joint");
    bone.position.set(0, 1.2, 0);
    w.sync(23, ZORO, root, "cast", 0);
    w.tick(0, 16);
    root.position.set(9, 0, -4); // the champion's root moved this frame
    w.sync(23, ZORO, root, "cast", 16);
    w.tick(16, 16);
    const pivot = scene.transformNodes.find((n) => n.name === "whirlwind-pivot")!;
    expect(pivot.position.x).toBeCloseTo(9, 5);
    expect(pivot.position.z).toBeCloseTo(-4, 5);
    w.dispose();
  });
});

describe("lifecycle + pooling", () => {
  it("unbound models are a no-op", () => {
    const w = fx();
    const { root } = makeRig("unbound");
    w.sync(7, "imported.herosaber", root, "cast", 0);
    w.tick(0, 16);
    expect(w.has(7)).toBe(false);
    w.dispose();
  });

  it("reuses pooled funnels instead of allocating per cast", () => {
    const w = fx();
    const { root } = makeRig("pooling");
    const before = scene.meshes.length;
    for (let cycle = 0; cycle < 5; cycle++) {
      const t0 = cycle * 1000;
      w.sync(9, ZORO, root, "cast", t0);
      w.tick(t0, 16);
      w.detach(9);
    }
    // 2 shells built once, then pooled: no growth across the later cycles
    expect(scene.meshes.length - before).toBeLessThanOrEqual(2);
    w.dispose();
  });

  it("sweep detaches entities that vanished", () => {
    const w = fx();
    const { root } = makeRig("sweep");
    w.sync(11, ZORO, root, "cast", 0);
    w.tick(0, 16);
    expect(w.has(11)).toBe(true);
    w.sweep(new Set<number>());
    expect(w.has(11)).toBe(false);
    w.dispose();
  });

  it("re-binds when the entity's model or root changes", () => {
    const w = fx();
    const a = makeRig("rebind-a");
    const b = makeRig("rebind-b");
    w.sync(13, ZORO, a.root, "cast", 0);
    w.tick(0, 16);
    w.sync(13, ZORO, b.root, "cast", 16);
    w.tick(16, 16);
    expect(w.has(13)).toBe(true);
    w.dispose();
  });

  it("resolves the anchor bone late (the .glb streams in async)", () => {
    const w = fx();
    const root = new TransformNode("late-glb", scene); // no joint yet
    w.sync(15, ZORO, root, "cast", 0);
    w.tick(0, 16);
    expect(w.has(15)).toBe(true); // parked on the root, not dropped

    const bone = new TransformNode("late-glb-whirlWindDummy", scene);
    bone.parent = root;
    bone.position.set(3, 1.1, -5);
    w.sync(15, ZORO, root, "cast", 600);
    w.tick(600, 16); // past BONE_RESCAN_MS
    const pivot = scene.transformNodes.find((n) => n.name === "whirlwind-pivot")!;
    expect(pivot.position.x).toBeCloseTo(3, 5); // moved onto the late joint
    expect(pivot.position.z).toBeCloseTo(-5, 5);
    w.dispose();
  });

  it("dispose is idempotent and releases everything", () => {
    const w = fx();
    const { root } = makeRig("dispose");
    w.sync(17, ZORO, root, "cast", 0);
    w.tick(0, 16);
    w.dispose();
    w.dispose();
    w.sync(17, ZORO, root, "cast", 100); // post-dispose sync is inert
    expect(w.has(17)).toBe(false);
  });
});
