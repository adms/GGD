/** 一次性量測探針（GH#689）—— 量完即刪。⛔ 不是守衛。 */
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Animation } from "@babylonjs/core/Animations/animation";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

function build(scene: Scene): AssetContainer {
  const node = new TransformNode("bone", scene);
  const mesh = MeshBuilder.CreateBox("body", { size: 1 }, scene);
  mesh.parent = node;
  const container = new AssetContainer(scene);
  container.transformNodes.push(node);
  container.meshes.push(mesh);
  container.rootNodes.push(node);
  for (const name of ["stand", "death"]) {
    const anim = new Animation(`${name}-anim`, "position.y", 60, Animation.ANIMATIONTYPE_FLOAT);
    anim.setKeys([
      { frame: 0, value: 0 },
      { frame: 120, value: 12 },
    ]);
    const g = new AnimationGroup(name, scene);
    g.addTargetedAnimation(anim, node);
    g.normalize(0, 120);
    container.animationGroups.push(g);
  }
  return container;
}

describe("probe", () => {
  it("measures", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.useConstantAnimationDeltaTime = true;
    new FreeCamera("cam", new Vector3(0, 0, -10), scene);
    const container = build(scene);
    const before = scene.animationGroups.length;
    const inst = container.instantiateModelsToScene((n) => `modelfx-7-${n}`, false, {
      doNotInstantiate: true,
    });
    console.log("CLONED GROUPS:", inst.animationGroups.map((g) => g.name));
    console.log("scene.animationGroups before/after:", before, scene.animationGroups.length);
    const death = inst.animationGroups.find((g) => g.name.endsWith("death"))!;
    const stand = inst.animationGroups.find((g) => g.name.endsWith("stand"))!;
    console.log("target is clone?", death.targetedAnimations[0]!.target === container.transformNodes[0], (death.targetedAnimations[0]!.target as TransformNode).name);
    death.speedRatio = 0.15;
    death.play(true);
    console.log("after play: isPlaying", death.isPlaying, "speedRatio", death.speedRatio, "animatables", death.animatables.length, "animatable.speedRatio", death.animatables[0]?.speedRatio);
    console.log("stand isPlaying", stand.isPlaying);
    const tgt = death.targetedAnimations[0]!.target as TransformNode;
    console.log("y before render", tgt.position.y);
    for (let i = 0; i < 5; i++) scene.render();
    console.log("y after 5 renders", tgt.position.y, "masterFrame", death.animatables[0]?.masterFrame);
    // control at 1.0
    const inst2 = container.instantiateModelsToScene((n) => `modelfx-8-${n}`, false, {
      doNotInstantiate: true,
    });
    const death2 = inst2.animationGroups.find((g) => g.name.endsWith("death"))!;
    death2.play(true);
    const tgt2 = death2.targetedAnimations[0]!.target as TransformNode;
    for (let i = 0; i < 5; i++) scene.render();
    console.log("fast y", tgt2.position.y, "slow y", tgt.position.y, "fastFrame", death2.animatables[0]?.masterFrame, "slowFrame", death.animatables[0]?.masterFrame);
    // stop / restart semantics
    death.stop();
    console.log("after stop isPlaying", death.isPlaying, "animatables", death.animatables.length);
    death.speedRatio = 0.5;
    death.play(true);
    console.log("after restart isPlaying", death.isPlaying, "speedRatio", death.speedRatio, "animatable.speedRatio", death.animatables[0]?.speedRatio);
    // start() on already started
    death.start(true, 0.9);
    console.log("start() while started -> speedRatio", death.speedRatio);
    // dispose
    const n0 = scene.animationGroups.length;
    death.dispose();
    console.log("scene groups after dispose", n0, scene.animationGroups.length);
    expect(true).toBe(true);
  });
});
