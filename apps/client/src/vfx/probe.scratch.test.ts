/** scratch probe: does VfxSystem's per-doc pool grow monotonically across rounds? */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { VfxDoc } from "@ggd/shared/content";
import { VfxSystem } from "./VfxSystem";

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

function doc(id: string): VfxDoc {
  return {
    id,
    schema: "vfx@1",
    emitter: { shape: "point" },
    mode: "burst",
    burstCount: 8,
    lifetimeSec: { min: 0.2, max: 0.5 },
    size: { start: 0.4, end: 0.1 },
    color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
    blendMode: "additive",
  };
}

describe("probe", () => {
  it("counts started systems per round", () => {
    const vfx = new VfxSystem(scene, { entityPos: (): null => null });
    const counts: number[] = [];
    let t = 1000;
    for (let round = 0; round < 4; round++) {
      for (let a = 0; a < 6; a++) {
        vfx.play(doc(`fx.r${round}-a${a}`), a, 0, t);
        t += 10;
      }
      // simulate a 30s gap between rounds (the shop) with per-frame updates
      for (let f = 0; f < 20; f++) {
        t += 1500;
        vfx.update(t);
      }
      counts.push(scene.particleSystems.filter((p) => p.isStarted()).length);
    }
    // eslint-disable-next-line no-console
    console.log("started systems per round:", counts, "total in scene:", scene.particleSystems.length);
    expect(counts.length).toBe(4);
    vfx.dispose();
  });
});
