import { expect, it } from "vitest";
import { modelUploadFixture } from "./fixtures";
import { prepareUploadedHeroModel, verifyUploadedHeroModel, heroModelBudgetIssues } from "./heroModel";
import { inspectModelUpload } from "./inspect";
import { encodeUploadGlb } from "./glb";

it("allows one clip to serve all six states and verifies the exact prepared bytes", async () => {
  const source = modelUploadFixture(), before = source.bytes.slice();
  const result = await prepareUploadedHeroModel(source.bytes, { idle: 0, run: 0, attack: 0, cast: 0, hurt: 0, death: 0 });
  expect(result.inspected.clips).toHaveLength(1);
  expect(new Set(Object.values(result.model.clipMap))).toEqual(new Set(["Motion"]));
  expect((await verifyUploadedHeroModel(result.model, result.bytes)).document).toEqual(result.document);
  expect(result.document.heroBody).toBeUndefined();
  expect(source.bytes).toEqual(before);
  await expect(verifyUploadedHeroModel({ ...result.model, sha256: "0".repeat(64) }, result.bytes)).rejects.toThrow("固定");
  await expect(verifyUploadedHeroModel({ ...result.model, clipMap: { ...result.model.clipMap, cast: "Missing" } }, result.bytes)).rejects.toThrow("引用");
});

it("rejects omitted state mappings and unselected clips in a purported runtime body", async () => {
  const source = modelUploadFixture();
  const result = await prepareUploadedHeroModel(source.bytes, { idle: 0, run: 0, attack: 0, cast: 0, hurt: 0, death: 0 });
  const full = await inspectModelUpload(source.bytes);
  await expect(verifyUploadedHeroModel({ ...result.model, sha256: full.sha256, byteSize: source.bytes.length }, source.bytes)).rejects.toThrow("引用");
  await expect(prepareUploadedHeroModel(source.bytes, { idle: 0 } as never)).rejects.toThrow("六項");
});

it("enforces the tablet budget on the selected runtime body", async () => {
  const source = modelUploadFixture();
  const original = await inspectModelUpload(source.bytes);
  const metrics = { ...original, triangles: 28_001, meshes: 6, textures: [{ width: 1025, height: 4, bytes: 20, sha256: "x" }], clips: [{ index: 0, name: "A", duration: 1, channels: 161 }] };
  expect(heroModelBudgetIssues(metrics).errors).toHaveLength(4);
  // One heavy unused clip must not block a small explicitly selected one.
  const nodes = Array.from({ length: 161 }, (_, index) => ({ name: `extra-${index}` }));
  const base = source.json.nodes!.length; source.json.nodes!.push(...nodes);
  source.json.scenes[0]!.nodes.push(...nodes.map((_, index) => base + index));
  source.json.animations![1]!.channels = nodes.map((_, index) => ({ sampler: 0, target: { node: base + index, path: "rotation" } }));
  const bytes = encodeUploadGlb(source.json, source.bin);
  const selected = await prepareUploadedHeroModel(bytes, { idle: 0, run: 0, attack: 0, cast: 0, hurt: 0, death: 0 });
  expect(selected.inspected.clips[0]!.channels).toBe(1);
  await expect(prepareUploadedHeroModel(bytes, { idle: 1, run: 1, attack: 1, cast: 1, hurt: 1, death: 1 })).rejects.toThrow("161");
});
