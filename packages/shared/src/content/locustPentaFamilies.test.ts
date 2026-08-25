/**
 * ⭐ GH#688 Phase 6（PENTA lane）—— 蝗蟲群視覺，三族一次收：
 *   ForgottenOneTent（u02S/u02V/u02W/u02X 聖杯黑泥）· ThunderClapCaster（e00G/o006/o01F
 *   ＋ h00Z 覆核）· ChaosOrcRange（h019/o031/oshm）。
 *
 * 11 列逐列用 JASS/w3a 驗證後的落點（⛔ 不是建議表照抄）：
 *   u02S InSpace→A0FK（69-002 固有結界-黑洞）＝ E00Q 黑化Saber（_legacy）——
 *        ⭐ 但出貨名冊有 GGD 原創英雄 godie-zombiex（聖杯黑泥醬 喪標麥可），
 *        它的身分就是這一族 ⇒ 綁 zombiex.r（百式・哈基米「聖杯的黑泥從體內爆發」）。
 *        原作 9 具散在 600×600（j:32770 loop 1..9 · TriggerSleepAction 8）⇒
 *        orbit count 9 · distance 3（±300 wc3u ÷100）· lifeSec 8 —— 引擎裡
 *        「count 個等分、travel 0」是散布的既有編碼（modelFxPath dx=dz=0）。
 *   u02V/u02X/u02W＝**同一個召喚的 L1/L2/L3 外觀**（w3a `AOsw.Hwe1` 逐級，
 *        scale 1.5/1.75/2）⇒ 併成一列取最高階（scale 2）綁 zombiex.ex
 *        （此世全部之咖哩 ＝ この世全ての悪的黑泥哏）。⛔ 不是三個落點。
 *   o006 LightCutRun→A0IJ（45-03 千鳥）→ godie-edem.e（生成點 j:41999 命中分支，
 *        TimedLife 1.00；HolySword→A0OD＝23-04 那半屬 Ntin _legacy ⇒ 不綁）。
 *   h00Z 覆核：NineSlashEffect 的 ThunderClap chest 特效與 WarStomp dummy 同屬
 *        A01B（47-03 劍心，未出貨）⇒ QUAD 的除名成立，不動。
 *   oshm 五個生成點**逐點 `ShowUnitHide`**（j:33217/33271/50256/52652/52806）＝
 *        原作刻意隱形的 bloodlust/stomp 代理 ⇒ 綁可見模型是發明原作沒有的畫面
 *        （TORNADO h027 α=0.01% 同款裁定）⇒ ChaosOrcRange 全族零可見落點，⛔ 不轉。
 *
 * @visual-proof —— 靜態那一半：forgottenonetent/thunderclapcaster 兩具新 glb 至少
 * 一個出生可見＋帶貼圖＋UV 的 primitive；轉換紀錄的 LUMA-KEY／出生 0 柵欄。
 *
 * ⚠️ godie-edem.e 那一列在 `pnpm skills:sync`（skillremake:json）之前是**紅的** ——
 * 來源已寫進 tools/skill-remake/heroes/godie-edem.py，產物鎖住。紅了 ⇒ 跑 sync，⛔ 不要改這裡。
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
  preset: string;
  modelKey: string;
  scale?: number;
  tint?: number[];
  lifeSec?: number;
  count?: number;
  distance?: number;
};

const LANDINGS: ReadonlyArray<NodeSpec> = [
  // u02S 黑洞聖杯泥：9 具散布 → orbit 環（±300 wc3u ⇒ 半徑 3）· life 8（j:32776 sleep）
  { rawcode: "u02S", file: "content/abilities/godie-zombiex.r.json", champion: "godie-zombiex", slot: "R",
    preset: "tpl-locust-orb", modelKey: "w3x.stock.forgottenonetent",
    scale: 2, tint: [0.1176, 0, 0], lifeSec: 8, count: 9, distance: 3 },
  // u02V/u02X/u02W 併列（AOsw L1-L3 同一召喚）取最高階 scale 2；lifeSec 缺 ⇒ 吃模板 2.5
  { rawcode: "u02W", file: "content/abilities/godie-zombiex.ex.json",
    preset: "tpl-locust-orb", modelKey: "w3x.stock.forgottenonetent",
    scale: 2, tint: [0.1176, 0, 0] },
  // o006 雷切：命中瞬間施法者腳下的雷環（TimedLife 1.00 · w3u scale 3.5 · tint 255,0,0）
  { rawcode: "o006", file: "content/abilities/godie-edem.e.json", champion: "godie-edem", slot: "E",
    preset: "tpl-locust-orb", modelKey: "w3x.stock.thunderclapcaster",
    scale: 3.5, tint: [1, 0, 0], lifeSec: 1 },
];

/** census sites=0 且 w3a 零引用的死 dummy（重掃出生成點的那一天這裡紅 ⇒ 照證據綁）。 */
const DEAD_DUMMIES = ["e00G", "o031"] as const;

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

describe("蝗蟲群視覺 · PENTA 三族（GH#688 Phase 6）", () => {
  it("forgottenonetent/thunderclapcaster 模型文件＋glb：至少一個出生可見、帶貼圖、有 UV 的 primitive（@visual-proof 靜態那一半）", () => {
    for (const key of ["w3x.stock.forgottenonetent", "w3x.stock.thunderclapcaster"]) {
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
    // 轉換紀錄柵欄。⚠️ forgottenonetent 的 Dust5A 是**已知**的 LUMA-KEY 貼圖（emitter
    // 塵霧，轉換器 fm>=3 分支會做 luma-key）—— 豁免只給它；出現**新的** alpha 病仍紅。
    for (const [slug, allowLuma] of [["forgottenonetent", ["Textures\\Dust5A.blp"]],
                                     ["thunderclapcaster", []]] as const) {
      const rec = readJson(`tools/w3x-import/out/stock/convert-${slug}.json`);
      const row = Array.isArray(rec) ? rec[0] : rec;
      const badTex = (row.textures ?? []).filter(
        (t: any) => t.verdict !== "shape-in-rgb" && !(allowLuma as readonly string[]).includes(t.texture));
      const badEmit = (row.emitterAlpha ?? []).filter((e: any) => e.verdict !== "visible-at-peak");
      expect(badTex, `${slug} 貼圖出現未豁免的 alpha 病`).toEqual([]);
      expect(badEmit, `${slug} emitter 出生即隱形`).toEqual([]);
    }
  });

  it("每個落點都擺得出節點（standalone＋champion 鏡射），參數逐格等於 JASS/w3a 證據", () => {
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
            wrong.push(`${row.file} (${where}) tint=${JSON.stringify(n.tint)}，證據=${JSON.stringify(row.tint)}`);
          if (n.lifeSec !== row.lifeSec)
            wrong.push(`${row.file} (${where}) lifeSec=${n.lifeSec}，證據=${row.lifeSec}`);
          if (row.count !== undefined && n.count !== row.count)
            wrong.push(`${row.file} (${where}) count=${n.count}，j:32770 loop=9 具`);
          if (row.distance !== undefined && n.distance !== row.distance)
            wrong.push(`${row.file} (${where}) distance=${n.distance}，600×600 rect ⇒ 半徑 3`);
        }
      }
    }
    expect(rejected, "出貨文件過不了 schema —— content:build 會在同一處拒絕它").toEqual([]);
    expect(missing, "這幾個落點擺不出節點（godie-edem.e 紅 ⇒ 跑 pnpm skills:sync，⛔ 不要改這裡）").toEqual([]);
    expect(wrong, "節點參數偏離證據（tint/lifeSec/count 逐格照 JASS/w3a，顏色不歸我挑）").toEqual([]);
  });

  it("無落點清單的理由保持成立（不成立的那一天這裡紅 ⇒ 把落點接上）", () => {
    // ① 死 dummy：census sites 仍是 0（e00G 連 w3a 都零引用；o031 只有清場 ForGroup）
    const census = readJson("tools/locust-census/census.json");
    const withSites = (census.templateSuggestions as any[])
      .filter((t) => (DEAD_DUMMIES as readonly string[]).includes(t.rawcode) && t.sites > 0)
      .map((t) => t.rawcode);
    expect(withSites, "census 重掃出了生成點 —— 死 dummy 的理由不再成立").toEqual([]);
    // ② 未出貨英雄仍未出貨：E00Q（69 黑化Saber＝ForgottenOneTent 一族的原主 ——
    //    出貨那天聖杯黑泥的綁定該搬回它身上，見 PENTA 報告）· Othr（31 金鋼狼 h019）
    //    · Ntin（23 菲特＝o006 HolySword 那半）
    for (const legacy of ["godie-e00q", "godie-othr", "godie-ntin"]) {
      expect(existsSync(join(ROOT, `content/champions/${legacy}.json`)),
        `${legacy} 進了出貨名冊 —— 這一族的落點裁定要重看（見 PENTA 報告無落點表）`).toBe(false);
    }
    // ③ o01F 的 A0JE 在 w3x 裡就沒有主人（77-04 出貨走的是 A0UB/Light_sword 路徑）
    const objects = readJson("tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json");
    const owners: string[] = [];
    for (const section of ["heroes", "units"]) {
      for (const [uid, u] of Object.entries<any>(objects[section] ?? {})) {
        const ab = [...(u.abilities ?? []), ...(u.hero_abilities ?? [])];
        if (ab.includes("A0JE")) owners.push(`${section}/${uid}`);
      }
    }
    expect(owners, "A0JE 有了主人 —— o01F 雷光劍(落雷) 的死內容裁定不再成立").toEqual([]);
    // ④ oshm 五個生成點仍逐點 ShowUnitHide（隱形代理 ⇒ 不綁可見模型）。
    //    ⚠️ 找不到生成點也要紅 —— 安靜跳過與全過長得一樣。
    const jass = readFileSync(join(ROOT, "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j"), "utf-8");
    const lines = jass.split("\n");
    const spawnIdx = lines
      .map((ln, i) => (ln.includes("CreateNUnitsAtLoc( 1, 'oshm'") ? i : -1))
      .filter((i) => i >= 0);
    expect(spawnIdx.length, "war3map.j 裡找不到 oshm 生成點 —— 這條理由失去出處").toBeGreaterThanOrEqual(5);
    const visibleSpawns = spawnIdx.filter(
      (i) => !lines.slice(i + 1, i + 3).some((ln) => ln.includes("ShowUnitHide")));
    expect(visibleSpawns.map((i) => `j:${i + 1}`),
      "oshm 出現了不 ShowUnitHide 的生成點 —— ChaosOrcRange「全族隱形」的除名理由不再成立").toEqual([]);
    // ⑤ 31-01 迴旋爪擊／23-04 雷焰聖劍 仍不在出貨技能名裡
    const shippedNames = readdirSync(join(ROOT, "content/abilities"))
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => { try { return String(readJson(`content/abilities/${f}`).name ?? ""); } catch { return ""; } });
    for (const dead of ["迴旋爪擊", "雷焰聖劍"]) {
      const hit = shippedNames.filter((n: string) => n.includes(dead));
      expect(hit, `出貨技能出現「${dead}」—— h019/o006-HolySword 的無落點理由不再成立`).toEqual([]);
    }
  });
});
