/**
 * ou99 匯入模型的**四個不變量**（GH#1164）—— ⭐ 讀的是**出貨的 GLB**，
 * ⛔ 不是掃 `gltf.py` 的原始碼字串（第二守則失敗形態⑥）。
 *
 * 四條都是 2026-09-10 真的踩到的缺陷，⛔ 不是假想：
 *  ① 零長度片段 —— WC3 modeler 把署名塞進 sequence 清單（「未经允许禁止分享与使用」
 *    這種），轉出來是 duration=0 的 glTF animation ⇒ `inspectModelUpload` 逐字擋
 *    「動作長度必須大於零且不超過 300 秒」⇒ 整顆模型註冊不進去（41 顆裡中 6 顆）。
 *  ② 貼圖掉光 —— `_find_texture_png()` 只在 `raw_dir` **最上層**找，而 ou99 的 zip
 *    **保留目錄**（BLP 在 `war3mapimported/`）⇒ 靜默退回 8×8 佔位圖。
 *    ⛔ 而它與「這顆模型本來就沒貼圖」量起來一模一樣（41 顆裡中 11 顆）。
 *  ③ 貼圖超過英雄上限 1024。
 *  ④ ⭐ **draw call 等於「畫起來不同」的材質數** —— 也就是同材質的幾何真的合併了。
 *    ⚠️ 刻意**不**斷言「≤5」：那是內容重不重的問題（今天有 5 顆真的超標），
 *    而這一條問的是**合併有沒有發生**，⛔ 與內容重量無關。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const GLB_DIR = join(REPO, "content", "assets", "models", "ou99");
const MODELS = join(REPO, "content", "models");
const have = existsSync(GLB_DIR) && existsSync(MODELS);

interface Gltf {
  images?: { bufferView: number }[];
  bufferViews?: { byteOffset?: number; byteLength: number }[];
  materials?: Record<string, unknown>[];
  meshes?: { primitives: { material?: number; indices?: number }[] }[];
  nodes?: { mesh?: number }[];
  accessors?: { max?: number[] }[];
  animations?: { name: string; samplers: { input: number }[] }[];
}

function readGlb(path: string): { gltf: Gltf; bin: Buffer } {
  const d = readFileSync(path);
  const jsonLen = d.readUInt32LE(12);
  const gltf = JSON.parse(d.subarray(20, 20 + jsonLen).toString("utf8")) as Gltf;
  const binStart = 20 + jsonLen + ((4 - (jsonLen % 4)) % 4) + 8;
  return { gltf, bin: d.subarray(binStart) };
}
function pngSize(bin: Buffer, gltf: Gltf, imageIndex: number): [number, number] | null {
  const bv = gltf.bufferViews![gltf.images![imageIndex]!.bufferView]!;
  const at = bv.byteOffset ?? 0;
  if (bin.readUInt32BE(at) !== 0x89504e47) return null;
  return [bin.readUInt32BE(at + 16), bin.readUInt32BE(at + 20)];
}
const files = have ? readdirSync(GLB_DIR).filter((f) => f.endsWith(".glb")).map((f) => join(GLB_DIR, f)) : [];

describe.skipIf(!have)("ou99 匯入模型的出貨不變量", () => {
  it("★ ① 沒有零長度片段 · ② 貼圖沒有整組掉成佔位圖 · ③ 貼圖不超過 1024", () => {
    const zero: string[] = [], gone: string[] = [], big: string[] = [];
    for (const f of files) {
      const { gltf, bin } = readGlb(f);
      const name = f.split("/").pop()!;
      for (const a of gltf.animations ?? []) {
        const span = Math.max(0, ...a.samplers.map((s) => gltf.accessors![s.input]!.max?.[0] ?? 0));
        if (span <= 0) zero.push(`${name}:${a.name}`);
      }
      const sizes = (gltf.images ?? []).map((_, i) => pngSize(bin, gltf, i)).filter(Boolean) as [number, number][];
      const edge = Math.max(0, ...sizes.flat());
      if (sizes.length && edge <= 8) gone.push(`${name} 全部貼圖 ≤8×8`);
      if (edge > 1024) big.push(`${name} 貼圖邊長 ${edge}`);
    }
    expect({ zero, gone, big }).toEqual({ zero: [], gone: [], big: [] });
  });

  it("★ ④ draw call 數 === 畫起來不同的材質數（＝同材質幾何真的合併了）", () => {
    const unmerged: string[] = [];
    for (const f of files) {
      const { gltf } = readGlb(f);
      const used: number[] = [];
      for (const n of gltf.nodes ?? []) {
        if (n.mesh === undefined) continue;
        for (const p of gltf.meshes![n.mesh]!.primitives) used.push(p.material ?? -1);
      }
      // ⭐ 「畫起來不同」＝ 材質 JSON 去掉 name / extras（那兩格是**溯源資料**，⛔ 不是渲染狀態）
      const distinct = new Set(used.map((m) => {
        const mat = gltf.materials?.[m] ?? {};
        return JSON.stringify(Object.fromEntries(
          Object.entries(mat).filter(([k]) => k !== "name" && k !== "extras").sort()));
      }));
      if (used.length !== distinct.size) {
        unmerged.push(`${f.split("/").pop()} draw=${used.length} 但只有 ${distinct.size} 種畫法`);
      }
    }
    expect(unmerged).toEqual([]);
  });

  it("★ 每份模型文件的六格 clipMap 都對得到 GLB 裡**唯一具名**的片段", () => {
    const broken: string[] = [];
    for (const mf of readdirSync(MODELS).filter((f) => f.startsWith("ou99.") && f.endsWith(".json"))) {
      const doc = JSON.parse(readFileSync(join(MODELS, mf), "utf8")) as { glbPath: string; clipMap: Record<string, string> };
      const glb = join(REPO, "content", doc.glbPath);
      if (!existsSync(glb)) { broken.push(`${mf} 的 GLB 不存在`); continue; }
      const names = (readGlb(glb).gltf.animations ?? []).map((a) => a.name);
      if (new Set(names).size !== names.length) broken.push(`${mf} 的 GLB 有同名片段`);
      for (const [state, clip] of Object.entries(doc.clipMap)) {
        if (!names.includes(clip)) broken.push(`${mf} 的 ${state} 指向不存在的「${clip}」`);
      }
    }
    expect(broken).toEqual([]);
  });
});
