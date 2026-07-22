/**
 * Lighting — one hemispheric fill + one angled directional key light. Returns
 * a handle so the quality settings can toggle "shadows": the scene has no
 * shadow-map pass yet, so the toggle modulates the directional key light (off
 * → flatter, cheaper shading; on → full directional contrast). Wired through
 * QualityController; ready to drive a real ShadowGenerator later.
 */
import type { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";

const SUN_ON = 0.9;
const SUN_OFF = 0.25;

export interface LightingHandle {
  setShadowsEnabled(on: boolean): void;
}

export function setupLighting(scene: Scene): LightingHandle {
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.75;
  hemi.diffuse = new Color3(0.9, 0.92, 1.0);
  hemi.groundColor = new Color3(0.18, 0.16, 0.22);

  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.35), scene);
  sun.intensity = SUN_ON;
  sun.diffuse = new Color3(1.0, 0.96, 0.88);

  return {
    setShadowsEnabled(on: boolean): void {
      sun.intensity = on ? SUN_ON : SUN_OFF;
      // bump the fill a touch when the key light is dimmed so it isn't murky
      hemi.intensity = on ? 0.75 : 0.95;
    },
  };
}
