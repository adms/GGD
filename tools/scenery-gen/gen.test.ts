/**
 * scenery-gen 的守衛。兩條，各守一件事。
 *
 * ① sha256 釘選 + **磁碟上出貨的那一份**要一致 —— 參數表動一個數字就紅。
 *    ⚠️ 這一條是「產物清單」，⛔ 不是斷言預算的一部分（每一列是一個檔案）。
 * ② 從**寫出去的位元組**讀回四條不變量，⛔ 不是從參數表讀
 *    （失敗形態⑤：被測的不是出貨的那個）。
 *
 * 突變紀錄（2026-08-18，承重那一條）：
 *   · `pieces.ts` 的 `torii` 笠木 `size` 高度 0.2 → 0.24 → ①紅（sha256 全變）
 *     ✅ 而且 `pnpm scenery:check` 同時報 STALE。改回。
 *
 * ⛔ 它紅了不要改這個檔案 —— 跑 `pnpm scenery:gen`，把新的 hash 貼回 PINS，
 * 檔案與 hash 進同一個 commit。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { bakeAll, outPath } from "./gen";
import { SCENERY_HEIGHT_CAP, TRI_BUDGET } from "./parts";

const PINS: Record<string, string> = {
  torii: "ba46dfe834a7ffe2576cf2c1ca1b5a18967fdd06886c5dc5891ff1a6116b1025",
  stone_lantern: "b9f36b82c61498a30d194bb717295fbd632b56a2e041dac608af186fddd565d8",
  shoji_door: "c069d451eceff3d908c0de7a885e3235e4fd738f18e8eef4c4c0171d6958e179",
  stone_steps: "901f3af91b0daff3e1756dced6c4a51e1265889f46c98a0edd8af49c16f7349c",
  gravestone: "007f2f980796c07a28c16296eca9401da5c9fb94f297f8ce661d2b89578cdaa3",
  dead_tree: "24368827d8a4134e7f4dcaa2dc86f610ca22138045d0bca658c27fa13e7f1d2c",
  iron_fence: "f1eb3e0b99678e0b3d6108cc1bb5b87999c98271faecab17d3b9379ec40caac4",
  sarcophagus: "d27ab46fb3eb8e832cd946fcc079a54dcb6e681ee05f09936d8e59077c2801f5",
  icicle_cluster: "9e47159d214327ff870bf028bcf075cee14dc1a9618ea468040218fecbb0ee23",
  ice_blocks: "6169cbf1ef84696e5536a9e45f556df265ce0b8c028c2c4f1c115755aa250398",
  broken_pillar: "d0782875bf1f6928e6c4437b66605239293475d84ff6a82af2df0446d3792dd8",
  rubble_pile: "e80a8ea9537aa82311280a9ed5036d6be899d46897cae85a812fd059d417dda9",
  leaning_beam: "8ceb8ff5e8748e9f5da14a969a750c6c020626b1b2a13fe8f8df1b3d1f12ba69",
  stand_section: "20f57410d18a2e4a4f43badc5c79a83ca3eac8a8d263f9a5cf22545b99be648d",
  hanging_banner: "01b996f016984494f96aeffe9a23e68cb63685eb44019d5ef6f227685617b553",
};

/** 12-byte header + length-prefixed JSON/BIN chunks — glTF 2.0 的全部。 */
function parseGlb(bytes: Uint8Array): { json: any; bin: Uint8Array } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  return { json, bin: bytes.subarray(20 + jsonLen + 8) };
}
function readAcc(json: any, bin: Uint8Array, i: number): Float32Array | Uint16Array {
  const a = json.accessors[i];
  const v = json.bufferViews[a.bufferView];
  const n = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type]!;
  const buf = bin.buffer.slice(bin.byteOffset + v.byteOffset, bin.byteOffset + v.byteOffset + v.byteLength);
  return a.componentType === 5126 ? new Float32Array(buf, 0, a.count * n) : new Uint16Array(buf, 0, a.count * n);
}

describe("scenery-gen", () => {
  const rows = bakeAll();

  it("每一件的位元組都被釘住，而且與出貨的檔案一致", () => {
    expect(rows.map((r) => r.piece.key).sort()).toEqual(Object.keys(PINS).sort());
    for (const { piece, bytes, stats } of rows) {
      expect(stats.sha256, `${piece.key} 的產生器輸出變了`).toBe(PINS[piece.key]);
      const file = outPath(piece.key);
      expect(existsSync(file), `${file} 不見了 —— 跑 pnpm scenery:gen`).toBe(true);
      expect(Buffer.from(bytes).equals(readFileSync(file)), `${piece.key}.glb 過期了`).toBe(true);
    }
  });

  it("⭐ 從出貨的位元組讀回：不穿地板 · 不擋視線 · 單 draw call · 面向正確", () => {
    for (const { piece, bytes, stats } of rows) {
      const { json, bin } = parseGlb(bytes);
      const prim = json.meshes[0].primitives[0];
      const accPos = json.accessors[prim.attributes.POSITION];
      // ① 不穿地板：bbox 最低點必須**逐位元組**是 0
      expect(accPos.min[1], `${piece.key} 的底不在 y=0`).toBe(0);
      // ② 不擋視線：ArenaScene.SIGHTLINE_HEIGHT_CAP 以下 ⇒ occludesPlayArea 永遠 false
      expect(accPos.max[1], `${piece.key} 太高，dressArena 會把它壓扁`).toBeLessThanOrEqual(SCENERY_HEIGHT_CAP);
      // ③ 一個 mesh / 一個 material / 零骨架 —— arena-decor 閘的三條硬線
      expect([json.meshes.length, json.materials.length, json.animations?.length ?? 0]).toEqual([1, 1, 0]);
      expect(json.meshes[0].primitives.length).toBe(1);
      expect(stats.triangles).toBeLessThanOrEqual(TRI_BUDGET);
      // ④ X 鏡射是改變定向的：繞序沒跟著反轉的話，每一個面都會翻到裡面去，
      //    而那**看起來像模型不見了**，不像斷言錯誤。
      const pos = readAcc(json, bin, prim.attributes.POSITION) as Float32Array;
      const nrm = readAcc(json, bin, prim.attributes.NORMAL) as Float32Array;
      const idx = readAcc(json, bin, prim.indices) as Uint16Array;
      let worst = 1;
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
        const p = (k: number) => [pos[k * 3]!, pos[k * 3 + 1]!, pos[k * 3 + 2]!];
        const [pa, pb, pc] = [p(a), p(b), p(c)];
        const e1 = pb.map((v, i) => v - pa[i]!);
        const e2 = pc.map((v, i) => v - pa[i]!);
        const g = [
          e1[1]! * e2[2]! - e1[2]! * e2[1]!,
          e1[2]! * e2[0]! - e1[0]! * e2[2]!,
          e1[0]! * e2[1]! - e1[1]! * e2[0]!,
        ];
        const len = Math.hypot(g[0]!, g[1]!, g[2]!);
        if (len < 1e-9) continue;
        worst = Math.min(worst, (g[0]! * nrm[a * 3]! + g[1]! * nrm[a * 3 + 1]! + g[2]! * nrm[a * 3 + 2]!) / len);
      }
      expect(worst, `${piece.key} 有面向內的三角形（繞序沒跟著 X 鏡射反轉）`).toBeGreaterThan(0.99);
    }
  });
});
