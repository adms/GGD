/**
 * ⭐ GH#688 Phase 6（CRESCENT lane）—— 蝗蟲群視覺：`crescent.mdl`（大紅蓮斬）×5。
 *
 * ⚠️ 這一族與 TORNADO 那一族**證據形狀不同**：五隻 dummy（u017/u01L/u01M/u01N/u01O）
 * 在出貨地圖裡 **sites=0**（war3map.j 零生成點、OBJECTS.json 零引用、int32 編碼零引用）
 * —— 它們是死內容；名字對到的 87-01 大紅蓮斬住在 content/_legacy（曹操未出貨）。
 * ⇒ dummy 路線**零落點**（誠實列，⛔ 不是「還沒做」）。
 *
 * 真正的落點走 **w3a 證據**（vfx-census realArt，provenance w3a-override，join CONFIRMED）：
 *   A0MY（80-02 弒鬼神，base AOsh 衝擊波）  → godie-h01u.w   —— Art-Missile = crescent.mdx
 *   A0EZ（08-04 阿邦快速劍X，base AUcs 蝗蟲群）→ godie-n01c.r ＋ godie-nbbc.r —— 同上
 * 兩個 base **真的會渲染** Art-Missile ⇒ 原作施放時彎月刃沿直線飛出（⛔ 不是名字猜的）。
 * preset＝tpl-locust-travel（forward）；⛔ 不帶 tint（w3a missile 未染色 —— 紅 tint
 * 屬於那五隻沒接線的 dummy）；scale 2＝census 這一族唯一量到的 usca。
 *
 * @visual-proof —— 「可見」的靜態那一半（第二守則 👁 的洞 a/c）：`crescent.glb`
 * 是 map-imported mesh-only（零 emitter，「The existing glb is the whole truth」），
 * 而它 **5 個 primitive 有 4 個**是轉檔器軟刪除（baseColorFactor [0,0,0,0]＋BLEND，
 * netherstrike 同款）—— 這裡量到並釘住：**至少一個出生可見、帶貼圖、UV 不退化**的
 * primitive 必須存在（2026-08-25 實測：mat1，18 verts，貼圖 75% 亮像素、shape-in-RGB）。
 *
 * 突變（承重線）：刪 godie-n01c.r.json 的 spawnModelFx 節點 → 「擺不出彎月刃」紅並指名。
 *
 * ⚠️ h01u 那一列在 `pnpm skills:sync`（skillremake:json）跑過之前是**紅的** ——
 * 來源已在 `tools/skill-remake/heroes/godie-h01u.py` 的 `model_fx=` 表格出口，
 * 產物是鎖住的（本 lane ⛔ 不跑全域鎖產生器）。紅了 ⇒ 跑 sync，⛔ 不要改這裡。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDoc } from "./loader";

const ROOT = join(__dirname, "../../../..");
const MODEL_KEY = "imported.crescent";
const readJson = (p: string): any => JSON.parse(readFileSync(join(ROOT, p), "utf-8"));

/** w3a 落點（champion 技能走 standalone＋鏡射）。 */
const LANDINGS: ReadonlyArray<{ rawcode: string; file: string; champion: string; slot: string }> = [
  { rawcode: "A0MY", file: "content/abilities/godie-h01u.w.json", champion: "godie-h01u", slot: "W" },
  { rawcode: "A0EZ", file: "content/abilities/godie-n01c.r.json", champion: "godie-n01c", slot: "R" },
  { rawcode: "A0EZ", file: "content/abilities/godie-nbbc.r.json", champion: "godie-nbbc", slot: "R" },
];

/** dummy 路線的誠實無落點（理由要**保持**成立 —— 不成立的那一天這裡紅，把落點接上）。 */
const DEAD_DUMMIES = ["u017", "u01L", "u01M", "u01N", "u01O"] as const;

function crescentNodes(node: unknown, out: any[] = []): any[] {
  if (Array.isArray(node)) node.forEach((v) => crescentNodes(v, out));
  else if (node && typeof node === "object") {
    const r = node as Record<string, unknown>;
    if (r["kind"] === "spawnModelFx" && r["modelKey"] === MODEL_KEY) out.push(r);
    Object.values(r).forEach((v) => crescentNodes(v, out));
  }
  return out;
}

describe("蝗蟲群視覺 · crescent（大紅蓮斬）×5（GH#688 Phase 6）", () => {
  it("模型文件與 .glb 都在，而且至少一個 primitive 出生可見（@visual-proof 靜態那一半）", () => {
    const doc = readJson(`content/models/${MODEL_KEY}.json`);
    expect(doc.schema).toBe("model@1");
    const glbPath = join(ROOT, "content", doc.glbPath);
    expect(existsSync(glbPath), `${doc.glbPath} 不存在`).toBe(true);

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

    // ① 出生可見 ＝ baseColorFactor 的 RGB 不全 0 **且** alpha ≠ 0（軟刪除是 [0,0,0,0]），
    //    或帶貼圖。⚠️ 這一族已知 4/5 primitive 是軟刪除 —— 判準是「至少一個活著」。
    const litMat = new Set<number>();
    (gltf.materials ?? []).forEach((m: any, i: number) => {
      const pbr = m.pbrMetallicRoughness ?? {};
      const f = pbr.baseColorFactor;
      const softDeleted = Array.isArray(f) && f[3] === 0;
      if (pbr.baseColorTexture !== undefined || !softDeleted) litMat.add(i);
    });
    const prims = (gltf.meshes ?? []).flatMap((m: any) => m.primitives ?? []);
    const visible = prims.filter((p: any) => p.material === undefined || litMat.has(p.material));
    expect(visible.length, "0 個出生可見的 primitive —— 又一支零像素模型（netherstrike 病）").toBeGreaterThan(0);

    // ② 可見的那幾個必須：有貼圖（純 factor 的軟刪除殘骸不算數）＋ UV 不退化。
    const textured = visible.filter((p: any) => {
      const mat = gltf.materials?.[p.material]?.pbrMetallicRoughness ?? {};
      return mat.baseColorTexture !== undefined && p.attributes?.TEXCOORD_0 !== undefined;
    });
    expect(textured.length, "可見 primitive 沒有一個帶貼圖＋UV —— 畫出來會是素色方塊").toBeGreaterThan(0);
  });

  it("w3a 落點都擺得出彎月刃（standalone＋champion 鏡射），⛔ 不帶 tint、scale 引用 census", () => {
    const missing: string[] = [];
    const wrong: string[] = [];
    const rejected: string[] = [];
    for (const row of LANDINGS) {
      const standalone = readJson(row.file);
      const v = validateDoc("abilities", standalone);
      if (!v.ok) rejected.push(`${row.file}: ${JSON.stringify(v.issues).slice(0, 300)}`);
      const ch = readJson(`content/champions/${row.champion}.json`);
      const docs: Array<[string, any]> = [
        ["standalone", standalone],
        [`champion 鏡射 ${row.slot}`, ch.abilities?.[row.slot]],
      ];
      for (const [where, doc] of docs) {
        const nodes = crescentNodes(doc);
        if (nodes.length === 0) {
          missing.push(`${row.rawcode} → ${row.file} (${where})`);
          continue;
        }
        for (const n of nodes) {
          if (n.preset !== "tpl-locust-travel") wrong.push(`${row.file} (${where}) preset=${n.preset}`);
          if (n.tint !== undefined) wrong.push(`${row.file} (${where}) 帶了 tint —— w3a missile 未染色，紅色屬於未接線的 dummy`);
          if (n.scale !== 2) wrong.push(`${row.file} (${where}) scale=${n.scale}（census usca=2）`);
        }
      }
    }
    expect(rejected, "出貨文件過不了 schema —— content:build 會在同一處拒絕它").toEqual([]);
    expect(missing, "這幾個落點擺不出 crescent（h01u 紅 ⇒ 跑 pnpm skills:sync）").toEqual([]);
    expect(wrong, "節點參數偏離證據（w3a=untinted forward missile · census usca=2）").toEqual([]);
  });

  it("五隻大紅蓮斬 dummy 的「無落點」理由保持成立（不成立的那一天這裡紅 ⇒ 把落點接上）", () => {
    // ① census sites 仍然是 0（有生成點的那一天，這五隻就該照 sites 證據綁）。
    const census = readJson("tools/locust-census/census.json");
    const withSites = (census.templateSuggestions as any[])
      .filter((t) => (DEAD_DUMMIES as readonly string[]).includes(t.rawcode) && t.sites > 0)
      .map((t) => t.rawcode);
    expect(withSites, "census 重掃出了生成點 —— 無落點的理由不再成立").toEqual([]);
    // ② 名字對到的 87-01 大紅蓮斬（曹操 godie-o02o.q）仍未出貨（出貨的那一天：
    //    五道紅月斬 scale 2 · tint [1,0.1176,0.1176] 就有了自己的家）。
    expect(
      existsSync(join(ROOT, "content/abilities/godie-o02o.q.json")),
      "曹操 87-01 大紅蓮斬進了出貨名冊 —— 這五隻紅彎月該綁到它身上了",
    ).toBe(false);
  });
});
