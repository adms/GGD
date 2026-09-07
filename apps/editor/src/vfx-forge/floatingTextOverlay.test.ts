import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
vi.mock("../../../client/src/render/QualityController", () => ({ qualityController: { getParams: () => ({ particleDensity: 1 }) } }));
import { VfxSystem } from "../../../client/src/vfx/VfxSystem";
import { CameraRig } from "../../../client/src/render/CameraRig";
import { projectFloatingTexts } from "./floatingTextOverlay";

describe("Forge world-anchored authored floating text", () => {
  it("renders both actual VfxSystem subjects with their authored colors and expiry", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new CameraRig(scene, { x: 0, z: 0 });
    const vfx = new VfxSystem(scene, { entityPos: () => ({ x: 0, z: 0 }) });
    try {
      scene.render();
      vfx.update(0);
      for (const [id, x, text, colorRgb] of [
        [1, -3, "怎麼反而變強了？！", [255, 230, 128]],
        [2, 3, "反轉增益 ↑", [255, 204, 38]],
      ] as const) vfx.handleEvent({ type: "floatingText", tick: 1, data: {
        caster: 1, subjects: [{ id, x, z: 0 }], text, colorRgb, durationSec: 1.2, sizeScale: 1,
      } }, 0);
      vfx.update(400);
      const before = structuredClone(vfx.floatingTextEntries);
      const project = (x: number, y: number, z: number) => camera.projectToScreen(x, y, z);
      const texts = projectFloatingTexts(vfx.floatingTextEntries, project);
      expect(texts).toHaveLength(2);
      expect(texts.map(text => text.text)).toEqual(["怎麼反而變強了？！", "反轉增益 ↑"]);
      expect(texts.map(text => text.color)).toEqual(["rgb(255, 230, 128)", "rgb(255, 204, 38)"]);
      expect(texts[0]!.x === texts[1]!.x && texts[0]!.y === texts[1]!.y).toBe(false);
      expect(texts.every(text => text.alpha > 0 && Number.isFinite(text.x + text.y))).toBe(true);
      expect(projectFloatingTexts(vfx.floatingTextEntries, () => ({ sx: 0, sy: 0, visible: false }))).toEqual([]);
      expect(vfx.floatingTextEntries).toEqual(before);
      for (let ms = 500; ms <= 2000; ms += 100) vfx.update(ms);
      expect(projectFloatingTexts(vfx.floatingTextEntries, project)).toEqual([]);
    } finally { vfx.dispose(); scene.dispose(); engine.dispose(); }
  });
});
