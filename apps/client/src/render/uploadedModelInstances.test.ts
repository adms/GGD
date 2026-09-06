import { expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { modelUploadFixture } from "@ggd/shared/content/modelUpload/fixtures";
import { encodeUploadGlb } from "@ggd/shared/content/modelUpload/glb";
import { mergeModelAnimations, selectModelAnimations } from "@ggd/shared/content/modelUpload/compose";
import { AssetManager, clearAssetByteCache } from "./AssetManager";

it("keeps uploaded source rigs at rest and independent instances keep identical initial bounds", async () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const bytes = modelUploadFixture().bytes;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from(bytes))));
  clearAssetByteCache();
  try {
    const container = await new AssetManager(scene).load("assets/models/community/fixture.glb");
    expect(container).not.toBeNull();
    expect(container!.animationGroups.every((group) => !group.isPlaying)).toBe(true);
    const instance = (id: string) => {
      const inst = container!.instantiateModelsToScene((name) => `${id}-${name}`, false, { doNotInstantiate: true });
      const root = new TransformNode(id, scene); for (const node of inst.rootNodes) node.parent = root;
      return { inst, root };
    };
    const first = instance("first");
    const opening = first.root.getHierarchyBoundingVectors(true);
    const clip = first.inst.animationGroups[0]!;
    clip.start(false); clip.pause(); clip.goToFrame(clip.to);
    const second = instance("second");
    expect(second.root.getHierarchyBoundingVectors(true)).toEqual(opening);
    expect(container!.animationGroups.every((group) => !group.isPlaying)).toBe(true);
    const firstBone = first.root.getChildTransformNodes(false).find((node) => node.name.endsWith("-Bone"))!;
    const secondBone = second.root.getChildTransformNodes(false).find((node) => node.name.endsWith("-Bone"))!;
    expect(firstBone.position.y).toBeCloseTo(0.5);
    expect(secondBone.position.y).toBe(0);
  } finally { scene.dispose(); engine.dispose(); clearAssetByteCache(); vi.unstubAllGlobals(); }
});

it("plays sparse cubic library motion correctly after merging and pruning the runtime model", async () => {
  const body = modelUploadFixture(), library = modelUploadFixture(true);
  const offset = library.bin.length, bin = new Uint8Array(offset + 28);
  bin.set(library.bin); bin.set([2, 4], offset);
  bin.set(new Uint8Array(new Float32Array([0, 2, 0, 0, 0.5, 0]).buffer), offset + 4);
  const indices = library.json.bufferViews.length, values = indices + 1;
  library.json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: 2 }, { buffer: 0, byteOffset: offset + 4, byteLength: 24 });
  library.json.accessors[library.move] = {
    componentType: 5126, type: "VEC3", count: 6,
    sparse: { count: 2, indices: { bufferView: indices, componentType: 5121 }, values: { bufferView: values } },
  };
  library.json.animations![0]!.samplers[0]!.interpolation = "CUBICSPLINE";
  const merged = await mergeModelAnimations(body.bytes, encodeUploadGlb(library.json, bin), [0]);
  const runtime = await selectModelAnimations(merged.bytes, [merged.added[0]!.index]);
  const engine = new NullEngine(), scene = new Scene(engine);
  clearAssetByteCache();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from(runtime.bytes))));
  try {
    const container = await new AssetManager(scene).load("assets/models/community/sparse-cubic.glb");
    expect(container?.animationGroups).toHaveLength(1);
    const inst = container!.instantiateModelsToScene((name) => `cubic-${name}`, false, { doNotInstantiate: true });
    const bone = scene.getTransformNodeByName("cubic-Bone")!;
    const clip = inst.animationGroups[0]!;
    clip.start(false); clip.pause();
    clip.goToFrame(clip.from);
    expect(bone.position.y).toBeCloseTo(0);
    clip.goToFrame((clip.from + clip.to) / 2);
    // Hermite midpoint: 0.5 * endpoint(0.5) + 0.125 * outgoing tangent(2).
    expect(bone.position.y).toBeCloseTo(0.5);
    clip.goToFrame(clip.to);
    expect(bone.position.y).toBeCloseTo(0.5);
  } finally { scene.dispose(); engine.dispose(); clearAssetByteCache(); vi.unstubAllGlobals(); }
});
