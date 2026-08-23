/**
 * 原作 dummy 模型接線的閘（D6）——「`spawnModelFx.modelKey` 指得到一具**畫得出來**的網格」。
 *
 * ⚠️ 這一條問的**不是**「那個 id 存不存在」。2026-08-23 接線時量到兩顆已匯入的模型
 * （`imported.divinering` · `imported.blackhole`）的 `.glb` 裡 **`meshes` 是 0** ——
 * `model@1` 文件在、`glbPath` 指得到檔、`ContentLoader` 全綠、`spawnModelFx` 照樣送事件、
 * `modelFxRig` 照樣 `acquire()` 出一個節點 —— 而畫面上一個像素都沒有。
 * ⇒ 那是第一·五守則的形狀（說了但不會發生），而**既有的每一條守衛都是綠的**。
 *
 * ⛔ 所以判準是「有沒有 primitive」，不是「檔案在不在」。
 *
 * 第二條問的是同一個病的另一半：`mergeExpansion()`（`templates/expand.ts`）把
 * `effects` 列在 `EXPANDED_KEYS` 裡 ⇒ 它**先整格刪掉**再貼上展開結果。
 * ⇒ 寫在一份 `template:` 文件上的 `spawnModelFx` 在註冊時**逐字消失**，
 * 而 JSON 上看起來完全正確。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SHIPPED_CONTENT_DIR, shippedDocs, shippedDocMap } from "./__fixtures__/shippedContent";

type Doc = Record<string, unknown>;

/**
 * 已知 0 網格、而**出貨內容已經在引用**的模型。每一列都要有一個能被反駁的理由。
 * ⛔ 這不是「先放著」——它是一張要被清空的清單。
 */
const ZERO_MESH_KNOWN = new Map<string, string>([
  [
    "imported.blackhole",
    "飛影 38-03 邪王炎殺黑龍波（godie-u010.e / godie-uvng.e / .ex）在 D6 之前就引用它。" +
      "blackhole.glb 的 meshes=0（原作 BlackHole.mdx 整個特效住在發射器上，網格是空的）⇒ " +
      "正解是把它的 5 份 `fx.w3x.particle.blackhole.p*` 掛上去（報告 B1），⛔ 不是換一顆模型。",
  ],
]);

/** GLB 的第一個 chunk 是 JSON —— 只讀它，⛔ 不解 BIN（幾 KB 就夠回答有沒有 primitive）。 */
function glbPrimitiveCount(absPath: string): number {
  const buf = readFileSync(absPath);
  const chunkLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + chunkLen).toString("utf8")) as {
    meshes?: Array<{ primitives?: unknown[] }>;
  };
  return (gltf.meshes ?? []).reduce((n, m) => n + (m.primitives ?? []).length, 0);
}

/** 每一個 `spawnModelFx` 節點（含 onTouch / onArrive 巢狀），連同它住在哪一份文件。 */
function modelFxSites(): Array<{ where: string; modelKey: string }> {
  const out: Array<{ where: string; modelKey: string }> = [];
  const walk = (node: unknown, where: string): void => {
    if (Array.isArray(node)) {
      for (const n of node) walk(n, where);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const rec = node as Doc;
    if (rec.kind === "spawnModelFx" && typeof rec.modelKey === "string") {
      out.push({ where, modelKey: rec.modelKey });
    }
    for (const v of Object.values(rec)) walk(v, where);
  };
  for (const doc of shippedDocs<Doc>("abilities")) walk(doc.effects, `abilities/${String(doc.id)}`);
  for (const doc of shippedDocs<Doc>("champions")) walk(doc.abilities, `champions/${String(doc.id)}`);
  return out;
}

describe("w3x dummy 模型接線", () => {
  it("每一個 spawnModelFx.modelKey 都指得到一具畫得出來的網格", () => {
    const models = shippedDocMap<Doc>("models");
    const sites = modelFxSites();
    expect(sites.length).toBeGreaterThan(0); // ⛔ 母體空掉 = 真空綠

    const bad: string[] = [];
    for (const { where, modelKey } of sites) {
      const model = models.get(modelKey);
      if (!model) {
        bad.push(`${where}: modelKey "${modelKey}" 在 models 集合裡不存在`);
        continue;
      }
      const rel = model.glbPath;
      if (typeof rel !== "string") {
        bad.push(`${where}: models/${modelKey} 沒有 glbPath`);
        continue;
      }
      const abs = join(SHIPPED_CONTENT_DIR, rel);
      if (!existsSync(abs)) {
        bad.push(`${where}: ${rel} 這個檔不存在`);
        continue;
      }
      if (glbPrimitiveCount(abs) === 0 && !ZERO_MESH_KNOWN.has(modelKey)) {
        bad.push(`${where}: ${rel} 的 meshes 是 0 —— 這一發送得出事件但畫不出任何東西`);
      }
    }
    expect(bad, `${bad.length} 個接不到網格的 spawnModelFx`).toEqual([]);
  });

  it("⛔ template 驅動的技能文件不可以自己寫 spawnModelFx（展開時會被整格刪掉）", () => {
    const orphaned: string[] = [];
    for (const doc of shippedDocs<Doc>("abilities")) {
      if (doc.template === undefined || doc.template === null) continue;
      const effects = doc.effects;
      if (!Array.isArray(effects)) continue;
      for (const e of effects) {
        if ((e as Doc)?.kind === "spawnModelFx") {
          orphaned.push(
            `abilities/${String(doc.id)}: 有 template 綁定，effects 會被 mergeExpansion() 整格覆蓋 ` +
              `⇒ 這個 spawnModelFx 在註冊表裡不存在。要接模型請走模板的參數，⛔ 不是寫在文件上`,
          );
        }
      }
    }
    expect(orphaned, `${orphaned.length} 份會被展開洗掉的 spawnModelFx`).toEqual([]);
  });
});
