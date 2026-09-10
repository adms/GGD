import { describe, expect, it } from "vitest";
import { encodeUploadGlb, parseUploadGlb, readFloatAccessor, MODEL_UPLOAD_LIMITS, type GlbDocument } from "./glb";
import { inspectModelUpload } from "./inspect";
import { mergeModelAnimations, selectModelAnimations } from "./compose";
import { modelUploadFixture } from "./fixtures";

describe("community GLB import boundaries", () => {
  it("accepts a skinned body and a model-free library, with stable distinct clip names", async () => {
    const body = await inspectModelUpload(modelUploadFixture().bytes);
    const library = await inspectModelUpload(modelUploadFixture(true).bytes, "animations");
    expect(body.report.issues).toMatchObject({ numErrors: 0, truncated: false });
    expect(body.clips.map((clip) => clip.name)).toEqual(["Motion", "Motion (2)"]);
    expect(body.clips.map((clip) => clip.duration)).toEqual([1, 1]);
    expect(body.triangles).toBe(1); expect(library.meshes).toBe(0);
    await expect(inspectModelUpload(modelUploadFixture(true).bytes)).rejects.toThrow("三角網格");
  });

  it("rejects external resources and unsupported extension declarations before loading", () => {
    const f = modelUploadFixture();
    for (const patch of [
      { buffers: [{ byteLength: f.bin.length, uri: "https://example.invalid/private.bin" }] },
      { images: [{ uri: "data:image/png;base64,AA==" }] },
      { extensionsRequired: ["KHR_draco_mesh_compression"] },
      { extensionsUsed: ["EXT_meshopt_compression"] },
      { extensions: { KHR_animation_pointer: {} } },
    ]) expect(() => parseUploadGlb(encodeUploadGlb({ ...f.json, ...patch } as unknown as GlbDocument, f.bin))).toThrow(/嵌入|擴充/);
  });

  it("preserves supported specular materials through animation selection and validates their values", async () => {
    const f = modelUploadFixture();
    const material = { extensions: { KHR_materials_specular: { specularFactor: 0.7, specularColorFactor: [0.5, 0.4, 0.3] } } };
    Object.assign(f.json.meshes![0]!.primitives[0]!, { material: 0 });
    const json = { ...f.json, extensionsUsed: ["KHR_materials_specular"], extensionsRequired: ["KHR_materials_specular"], materials: [material] };
    const inspected = await inspectModelUpload(encodeUploadGlb(json, f.bin));
    expect(inspected.report.issues.numErrors).toBe(0);
    const selected = await selectModelAnimations(encodeUploadGlb(json, f.bin), [0]);
    expect((selected.inspected.json as typeof json).materials).toEqual([material]);
    const invalid = structuredClone(json);
    invalid.materials[0]!.extensions.KHR_materials_specular.specularFactor = 2;
    await expect(inspectModelUpload(encodeUploadGlb(invalid, f.bin))).rejects.toThrow("GLB 格式檢查未通過");
  });

  it("bounds sizes, primitive arrays, tree depth, and sparse implicit allocations", () => {
    const f = modelUploadFixture();
    expect(() => parseUploadGlb(f.bytes.subarray(0, f.bytes.length - 1))).toThrow("完整");
    const huge = structuredClone(f.json); huge.accessors[0]!.count = MODEL_UPLOAD_LIMITS.accessorValues;
    expect(() => parseUploadGlb(encodeUploadGlb(huge, f.bin))).toThrow("解碼資料量");
    expect(() => parseUploadGlb(encodeUploadGlb({ ...f.json, extras: Array(250_001).fill(0).map(() => [0]) } as typeof f.json, f.bin))).toThrow("過於複雜");
    let deep: unknown = 0; for (let i = 0; i < 70; i++) deep = { next: deep };
    expect(() => parseUploadGlb(encodeUploadGlb({ ...f.json, extras: deep } as typeof f.json, f.bin))).toThrow("過於複雜");
    expect(() => readFloatAccessor(huge, f.bin, 0)).toThrow("有界浮點");
  });

  it("rejects invalid indices and animation timestamps through the actual Khronos validator", async () => {
    const badIndex = modelUploadFixture(); badIndex.json.animations![0]!.channels[0]!.target.node = 100;
    await expect(inspectModelUpload(encodeUploadGlb(badIndex.json, badIndex.bin))).rejects.toThrow("GLB 格式檢查未通過");
    const badTime = modelUploadFixture();
    const view = badTime.json.bufferViews[badTime.json.accessors[badTime.times]!.bufferView!]!;
    new DataView(badTime.bin.buffer).setFloat32(view.byteOffset! + 4, -1, true);
    await expect(inspectModelUpload(encodeUploadGlb(badTime.json, badTime.bin))).rejects.toThrow("GLB 格式檢查未通過");
  });
});

describe("compatible animation libraries and selected runtime clips", () => {
  it("maps an independent library without changing body geometry, rig, or original binary", async () => {
    const body = modelUploadFixture(), library = modelUploadFixture(true);
    const merged = await mergeModelAnimations(body.bytes, library.bytes, [1]);
    const result = merged.inspected;
    expect(result.json.nodes).toEqual(body.json.nodes);
    expect(result.json.meshes).toEqual(body.json.meshes);
    expect(result.json.skins).toEqual(body.json.skins);
    expect(result.bin.subarray(0, body.bin.length)).toEqual(body.bin);
    expect(merged.added).toEqual([{ sourceIndex: 1, index: 2, name: "Motion (2) (2)" }]);
    const sampler = result.json.animations![2]!.samplers[0]!;
    expect(readFloatAccessor(result.json, result.bin, sampler.output)).toEqual(readFloatAccessor(library.json, library.bin, library.rotate));
    expect(result.json.animations![2]!.channels[0]!.target).toEqual({ node: 1, path: "rotation" });
    expect(result.json.animations![2]!.samplers[0]!.interpolation).toBe("STEP");
  });

  it.each(["name", "duplicate", "pose", "hierarchy"])("rejects incompatible %s and leaves the original unchanged", async (mode) => {
    const body = modelUploadFixture(), library = modelUploadFixture(true), original = body.bytes.slice();
    if (mode === "name") library.json.nodes![1]!.name = "OtherBone";
    if (mode === "duplicate") library.json.nodes![0]!.name = "Bone";
    if (mode === "pose") library.json.nodes![1]!.translation = [0, 0.1, 0];
    if (mode === "hierarchy") { delete library.json.nodes![0]!.children; library.json.scenes[0]!.nodes = [0, 1]; }
    await expect(mergeModelAnimations(body.bytes, encodeUploadGlb(library.json, library.bin), [0])).rejects.toThrow(/骨架|基準姿勢/);
    expect(body.bytes).toEqual(original);
  });

  it("prunes unselected animation bytes while retaining all skin and geometry samples", async () => {
    const f = modelUploadFixture(), original = f.bytes.slice();
    const selected = await selectModelAnimations(f.bytes, [1]);
    expect(selected.inspected.clips.map((clip) => clip.name)).toEqual(["Motion (2)"]);
    expect(selected.bytes.length).toBeLessThan(f.bytes.length);
    const result = selected.inspected, primitive = result.json.meshes![0]!.primitives[0]!;
    expect(readFloatAccessor(result.json, result.bin, primitive.attributes.POSITION!)).toEqual(readFloatAccessor(f.json, f.bin, f.position));
    expect(readFloatAccessor(result.json, result.bin, result.json.skins![0]!.inverseBindMatrices!)).toEqual(readFloatAccessor(f.json, f.bin, f.inverseBind));
    expect(readFloatAccessor(result.json, result.bin, result.json.animations![0]!.samplers[0]!.output)).toEqual(readFloatAccessor(f.json, f.bin, f.rotate));
    expect(result.json.nodes).toEqual(f.json.nodes);
    expect(f.bytes).toEqual(original);
    await expect(selectModelAnimations(f.bytes, [0, 0])).rejects.toThrow("不重複");
    await expect(selectModelAnimations(f.bytes, [20])).rejects.toThrow("有效");
  });
});
