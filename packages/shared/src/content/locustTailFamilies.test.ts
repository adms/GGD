/**
 * ⭐ GH#688 Phase 6（TAIL lane）—— 蝗蟲群視覺長尾，五族一次收：
 *   AquaSpikeVersion2（h032 / o02Y）· BlackHole1（o01N / osp1）·
 *   MidchilderNanohaAura（h01Y / h01Z / h02D）· NetherStrike（h00X / h030）·
 *   GrandOrcAura（o015）。⭐ 五族的 .glb **本來就在 repo 裡**，本批一具都沒新轉
 *   （路徑柵欄：`tools/w3x-import/**` 屬另一條 lane）。
 *
 * 10 列逐列用 JASS／OBJECTS 驗證後的落點（⛔ 不是建議表照抄）：
 *   h032 FinalShotting→A0S6（**02-002 神通眼**）＋ HudGhosts→A0Z6（**02-04**）
 *        ⇒ godie-hvwd.ex／godie-hvwd.r。⭐ 這一族的 emitter 半（`godie-aquaspikeversion2-p0`）
 *        **早就綁在 hvwd.r 上**，本批補的是 geoset 半（ThunderClapCaster 同款分工）。
 *   o02Y WindFlowerStart→A0ZU（**15-002** 風花-武裝解除，GGD 改名「敵彈吸收陣。太陰道」）
 *        ⇒ godie-emfr.ex（編號是 join key，改名不是缺陷）。
 *   o01N newlzfsmove←newlzfs→A0MV（**34-002 冥道殘月破**）⇒ godie-osam.ex。
 *   h030 ImbaEye→A102（**45-002 天照**）⇒ godie-edem.ex。
 *   h02D Initate Crazy 的 Hvsh 分支（j:25410，與 QUAD 綁過的 h02I 同一塊）
 *        ⇒ godie-hvsh.r 第三個節點。
 *   o015 CloseDest→A0HB（**21-04 討滅封絕**）⇒ godie-e008.r。
 *   ⛔ 無落點：h01Y/h01Z（O01Z/O02V 奈葉未出貨）· h00X（兩個生成點都在
 *      `GetUnitTypeId=='E00Q'` 黑化Saber 柵欄裡）· osp1（A0WK 93-00 小考＝Ekee 未出貨）
 *      · o01N 的 GravityBall（A0YJ 是**道具** I030 的能力，而 GGD 的 godie-i030 沒有主動節點）
 *      · o01N/o015 的 AKT 支線（A0JZ「14-04 AKT戰隊」**在物件編輯器裡沒有主人**，
 *        而 Etyr 出貨的 14-04 是 A0SS 聖夜降臨 —— 不同的設計）。
 *
 * @visual-proof —— 靜態那一半：五具 .glb 至少一個出生可見＋帶貼圖＋UV 的 primitive，
 * 而且**乘上 doc.scale × 節點 scale 之後不會寬過半個競技場**（doc scale 退化的守衛）。
 * 動態那一半住 `docs/_reports/tail_visual-proof_20260826-0000/`（calibrate 462,400 自證，
 * 近黑家族走 A/B 像素差分尺；量到並修掉兩個「說了但不會發生」的節點，見報告 §四）。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDoc } from "./loader";

const ROOT = join(__dirname, "../../../..");
const readJson = (p: string): any => JSON.parse(readFileSync(join(ROOT, p), "utf-8"));

type NodeSpec = {
  rawcode: string;
  file: string;
  champion?: string;
  slot?: string;
  modelKey: string;
  scale: number;
  tint?: number[];
  lifeSec: number;
  distance?: number;
};

/** 逐格出處寫在每一列後面（w3u＝census 解析後的 usca／頂點色；j:＝war3map.j 行號）。 */
const LANDINGS: ReadonlyArray<NodeSpec> = [
  // h032 @ FinalShotting j:34036-34039：SetUnitScalePercent(800) · 前方 160 wc3u · TimedLife 1.00
  { rawcode: "h032", file: "content/abilities/godie-hvwd.ex.json",
    modelKey: "imported.aquaspikeversion2", scale: 8, distance: 1.6, lifeSec: 1 },
  // h032 @ HudGhosts j:55399-55401：SetUnitScalePercent(300) · 施法者腳下 · TimedLife 6.00
  // ⭐ distance 0.8 是**量出來的**（0.1 時 2,122→120 px，整支被施法者方塊遮掉），⛔ 不是 JASS 值
  { rawcode: "h032", file: "content/abilities/godie-hvwd.r.json", champion: "godie-hvwd", slot: "R",
    modelKey: "imported.aquaspikeversion2", scale: 3, distance: 0.8, lifeSec: 6 },
  // o02Y @ WindFlowerStart j:34816-34817：w3u usca 2 · RemoveUnitSP(u,3,1)
  // ⛔ census tint [1,0,0] 刻意不搬（紅 × 純青貼圖 ≈ 全黑，實測 3 px vs 621 px）
  { rawcode: "o02Y", file: "content/abilities/godie-emfr.ex.json",
    modelKey: "imported.aquaspikeversion2", scale: 2, distance: 1, lifeSec: 3 },
  // o01N @ newlzfsmove j:39088-39095：w3u usca 2.5 · 頂點色 100,0,0 · sleep 6 + sleep 1 → KillUnit
  { rawcode: "o01N", file: "content/abilities/godie-osam.ex.json",
    modelKey: "imported.blackhole1", scale: 2.5, tint: [0.3922, 0, 0], lifeSec: 7 },
  // h030 @ ImbaEye j:42213-42214：w3u usca 4（無 SetUnitScalePercent）· RemoveUnitSP(u,2,1)
  { rawcode: "h030", file: "content/abilities/godie-edem.ex.json",
    modelKey: "imported.netherstrike", scale: 4, lifeSec: 2 },
  // h02D @ Initate Crazy j:25410-25412：w3u usca 1.5 · 頂點色 255,100,100 · 前方 100 wc3u · TimedLife 3.00
  { rawcode: "h02D", file: "content/abilities/godie-hvsh.r.json", champion: "godie-hvsh", slot: "R",
    modelKey: "imported.midchildernanohaaura", scale: 1.5, tint: [1, 0.3922, 0.3922],
    distance: 1, lifeSec: 3 },
  // o015 @ CloseDest j:33037：頂點色 100,100,100 · sleep = lvl*4+2（rank1 ⇒ 6）
  // scale 3.1 ＝ CloseDestEffect j:33122 的**終值** (60*5+10)%，⛔ 不是 w3u 的 0.1（那是起始 15% 前的底數）
  { rawcode: "o015", file: "content/abilities/godie-e008.r.json", champion: "godie-e008", slot: "R",
    modelKey: "imported.grandorcaura", scale: 3.1, tint: [0.3922, 0.3922, 0.3922], lifeSec: 6 },
];

const PRESET = "tpl-locust-orb";
/** 競技場 24×18 ⇒ 一具蝗蟲群演出寬過半個場（12 世界單位）就是 doc.scale 退化了。 */
const MAX_WORLD_WIDTH = 12;

function fxNodes(node: unknown, modelKey: string, out: any[] = []): any[] {
  if (Array.isArray(node)) node.forEach((v) => fxNodes(v, modelKey, out));
  else if (node && typeof node === "object") {
    const r = node as Record<string, unknown>;
    if (r["kind"] === "spawnModelFx" && r["preset"] === PRESET && r["modelKey"] === modelKey) out.push(r);
    Object.values(r).forEach((v) => fxNodes(v, modelKey, out));
  }
  return out;
}

/** .glb 的 JSON chunk（⛔ 不解 BIN —— 這裡問的是材質/貼圖/UV/bbox，全部住 JSON）。 */
function glbJson(rel: string): any {
  const b = readFileSync(join(ROOT, rel));
  let off = 12;
  while (off + 8 <= b.length) {
    const len = b.readUInt32LE(off);
    const ty = b.readUInt32LE(off + 4);
    off += 8;
    if (ty === 0x4e4f534a) return JSON.parse(b.subarray(off, off + len).toString("utf8"));
    off += len;
  }
  return null;
}

describe("蝗蟲群視覺 · TAIL 五族（GH#688 Phase 6）", () => {
  it("五具模型文件＋glb：出生可見、帶貼圖與 UV，而且乘完 scale 不會寬過半個競技場（@visual-proof 靜態那一半）", () => {
    const widest: string[] = [];
    for (const key of [...new Set(LANDINGS.map((l) => l.modelKey))]) {
      const doc = readJson(`content/models/${key}.json`);
      expect(doc.schema, key).toBe("model@1");
      const glbPath = `content/${doc.glbPath}`;
      expect(existsSync(join(ROOT, glbPath)), `${glbPath} 不存在`).toBe(true);
      const gltf = glbJson(glbPath);
      expect(gltf, `${key}: glb 裡沒有 JSON chunk`).toBeTruthy();
      const mats = gltf.materials ?? [];
      const prims = (gltf.meshes ?? []).flatMap((m: any) => m.primitives ?? []);
      const visible = prims.filter((p: any) => {
        const f = mats[p.material]?.pbrMetallicRoughness?.baseColorFactor;
        return !(Array.isArray(f) && f[3] === 0); // 軟刪除 = alpha factor 0
      });
      expect(visible.length, `${key}: 0 個出生可見 primitive（軟刪除病）`).toBeGreaterThan(0);
      const textured = visible.filter((p: any) => {
        const pbr = mats[p.material]?.pbrMetallicRoughness ?? {};
        return pbr.baseColorTexture !== undefined && p.attributes?.TEXCOORD_0 !== undefined;
      });
      expect(textured.length, `${key}: 可見 primitive 沒有貼圖＋UV —— 素色方塊`).toBeGreaterThan(0);
      // ⭐ doc.scale 是**幾何正規化**（第〇·四守則：節點只寫原作的 scale）。它退化的
      //    症狀不是紅字而是「畫面被一張貼圖糊滿」⇒ 用最寬的那一支落點反推。
      let span = 0;
      for (const p of visible) {
        const a = gltf.accessors?.[p.attributes?.POSITION];
        if (!a?.min) continue;
        span = Math.max(span, a.max[0] - a.min[0], a.max[2] - a.min[2], a.max[1] - a.min[1]);
      }
      const biggest = Math.max(...LANDINGS.filter((l) => l.modelKey === key).map((l) => l.scale));
      const world = span * doc.scale * biggest;
      if (world > MAX_WORLD_WIDTH) widest.push(`${key}: ${world.toFixed(1)} 世界單位（scale ${biggest}）`);
    }
    expect(widest, `這幾具乘完之後比半個競技場還大 —— content/models/*.json 的 scale 要重新正規化`).toEqual([]);
  });

  it("七個落點都擺得出節點（standalone＋champion 鏡射），參數逐格等於 JASS/w3u 證據", () => {
    const missing: string[] = [];
    const wrong: string[] = [];
    const rejected: string[] = [];
    for (const row of LANDINGS) {
      const standalone = readJson(row.file);
      const v = validateDoc("abilities", standalone);
      if (!v.ok) rejected.push(`${row.file}: ${JSON.stringify(v.issues).slice(0, 300)}`);
      const docs: Array<[string, any]> = [["standalone", standalone]];
      if (row.champion && row.slot) {
        docs.push([`champion 鏡射 ${row.slot}`, readJson(`content/champions/${row.champion}.json`).abilities?.[row.slot]]);
      }
      for (const [where, doc] of docs) {
        const matches = fxNodes(doc, row.modelKey).filter((n) => n.scale === row.scale);
        if (matches.length === 0) {
          missing.push(`${row.rawcode} → ${row.file} (${where})`);
          continue;
        }
        for (const n of matches) {
          if (JSON.stringify(n.tint) !== JSON.stringify(row.tint))
            wrong.push(`${row.file} (${where}) tint=${JSON.stringify(n.tint)}，證據=${JSON.stringify(row.tint)}`);
          if (n.lifeSec !== row.lifeSec)
            wrong.push(`${row.file} (${where}) lifeSec=${n.lifeSec}，證據=${row.lifeSec}`);
          if (n.distance !== row.distance)
            wrong.push(`${row.file} (${where}) distance=${n.distance}，證據/實測=${row.distance}`);
          // ⭐ tpl-locust-orb ⛔ 不在 SOUNDLESS_TEMPLATES 上 ⇒ 每一個節點都要有聲音鍵
          if (typeof n.soundKey !== "string")
            wrong.push(`${row.file} (${where}) 沒有 soundKey —— modelFxStagingContract ④ 會紅`);
        }
      }
    }
    expect(rejected, "出貨文件過不了 schema —— content:build 會在同一處拒絕它").toEqual([]);
    expect(missing, "這幾個落點擺不出節點（產物紅 ⇒ 跑 pnpm skills:sync，⛔ 不要改這裡）").toEqual([]);
    expect(wrong, "節點參數偏離證據（scale/tint/lifeSec/distance 逐格照 JASS/w3u，⛔ 顏色與位置不歸我挑）").toEqual([]);
  });

  it("無落點清單的理由保持成立（不成立的那一天這裡紅 ⇒ 把落點接上）", () => {
    const jass = readFileSync(join(ROOT, "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j"), "utf-8");
    const objects = readJson("tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json");
    const ownersOf = (ab: string): string[] => {
      const out: string[] = [];
      for (const section of ["heroes", "units"]) {
        for (const [uid, u] of Object.entries<any>(objects[section] ?? {})) {
          if ([...(u.abilities ?? []), ...(u.hero_abilities ?? [])].includes(ab)) out.push(`${section}/${uid}`);
        }
      }
      return out;
    };
    // ① 未出貨的原主：O01Z/O02V（奈葉魔法陣 h01Y/h01Z）· E00Q（勝利劍黑化 h00X）· Ekee（教室 osp1）
    for (const legacy of ["godie-o01z", "godie-o02v", "godie-e00q", "godie-ekee"]) {
      expect(existsSync(join(ROOT, `content/champions/${legacy}.json`)),
        `${legacy} 進了出貨名冊 —— 這一族的落點裁定要重看（見 TAIL 報告無落點表）`).toBe(false);
    }
    // ② h00X 的兩個生成點都在黑化Saber 柵欄裡：Excalibur 那一半靠 `GetUnitTypeId==E00Q` 分支
    expect(/function Trig_Excalibur_Func019C[\s\S]{0,200}?GetUnitTypeId\(GetTriggerUnit\(\)\) == 'E00Q'/.test(jass),
      "Excalibur 的 h00X 分支不再由 E00Q 把關 —— 20-03 那一支要重新裁定要不要綁勝利劍黑化").toBe(true);
    // ③ AKT 支線：A0JZ「14-04 AKT戰隊」在物件編輯器裡沒有主人，而 Etyr 出貨的 14-04 是聖夜降臨
    expect(ownersOf("A0JZ"), "A0JZ 有了主人 —— o01N/o015 的 AKT 生成點要重新裁定").toEqual([]);
    expect(String(readJson("content/abilities/godie-etyr.r.json").name),
      "Etyr 的 14-04 換成 AKT戰隊 了 —— 那 AKT 那兩個生成點就有落點了").toContain("聖夜降臨");
    // ④ GravityBall 那一半：A0YJ 是**道具** I030 的能力，而 GGD 的 godie-i030 沒有主動效果節點
    expect(ownersOf("A0YJ"), "A0YJ 變成單位/英雄的技能了 —— 重新看 o01N 的第三個生成點").toEqual([]);
    const i030 = readJson("content/items/godie-i030.json");
    expect(i030.effects ?? i030.active, "godie-i030 長出主動效果了 —— 重力之球該接到它身上").toBeUndefined();
    // ⑤ 母體自證：找不到生成點也要紅（安靜跳過與全過長得一樣）
    for (const rc of ["h032", "o02Y", "o01N", "h030", "h02D", "o015"]) {
      expect(jass.includes(`CreateNUnitsAtLoc( 1, '${rc}'`),
        `war3map.j 裡找不到 ${rc} 的生成點 —— 這一批的證據鏈失去出處`).toBe(true);
    }
  });
});
