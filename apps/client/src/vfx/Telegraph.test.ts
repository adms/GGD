/**
 * vfx-telegraph-resolve (task #33): the AoE telegraph keeps its readable
 * fill-then-fire read, but the RESOLVE moment now pays off — on the frame the
 * AoE fires it spawns an expanding ground shockwave plus a layered ember/dust
 * kick, exactly once, and the telegraph fades exponentially instead of
 * linearly. Everything is pooled: no mesh or ParticleSystem is allocated per
 * cast after the first, and a ring mesh is only ever reused at the radius its
 * geometry was built for (the telegraph is the "the AoE lands HERE" contract).
 * Runs on NullEngine.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Telegraph, telegraphPoolStats, SHOCKWAVE_MS } from "./Telegraph";

const FILL_MS = 300;
const HOLD_MS = 150;

let engine: NullEngine;

beforeAll(() => {
  engine = new NullEngine();
});
afterAll(() => {
  engine.dispose();
});

/** Fresh scene per test: the pools are per-scene (WeakMap keyed by scene). */
function withScene<T>(fn: (scene: Scene) => T): T {
  const scene = new Scene(engine);
  try {
    return fn(scene);
  } finally {
    scene.dispose();
  }
}

/** Run a telegraph to completion, returning the frame times it was updated. */
function runToDone(t: Telegraph, bornMs: number): number {
  let now = bornMs;
  for (let i = 0; i < 200 && !t.done; i++) {
    now += 16;
    t.update(now);
  }
  return now;
}

describe("Telegraph resolve pop (vfx-telegraph-resolve)", () => {
  it("fills, then fires the shockwave + kick EXACTLY once, then finishes", () => {
    cover("vfx-telegraph-resolve");
    withScene((scene) => {
      const meshesBefore = scene.meshes.length;
      const psBefore = scene.particleSystems.length;
      const t = new Telegraph(scene, 3, -4, 2, 1000, FILL_MS, HOLD_MS);

      // ring + fill are up immediately (the area reads before it resolves)
      expect(scene.meshes.length - meshesBefore).toBe(2);
      expect(t.resolveFired).toBe(false);

      // mid-fill: the disc is still growing, nothing has fired
      t.update(1000 + FILL_MS / 2);
      expect(t.resolveFired).toBe(false);
      expect(scene.particleSystems.length).toBe(psBefore);

      // the frame the AoE FIRES: shockwave mesh + ember/dust kick systems
      t.update(1000 + FILL_MS + 16);
      expect(t.resolveFired).toBe(true);
      expect(scene.meshes.length - meshesBefore).toBe(3); // + shockwave torus
      expect(scene.particleSystems.length - psBefore).toBe(2); // embers + dust

      // …and never again, however many frames run
      const psAfterResolve = scene.particleSystems.length;
      const meshAfterResolve = scene.meshes.length;
      runToDone(t, 1000 + FILL_MS + 16);
      expect(t.done).toBe(true);
      expect(scene.particleSystems.length).toBe(psAfterResolve);
      expect(scene.meshes.length).toBe(meshAfterResolve);
    });
  });

  it("stays alive until the shockwave finishes expanding, then pools its meshes", () => {
    cover("vfx-telegraph-resolve");
    withScene((scene) => {
      const t = new Telegraph(scene, 0, 0, 1.5, 0, FILL_MS, HOLD_MS);
      // fade is over at fillMs+holdMs, but the shockwave still has ~130ms left
      t.update(FILL_MS + HOLD_MS + 16);
      expect(t.done).toBe(false);
      expect(telegraphPoolStats(scene).rings).toBe(1); // ring/fill already pooled
      expect(telegraphPoolStats(scene).fills).toBe(1);
      expect(telegraphPoolStats(scene).shocks).toBe(0); // shock still on screen

      const end = runToDone(t, FILL_MS + HOLD_MS + 16);
      expect(t.done).toBe(true);
      expect(end).toBeGreaterThanOrEqual(FILL_MS + SHOCKWAVE_MS);
      expect(telegraphPoolStats(scene).shocks).toBe(1); // …now pooled too
    });
  });

  it("fades exponentially (not linearly) after the fill completes", () => {
    cover("vfx-telegraph-resolve");
    withScene((scene) => {
      const t = new Telegraph(scene, 0, 0, 1.5, 0, FILL_MS, HOLD_MS);
      const ring = scene.meshes.find((m) => m.name === "telegraph-ring")!;
      const alpha = (): number => (ring.material as StandardMaterial).alpha;
      const a0 = alpha();
      t.update(FILL_MS + HOLD_MS / 2); // halfway through the fade
      const half = alpha();
      // linear would sit at 50% of the start alpha; (1-t)² sits at ~25%
      expect(half).toBeLessThan(a0 * 0.35);
      expect(half).toBeGreaterThan(0);
      t.update(FILL_MS + HOLD_MS - 1);
      expect(alpha()).toBeLessThan(half);
    });
  });

  it("recycles pooled meshes for a repeat cast — zero allocation per cast", () => {
    cover("vfx-telegraph-resolve");
    withScene((scene) => {
      const first = new Telegraph(scene, 0, 0, 2, 0, FILL_MS, HOLD_MS);
      runToDone(first, 0);
      const meshesAfterFirst = scene.meshes.length;
      const psAfterFirst = scene.particleSystems.length;

      const second = new Telegraph(scene, 9, 9, 2, 5000, FILL_MS, HOLD_MS);
      runToDone(second, 5000);
      // same radius → ring/fill/shock meshes and the kick systems all reused
      expect(scene.meshes.length).toBe(meshesAfterFirst);
      expect(scene.particleSystems.length).toBe(psAfterFirst);
    });
  });

  it("never reuses a ring built for a DIFFERENT radius (readability contract)", () => {
    cover("vfx-telegraph-resolve");
    withScene((scene) => {
      // the ring currently on screen (pooled ones are disabled, and a reused
      // mesh keeps its original position in scene.meshes)
      const extent = (): number => {
        const live = scene.meshes.filter((m) => m.name === "telegraph-ring" && m.isEnabled());
        expect(live).toHaveLength(1);
        return live[0]!.getBoundingInfo().boundingBox.extendSize.x;
      };
      const a = new Telegraph(scene, 0, 0, 0.9, 0, FILL_MS, HOLD_MS);
      expect(extent()).toBeCloseTo(0.9 + 0.06, 2); // radius + half thickness
      runToDone(a, 0);
      expect(telegraphPoolStats(scene).rings).toBe(1);

      // 1.1 lands in the same 0.25-wide bucket the old key used — it must NOT
      // borrow the 0.9 ring (that shipped a 22%-wrong AoE outline)
      const b = new Telegraph(scene, 0, 0, 1.1, 5000, FILL_MS, HOLD_MS);
      expect(extent()).toBeCloseTo(1.1 + 0.06, 2);
      runToDone(b, 5000);
      expect(telegraphPoolStats(scene).rings).toBe(2); // one free-list per radius

      // …while an exact repeat of 0.9 still recycles
      const meshes = scene.meshes.length;
      const c = new Telegraph(scene, 0, 0, 0.9, 9000, FILL_MS, HOLD_MS);
      expect(scene.meshes.length).toBe(meshes);
      expect(extent()).toBeCloseTo(0.9 + 0.06, 2);
      c.dispose();
    });
  });

  it("dispose() before the resolve pops nothing and returns the meshes", () => {
    cover("vfx-telegraph-resolve");
    withScene((scene) => {
      const psBefore = scene.particleSystems.length;
      const t = new Telegraph(scene, 0, 0, 1.2, 0, FILL_MS, HOLD_MS);
      t.update(100);
      t.dispose();
      expect(t.done).toBe(true);
      expect(t.resolveFired).toBe(false);
      expect(scene.particleSystems.length).toBe(psBefore);
      expect(telegraphPoolStats(scene).rings).toBe(1);
      expect(telegraphPoolStats(scene).fills).toBe(1);
      t.update(9999); // post-dispose updates are inert
      expect(t.resolveFired).toBe(false);
    });
  });
});
