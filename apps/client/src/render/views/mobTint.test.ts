/**
 * 殭屍染黑真的塗到材質上 (GH#192).
 *
 * WHY THIS FILE EXISTS. `mobTint.ts`'s header cites numbers 「measured, not
 * asserted … See `mobTint.test.ts`, which reads the numbers back off real
 * Babylon materials」 — and until v0.9.12 that file DID NOT EXIST. The decision
 * layer was covered (`mobSizeWiring.test.ts` pins the `entityTintFor` branch,
 * `GameApp.mobWiring.test.ts` pins the wiring), but nothing anywhere proved the
 * multiply ever reached a material. That is failure shape ② — computed and
 * never delivered — and it would have stayed green through a total regression.
 *
 * WHAT IT CATCHES THAT THE OTHERS DO NOT. `applyModelTint` does not mutate the
 * material it is handed: it CLONES it (`m#tint`) and reassigns `mesh.material`.
 * So every assertion written against the original material object passes
 * whether the paint happened or not. These read back off `mesh.material` AFTER
 * the call, which is the only object the renderer will actually draw with.
 */
import { Color3, MeshBuilder, NullEngine, Scene, StandardMaterial, TransformNode } from "@babylonjs/core";
import { describe, expect, it } from "vitest";
import { applyModelTint } from "./modelTint";
import { entityTintFor, mobTintFor } from "./mobTint";

const KIND_MOB = 6;

/** A champion-shaped node: a parent + one skinned child, like `ChampionView.root`. */
function figure(scene: Scene): { root: TransformNode; body: ReturnType<typeof MeshBuilder.CreateBox> } {
  const root = new TransformNode("root", scene);
  const body = MeshBuilder.CreateBox("body", {}, scene);
  body.parent = root; // `applyModelTint` walks getChildMeshes() — the root itself is never painted
  const mat = new StandardMaterial("m", scene);
  mat.diffuseColor = new Color3(1, 1, 1);
  body.material = mat;
  return { root, body };
}

const diffuseOf = (m: { material: unknown }): Color3 =>
  (m.material as StandardMaterial).diffuseColor;

describe("the 染黑 multiply reaches the material the renderer draws", () => {
  it("0.65 lands as 0.35 on the mesh's material, not just on the tint object", () => {
    const scene = new Scene(new NullEngine());
    const { root, body } = figure(scene);

    const painted = applyModelTint(root, mobTintFor(0.65));

    expect(painted).toBe(1); // it touched a mesh at all
    expect(diffuseOf(body).r).toBeCloseTo(0.35, 5);
    expect(diffuseOf(body).g).toBeCloseTo(0.35, 5);
    expect(diffuseOf(body).b).toBeCloseTo(0.35, 5);
  });

  it("strength 0 paints NOTHING — 「後台關掉」 is really zero work, not a grey wash", () => {
    const scene = new Scene(new NullEngine());
    const { root, body } = figure(scene);

    expect(mobTintFor(0)).toBeNull();
    expect(applyModelTint(root, mobTintFor(0))).toBe(0);
    expect(diffuseOf(body).r).toBe(1); // still the champion's own colour
  });

  it("a MOB is painted while a champion on the same path is not", () => {
    // The end-to-end shape: the same `entityTintFor` answer both entities get in
    // GameApp, carried all the way to two real materials.
    const scene = new Scene(new NullEngine());
    const mob = figure(scene);
    const champ = figure(scene);

    applyModelTint(mob.root, entityTintFor({ kind: KIND_MOB }, 0.65, () => null));
    applyModelTint(champ.root, entityTintFor({ kind: 0 }, 0.65, () => null));

    expect(diffuseOf(mob.body).r).toBeCloseTo(0.35, 5);
    expect(diffuseOf(champ.body).r).toBe(1); // 玩家不會被染黑
  });
});
