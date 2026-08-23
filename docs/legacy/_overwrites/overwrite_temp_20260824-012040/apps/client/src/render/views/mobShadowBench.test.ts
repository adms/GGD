/** GH#647 暫時 bench —— 量完即刪,不進 commit。60 隻普通殭屍(R7: 30×2 區)影子開/關的 scene.render() CPU ms/frame。 */
import { describe, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ChampionView } from "./ChampionView";

function bench(suppress: boolean): number {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const cam = new FreeCamera("c", new Vector3(0, 20, -20), scene);
  cam.setTarget(Vector3.Zero());
  scene.activeCamera = cam;
  for (let i = 0; i < 60; i++) {
    const v = new ChampionView(scene, i + 1, "champ.godie-zombiex", 0, { skin: null });
    v.setPose((i % 10) * 2 - 9, Math.floor(i / 10) * 2 - 5, 0, 1);
    v.setShadowSuppressed(suppress);
  }
  for (let f = 0; f < 50; f++) scene.render();
  const FRAMES = 400;
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) scene.render();
  const ms = (performance.now() - t0) / FRAMES;
  const enabled = scene.meshes.filter((m) => m.isEnabled()).length;
  console.log(
    `[bench] suppress=${suppress} ${ms.toFixed(4)} ms/frame · meshes ${scene.meshes.length} (enabled ${enabled})`,
  );
  scene.dispose();
  engine.dispose();
  return ms;
}

describe("GH#647 bench", () => {
  it("60 mobs, shadows on vs off (two rounds, JIT-warmed)", () => {
    bench(false);
    bench(true);
    const on = bench(false);
    const off = bench(true);
    console.log(`[bench] FINAL on=${on.toFixed(4)} off=${off.toFixed(4)} saved=${(on - off).toFixed(4)} ms/frame (CPU, NullEngine)`);
  }, 120000);
});
