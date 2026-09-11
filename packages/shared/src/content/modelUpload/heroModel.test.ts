import { expect, it } from "vitest";
import { modelUploadFixture } from "./fixtures";
import { prepareUploadedHeroModel, verifyUploadedHeroModel, heroModelBudgetIssues } from "./heroModel";
import { inspectModelUpload } from "./inspect";
import { HERO_MODEL_BUDGET } from "./budget";
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
    // ⭐ GH#1230 —— 骨架綁定變成硬錯誤之後，這個夾具要**明說它是綁好的**。
    // ⚠️ ⛔ 這不是回歸，是**前提消失**：`meshes` 被覆寫成 limit+1，而 `skinnedPrimitives`
    //    還留著 `original` 的值 ⇒ 「有網格沒權重」當然成立。
    // ⇒ 這條測試要問的是**四條預算**，⛔ 不是骨架 —— 所以把骨架這一格釘成合格。
    //    骨架本身有自己的守衛：`heroModelRig.test.ts`。
    skins: 1,
    skinnedPrimitives: over(HERO_MODEL_BUDGET.meshes),
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
