/**
 * ⭐ GH#688 Phase 6（TORNADO lane）—— 蝗蟲群視覺：`TornadoElemental.mdl` ×9。
 *
 * census（`tools/locust-census/census.json` 的 `templateSuggestions`）裡最大的
 * 一族：9 隻 dummy 共用這一份 stock 模型，逐支只差 scale/tint/lifeSec。
 * 對照鏈（war3map.j 逐條回溯，⛔ 不是名字猜的）：
 *   e00Y →(LiteningWind, A052)→ godie-emfr.e   · e016 →(ThTh, A053)→ godie-emfr.r
 *   e013 →(Toro, buff B03V/A000)→ godie-hart.e · h01S →(ThworldStart, A0MQ)→ godie-udre.r + godie-u01u.r
 *   o01H →(spiralAttack, A0JP=item I01V)→ items/godie-i01v
 *   o01P →(HoLuKen, A0L2)→ godie-u00v.e（SkySlash/A012 的 Eevi、E012 不在出貨名冊 ⇒ 無落點）
 *   h027 →(Luf Three Effect)→ ⛔ 不綁：出生即 α=0.01%（≈全隱形）的原作死演出
 *   u00A / u00Z → census sites=0 ⇒ 無落點
 *
 * @visual-proof —— 這裡的「可見」是**靜態可判**的那一半（第二守則 👁 的洞 a/c）：
 * 出貨 .glb 的材質不可以全部 alpha=0（出生即隱形）、有貼圖的 primitive 必須有
 * TEXCOORD_0（UV 退化 ⇒ 全部取樣同一點）；轉換紀錄裡每一支 emitter 的
 * segmentAlpha **peak** > 0（⛔ 不是 birth —— WarStomp 家族的教訓）。
 *
 * 突變（承重線）：把 godie-hart.e.json 的 spawnModelFx 節點刪掉 → 「擺不出那具模型」
 * 紅並指名 hart.e；champion 鏡射漏一邊也紅。
 *
 * ⚠️ emfr 那兩列在 `pnpm skills:sync`（skillremake:json）跑過之前是**紅的** ——
 * 來源已在 `tools/skill-remake/heroes/godie-emfr.py` 的 `model_fx=` 表格出口，
 * 產物是鎖住的（本 lane ⛔ 不跑全域鎖產生器）。紅了 ⇒ 跑 sync，⛔ 不要改這裡。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../..");
const MODEL_KEY = "w3x.stock.tornadoelemental";
const readJson = (p: string): any => JSON.parse(readFileSync(join(ROOT, p), "utf-8"));

/** dummy → 出貨落點（champion 技能走 standalone＋鏡射；item 只有一份）。 */
const LANDINGS: ReadonlyArray<{ dummy: string; file: string; champion?: string; slot?: string }> = [
  { dummy: "e00Y", file: "content/abilities/godie-emfr.e.json", champion: "godie-emfr", slot: "E" },
  { dummy: "e016", file: "content/abilities/godie-emfr.r.json", champion: "godie-emfr", slot: "R" },
  { dummy: "e013", file: "content/abilities/godie-hart.e.json", champion: "godie-hart", slot: "E" },
  { dummy: "h01S", file: "content/abilities/godie-udre.r.json", champion: "godie-udre", slot: "R" },
  { dummy: "h01S", file: "content/abilities/godie-u01u.r.json", champion: "godie-u01u", slot: "R" },
  { dummy: "o01P", file: "content/abilities/godie-u00v.e.json", champion: "godie-u00v", slot: "E" },
  { dummy: "o01H", file: "content/items/godie-i01v.json" },
];

/** census 建議表（tint 的唯一出處 —— ⛔ 顏色不可以自己挑）。 */
const suggestions = new Map<string, any>(
  (readJson("tools/locust-census/census.json").templateSuggestions as any[])
    .filter((t) => (t.model ?? "").includes("TornadoElemental"))
    .map((t) => [t.rawcode, t]),
);

function tornadoNodes(node: unknown, out: any[] = []): any[] {
  if (Array.isArray(node)) node.forEach((v) => tornadoNodes(v, out));
  else if (node && typeof node === "object") {
    const r = node as Record<string, unknown>;
    if (r["kind"] === "spawnModelFx" && r["modelKey"] === MODEL_KEY) out.push(r);
    Object.values(r).forEach((v) => tornadoNodes(v, out));
  }
  return out;
}

describe("蝗蟲群視覺 · TornadoElemental ×9（GH#688 Phase 6）", () => {
  it("模型文件與 .glb 都在，而且出生就看得見（@visual-proof 靜態那一半）", () => {
    const doc = readJson(`content/models/${MODEL_KEY}.json`);
    expect(doc.schema).toBe("model@1");
    expect(doc.id).toBe(MODEL_KEY);
    const glbPath = join(ROOT, "content", doc.glbPath);
    expect(existsSync(glbPath), `${doc.glbPath} 不存在`).toBe(true);

    // .glb 的 JSON chunk（GLB header 12B → chunk header 8B → JSON）。
    const b = readFileSync(glbPath);
    let off = 12;
    let gltf: any = null;
    while (off + 8 <= b.length) {
      const len = b.readUInt32LE(off);
      const ty = b.readUInt32LE(off + 4);
      off += 8;
      if (ty === 0x4e4f534a) gltf = JSON.parse(b.subarray(off, off + len).toString("utf8"));
      off += len;
    }
    expect(gltf, "glb 裡沒有 JSON chunk").toBeTruthy();

    // ① 至少一個 primitive 的材質**出生可見**（baseColorFactor alpha > 0 或有貼圖）。
    const lit = new Set<number>();
    (gltf.materials ?? []).forEach((m: any, i: number) => {
      const pbr = m.pbrMetallicRoughness ?? {};
      const a = pbr.baseColorFactor?.[3];
      if (pbr.baseColorTexture !== undefined || a === undefined || a > 0) lit.add(i);
    });
    const prims = (gltf.meshes ?? []).flatMap((m: any) => m.primitives ?? []);
    const visible = prims.filter((p: any) => p.material === undefined || lit.has(p.material));
    expect(visible.length, "0 個出生可見的 primitive —— 又一支零像素模型").toBeGreaterThan(0);

    // ② 有貼圖的 primitive 必須有 UV（退化 UV ⇒ 整張貼圖取樣同一點）。
    for (const p of prims) {
      const mat = p.material === undefined ? undefined : gltf.materials[p.material];
      if (mat?.pbrMetallicRoughness?.baseColorTexture !== undefined)
        expect(p.attributes?.TEXCOORD_0, "有貼圖但沒有 TEXCOORD_0").toBeDefined();
    }

    // ③ 轉換紀錄：每一支 emitter 的 segmentAlpha **peak** > 0（⛔ 不看 birth）。
    const rec = readJson("tools/w3x-import/out/stock/convert-tornadoelemental.json");
    expect(rec.emitterAlpha.length).toBeGreaterThan(0);
    for (const e of rec.emitterAlpha)
      expect(Math.max(...e.segmentAlpha), `${e.emitter} 全程 alpha=0`).toBeGreaterThan(0);
    for (const t of rec.textures)
      expect(t.verdict, `${t.texture} 是 LUMA-KEY 病族 —— 轉出來會是白方塊`).toBe("shape-in-rgb");
  });

  it("每一個落點都擺得出那具龍捲風（standalone ＋ champion 鏡射），tint 引用 census", () => {
    const missing: string[] = [];
    const badTint: string[] = [];
    for (const row of LANDINGS) {
      const sug = suggestions.get(row.dummy)!;
      expect(sug, `census 裡沒有 ${row.dummy} —— 對照鏈斷了`).toBeTruthy();
      const docs: Array<[string, any]> = [["standalone", readJson(row.file)]];
      if (row.champion) {
        const ch = readJson(`content/champions/${row.champion}.json`);
        docs.push([`champion 鏡射 ${row.slot}`, ch.abilities?.[row.slot!]]);
      }
      for (const [where, doc] of docs) {
        const nodes = tornadoNodes(doc);
        if (nodes.length === 0) {
          missing.push(`${row.dummy} → ${row.file} (${where})`);
          continue;
        }
        for (const n of nodes)
          if (sug.params.tint && JSON.stringify(n.tint) !== JSON.stringify(sug.params.tint))
            badTint.push(`${row.file} (${where}) tint=${JSON.stringify(n.tint)} census=${JSON.stringify(sug.params.tint)}`);
      }
    }
    expect(missing, "這幾個落點擺不出 TornadoElemental（emfr 兩列紅 ⇒ 跑 pnpm skills:sync）").toEqual([]);
    expect(badTint, "tint 與 census 建議表不符 —— 顏色不可以自己挑").toEqual([]);
  });
});
