import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ScriptBeamFx, type ScriptBeamEvent } from "./ScriptBeamFx";

const EVENT: ScriptBeamEvent = {
  x: 1,
  z: 2,
  dx: 0,
  dz: 1,
  lengthU: 8,
  widthU: 1.4,
  heightU: 1.2,
  pitchDeg: 0,
  travelU: 6,
  durationSec: 1,
  colorRgb: [72, 164, 255],
  alpha: 0.9,
};

describe("VFX script presentation beam", () => {
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

  it("creates emissive geometry, moves along the authored direction and self-cleans", () => {
    const fx = new ScriptBeamFx(scene);
    fx.spawn(EVENT, 100);

    const root = scene.getTransformNodeByName("vfx-script-beam");
    expect(root).not.toBeNull();
    expect(root?.position.asArray()).toEqual([1, 1.2, 2]);
    expect(scene.getMeshByName("vfx-script-beam-core-mesh")).not.toBeNull();
    expect(scene.getMeshByName("vfx-script-beam-glow-mesh")).not.toBeNull();

    fx.update(600);
    expect(root?.position.z).toBeCloseTo(2 + 6 * (0.5 / 0.85), 5);
    fx.update(1100);
    expect(scene.getTransformNodeByName("vfx-script-beam")).toBeNull();
  });
});
