import { expect, it } from "vitest";
import { modelUploadFixture } from "./fixtures";
import { prepareUploadedHeroModel, verifyUploadedHeroModel, heroModelBudgetIssues } from "./heroModel";
import { inspectModelUpload } from "./inspect";
import { HERO_MODEL_BUDGET } from "./budget";
import { encodeUploadGlb } from "./glb";

function sourceWithLeadingZeroClip() {
  const source = modelUploadFixture(), clip = source.json.animations![0]!, sampler = clip.samplers[0]!;
  source.json.animations![1]!.name = "Cast";
  const input = source.json.accessors.length;
  source.json.accessors.push({ ...source.json.accessors[sampler.input]!, count: 1, min: [0], max: [0] });
  const output = source.json.accessors.length;
  source.json.accessors.push({ ...source.json.accessors[sampler.output]!, count: 1 });
  source.json.animations!.unshift({ name: "ZeroPose", channels: structuredClone(clip.channels), samplers: [{ ...sampler, input, output }] });
  return encodeUploadGlb(source.json, source.bin);
}

it("preserves original selected clip identities when normalization removes an earlier zero-length clip", async () => {
  const bytes = sourceWithLeadingZeroClip(), original = bytes.slice();
  const result = await prepareUploadedHeroModel(bytes, { idle: 1, run: 1, attack: 2, cast: 2, hurt: 1, death: 2 });
  expect(result.model.clipMap).toEqual({ idle: "Motion", run: "Motion", attack: "Cast", cast: "Cast", hurt: "Motion", death: "Cast" });
  expect(result.inspected.json.animations!.map((clip) => clip.channels[0]!.target.path)).toEqual(["translation", "rotation"]);
  await expect(verifyUploadedHeroModel(result.model, result.bytes)).resolves.toBeDefined();
  expect(bytes).toEqual(original);
});

it("rejects a selected zero-length clip instead of substituting the next animation", async () => {
  const bytes = sourceWithLeadingZeroClip(), original = bytes.slice();
  await expect(prepareUploadedHeroModel(bytes, { idle: 0, run: 1, attack: 2, cast: 2, hurt: 1, death: 2 })).rejects.toThrow("長度為零");
  expect(bytes).toEqual(original);
});

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
  // ⭐ 夾具從**出貨上限推導**，⛔ 不抄字面值 —— 這條在 2026-09-10 之前是紅的：
  //    `channels: 161` 假設上限是 160，而 owner 那天把它改成 500 ⇒ 那一格再也不報錯，
  //    測試卻仍然期望 4 個。⚠️ 同一天 `meshes` 從 5 變 6（最低配備抬到 M1）又會再破一次。
  //    ⇒ 每一格都寫成 `limit + 1`，上限怎麼調它都還是「剛好超過」。
  const over = (row: { limit: number }) => row.limit + 1;
  const metrics = {
    ...original,
    triangles: over(HERO_MODEL_BUDGET.tris),
    meshes: over(HERO_MODEL_BUDGET.meshes),
    textures: [{ width: over(HERO_MODEL_BUDGET.texEdge), height: 4, bytes: 20, sha256: "x" }],
    clips: [{ index: 0, name: "A", duration: 1, channels: over(HERO_MODEL_BUDGET.channels) }],
  };
  expect(heroModelBudgetIssues(metrics).errors).toHaveLength(4);
  // One heavy unused clip must not block a small explicitly selected one.
  // ⭐ 同樣從出貨上限推導 —— ⛔ 不抄 161（那個字面值假設上限是 160，2026-09-10 起是 500）。
  const nodes = Array.from({ length: HERO_MODEL_BUDGET.channels.limit + 1 }, (_, index) => ({ name: `extra-${index}` }));
  const base = source.json.nodes!.length; source.json.nodes!.push(...nodes);
  source.json.scenes[0]!.nodes.push(...nodes.map((_, index) => base + index));
  source.json.animations![1]!.channels = nodes.map((_, index) => ({ sampler: 0, target: { node: base + index, path: "rotation" } }));
  const overChannels = String(nodes.length);
  const bytes = encodeUploadGlb(source.json, source.bin);
  const selected = await prepareUploadedHeroModel(bytes, { idle: 0, run: 0, attack: 0, cast: 0, hurt: 0, death: 0 });
  expect(selected.inspected.clips[0]!.channels).toBe(1);
  await expect(prepareUploadedHeroModel(bytes, { idle: 1, run: 1, attack: 1, cast: 1, hurt: 1, death: 1 })).rejects.toThrow(overChannels);
});
