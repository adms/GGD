/**
 * `model@1.fxLongAxis` —— 「**90 度橫放的 beam**」的**一條**承重守衛（#555）。
 *
 * owner 2026-08-22:「翻滾光束應該包含 90 度橫放的 beam 吧」
 *                  「許多角色的衝擊波特效橫放 beam」
 *
 * ⚠️ 缺陷可以量到而且是**恆等於零**的：`spawnModelFx` 只給了模型一個繞世界 Y 的
 * 偏航，而偏航是繞 Y 轉 —— 所以一份沿自己 X（或 Y）建的網格，它的長軸**永遠**
 * 垂直於行進方向，不管施法者朝哪裡、不管翻滾轉到第幾圈。下面第三條斷言就是它。
 *
 * 驗的是**機制**⛔ 不是角度數字（第二守則）：把宣告的長軸推過**出貨的場景樹**
 * （`modelfx-axis-*` 節點的世界矩陣，⛔ 不是一個只有測試看得到的存取器 ——
 * 那是失敗形態⑤），再問「它跟行進方向平行嗎」。
 *
 * ⭐ 而且**帶著翻滾一起量**（`spinDegPerSec: 720`，tick 過之後才斷言）：
 * 長軸修正必須疊在 roll **裡面**，否則每滾一圈光束就甩離航線一次。
 * 把 `acquire()` 裡的父子關係倒過來，這一條就紅。
 *
 * ⛔ 不驗正負號：長軸是一條**線**不是箭頭（glTF 載入器那個 X 鏡射也因此無關），
 * 所以斷言的是 |cos| = 1。
 */
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ModelFxRig } from "./modelFxRig";
import type { ModelFxLongAxis, ModelFxMotionSpec } from "./modelFxPath";

const SPEC: ModelFxMotionSpec = {
  shape: "single",
  modelKey: "fx.beam",
  path: "forward",
  speed: 10,
  distance: 8,
  spinDegPerSec: 720, // ⭐ 翻滾:對齊不可以被它甩掉
};
/** ⚠️ 刻意不是軸向的角度 —— 0/90 度會讓一個壞掉的實作剛好蒙對。 */
const FACING = 0.9;
const LOCAL: Record<ModelFxLongAxis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

/** |cos| between the mesh's declared long axis and the direction it is travelling. */
function alignment(declared: ModelFxLongAxis | undefined, probe: ModelFxLongAxis): number {
  const scene = new Scene(new NullEngine());
  const rig = new ModelFxRig(scene, {
    resolveModel: () => ({ glbPath: "assets/models/beam.glb", scale: 1, fxLongAxis: declared }),
    loadContainer: () => Promise.resolve(null),
  });
  rig.spawn(SPEC, { origin: { x: 0, y: 1, z: 0 }, facingRad: FACING });
  rig.tick(250); // 翻滾了 180°
  const node = scene.transformNodes.find((n) => n.name.startsWith("modelfx-axis-"));
  expect(node).toBeDefined();
  const world = Vector3.TransformNormal(LOCAL[probe], node!.computeWorldMatrix(true)).normalize();
  rig.dispose();
  return Math.abs(Vector3.Dot(world, new Vector3(Math.sin(FACING), 0, Math.cos(FACING))));
}

describe("moving-model FX: 烘出來的長軸要躺在行進方向上", () => {
  it("宣告了長軸就對齊，翻滾甩不掉；⛔ 沒宣告的維持今天的行為（正側面）", () => {
    // 沿自己 X 建的火焰(imported.fireblast / 莉娜 龍破斬)
    expect(alignment("x", "x")).toBeCloseTo(1, 6);
    // 沿自己 Y 建的柱子(imported.netherstrike / Saber 約束與勝利之劍的翻滾光束)
    expect(alignment("y", "y")).toBeCloseTo(1, 6);
    // ⛔ 缺陷的樣子:偏航繞 Y 轉,所以未宣告的長軸**恆**垂直於行進方向
    expect(alignment(undefined, "x")).toBeCloseTo(0, 6);
    expect(alignment(undefined, "y")).toBeCloseTo(0, 6);
  });
});
