/**
 * `model@1.hiddenPrimitives` —— 「3d model 連著屍體一起」的守衛。
 *
 * ---------------------------------------------------------------------------
 * 缺陷
 * ---------------------------------------------------------------------------
 * owner 2026-08-02:「初號機跟拳四郎一樣 3d model 連著屍體一起」。
 *
 * Warcraft III 的單位模型帶一個 `gutz*` geoset —— 屍體留在地上的那攤血泥。WC3
 * 靠 geoset 的 alpha 動畫(GEOA/KGAO)把它藏到 decay 序列才顯示,而 #59 已經確認
 * mdx→glb 轉檔**把 geoset 可見度動畫整個丟掉**,所以它在 .glb 裡變成一片永遠畫
 * 得出來的圖元。實測(`tools/w3x-import/gore_geoset_census.py`,直接讀 glb 位元組):
 *
 *   E00R.glb (初號機)  mesh0/prim2  53 頂點  100% 綁 `gutz00`
 *       rest bbox  x −0.025…1.641   y 0.119…0.260   ← 身高只有 ~1.7u
 *       → 一片跟屍體一樣長、貼在腳踝高度的平板,躺在英雄旁邊
 *   Umal.glb (拳四郎)  mesh0/prim4  49 頂點  100% 綁 `gutz00`   同上
 *                      mesh0/prim2 107 頂點  100% 綁 `Bone_Root01` 子樹
 *       rest bbox  z 0.787…1.662 (本體 z −0.526…0.549) —— **完全不重疊**,
 *       是站在旁邊的第二具人形,而且 13 個動畫全部驅動它:跟著走、跟著打、跟著死
 *
 * 40 個 overlay 模型裡 16 個帶血泥。出貨的 `content/assets/models/` 裡 1 個
 * (`hero-turtle.glb` mesh0/prim1, 62 頂點)。
 *
 * ---------------------------------------------------------------------------
 * 為什麼既有的兩支工具對它是綠的(第三守則:去驗證)
 * ---------------------------------------------------------------------------
 *   · `tools/w3x-import/strip_geoset_prims.py:35` 把 `GLB_DIR` 寫死成
 *     `content/assets/models/imported` —— overlay 那棵樹從來不在射程內。
 *   · `tools/w3x-import/invisible_prim_census.py` 有掃 overlay,但它選的是
 *     `baseColorFactor[3] == 0` 的圖元。血泥圖元**根本沒有 baseColorFactor**,
 *     所以那份普查對它們是結構上必然的綠。
 * 兩個都在掃「材質」,而這個缺陷長在「蒙皮」上。
 *
 * ---------------------------------------------------------------------------
 * 這一份守什麼(四段,分別對應四種會漏掉的方式)
 * ---------------------------------------------------------------------------
 * A. 出貨樹 —— **每次都從真的 .glb 位元組重解**。`content/assets/` 是 git 追蹤
 *    的,CI 上一定在,所以這半邊沒有「凍結的指紋」,凍結就是失敗形態 ⑤。
 * B. overlay 樹 —— 比對**committed 指紋**。`data/blizzard-overlay/` 是
 *    gitignore 的執行期資產(#10/#177),一條「檔案不在就 skip」的測試在**所有
 *    重要的地方都會靜靜地通過**,那不是守衛。指紋 40 個模型全在
 *    `hiddenPrimitives.fixture.json`。
 * C. 指紋不可以腐爛 —— overlay 樹在本機時,B 用的指紋必須跟現場重解的結果一致。
 * D. **渲染端真的做到了** —— 真的 Babylon(NullEngine)+ 真的 glTF loader +
 *    真的出貨 .glb + 真的 `EntityViewRegistry`,斷言的是 Babylon 會送進 render
 *    loop 的最終狀態(`isEnabled()` / `renderOverlay`),不是任何簿記旗標。
 *    這一段抓的是失敗形態 ②:欄位讀了、算了,但畫面上什麼都沒發生。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { ModelDoc } from "@ggd/shared/content";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { gltfPrimitiveIndexOf } from "./hiddenPrimitives";
import type { AssetManager } from "../AssetManager";

const REPO = resolve(__dirname, "../../../../..");
const MODELS_DIR = join(REPO, "content/models");
const OVERLAY_DIR = join(REPO, "data/blizzard-overlay/models");

// ────────────────────────────────────────────────────────────────────────────
// 最小 glTF 讀取器 —— 刻意跟 python 工具**各寫一次**。
// 指紋由 python 產,這裡用 TypeScript 重解;兩邊獨立算出同一組索引才會綠。
// 抄過來只會讓兩邊一起錯。
// ────────────────────────────────────────────────────────────────────────────
interface Gltf {
  nodes?: { name?: string; children?: number[]; mesh?: number; skin?: number }[];
  meshes?: { primitives: { attributes: Record<string, number> }[] }[];
  skins?: { joints: number[] }[];
  accessors?: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews?: { byteOffset?: number; byteStride?: number }[];
}

const COMPONENT_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NUM_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGlb(path: string): { gltf: Gltf; bin: Buffer } {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`not a .glb: ${path}`);
  const total = buf.readUInt32LE(8);
  let off = 12;
  let gltf: Gltf | null = null;
  let bin: Buffer = Buffer.alloc(0);
  while (off < total) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len;
    if (type === 0x4e4f534a) gltf = JSON.parse(chunk.toString("utf8")) as Gltf;
    else if (type === 0x004e4942) bin = chunk;
  }
  if (!gltf) throw new Error(`no JSON chunk: ${path}`);
  return { gltf, bin };
}

/** Accessor → rows of numbers (handles the interleaved byteStride case). */
function readAccessor(gltf: Gltf, bin: Buffer, index: number): number[][] {
  const acc = gltf.accessors![index]!;
  const n = NUM_COMPONENTS[acc.type]!;
  const size = COMPONENT_SIZE[acc.componentType]!;
  const view = gltf.bufferViews![acc.bufferView]!;
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = view.byteStride ?? n * size;
  const rows: number[][] = [];
  for (let i = 0; i < acc.count; i++) {
    const row: number[] = [];
    for (let c = 0; c < n; c++) {
      const at = base + i * stride + c * size;
      switch (acc.componentType) {
        case 5121: row.push(bin.readUInt8(at)); break;
        case 5123: row.push(bin.readUInt16LE(at)); break;
        case 5125: row.push(bin.readUInt32LE(at)); break;
        case 5126: row.push(bin.readFloatLE(at)); break;
        default: row.push(0);
      }
    }
    rows.push(row);
  }
  return rows;
}

const GORE_MARKER = "gutz";
const GORE_SHARE = 0.5;

/**
 * Primitive indices whose skin weight is ≥50% on a joint whose name contains
 * `marker`.
 *
 * ⚠️ 標記是**參數**而不是常數,因為 GH#742 需要同一把尺量另一個標記:一護的
 * 卍解身體綁在 `Object2Nwan` / `bone_ribbonwan` 那一族骨頭上(`wan` = 卍)。
 * ⛔ 抄第二份解析器就是第二個住處(第〇·四守則),而兩份 glb 解析器一定會漂。
 */
function markerPrimitivesOf(path: string, marker: string): number[] {
  const { gltf, bin } = readGlb(path);
  const names = (gltf.nodes ?? []).map((n) => n.name ?? "");
  const out: number[] = [];
  for (const node of gltf.nodes ?? []) {
    if (node.mesh === undefined || node.skin === undefined) continue;
    const joints = gltf.skins![node.skin]!.joints;
    const prims = gltf.meshes![node.mesh]!.primitives;
    for (let pi = 0; pi < prims.length; pi++) {
      const attrs = prims[pi]!.attributes;
      if (attrs.JOINTS_0 === undefined || attrs.WEIGHTS_0 === undefined) continue;
      const J = readAccessor(gltf, bin, attrs.JOINTS_0);
      const W = readAccessor(gltf, bin, attrs.WEIGHTS_0);
      const ct = gltf.accessors![attrs.WEIGHTS_0]!.componentType;
      const norm = ct === 5121 ? 255 : ct === 5123 ? 65535 : 1;
      let gore = 0;
      let total = 0;
      for (let v = 0; v < J.length; v++) {
        for (let k = 0; k < 4; k++) {
          const w = W[v]![k]! / norm;
          if (w <= 1e-4) continue;
          total += w;
          if (names[joints[J[v]![k]!]!]!.toLowerCase().includes(marker)) gore += w;
        }
      }
      if (total > 0 && gore / total >= GORE_SHARE) out.push(pi);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Primitive indices whose skin weight is ≥50% on a `gutz*` joint. */
const gorePrimitivesOf = (path: string): number[] => markerPrimitivesOf(path, GORE_MARKER);

// ────────────────────────────────────────────────────────────────────────────
// A. 出貨樹 —— 每次都從真的位元組重解
// ────────────────────────────────────────────────────────────────────────────
interface ModelDocOnDisk extends ModelDoc {
  hiddenPrimitives?: number[];
}

const shippedDocs = readdirSync(MODELS_DIR)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(MODELS_DIR, f), "utf8")) as ModelDocOnDisk)
  .map((d) => ({ doc: d, abs: join(REPO, "content", d.glbPath) }))
  .filter((e) => existsSync(e.abs));

/**
 * ⭐ 第二個**合法的**隱藏理由:形態互斥的身體(GH#742,黑崎一護)。
 *
 * 在此之前只認「它是血泥」一種理由,而 `heroichigo.glb` 一顆 `gutz*` 骨頭都沒有
 * (量到的:5 片圖元 goreShare 全 0.000),它要藏的正是**身體** ⇒ 下面那條斷言會把
 * 一護的修復擋在門外。⚠️ 這是這條 lane 量到的真正阻礙(lane 契約第三條)。
 *
 * ⛔ 放行不可以放成「藏什麼都行」⇒ 判準是**關係**:同一顆 `glbPath` 被**另一份**
 * 文件用一組**不相交且非空**的索引切開 ⇒ 兩份文件各畫一半。單獨一份文件把身體
 * 藏掉(打錯索引、漏掉搭檔)**仍然紅**。⚠️ 量過今天不誤放行任何既有文件:148 份裡
 * 只有 `imported.hero-turtle` 有宣告,而它的 glbPath 沒有第二份文件。
 */
function formSplitPartnerOf(doc: ModelDocOnDisk): ModelDocOnDisk | null {
  const mine = new Set(doc.hiddenPrimitives ?? []);
  if (mine.size === 0) return null;
  for (const { doc: other } of shippedDocs) {
    if (other.id === doc.id || other.glbPath !== doc.glbPath) continue;
    const theirs = other.hiddenPrimitives ?? [];
    if (theirs.length === 0 || theirs.some((p) => mine.has(p))) continue;
    return other;
  }
  return null;
}

describe("A · 出貨的 content/assets/models —— 血泥圖元必須被宣告", () => {
  it("每一份 model@1 的 gutz 圖元都在 hiddenPrimitives 裡", () => {
    expect(shippedDocs.length, "content/models 至少要有一份文件指到存在的 glb").toBeGreaterThan(50);
    const missing: string[] = [];
    let declaredTotal = 0;
    for (const { doc, abs } of shippedDocs) {
      const gore = gorePrimitivesOf(abs);
      const declared = new Set(doc.hiddenPrimitives ?? []);
      declaredTotal += gore.filter((p) => declared.has(p)).length;
      for (const p of gore) {
        if (!declared.has(p)) missing.push(`${doc.id} (${doc.glbPath}) prim${p}`);
      }
    }
    // 前提:這條守衛必須真的有東西可守。出貨資產哪天被修好/換掉,這一行會紅,
    // 而不是讓整段靜悄悄變成「什麼都沒測」(失敗形態 ③)。
    expect(declaredTotal, "出貨樹裡至少要有一個被宣告的血泥圖元(這條守衛的前提)").toBeGreaterThan(0);
    expect(missing, `這些 glb 帶著沒宣告的 WC3 血泥 geoset:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("宣告的索引必須真的存在,而且不可以指到身體", () => {
    for (const { doc, abs } of shippedDocs) {
      const declared = doc.hiddenPrimitives ?? [];
      if (declared.length === 0) continue;
      const { gltf } = readGlb(abs);
      const total = Math.max(...(gltf.meshes ?? []).map((m) => m.primitives.length), 0);
      const gore = new Set(gorePrimitivesOf(abs));
      const partner = formSplitPartnerOf(doc);
      for (const p of declared) {
        expect(p, `${doc.id} 的 hiddenPrimitives 有 prim${p},但這個 glb 只有 ${total} 個圖元`).toBeLessThan(total);
        expect(
          gore.has(p) || partner !== null,
          `${doc.id} 藏了 prim${p},但那既不是血泥圖元、也沒有一份共用同一顆 glb 的` +
            `互補文件 —— 藏到身體會讓英雄整塊消失`,
        ).toBe(true);
      }
      if (partner) {
        const union = new Set([...declared, ...(partner.hiddenPrimitives ?? [])]);
        expect(
          union.size,
          `${doc.id} 與 ${partner.id} 合起來藏光了 ${total} 個圖元 —— ` +
            `形態切分至少要留下共用的那幾片(腳底座、頭),否則兩態都是空的`,
        ).toBeLessThan(total);
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// B/C. overlay 樹 —— committed 指紋(CI 上唯一能跑的東西)
// ────────────────────────────────────────────────────────────────────────────
interface FixtureModel {
  gorePrimitives: { primitive: number; vertices: number; joints: string[] }[];
  bodyRoots: { joint: string; vertices: number; primitives: number[]; animatedJoints: number; minY?: number | null }[];
  primitiveCount: number;
}
const fixture = JSON.parse(
  readFileSync(join(__dirname, "hiddenPrimitives.fixture.json"), "utf8"),
) as { models: Record<string, FixtureModel> };

// ⚠️ 這段註解以前寫著「暫放在這裡…搬家的時候只要改下面這一行路徑」——
// **兩步在 v0.9.28 都做完了**（`KNOWN_SIDECARS.models` 有這一列、`overlayModelDoc`
// 會注入），2026-08-22 GH#540 逐一查證過。⛔ 沒有「搬家」這件事待辦（第三守則）。
//
// ⚠️ 而這一支只問「**宣告的索引對不對**」——「有沒有一份帶血泥卻沒宣告的模型」
// 它結構上問不到。反向那半在 `hiddenPrimitives.census.test.ts`。
const overlayDecl = JSON.parse(
  readFileSync(join(__dirname, "../../../../../content/models/_overlay-hidden-geometry.json"), "utf8"),
) as { models: Record<string, { hiddenPrimitives: number[] }> };

describe("B · Blizzard overlay —— 每一個帶血泥的模型都要有宣告", () => {
  it("指紋裡有血泥的 16 個模型,_overlay-hidden-geometry.json 一個都不能少", () => {
    const withGore = Object.entries(fixture.models).filter(([, m]) => m.gorePrimitives.length > 0);
    // 前提。指紋被清空 / 換成別的東西時這裡先紅。
    expect(withGore.length, "指紋裡應該有 16 個帶血泥的 overlay 模型").toBe(16);

    const missing: string[] = [];
    for (const [file, m] of withGore) {
      const key = `assets/blizzard-local/models/${file}`;
      const declared = new Set(overlayDecl.models[key]?.hiddenPrimitives ?? []);
      for (const g of m.gorePrimitives) {
        if (!declared.has(g.primitive)) {
          missing.push(`${key} prim${g.primitive} (${g.vertices}頂點, ${g.joints.join("/")})`);
        }
      }
    }
    expect(missing, `overlay 血泥沒宣告:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("拳四郎的第二具骨架(Bone_Root01)也要藏 —— 它跟著走跟著打跟著死", () => {
    // 這一條單獨釘住,因為它跟血泥是**不同的**缺陷:一具完整的、被 13 個動畫
    // 驅動的第二人形,站在本體 +Z 1.2u 外。指紋裡它是 bodyRoots 的一列。
    const umal = fixture.models["Umal.glb"]!;
    const second = umal.bodyRoots.find((r) => r.joint === "Bone_Root01");
    expect(second, "Umal.glb 的指紋必須有 Bone_Root01 這具骨架").toBeTruthy();
    expect(second!.vertices, "它有真的頂點,不是空骨架").toBeGreaterThan(100);
    expect(second!.animatedJoints, "而且真的被動畫驅動").toBeGreaterThan(0);
    const declared = overlayDecl.models["assets/blizzard-local/models/Umal.glb"]!.hiddenPrimitives;
    for (const p of second!.primitives) {
      expect(declared, `Umal prim${p} 是第二具身體,必須藏`).toContain(p);
    }
  });

  it("宣告表不可以憑空多藏東西(每個索引都要在指紋裡有依據)", () => {
    for (const [key, entry] of Object.entries(overlayDecl.models)) {
      const file = key.split("/").pop()!;
      const m = fixture.models[file]!;
      expect(m, `${key} 不在指紋裡 —— 這個檔名不存在於 overlay 樹`).toBeTruthy();
      // ⭐ 主體 = 頂點最多的那個 root（指紋已按頂點數排序）。
      const bodyMinY = m.bodyRoots[0]?.minY ?? null;
      const justified = new Set<number>([
        ...m.gorePrimitives.map((g) => g.primitive),
        // 第二具(含以上)骨架:按頂點數排序後的第 2 名以下,且真的被動畫驅動
        ...m.bodyRoots
          .filter((r, i) => i > 0 && r.vertices >= 100 && r.animatedJoints > 0)
          .flatMap((r) => r.primitives),
        // ⭐ **浮在本體之上的獨立 root**（GH#558②）—— ⛔ 頂點數這個代理看不到它。
        //
        // ⚠️ E00S（白木老樹精）的兩顆浮空球各只有 **25 頂點**，
        //   ⭐ 正好落在上面那條 `vertices >= 100` 的**另一邊** ⇒ 閘對這一整類結構上失明
        //   （CLAUDE.md 失敗形態⑩：一個極端值落在門檻另一邊，而守衛因此是綠的）。
        //   而它的症狀是 #540 阿福那個：**戰鬥中一個分身飛上天**。
        //
        // ⭐ 判準改用**量到的幾何**：這個 root 的最低點，比主體的最低點高 3 個單位以上
        //   ⇒ 它整個懸在本體上方，⛔ 不可能是身體的一部分。
        //   （`minY` 由 `tools/w3x-import/gore_geoset_census.py` 從 accessor 量出來。）
        ...m.bodyRoots
          .filter(
            (r, i) =>
              i > 0 &&
              r.animatedJoints > 0 &&
              typeof r.minY === "number" &&
              typeof bodyMinY === "number" &&
              r.minY - bodyMinY >= 3,
          )
          .flatMap((r) => r.primitives),
      ]);
      for (const p of entry.hiddenPrimitives) {
        expect(justified.has(p), `${key} 藏了 prim${p},但指紋裡沒有任何理由`).toBe(true);
        expect(p).toBeLessThan(m.primitiveCount);
      }
    }
  });
});

describe("C · 指紋不可以腐爛", () => {
  const present = existsSync(OVERLAY_DIR);
  it.skipIf(!present)("overlay 樹在本機時,指紋必須等於現場重解的結果", () => {
    const drift: string[] = [];
    for (const [file, m] of Object.entries(fixture.models)) {
      const abs = join(OVERLAY_DIR, file);
      if (!existsSync(abs)) {
        drift.push(`${file}: 指紋有它,overlay 樹沒有`);
        continue;
      }
      const live = gorePrimitivesOf(abs).join(",");
      const frozen = m.gorePrimitives.map((g) => g.primitive).sort((a, b) => a - b).join(",");
      if (live !== frozen) drift.push(`${file}: 指紋 [${frozen}] ≠ 現場 [${live}]`);
    }
    expect(
      drift,
      `hiddenPrimitives.fixture.json 過期了 —— 跑 \`python3 tools/w3x-import/gore_geoset_census.py ` +
        `--fixture apps/client/src/render/views/hiddenPrimitives.fixture.json\`:\n  ${drift.join("\n  ")}`,
    ).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// D. 渲染端真的做到了
// ────────────────────────────────────────────────────────────────────────────
const TURTLE = "content/assets/models/imported/hero-turtle.glb";
const TURTLE_DOC = "content/models/imported.hero-turtle.json";
const ID = 802;

let engine: NullEngine;
let scene: Scene;
beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

async function realContainer(relPath: string): Promise<AssetContainer> {
  const bytes = readFileSync(resolve(REPO, relPath));
  const c = await LoadAssetContainerAsync(`data:base64,${bytes.toString("base64")}`, scene, {
    pluginExtension: ".glb",
  });
  c.removeAllFromScene();
  return c;
}

const champ = (): EntityViewState =>
  ({
    id: ID, kind: 0, seatId: 0, key: "test.body", teamId: 1,
    x: 0, z: 0, fx: 0, fz: 1, alive: true, flags: 0,
  }) as EntityViewState;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** 真的把出貨文件 + 出貨 glb 跑過 registry,回傳最終的網格清單。 */
async function mountModel(
  rel: string,
  doc: ModelDoc,
): Promise<{ reg: EntityViewRegistry; meshes: AbstractMesh[] }> {
  const container = await realContainer(rel);
  const assets = { load: () => Promise.resolve(container) } as unknown as AssetManager;
  const reg = new EntityViewRegistry(scene, assets, { modelDocFor: () => doc });
  reg.sync({
    entities: [champ()],
    poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
    nowMs: 0, dtMs: 16, loadModels: true,
  });
  await settle();
  return { reg, meshes: reg.getChampionView(ID)!.root.getChildMeshes(false) };
}

const mountTurtle = (doc: ModelDoc): Promise<{ reg: EntityViewRegistry; meshes: AbstractMesh[] }> =>
  mountModel(TURTLE, doc);

/** 出貨的那一份文件本身 —— 不是手捏的(失敗形態 ⑤)。 */
const shippedTurtleDoc = JSON.parse(readFileSync(join(REPO, TURTLE_DOC), "utf8")) as ModelDocOnDisk;

describe("D · 渲染端:被宣告的圖元真的不畫,而且不參與閃光與落地", () => {
  it("出貨文件說要藏 prim1 —— 而 prim1 真的是血泥(前提)", () => {
    expect(shippedTurtleDoc.hiddenPrimitives).toEqual([1]);
    expect(gorePrimitivesOf(resolve(REPO, TURTLE))).toEqual([1]);
  });

  it("宣告的圖元 setEnabled(false),其餘照常畫", async () => {
    const { reg, meshes } = await mountTurtle(shippedTurtleDoc as ModelDoc);
    // Babylon 的 glTF loader 把多圖元 mesh 拆成 `<node>_primitive<i>`;
    // 這一行是在**驗證那個約定**,不是假設它(第三守則)。
    const named = meshes.filter((m) => /_primitive\d+$/.test(m.name));
    expect(named.length, "hero-turtle 是多圖元 mesh,Babylon 應該給每片一個名字").toBeGreaterThan(1);

    const hidden = named.filter((m) => /_primitive1$/.test(m.name));
    const rest = named.filter((m) => !/_primitive1$/.test(m.name));
    expect(hidden.length, "prim1 必須存在").toBe(1);
    expect(rest.length, "身體必須還有別的圖元").toBeGreaterThan(0);

    expect(hidden[0]!.isEnabled(false), "血泥圖元必須是關掉的").toBe(false);
    for (const m of rest) expect(m.isEnabled(false), `${m.name} 是身體,不可以被關掉`).toBe(true);
    reg.dispose();
  });

  it("被藏起來的圖元挨打時不可以被閃光點亮(不能留在 flashMeshes 裡)", async () => {
    const { reg, meshes } = await mountTurtle(shippedTurtleDoc as ModelDoc);
    const view = reg.getChampionView(ID)!;
    view.flash([1, 0.2, 0.2], 100, 80, 0.6);
    view.update("idle", 100, 16, 0);

    const hidden = meshes.find((m) => /_primitive1$/.test(m.name))!;
    // ⚠️ 這個斷言之所以有鑑別力:`applyFlash` 讀的是 `drawnOpacityOf`(材質
    // alpha × visibility),**完全不看 isEnabled**。hero-turtle 的 mat2 是
    // BLEND 但沒有 baseColorFactor ⇒ alpha = 1。所以這片如果還留在
    // flashMeshes 裡,renderOverlay 就會是 true。
    //
    // 讀的是「誰真的被點亮了」這份清單,不是 `hidden.renderOverlay === false`:
    // `renderOverlay` 是 `@babylonjs/core/Rendering/outlineRenderer` 用
    // defineProperty 掛上去的,沒被寫過就是 undefined,`toBe(false)` 會因為
    // undefined ≠ false 而紅在錯的理由上。
    const lit = meshes.filter((m) => m.renderOverlay === true).map((m) => m.name);
    expect(lit, "藏起來的血泥不可以挨打發光").not.toContain(hidden.name);
    expect(lit.length, "身體本身還是要閃(否則『全部關掉』也會讓上面那行綠)").toBeGreaterThan(0);
    reg.dispose();
  });

  it("藏起來的幾何不參與身高正規化(ENABLED_ONLY predicate)", async () => {
    // ⚠️ 為什麼是探針文件而不是出貨文件:hero-turtle 的血泥 prim1 在 Y 上
    // (0.026…0.249)完全被身體(0.003…1.703)包住,所以藏掉它**本來就**不會改變
    // 身高 —— 拿它當對照組會讓這條測試對正確與壞掉的實作都過(失敗形態 ④)。
    // 所以這裡用同一顆真的出貨 glb,藏掉真的會撐開 Y 上界的 prim4/prim5
    // (兩片都到 y=1.703,其餘最高 1.39),驗的是**渲染規則**而不是內容。
    //
    // 這條規則是真的有人踩:量過的 overlay 模型裡有 4 個(H021、Hblm 賈修、
    // Umal 拳四郎、Usyl)的血泥最低點比身體還低(Hblm −0.063 vs 0.025),
    // 少了 predicate 就會被 `position.y = -min.y` 墊到半空中(失敗形態 ①)。
    // 那 4 個在 gitignore 的 overlay 樹裡,下面那條在本機才跑。
    const probe = { ...shippedTurtleDoc, hiddenPrimitives: [4, 5] } as ModelDoc;
    const hidden = await mountTurtle(probe);
    const scaleHidden = hidden.reg.getChampionView(ID)!.declaredScale;
    hidden.reg.dispose();

    const { hiddenPrimitives: _drop, ...noHide } = shippedTurtleDoc;
    const plain = await mountTurtle(noHide as ModelDoc);
    const scalePlain = plain.reg.getChampionView(ID)!.declaredScale;
    plain.reg.dispose();

    expect(scaleHidden).not.toBeNull();
    expect(scalePlain).not.toBeNull();
    // 藏掉最高的兩片 ⇒ 剩下的輪廓變矮 ⇒ 正規化到同一個 1.8u 要放得更大。
    expect(
      scaleHidden!,
      "藏掉撐開身高的圖元之後,正規化倍率必須變大 —— 沒變代表 bbox 還在算它",
    ).toBeGreaterThan(scalePlain! * 1.05);
  });

  it.skipIf(!existsSync(join(OVERLAY_DIR, "Hblm.glb")))(
    "賈修(Hblm)的血泥比腳底還低 —— 藏了之後不可以把他墊到半空中",
    async () => {
      const doc = {
        ...(shippedTurtleDoc as ModelDoc),
        glbPath: "assets/blizzard-local/models/Hblm.glb",
        hiddenPrimitives: [1],
      } as ModelDoc;
      const container = await realContainer("data/blizzard-overlay/models/Hblm.glb");
      const assets = { load: () => Promise.resolve(container) } as unknown as AssetManager;
      const reg = new EntityViewRegistry(scene, assets, { modelDocFor: () => doc });
      reg.sync({
        entities: [champ()],
        poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
        nowMs: 0, dtMs: 16, loadModels: true,
      });
      await settle();
      const view = reg.getChampionView(ID)!;
      const glbRoot = scene.getTransformNodeByName(`champ-${ID}-glb`)!;
      expect(glbRoot, "glb 必須真的掛上來了").toBeTruthy();
      // 落地量是用**看得見的**幾何算的:血泥 min.y = −0.063、身體 = 0.025,
      // 所以正確的抬升量是 −0.025×scale,不是 +0.063×scale。
      const scale = view.declaredScale!;
      expect(glbRoot.position.y).toBeCloseTo(-0.025 * scale, 2);
      reg.dispose();
    },
    30000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 接線守衛 —— 宣告到得了渲染端嗎（GH#220 / owner 2026-08-02「連著屍體一起」）
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ 上面那些測試驗的是「資料是對的」。這一條驗的是**資料到得了畫面** ——
// blizzard-overlay 那 40 隻沒有自己的 model 文件,ModelDoc 是 `overlayModelDoc`
// 在執行期合成的,所以不注入 = 資料在、schema 在、渲染端在,而玩家照樣看到屍體
// (失敗形態 ②:算出來了但從沒送到消費端)。
describe("overlayModelDoc 把宣告注入合成出來的 ModelDoc", () => {
  it("有宣告的 glb 拿得到 hiddenPrimitives", async () => {
    const { overlayModelDoc, overlayHiddenGeometryFromDoc, DEFAULT_W3X_CLIP_MAP } = await import("./blizzardOverlay");
    const hidden = overlayHiddenGeometryFromDoc(
      JSON.parse(
        readFileSync(join(__dirname, "../../../../../content/models/_overlay-hidden-geometry.json"), "utf8"),
      ),
    );
    const glb = "assets/blizzard-local/models/E00R.glb"; // 初號機 —— owner 點名的那一隻
    expect(Object.keys(hidden).length, "宣告表解析出來是空的").toBeGreaterThan(0);

    const doc = overlayModelDoc(
      { unitId: "E00R", champId: "godie-e00r", glb, clipMap: DEFAULT_W3X_CLIP_MAP },
      hidden,
    );
    // 突變點:把 overlayModelDoc 的 `...(hiddenPrimitives ...)` 那一段刪掉 → 這裡 undefined。
    expect(doc.hiddenPrimitives, "初號機的血泥 geoset 宣告沒有進到 ModelDoc").toEqual(hidden[glb]);
  });

  it("沒有宣告的 glb 不會多出這個欄位", async () => {
    const { overlayModelDoc, DEFAULT_W3X_CLIP_MAP } = await import("./blizzardOverlay");
    const doc = overlayModelDoc(
      { unitId: "ZZZZ", champId: "godie-zzzz", glb: "assets/blizzard-local/models/ZZZZ.glb", clipMap: DEFAULT_W3X_CLIP_MAP },
      {},
    );
    expect(doc.hiddenPrimitives).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// E. @visual-proof —— 黑崎一護的兩個形態各只畫一套身體(GH#742 / #34)
//
// 缺陷:`heroichigo.glb` 把**常態**與**卍解**兩套身體烘在同一顆 mesh 的 5 片圖元
// 裡。WC3 用 GEOA/KGAO 的 sequence 分族把另一套關掉,而 #59 已確認 mdx→glb
// **把 geoset 可見度動畫整個丟掉** ⇒ 兩隻一護同時穿著兩套身體。
//
// ⭐ 驗的是**終點**(玩家看得到那一層):真的 Babylon(NullEngine)+ 真的 glTF
// loader + 真的出貨 .glb + 真的出貨 model 文件 + 真的 `EntityViewRegistry`,
// 斷言 `isEnabled()` 與 `getVerticesData("position")`。
//
// ⚠️ 分族**每一次都從出貨位元組重解**(⛔ 沒有凍結的指紋 —— 失敗形態 ⑤),而且是
// 兩條**互不相干**的軸:①骨架(卍解身體綁在 `Object2Nwan`/`bone_ribbonwan`,
// `wan` = 卍) ②材質(唯一掛第二個 material 的圖元)。重烘 renumber ⇒ 這裡紅。
// ────────────────────────────────────────────────────────────────────────────
const ICHIGO_GLB = "content/assets/models/imported/heroichigo.glb";
const ICHIGO_LODS = ["heroichigo.glb", "heroichigo-mid.glb", "heroichigo-small.glb"];
const readDoc = (rel: string): ModelDocOnDisk =>
  JSON.parse(readFileSync(join(REPO, rel), "utf8")) as ModelDocOnDisk;

/** 這顆 glb 裡「只屬於卍解態」的圖元 —— 兩個軸各算一次,必須相等。 */
function bankaiPrimitivesOf(abs: string): number[] {
  const bySkin = markerPrimitivesOf(abs, "wan");
  const { gltf } = readGlb(abs);
  const mats = (gltf.meshes![0]!.primitives as { material?: number }[]).map((p) => p.material ?? 0);
  const byMaterial = mats.map((m, i) => [m, i] as const).filter(([m]) => m !== 0).map(([, i]) => i);
  expect(byMaterial.length, "一護的 glb 應該只有一片圖元掛在第二個 material 上").toBe(1);
  expect(byMaterial, "骨架與材質兩個軸對卍解身體的判定不一致").toEqual(bySkin);
  return bySkin;
}

describe("E · 一護的兩個形態各只畫一套身體 (@visual-proof)", () => {
  const base = readDoc("content/models/imported.heroichigo.json");
  const bankai = readDoc("content/models/imported.heroichigo-bankai.json");

  it("三階 LOD 的圖元切分一致,而且宣告來自那份切分(⛔ 不是手打的索引)", () => {
    const splits = ICHIGO_LODS.map((f) => {
      const abs = join(REPO, "content/assets/models/imported", f);
      expect(existsSync(abs), `${f} 不在出貨樹裡`).toBe(true);
      return { f, alt: bankaiPrimitivesOf(abs), total: readGlb(abs).gltf.meshes![0]!.primitives.length };
    });
    // 三階共用**一份**索引宣告 ⇒ 它們的切分必須逐格相同,否則遠景會換一套身體。
    for (const s of splits) {
      expect(s.total, `${s.f} 的圖元數與最高階不同`).toBe(splits[0]!.total);
      expect(s.alt, `${s.f} 的卍解圖元與最高階不同`).toEqual(splits[0]!.alt);
    }
    // 常態文件藏的,就是量出來的卍解身體;卍解文件藏的是剩下的常態專屬圖元。
    expect(base.hiddenPrimitives, "常態一護要藏的是卍解身體").toEqual(splits[0]!.alt);
    expect(bankai.hiddenPrimitives?.length, "卍解一護要藏常態身體與常態配件").toBeGreaterThan(0);
    expect(
      bankai.hiddenPrimitives!.some((p) => splits[0]!.alt.includes(p)),
      "卍解文件把自己的身體也藏掉了",
    ).toBe(false);
    expect(bankai.glbPath, "兩份文件必須共用同一顆 glb —— ⛔ 不要多烘一份二進位檔").toBe(base.glbPath);

    // 兩隻一護各自指到其中一份 —— ⛔ 共用一份就必然畫同一套身體(這張票的缺陷)。
    const ch = (id: string): { modelKey: string; transform?: { role: string; counterpartId: string } } =>
      JSON.parse(readFileSync(join(REPO, `content/champions/${id}.json`), "utf8"));
    const [n, o] = [ch("godie-h01n"), ch("godie-h01o")];
    expect([n.transform?.role, o.transform?.counterpartId]).toEqual(["base", "godie-h01n"]);
    expect([n.modelKey, o.modelKey], "兩隻一護沒有各自指到自己的形態文件").toEqual([base.id, bankai.id]);
  });

  it("渲染端:常態畫不出卍解身體,卍解畫不出常態身體,而兩邊都還有身體可畫", async () => {
    const drawn = async (doc: ModelDocOnDisk): Promise<Map<number, { on: boolean; verts: number }>> => {
      const { reg, meshes } = await mountModel(ICHIGO_GLB, doc as ModelDoc);
      const out = new Map<number, { on: boolean; verts: number }>();
      for (const m of meshes) {
        const i = gltfPrimitiveIndexOf(m.name);
        if (i < 0) continue;
        out.set(i, { on: m.isEnabled(false), verts: (m.getVerticesData("position")?.length ?? 0) / 3 });
      }
      reg.dispose();
      return out;
    };

    const asBase = await drawn(base);
    const asBankai = await drawn(bankai);
    expect(asBase.size, "Babylon 應該把 5 片圖元各拆成一個網格").toBe(5);

    const visible = (m: Map<number, { on: boolean; verts: number }>): number[] =>
      [...m].filter(([, v]) => v.on).map(([i]) => i);
    const verts = (m: Map<number, { on: boolean; verts: number }>): number =>
      [...m.values()].filter((v) => v.on).reduce((s, v) => s + v.verts, 0);

    for (const p of base.hiddenPrimitives!) {
      expect(asBase.get(p)!.on, `常態一護還畫著卍解身體 prim${p}`).toBe(false);
      expect(asBankai.get(p)!.on, `卍解一護沒有畫出自己的身體 prim${p}`).toBe(true);
    }
    for (const p of bankai.hiddenPrimitives!) {
      expect(asBankai.get(p)!.on, `卍解一護還畫著常態身體 prim${p}`).toBe(false);
      expect(asBase.get(p)!.on, `常態一護沒有畫出自己的身體 prim${p}`).toBe(true);
    }
    // ⛔「兩邊都關光了」也會讓上面全綠 —— 這兩行是那個對照(失敗形態 ④)。
    expect(verts(asBase), "常態一護畫出來是空的").toBeGreaterThan(400);
    expect(verts(asBankai), "卍解一護畫出來是空的").toBeGreaterThan(400);
    // 兩態共用的那幾片(腳底座 + 頭)必須兩邊都在。
    const shared = visible(asBase).filter((i) => visible(asBankai).includes(i));
    expect(shared.length, "兩態之間一片共用圖元都沒有 —— 切分把整具身體切斷了").toBeGreaterThan(0);
  });
});
