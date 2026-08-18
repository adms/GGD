/**
 * ⛔ **15 件招牌物件不可以「生出來了但沒有一張圖放」。**（GH#362，owner 2026-08-18
 * 「太少特殊獨有場景裝飾」）
 *
 * `tools/scenery-gen` 烤出 15 個 .glb 之後，**沒有任何既有守衛會因為 13 張圖一件都
 * 沒放而紅** —— 檔案在、sha256 對得上、`content:build` 綠、`arenaScenery.test.ts`
 * 也綠（它只問「散佈規則有沒有變成 mesh」，而出貨的規則本來就有 pillar）。
 * 那正是失敗形態②：做了但玩家看不到。
 *
 * 這一支關**兩個**口子，兩個都是「量到的」不是「掃字串的」：
 *
 * ① **展開之後一件都不可以被砍。** `expandSceneryProps` 的 `maxPropsPerZone`
 *    （出貨 40）砍的是**規則順序的後面**，而新加的規則正好排在那裡 ——
 *    一條 count 超編的規則會讓整批招牌物件靜默消失，而 JSON 裡那幾行看起來完全正確。
 *    ⚠️ 上限**從 `content/config/ambient-vfx.json` 讀**，⛔ 不抄 40。
 *
 * ② **放大之後仍然不擋鏡頭。** `scenery-gen` 的 bake() 保證每一件 ≤ 2.4u，
 *    但 README 自己點名 `scale` 是唯一的漏洞（鳥居 2.34 × 1.5 = 3.5）。
 *    高度從**出貨的 GLB 位元組**讀 POSITION accessor 的 max.y，⛔ 不抄參數表。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zArenaDoc, zConfigAmbientVfxDoc, expandSceneryProps } from "@ggd/shared/content";
import { SIGHTLINE_HEIGHT_CAP } from "./ArenaScene";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (rel: string): unknown => JSON.parse(readFileSync(join(REPO, rel), "utf8"));
const SCENERY_DIR = "content/assets/models/scenery";

/** 這件模型出貨的**位元組**說它多高。⛔ 不讀 `tools/scenery-gen/pieces.ts` 的表。 */
function modelTopY(rel: string): number {
  const buf = readFileSync(join(REPO, "content", rel));
  const gltf = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8")) as {
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { max: number[] }[];
  };
  return Math.max(
    ...gltf.meshes.flatMap((m) =>
      m.primitives.map((p) => gltf.accessors[p.attributes.POSITION]!.max[1]!),
    ),
  );
}

const CAP = zConfigAmbientVfxDoc.parse(read("content/config/ambient-vfx.json")).scenery!
  .maxPropsPerZone;
const DOCS = readdirSync(join(REPO, "content/arenas"))
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => zArenaDoc.parse(read(`content/arenas/${f}`)));

describe("15 件招牌物件真的落在 13 張圖上 (GH#362)", () => {
  it("★ 每一件都被用到，而且展開之後 maxPropsPerZone 一件都沒砍掉", () => {
    const used = new Set<string>();
    for (const doc of DOCS) {
      const rules = doc.scenery?.props ?? [];
      const decor = expandSceneryProps(doc.scenery, doc.zones, CAP);
      const want = doc.zones.length * rules.reduce((n, r) => n + r.count, 0);
      expect(decor.length, `${doc.id} 的散佈道具被 maxPropsPerZone(${CAP}) 砍掉了`).toBe(want);
      for (const d of decor) if (d.model.includes("/scenery/")) used.add(d.model);
    }
    const onDisk = readdirSync(join(REPO, SCENERY_DIR))
      .filter((f) => f.endsWith(".glb"))
      .map((f) => `assets/models/scenery/${f}`);
    expect([...used].sort(), "有招牌物件烤出來了卻沒有任何一張圖放").toEqual(onDisk.sort());
  });

  it("★ 放大之後仍然不高於視線上限（scale 是 2.4u 不變量唯一的漏洞）", () => {
    for (const doc of DOCS) {
      for (const r of doc.scenery?.props ?? []) {
        if (!r.model.includes("/scenery/")) continue;
        const top = modelTopY(r.model) * r.scaleMax;
        expect(top, `${doc.id} 的 ${r.model} 放大後 ${top.toFixed(2)}u 會被壓扁`).toBeLessThanOrEqual(
          SIGHTLINE_HEIGHT_CAP + 1e-6,
        );
      }
    }
  });
});
