/**
 * ⭐⭐【`fxLongAxis` 指的那一軸，必須由**畫得出來的**幾何撐出來】—— GH#767。
 *
 * ── ⛔ 為什麼既有的閘全綠而光束看不見 ─────────────────────────────────────────
 * `modelFxStagingContract` ⑥⑦ 的 `visiblePrimitives()` 問的是一個**名詞**：
 * 「這份模型**有沒有任何一片** primitive 畫得出來」。出貨的 `revivehuman.glb`
 * （20-03 約束與勝利之劍 · 09-04 龜派氣功 · 90-04 都指到它）是 **3/4** ⇒ 過。
 *
 * ⚠️ 而缺陷住在**關係**：被拿來當長軸／縮放基準的那一片**自己**是不是看得見。
 * 2026-08-26 直接讀位元組量到（⛔ 不是推測）：
 *
 *   含隱形面片  10.751 × **16.757** × 10.751  ⇒ 長軸 y
 *   只算可見     7.817 × ** 5.127** ×  7.817  ⇒ 長軸 x，而 **y 是最短的那一軸**
 *
 * y 那一格有 **69% 由 `TeamGlow0`（`baseColorFactor:[0,0,0,0]`、無貼圖）貢獻** ——
 * 也就是說「這具模型是立著的」這個結論**整個來自一片必不可見的面片**。
 * ⇒ `fxLongAxis:"y"` 把一具看得見的東西按照一個看不見的東西的形狀放倒，
 * 而 `scaleAxis` 又沿著那條假長軸把它拉長 3.12 倍。
 *
 * ── ⭐ 這一條問的兩件事（都是**關係**，⛔ 不是布林） ──────────────────────────
 *  ① 宣告的那一軸 === **可見**包圍盒的最長軸
 *  ② 宣告的那一軸上，可見幾何至少撐出含隱形長度的 `MIN_VISIBLE_FRAC`
 *     （⚠️ 少了②，一份「可見最長軸剛好也是 y、但 y 有九成是隱形的」模型會漏過去 ——
 *      縮放基準仍然在描述一個看不見的東西）
 *
 * ⭐ 內建 sentinel：自造一份「長軸只由隱形 prim 貢獻」的假 glTF，斷言檢查器抓得到它。
 * ⛔ 沒有 sentinel 的量尺會在自己壞掉的時候**安靜地全過**（＝「這台量尺自己說謊」）。
 *
 * ── 突變紀錄（一批一條，承重線）──────────────────────────────────────────────
 *  · 把 `visibleOnly` 那一行過濾（`prim.material` 不在 `lit` 就跳過）拿掉，
 *    讓 `visibleBox()` 退化成量含隱形的包圍盒
 *      → 紅：sentinel 那一條先紅（「sentinel 沒有被抓到」），⛔ 不是靜靜地全過。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../../content");

/** 宣告的那一軸上，可見幾何至少要撐出含隱形長度的這麼多比例。 */
const MIN_VISIBLE_FRAC = 0.5;

type Gltf = {
  materials?: { pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: unknown } }[];
  meshes?: { primitives?: { material?: number; attributes?: Record<string, number> }[] }[];
  nodes?: { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; scale?: number[] }[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
  accessors?: { min?: number[]; max?: number[] }[];
};

function glbJson(path: string): Gltf {
  const buf = readFileSync(path);
  let off = 12;
  let json: Gltf = {};
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    off += 8;
    if (type === 0x4e4f534a) json = JSON.parse(buf.subarray(off, off + len).toString("utf8")) as Gltf;
    off += len;
  }
  return json;
}

/** 鏡射 `modelFxStagingContract` ⑥ 的 litMaterials（同一套判準，⛔ 不要各寫一份）。 */
function litMaterials(g: Gltf): Set<number> {
  const lit = new Set<number>();
  (g.materials ?? []).forEach((m, i) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    if (pbr.baseColorTexture !== undefined || pbr.baseColorFactor === undefined) lit.add(i);
    else if ((pbr.baseColorFactor[3] ?? 1) > 0) lit.add(i);
  });
  return lit;
}

/** rest-pose 包圍盒邊長 [x,y,z]；`visibleOnly` ⇒ 跳過材質畫不出來的 primitive。 */
function boxExtents(g: Gltf, visibleOnly: boolean): [number, number, number] | undefined {
  const lit = litMaterials(g);
  const nodes = g.nodes ?? [];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const visit = (idx: number, off: number[], scale: number[]): void => {
    const n = nodes[idx];
    if (!n) return;
    // ⚠️ 只吃 TRS 的平移與縮放（出貨的 imported .glb 從不對 mesh 節點下旋轉；
    //     真的出現旋轉時 `matrix` 分支會把它保守地當成單位矩陣 ⇒ 寧可誤放行）。
    const t = n.matrix ? [n.matrix[12] ?? 0, n.matrix[13] ?? 0, n.matrix[14] ?? 0] : (n.translation ?? [0, 0, 0]);
    const s = n.scale ?? [1, 1, 1];
    const o = [0, 1, 2].map((k) => off[k]! + (t[k] ?? 0) * scale[k]!);
    const sc = [0, 1, 2].map((k) => scale[k]! * (s[k] ?? 1));
    if (n.mesh !== undefined) {
      for (const prim of g.meshes?.[n.mesh]?.primitives ?? []) {
        if (visibleOnly && prim.material !== undefined && !lit.has(prim.material)) continue;
        const acc = g.accessors?.[prim.attributes?.["POSITION"] ?? -1];
        if (!acc?.min || !acc.max) continue;
        for (const k of [0, 1, 2]) {
          const a = o[k]! + acc.min[k]! * sc[k]!;
          const b = o[k]! + acc.max[k]! * sc[k]!;
          lo[k] = Math.min(lo[k]!, a, b);
          hi[k] = Math.max(hi[k]!, a, b);
        }
      }
    }
    for (const c of n.children ?? []) visit(c, o, sc);
  };
  const roots = g.scenes?.[g.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
  for (const r of roots) visit(r, [0, 0, 0], [1, 1, 1]);
  if (!Number.isFinite(lo[0])) return undefined;
  return [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!];
}

/** 這一份 .glb 對「宣告 `axis`」這件事的回答：`undefined` ＝ 沒問題，字串 ＝ 為什麼壞。 */
function longAxisComplaint(g: Gltf, axis: string): string | undefined {
  const full = boxExtents(g, false);
  const vis = boxExtents(g, true);
  if (!full) return "整份 .glb 沒有任何幾何可以量 —— 宣告長軸是一句「說了但不會發生」";
  if (!vis) return `${full.join(" × ")} 的幾何**一片都畫不出來**（材質 alpha 全 0）⇒ 零像素`;
  const k = "xyz".indexOf(axis);
  if (k < 0) return `宣告了一個不存在的軸「${axis}」`;
  const visLong = "xyz"[vis.indexOf(Math.max(...vis))];
  const frac = full[k]! > 1e-9 ? vis[k]! / full[k]! : 0;
  if (visLong !== axis)
    return (
      `宣告 ${axis}，但**可見**幾何的最長軸是 ${visLong}` +
      `（可見 ${vis.map((v) => v.toFixed(3)).join(" × ")} · 含隱形 ${full.map((v) => v.toFixed(3)).join(" × ")}）`
    );
  if (frac < MIN_VISIBLE_FRAC)
    return (
      `宣告 ${axis}，可見幾何只撐出那一軸的 ${(frac * 100).toFixed(0)}%` +
      `（< ${MIN_VISIBLE_FRAC * 100}%）⇒ 縮放/朝向基準在描述看不見的幾何`
    );
  return undefined;
}

describe("fxLongAxis 的那一軸要由可見幾何撐出來（GH#767：關係，⛔ 不是名詞）", () => {
  it("★ sentinel：長軸只由隱形 prim 貢獻的假模型，一定要被抓到", () => {
    const fake: Gltf = {
      materials: [
        { pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 0] } }, // 隱形
        { pbrMetallicRoughness: { baseColorTexture: {} } }, // 看得見
      ],
      accessors: [
        { min: [-1, -8, -1], max: [1, 8, 1] }, // 高 16 —— 隱形
        { min: [-3, -1, -3], max: [3, 1, 3] }, // 高 2、寬 6 —— 看得見
      ],
      meshes: [
        {
          primitives: [
            { material: 0, attributes: { POSITION: 0 } },
            { material: 1, attributes: { POSITION: 1 } },
          ],
        },
      ],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    };
    expect(boxExtents(fake, false), "sentinel 的含隱形包圍盒量錯了").toEqual([6, 16, 6]);
    expect(boxExtents(fake, true), "sentinel 的可見包圍盒量錯了").toEqual([6, 2, 6]);
    expect(
      longAxisComplaint(fake, "y"),
      "sentinel 沒有被抓到 —— 這台量尺自己壞了，下面那一條的『全過』不算數",
    ).toMatch(/可見/);
    expect(longAxisComplaint(fake, "x"), "可見長軸 x 本來就該過").toBeUndefined();
  });

  it("★ 出貨的每一份 model@1：宣告的長軸必須是可見幾何的長軸", () => {
    const dir = join(CONTENT, "models");
    const declared = readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>)
      .filter((d) => typeof d["fxLongAxis"] === "string");
    expect(declared.length, "沒有任何 model@1 宣告 fxLongAxis —— 這條斷言是真空綠的").toBeGreaterThan(0);

    const bad: string[] = [];
    for (const doc of declared) {
      const g = glbJson(join(CONTENT, String(doc["glbPath"])));
      const why = longAxisComplaint(g, String(doc["fxLongAxis"]));
      if (why) bad.push(`${String(doc["id"])}: ${why}`);
    }
    expect(
      bad,
      "這幾份的長軸基準是**看不見的幾何**：spawnModelFx 會照著它把模型放倒、" +
        "scaleAxis 會照著它把模型拉長，而玩家看到的是另一個形狀。" +
        "⛔ 改 fxLongAxis 只是換一句謊話 —— 先問那片隱形面片為什麼不可見" +
        "（`python3 tools/w3x-import/convert_stock_model.py <slug> --dry-run` 的 " +
        "`litGlowMaterials` / `longAxisVisibleFrac`），修得好就重烘，修不好才改宣告",
    ).toEqual([]);
  });
});
