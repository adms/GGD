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
  it("keeps the resized image MIME consistent with PNG bytes returned for a JPEG source", async () => {
    // Authored solid-color 2x1 JPEG and 1x1 PNG; no external image decoder required.
    const jpeg = new Uint8Array(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCICmAv/9k=", "base64"));
    const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPwajn2HwAFRAKU7glcDgAAAABJRU5ErkJggg==", "base64"));
    const src = modelUploadFixture();
    src.json.images = [{ bufferView: src.json.bufferViews.length, mimeType: "image/jpeg" }];
    src.json.bufferViews.push({ buffer: 0, byteOffset: src.bin.length, byteLength: jpeg.length });
    const bin = new Uint8Array(src.bin.length + jpeg.length); bin.set(src.bin); bin.set(jpeg, src.bin.length);
    const bytes = encodeUploadGlb(src.json, bin), original = bytes.slice();
    const before = await inspectModelUpload(bytes);
    const normalized = await normalizeUploadedModel(bytes, { maxTextureEdge: 1, resizeImage: async (input, cap) => {
      expect(input).toEqual(jpeg); expect(cap).toBe(1); return png;
    } });
    const after = await inspectModelUpload(normalized.bytes);
    expect(after.json.images![0]!.mimeType).toBe("image/png");
    expect(after.textures[0]).toMatchObject({ width: 1, height: 1 });
    expect(normalized.report.resizedTextures).toEqual([[2, 1]]);
    expect(after.clips).toEqual(before.clips);
    expect(bytes).toEqual(original);
  });

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
    // SSBU and many native game models store colors/weights as normalized integers.
    // The merged accessor must retain `normalized: true`; otherwise Khronos rejects
    // the output even though the source primitives were valid.
    const colors = new Uint8Array(count * 4).fill(255);
    const bin3 = new Uint8Array(bin2.byteLength + colors.byteLength);
    bin3.set(bin2, 0); bin3.set(colors, bin2.byteLength);
    src.json.bufferViews.push({ buffer: 0, byteOffset: bin2.byteLength, byteLength: colors.byteLength, target: 34962 });
    src.json.accessors.push({
      bufferView: src.json.bufferViews.length - 1, componentType: 5121, count, type: "VEC4", normalized: true,
    });
    mesh.primitives[0]!.attributes.COLOR_0 = src.json.accessors.length - 1;
    src.bin = bin3;
    const before = await inspectModelUpload(encodeUploadGlb(src.json, src.bin));
    // ⛔ 同一份幾何畫兩次 —— 正是 WC3 匯入產生的形狀
    mesh.primitives.push({ ...mesh.primitives[0]! });
    const doubled = encodeUploadGlb(src.json, src.bin);
    expect((await inspectModelUpload(doubled)).meshes).toBe(before.meshes + 1);

    const { bytes, report } = await normalizeUploadedModel(doubled);
    expect(report.drawCalls).toEqual({ before: before.meshes + 1, after: before.meshes });
    const after = await inspectModelUpload(bytes);
    expect(after.meshes).toBe(before.meshes);
    // ⭐ 合併是把幾何**接起來**，⛔ 不是丟掉一份 ⇒ 三角面總數守恆
    expect(after.triangles).toBe(before.triangles * 2);
    // ⭐ 合併後的 POSITION 界必須用真資料重算，⛔ 沿用任何一段都會超界
    const { json } = parseUploadGlb(bytes);
    const pos = json.accessors[json.meshes![0]!.primitives[0]!.attributes.POSITION!]!;
    const color = json.accessors[json.meshes![0]!.primitives[0]!.attributes.COLOR_0!]!;
    expect(pos.min).toHaveLength(3);
    expect(pos.max!.every((v, i) => v >= pos.min![i]!)).toBe(true);
    expect(color.normalized).toBe(true);
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
    const { bytes, report } = await normalizeUploadedModel(withSignature);
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
  const oversample = HERO_MODEL_BUDGET.texEdge.limit ** 2 / screenPixels;
  // ⭐ 過取樣要落在 1–4 倍之間：低於 1 是糊掉，高於 4 是白花 VRAM
  //   （512² 是 7.0×、1024² 是 28×，兩個都在窗外）
  expect(oversample).toBeGreaterThan(1);
  expect(oversample).toBeLessThan(4);
  // ⭐ owner 2026-09-10：「場景也是阿 不應該有貼圖超過256」⇒ 上限就是那條線本身，
  //    ⛔ 沒有「英雄可以再大一級」的空間 —— 警戒不得高於上限。
  expect(HERO_MODEL_BUDGET.texEdge.warn).toBeLessThanOrEqual(HERO_MODEL_BUDGET.texEdge.limit);
});
