import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Animation } from "@babylonjs/core/Animations/animation";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { ClipAnimator } from "./ClipAnimator";

describe("imported mesh quaternion animation", () => {
  it("blends a rotation track from an Euler-only rest pose without a null clone", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const mesh = new Mesh("animated-skinned-mesh", scene);
      mesh.rotation.set(0.2, 0.4, 0.6);
      const rest = Quaternion.FromEulerVector(mesh.rotation);
      const track = new Animation("mesh rotation", "rotationQuaternion", 30, Animation.ANIMATIONTYPE_QUATERNION);
      track.setKeys([{ frame: 0, value: rest }, { frame: 30, value: Quaternion.Identity() }]);
      const group = new AnimationGroup("wait", scene);
      group.addTargetedAnimation(track, mesh);
      expect(mesh.rotationQuaternion).toBeNull();
      const animator = new ClipAnimator([group], { idle: "wait" });
      const initialPose = mesh.rotationQuaternion?.asArray();
      expect(() => { animator.play("idle"); group.goToFrame(1); scene.animate(); }).not.toThrow();
      expect(initialPose).toEqual(rest.asArray());
      expect(mesh.rotationQuaternion).not.toBeNull();
      expect(track.getKeys()[0]!.value.asArray()).toEqual(rest.asArray());
      animator.dispose();
    } finally { scene.dispose(); engine.dispose(); }
  });

  it("keeps existing quaternion poses and unrelated position targets unchanged", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const rotated = new Mesh("quaternion-pose", scene);
      const positioned = new Mesh("position-only", scene);
      const rest = Quaternion.RotationYawPitchRoll(0.7, 0.3, 0.1);
      rotated.rotationQuaternion = rest;
      const rotation = new Animation("rotation", "rotationQuaternion", 30, Animation.ANIMATIONTYPE_QUATERNION);
      rotation.setKeys([{ frame: 0, value: rest }, { frame: 30, value: rest }]);
      const position = new Animation("position", "position", 30, Animation.ANIMATIONTYPE_VECTOR3);
      position.setKeys([{ frame: 0, value: positioned.position.clone() }, { frame: 30, value: positioned.position.clone() }]);
      const group = new AnimationGroup("wait", scene);
      group.addTargetedAnimation(rotation, rotated);
      group.addTargetedAnimation(position, positioned);
      const animator = new ClipAnimator([group], { idle: "wait" });
      expect(rotated.rotationQuaternion).toBe(rest);
      expect(positioned.rotationQuaternion).toBeNull();
      animator.dispose();
    } finally { scene.dispose(); engine.dispose(); }
  });
});
