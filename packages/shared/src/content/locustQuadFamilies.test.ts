/**
 * ⭐ GH#688 Phase 6（QUAD lane）—— 蝗蟲群視覺，四個小族一次收：
 *   ReviveHuman 殘餘（h007/h00S/h01V/n00V）· TomeOfRetrainingCaster（h00N/h025/h02I/o00R）
 *   · WarStompCaster（h00Z/o00V/o019/o01U）· Meteor.mdl（n009/n00L/n00R/n01F）。
 *
 * 16 列逐列用 sites/w3a 驗證後的落點（⛔ 不是建議表照抄 —— 建議表把死 dummy 也列進來）：
 *   h007 SunFire→A0R4（90-04 陽光烈焰）→ godie-h02r.r ＋ godie-hgam.r（Turtle Power
 *        →09-04 已由 pilot 綁過 revivehuman，⛔ 不重複；Allbullet→03-04 鋼彈在 _legacy）
 *   h00S →A0D5（20-03 約束與勝利之劍）→ godie-e002.e ＋ godie-e00l.e —— staging 契約④
 *        的 SHARED_MODEL_FENCED_OUT 點名「20-03＝h00S（ReviveHuman 紅）」，本批接上
 *   h025 →A0RR（48-00 石化之眼）＋ RidermovelineDam（48-04 落地）→ godie-hvsh.passive/.r
 *   h02I →A0RQ EX 路徑（Initate Crazy，Hvsh 限定）→ godie-hvsh.r 第二節點
 *   n01F →A0UY（w3a Uin4='n01F'，01-02 隕石擊的 inferno 召喚）→ godie-hart.w
 *   n00R →A0SW（w3a Uin4='n00R'；FinalBolide=A0G5 74-04 ＋ Supernova=A0S3 74-002 兩處
 *        dummy-cast）→ godie-u00j.r ＋ godie-u00j.ex
 *
 * WarStompCaster 全族**零出貨落點**（47-03 劍心、40-04 胖虎未出貨；o019=A0J2 是
 * combo-strikes.json 判定的 map-mechanic 遊戲結束亂鬥；o00V sites=0）⇒ ⛔ 刻意不轉模型
 * —— 轉一具零消費者的 glb 沒有任何人受益（CRESCENT 對 crescent「零使用者」同款警覺）。
 *
 * @visual-proof —— 靜態那一半：tome/meteor 兩具新 glb 至少一個出生可見＋帶貼圖＋UV 的
 * primitive（meteor 舊 glb 是 6/7 軟刪除＋8×8 佔位貼圖 —— 本批用現行管線重轉成 4/4）。
 *
 * ⚠️ godie-e002.e 那一列在 `pnpm skills:sync`（skillremake:json）之前是**紅的** ——
 * 來源已寫進 tools/skill-remake/heroes/godie-e002.py，產物鎖住。紅了 ⇒ 跑 sync，⛔ 不要改這裡。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDoc } from "./loader";

const ROOT = join(__dirname, "../../../..");
const readJson = (p: string): any => JSON.parse(readFileSync(join(ROOT, p), "utf-8"));

type NodeSpec = {
  rawcode: string;
  file: string;
  champion?: string; // 有 champion 鏡射的才填（passive/ex 只有 standalone）
  slot?: string;
  preset: string;
  modelKey: string;
  scale?: number;
  tint?: number[];
  lifeSec?: number;
};

const LANDINGS: ReadonlyArray<NodeSpec> = [
  { rawcode: "h007", file: "content/abilities/godie-h02r.r.json", champion: "godie-h02r", slot: "R",
    preset: "tpl-locust-orb", modelKey: "w3x.stock.revivehuman", scale: 1.25, lifeSec: 2 },
  { rawcode: "h007", file: "content/abilities/godie-hgam.r.json", champion: "godie-hgam", slot: "R",
    preset: "tpl-locust-orb", modelKey: "w3x.stock.revivehuman", scale: 1.25, lifeSec: 2 },
  // 20-03：beam-roll 既有節點**補上自己的模型**（scale/life 住模板共用表，⛔ 不覆寫）
  { rawcode: "h00S", file: "content/abilities/godie-e002.e.json", champion: "godie-e002", slot: "E",
    preset: "tpl-beam-roll", modelKey: "w3x.stock.revivehuman", tint: [1, 0.3922, 0.3922] },
  { rawcode: "h00S", file: "content/abilities/godie-e00l.e.json", champion: "godie-e00l", slot: "E",
    preset: "tpl-beam-roll", modelKey: "w3x.stock.revivehuman", tint: [1, 0.3922, 0.3922] },
  { rawcode: "h025", file: "content/abilities/godie-hvsh.passive.json",
    preset: "tpl-locust-orb", modelKey: "w3x.stock.tomeofretrainingcaster", scale: 4, tint: [1, 0, 1], lifeSec: 2 },
  { rawcode: "h025", file: "content/abilities/godie-hvsh.r.json", champion: "godie-hvsh", slot: "R",
    preset: "tpl-locust-orb", modelKey: "w3x.stock.tomeofretrainingcaster", scale: 4, tint: [1, 0, 1], lifeSec: 2 },
  { rawcode: "h02I", file: "content/abilities/godie-hvsh.r.json", champion: "godie-hvsh", slot: "R",
    preset: "tpl-locust-orb", modelKey: "w3x.stock.tomeofretrainingcaster", scale: 5, lifeSec: 3 },
  { rawcode: "n01F", file: "content/abilities/godie-hart.w.json", champion: "godie-hart", slot: "W",
    preset: "tpl-locust-orb", modelKey: "imported.meteor", scale: 0.8, tint: [0.7843, 0.5882, 0.5882] },
  { rawcode: "n00R", file: "content/abilities/godie-u00j.r.json", champion: "godie-u00j", slot: "R",
    preset: "tpl-locust-orb", modelKey: "imported.meteor", scale: 5 },
  { rawcode: "n00R", file: "content/abilities/godie-u00j.ex.json",
    preset: "tpl-locust-orb", modelKey: "imported.meteor", scale: 5 },
];

/** census sites=0 的死 dummy（重掃出生成點的那一天這裡紅 ⇒ 照 sites 證據綁）。 */
const DEAD_DUMMIES = ["n00V", "o00V", "n009", "n00L"] as const;

function fxNodes(node: unknown, modelKey: string, preset: string, out: any[] = []): any[] {
  if (Array.isArray(node)) node.forEach((v) => fxNodes(v, modelKey, preset, out));
  else if (node && typeof node === "object") {
    const r = node as Record<string, unknown>;
    if (r["kind"] === "spawnModelFx" && r["preset"] === preset && r["modelKey"] === modelKey) out.push(r);
    Object.values(r).forEach((v) => fxNodes(v, modelKey, preset, out));
  }
  return out;
}

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

describe("蝗蟲群視覺 · QUAD 四小族（GH#688 Phase 6）", () => {
  it("tome/meteor 模型文件＋glb：至少一個出生可見、帶貼圖、有 UV 的 primitive（@visual-proof 靜態那一半）", () => {
    for (const key of ["w3x.stock.tomeofretrainingcaster", "imported.meteor"]) {
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
    }
    // 轉換紀錄的柵欄：tome 4 貼圖全 shape-in-rgb、2 emitter 至 peak 可見（LUMA-KEY／出生0 病）
    const rec = readJson("tools/w3x-import/out/stock/convert-tomeofretrainingcaster.json");
    const row = Array.isArray(rec) ? rec[0] : rec;
    const badTex = (row.textures ?? []).filter((t: any) => t.verdict !== "shape-in-rgb");
    const badEmit = (row.emitterAlpha ?? []).filter((e: any) => e.verdict !== "visible-at-peak");
    expect(badTex, "tome 貼圖出現 alpha 病").toEqual([]);
    expect(badEmit, "tome emitter 出生即隱形").toEqual([]);
  });

  it("每個落點都擺得出節點（standalone＋champion 鏡射），參數逐格等於 census/w3a 證據", () => {
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
        const matches = fxNodes(doc, row.modelKey, row.preset).filter(
          (n) => row.scale === undefined || n.scale === row.scale,
        );
        if (matches.length === 0) {
          missing.push(`${row.rawcode} → ${row.file} (${where})`);
          continue;
        }
        for (const n of matches) {
          if (JSON.stringify(n.tint) !== JSON.stringify(row.tint))
            wrong.push(`${row.file} (${where}) tint=${JSON.stringify(n.tint)}，census=${JSON.stringify(row.tint)}`);
          if (n.lifeSec !== row.lifeSec)
            wrong.push(`${row.file} (${where}) lifeSec=${n.lifeSec}，census=${row.lifeSec}`);
        }
      }
    }
    expect(rejected, "出貨文件過不了 schema —— content:build 會在同一處拒絕它").toEqual([]);
    expect(missing, "這幾個落點擺不出節點（godie-e002.e 紅 ⇒ 跑 pnpm skills:sync，⛔ 不要改這裡）").toEqual([]);
    expect(wrong, "節點參數偏離證據（tint/lifeSec 逐格照 census，顏色不歸我挑）").toEqual([]);
  });

  it("無落點清單的理由保持成立（不成立的那一天這裡紅 ⇒ 把落點接上）", () => {
    // ① 死 dummy：census sites 仍是 0
    const census = readJson("tools/locust-census/census.json");
    const withSites = (census.templateSuggestions as any[])
      .filter((t) => (DEAD_DUMMIES as readonly string[]).includes(t.rawcode) && t.sites > 0)
      .map((t) => t.rawcode);
    expect(withSites, "census 重掃出了生成點 —— 死 dummy 的理由不再成立").toEqual([]);
    // ② 未出貨英雄：鋼彈（03-04 全彈發射 = h00N/h007-Allbullet）、白色惡魔（81-03 = h01V）
    //    出貨的那一天，這幾隻 dummy 就有了自己的家。
    for (const legacy of ["godie-hlgr", "godie-o01z", "godie-o02v"]) {
      expect(existsSync(join(ROOT, `content/champions/${legacy}.json`)),
        `${legacy} 進了出貨名冊 —— 該把它的 dummy 綁上去了（見 QUAD 報告無落點表）`).toBe(false);
    }
    // ③ 47-03 九頭龍閃（h00Z 劍心）與 40-04 地獄搖滾（o01U 胖虎）仍不在出貨技能裡
    const fs = require("node:fs") as typeof import("node:fs");
    const shippedNames = fs.readdirSync(join(ROOT, "content/abilities"))
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => { try { return String(readJson(`content/abilities/${f}`).name ?? ""); } catch { return ""; } });
    for (const dead of ["九頭龍閃", "地獄搖滾", "王者之笛", "英雄之笛"]) {
      const hit = shippedNames.filter((n: string) => n.includes(dead));
      expect(hit, `出貨技能出現「${dead}」—— WarStomp/Tome 的無落點理由不再成立`).toEqual([]);
    }
    // ④ o019（A0J2 龍虎亂舞）仍是 map-mechanic（combo-strikes 的裁定），不是任何英雄的技能
    //    ⚠️ 找不到那一列也要紅 —— 安靜跳過與全過長得一樣。
    const combo = readJson("content/config/combo-strikes.json");
    const dtr = (combo.families as any[]).find((c) => c.key === "dragontigerready");
    expect(dtr, "combo-strikes.json 的 dragontigerready 列不見了 —— o019 的無落點裁定失去出處").toBeTruthy();
    expect(dtr.ownerKind, "A0J2 有了英雄擁有者 —— o019 動地剁該綁上去了").toBe("map-mechanic");
  });
});
