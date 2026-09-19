/**
 * ⭐ GH#1283 —— 「可合併」的判準**只有一個住處**，而且半透明⛔不算。
 *
 * 在此之前同一個問題有三份判準：`normalize.ts`（上架真的會走的那條）與 `model_intake.py`
 * 說「同畫法就可以接」，⭐ 而 `atlas_pack.py` 的 blend-order 保護刻意不動半透明 ——
 * ⛔ 兩個相反的答案，而棘輪吃的是後者（莉娜 GH#1173：兩塊半透明被接成一塊 ⇒ a 255 → 256）。
 *
 * ⚠️ 這條守衛**兩個方向都跑**（一把只驗過單邊的尺不算自證過）：同一份位元組只改
 * `alphaMode` 一格 —— OPAQUE ⇒ 兩邊都說「接得起來」；BLEND ⇒ 兩邊都說「⛔ 不接」。
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { modelUploadFixture } from "./fixtures";
import { encodeUploadGlb } from "./glb";
import { normalizeUploadedModel } from "./normalize";

const SCRIPT = resolve(__dirname, "../../../../../tools/w3x-import/model_intake.py");

/** 同一份幾何畫兩次、共用一份材質 —— ⭐ 正是 WC3 匯入產生的形狀；只有 `alphaMode` 那一格不同。 */
function doubled(alphaMode: "OPAQUE" | "BLEND"): Uint8Array {
  const src = modelUploadFixture();
  const mesh = src.json.meshes![0]!;
  // ⚠️ 合併只處理**有索引**的 primitive（刻意的保守）⇒ 夾具要先長成出貨真的會有的形狀。
  const count = src.json.accessors[mesh.primitives[0]!.attributes.POSITION!]!.count;
  const idx = new Uint16Array(Array.from({ length: count }, (_, i) => i));
  const bin = new Uint8Array(src.bin.byteLength + idx.byteLength);
  bin.set(src.bin, 0); bin.set(new Uint8Array(idx.buffer), src.bin.byteLength);
  src.json.bufferViews.push({ buffer: 0, byteOffset: src.bin.byteLength, byteLength: idx.byteLength, target: 34963 });
  src.json.accessors.push({ bufferView: src.json.bufferViews.length - 1, componentType: 5123, count, type: "SCALAR" });
  mesh.primitives[0]!.indices = src.json.accessors.length - 1;
  (src.json as { materials?: unknown[] }).materials = [{ alphaMode }];
  (mesh.primitives[0]! as { material?: number }).material = 0;
  mesh.primitives.push({ ...mesh.primitives[0]! });
  return encodeUploadGlb(src.json, bin);
}

describe("半透明 ⛔ 不算「可合併」（GH#1283）", () => {
  it("★ 上架正規化：OPAQUE 接得起來，BLEND 原封不動", async () => {
    // ⭐ 已知「有」的方向 —— 沒有這一半，下一條就分不出「保護生效」與「合併整個壞掉」。
    expect((await normalizeUploadedModel(doubled("OPAQUE"))).report.drawCalls).toEqual({ before: 2, after: 1 });
    // ⭐ 已知「沒有」的方向 —— 只有 alphaMode 換成 BLEND。
    const blend = await normalizeUploadedModel(doubled("BLEND"));
    expect(blend.report.drawCalls).toEqual({ before: 2, after: 2 });
    expect(blend.report.changed).toBe(false);
  });

  it("★ 入庫檢查對同一份位元組給**同一個**答案（⛔ 不是兩份判準）", () => {
    const dir = mkdtempSync(join(tmpdir(), "merge-blend-"));
    try {
      writeFileSync(join(dir, "opaque.glb"), doubled("OPAQUE"));
      writeFileSync(join(dir, "blend.glb"), doubled("BLEND"));
      const r = spawnSync("python3", [SCRIPT, join(dir, "opaque.glb"), join(dir, "blend.glb"), "--no-validate"],
        { encoding: "utf8" });
      const out = `${r.stdout}${r.stderr}`;
      expect(out).toContain("掃了 2 顆");
      // ⭐ 只有 opaque 那一顆被指名「可合併」；blend 那一顆乾淨 ⇒ 逐檔清單裡根本不出現。
      expect(out).toContain("opaque.glb");
      expect(out).toContain("可合併");
      expect(out).not.toContain("blend.glb");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
