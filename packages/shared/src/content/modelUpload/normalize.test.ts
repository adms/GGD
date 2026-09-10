import { describe, expect, it } from "vitest";
import { modelUploadFixture } from "./fixtures";
import { encodeUploadGlb, parseUploadGlb, readFloatAccessor } from "./glb";
import { normalizeUploadedModel } from "./normalize";
import { inspectModelUpload } from "./inspect";
import { HERO_MODEL_BUDGET } from "./budget";

/**
 * 匯入正規化的兩個承重不變量（GH#1164）。
 *
 * ⚠️ 兩條都是 2026-09-10 **真的擋住上架**的缺陷，⛔ 不是假想：
 *  ① 22 個 draw call 而只有 3 種畫法（`imported.doraemon-cat`）⇒ 超過每支 6 的上限
 *  ② 一段長度為零的作者署名（「未经允许禁止分享与使用」）⇒ 整顆註冊不進去
 */
describe("匯入模型的自動正規化", () => {
  it("★ 畫法相同的 primitive 被合併，而三角面與畫面內容不變", async () => {
    const src = modelUploadFixture();
    const mesh = src.json.meshes![0]!;
    // ⚠️ 夾具的 primitive 是**非索引**的，而合併只處理有索引的（⛔ 那是刻意的保守）
    //    ⇒ 先給它一份索引，讓夾具長成**出貨真的會出現**的形狀（第二守則形態⑩）。
    const count = src.json.accessors[mesh.primitives[0]!.attributes.POSITION!]!.count;
    const idx = new Uint16Array(Array.from({ length: count }, (_, i) => i));
    const bin2 = new Uint8Array(src.bin.byteLength + idx.byteLength);
    bin2.set(src.bin, 0); bin2.set(new Uint8Array(idx.buffer), src.bin.byteLength);
    src.json.bufferViews.push({ buffer: 0, byteOffset: src.bin.byteLength, byteLength: idx.byteLength, target: 34963 });
    src.json.accessors.push({ bufferView: src.json.bufferViews.length - 1, componentType: 5123, count, type: "SCALAR" });
    mesh.primitives[0]!.indices = src.json.accessors.length - 1;
    src.bin = bin2;
    const before = await inspectModelUpload(encodeUploadGlb(src.json, src.bin));
    // ⛔ 同一份幾何畫兩次 —— 正是 WC3 匯入產生的形狀
    mesh.primitives.push({ ...mesh.primitives[0]! });
    const doubled = encodeUploadGlb(src.json, src.bin);
    expect((await inspectModelUpload(doubled)).meshes).toBe(before.meshes + 1);

    const { bytes, report } = normalizeUploadedModel(doubled);
    expect(report.drawCalls).toEqual({ before: before.meshes + 1, after: before.meshes });
    const after = await inspectModelUpload(bytes);
    expect(after.meshes).toBe(before.meshes);
    // ⭐ 合併是把幾何**接起來**，⛔ 不是丟掉一份 ⇒ 三角面總數守恆
    expect(after.triangles).toBe(before.triangles * 2);
    // ⭐ 合併後的 POSITION 界必須用真資料重算，⛔ 沿用任何一段都會超界
    const { json } = parseUploadGlb(bytes);
    const pos = json.accessors[json.meshes![0]!.primitives[0]!.attributes.POSITION!]!;
    expect(pos.min).toHaveLength(3);
    expect(pos.max!.every((v, i) => v >= pos.min![i]!)).toBe(true);
  });

  it("★ 長度為零的片段被丟掉（判準是**長度**，⛔ 不是名字）", async () => {
    const src = modelUploadFixture();
    const clip = src.json.animations![0]!;
    const input = src.json.accessors[clip.samplers[0]!.input]!;
    const zeroInput = src.json.accessors.length;
    // ⭐ 一段所有 key 都落在 t=0 的片段 —— 作者署名就是這個形狀。
    //    取原本時間軸的**第一顆** key 當成唯一一顆；⚠️ 先確認它真的是 0，
    //    ⛔ 否則這條測試會在夾具改動後靜默失去前提（第二守則形態⑩）。
    const firstTime = readFloatAccessor(src.json, src.bin, clip.samplers[0]!.input)[0]!;
    expect(firstTime).toBe(0);
    src.json.accessors.push({ ...input, count: 1, min: [firstTime], max: [firstTime] });
    src.json.animations!.push({
      name: "未经允许禁止分享与使用",
      channels: clip.channels.map((c) => ({ ...c })),
      samplers: clip.samplers.map((s) => ({ ...s, input: zeroInput })),
    });
    const withSignature = encodeUploadGlb(src.json, src.bin);
    const { bytes, report } = normalizeUploadedModel(withSignature);
    expect(report.droppedZeroClips).toEqual(["未经允许禁止分享与使用"]);
    // ⭐ 而合法的片段一個都不能少
    const after = await inspectModelUpload(bytes);
    expect(after.clips.map((c) => c.name)).toEqual((await inspectModelUpload(src.bytes)).clips.map((c) => c.name));
  });
});

/**
 * ⭐ 貼圖邊長是從**螢幕解析度**反推的，⛔ 不是挑一個好看的 2 的次方。
 *
 * > owner 2026-09-10（逐字）：「因為**我們不是在做4k遊戲 頂多HD1080**」
 *
 * ⚠️ 這條驗的是**關係**（貼圖 texel 數 vs 一具英雄真的佔幾個螢幕像素），
 * ⛔ 不是數字本身 —— 鏡頭參數或目標解析度改了，它就會紅並且說得出為什麼。
 */
it("★ 英雄貼圖的警戒邊長，相對 1080p 上一具英雄的螢幕佔用是「略微過取樣」", () => {
  // 出貨鏡頭：content/config/camera.json 的 minDolly（滾到最近＝最嚴苛）
  const MIN_DOLLY = 10, FOV_RAD = 0.8, HERO_WORLD_HEIGHT = 1.7, SCREEN_H = 1080;
  const heroPx = (HERO_WORLD_HEIGHT / (2 * MIN_DOLLY * Math.tan(FOV_RAD / 2))) * SCREEN_H;
  // 一具英雄約 heroPx 高、寬約 0.6 倍 ⇒ 螢幕佔用
  const screenPixels = heroPx * heroPx * 0.6;
  const texels = HERO_MODEL_BUDGET.texEdge.warn ** 2;
  const oversample = texels / screenPixels;
  // ⭐ 過取樣要落在 1–4 倍之間：低於 1 是糊掉，高於 4 是白花 VRAM
  //   （512² 是 7.0×、1024² 是 28×，兩個都在窗外）
  expect(oversample).toBeGreaterThan(1);
  expect(oversample).toBeLessThan(4);
  // ⭐ 上限是警戒的兩倍（給真的需要細節的角色一格空間），⛔ 不是四倍
  expect(HERO_MODEL_BUDGET.texEdge.limit).toBe(HERO_MODEL_BUDGET.texEdge.warn * 2);
});
