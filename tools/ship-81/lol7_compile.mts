/**
 * ⭐ 七名 LOL 英雄 → `champion@1` ＋ 六份 `ability@1` ＋ `vfx-script@1`（GH#1165 / GH#1158）。
 *
 * > owner 2026-09-09（逐字）：「其實還有**七個LOL英雄**也要跟著上架喔」
 * > owner 2026-09-10（逐字）：「⋯**已經取得審查授權可以直接上架，被認定為預設官方角色**」
 *
 * ── ⛔⛔ 這一支推翻了 `b7a057080` 的結論 ────────────────────────────────
 * 那個 commit 逐字寫著「**招式與數值不存在**⋯⛔ 而我不替社群作者發明招式與平衡」，
 * ⭐ 而它掃的是 `content/` · `materials/recipes` · S3 · 編輯器 catalog-store。
 * ⛔ **它沒有掃出貨的 TS**：`packages/shared/src/content/heroForge/communityExamples.ts`
 * 裡 `COMMUNITY_HERO_EXAMPLES` **七名全在**，六格招式（含 EX/被動）齊、
 * 帶 `adaptations` 與 `sourceUrl`，`20702b3a5`（2026-09-06）併進 main。
 * ⇒ ⭐ CLAUDE.md 那一條：「**我掃的是哪一條路？還有別條嗎？**」
 *
 * ── ⭐ 這一支**不發明任何東西** ──────────────────────────────────────
 * | 什麼 | 從哪來 |
 * |---|---|
 * | 招式 · 數值 · 說明 · 出身 | ⭐ `COMMUNITY_HERO_EXAMPLES`（出貨 TS，⛔ 不是我編的） |
 * | 屬性 · 成長 · 級距 | ⭐ `compileHeroPackageProject`（出貨的編輯器編譯器） |
 * | modelKey | ⭐ owner 的 `全角色模型盤點.md`（經 `model_map.py`，⛔ 不抄一份） |
 *
 * ── ⚠️ 兩件刻意的事 ────────────────────────────────────────────────
 * ① **`heroBody` 只在記憶體裡打開**。`heroBodyModelIds()` 的規則是
 *    「`heroBody===true` **或**已經被某張英雄卡綁著」⇒ ⭐ 這七顆今天兩個都不是
 *    （卡還不存在 —— 先有蛋還是先有雞）。⛔ 而它**不是繞過閘**：那個閘問的是
 *    「這顆是不是核准過的**英雄本體**」，⭐ 而 `--map` 的每一顆都來自素材庫
 *    `kind: model-body` ＋ `status: standardized` ＋ owner 表上的「預設模型」欄。
 *    ⇒ 卡寫進去之後，綁定本身就讓它成為 hero body，⛔ 所以出貨樹不必多一個欄位。
 * ② **catalog 刻意排除 `lol-*` 自己的產物** ⇒ ⭐ 這一支**可以重跑**
 *    （⛔ 否則第二次會死在「社群作品不能佔用既有官方英雄的身分」）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { shippedHeroCatalog } from "../../packages/shared/testkit/heroPackageFixture";
import { COMMUNITY_HERO_EXAMPLES, createCommunityHeroExample } from "../../packages/shared/src/content/heroForge/communityExamples";
import { compileHeroPackageProject } from "../../packages/shared/src/content/import/heroPackage";
import { snapshotHeroGenerator } from "../../packages/shared/src/content/import/heroBuildSources";
import type { TemplateDoc } from "../../packages/shared/src/content/schema/template";

/** ⭐ 出貨 id 的規則，⛔ 一個住處。盤點表的 `example:<x>` 與範例表的 `<x>` 都由它 join。 */
export const shippedId = (exampleId: string): string => `lol-${exampleId}`;

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
};
const library = arg("library");
const mapPath = arg("map");
const out = arg("out");
if (!library || !mapPath || !out) throw new Error("用法：lol7_compile.mts --library <素材庫> --map <models.json> --out <目錄>");

// ⭐ GLB 的位元組**不在 git 裡**（owner 2026-09-08 的逐類歸屬表）—— 而編譯器要真的讀到它們
//   才算「可分發資產」。⇒ 從素材庫的 `ready/<bundle>/<digest>/content/` 補位元組。
const roots: string[] = [];
for (const bundle of readdirSync(resolve(library, "ready"))) {
  const dir = resolve(library, "ready", bundle);
  for (const digest of readdirSync(dir)) {
    const root = resolve(dir, digest, "content");
    if (existsSync(root)) roots.push(root);
  }
}

const wanted = new Map<string, { modelKey: string; assetId: string | null; glbSha256: string | null; heroId: string; heroName: string; state: string; why: string }>();
for (const row of JSON.parse(readFileSync(mapPath, "utf8")) as Array<Record<string, string>>) {
  wanted.set(row.heroId!.replace(/^example:/, ""), row as never);
}

const catalog = shippedHeroCatalog();
// ⭐ ②：排除這一支自己的產物 ⇒ 可重跑。⛔ 判準是 id 前綴,⛔ 不是「檔案在不在」。
for (const key of [...catalog.documents.keys()]) {
  const id = key.split("/").slice(1).join("/");
  if (id.startsWith("lol-")) catalog.documents.delete(key);
}
const shippedAsset = catalog.readAsset;
catalog.readAsset = (path: string) => {
  const own = shippedAsset(path);
  if (own) return own;
  for (const root of roots) {
    const file = resolve(root, path);
    if (existsSync(file)) return new Uint8Array(readFileSync(file));
  }
  return undefined;
};

const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const generatorVersion = snapshotHeroGenerator(resolve(import.meta.dirname, "../..")).versionId;
mkdirSync(out, { recursive: true });
const rows: unknown[] = [];
const blocked: unknown[] = [];
for (const example of COMMUNITY_HERO_EXAMPLES) {
  const row = wanted.get(example.id);
  if (!row) { blocked.push({ id: example.id, why: `⛔ 盤點表的 LOL 那一節沒有 example:${example.id}` }); continue; }
  if (row.state !== "real" && row.state !== "real-late") { blocked.push({ id: example.id, why: `⛔ 模型未核准：${row.state} —— ${row.why}` }); continue; }
  const model = catalog.documents.get(`models/${row.modelKey}`);
  if (!model) { blocked.push({ id: example.id, why: `⛔ content/models 裡沒有 ${row.modelKey} —— 模型側還沒進 git` }); continue; }
  // ⭐ ①：只對「盤點表指名 ＋ 素材庫已標準化」的這一顆宣告 hero body,而且**只在記憶體裡**。
  catalog.documents.set(`models/${row.modelKey}`, { ...model, heroBody: true });
  // ⭐ 驗雜湊 —— 素材庫說這顆是哪一份位元組,就要真的是那一份（第一·四守則第 4 條）。
  const glb = String((model as { glbPath?: string }).glbPath ?? "");
  const bytes = catalog.readAsset(glb);
  if (!bytes) { blocked.push({ id: example.id, why: `⛔ 素材庫裡找不到 ${glb} 的位元組` }); continue; }
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (row.glbSha256 && sha !== row.glbSha256) throw new Error(`⛔ ${example.id} 的 GLB 雜湊與素材庫不符：${sha} ≠ ${row.glbSha256}`);

  const project = createCommunityHeroExample(example.id, shippedId(example.id), templates, generatorVersion);
  project.presentation.modelKey = row.modelKey;
  const compiled = compileHeroPackageProject(project, catalog, false);
  const fresh = compiled.runtime.filter((doc) => !catalog.documents.has(`${doc.collection}/${doc.id}`));
  const champion = fresh.find((doc) => doc.collection === "champions");
  const abilities = fresh.filter((doc) => doc.collection === "abilities").map((doc) => doc.document);
  const scripts = fresh.filter((doc) => doc.collection === "vfx-scripts").map((doc) => doc.document);
  // ⭐ 斷言,⛔ 不是「應該會有六個」——`ship-81` 的檔頭記著同一個坑：靜默回 [] 比報錯貴。
  if (!champion) throw new Error(`⛔ ${example.id} 沒有編出 champion@1`);
  if (abilities.length !== 6) throw new Error(`⛔ ${example.id} 只有 ${abilities.length} 份技能 —— 六格要齊`);
  const other = fresh.filter((doc) => !["champions", "abilities", "vfx-scripts"].includes(doc.collection));
  if (other.length) throw new Error(`⛔ ${example.id} 編出了預期外的新文件：${other.map((d) => `${d.collection}/${d.id}`).join(", ")}`);
  // ⛔⛔ 模板**實例**住 `dependencies`，⛔ 不是 `runtime` —— 而它們是**這一批新造的**
  //   （`generated.templateInstances`，id 是內容雜湊）。⭐ 少搬它們的下場已經量過一次：
  //   GH#1165「第二批 222 支技能的模板展開全部失敗」——載入器 fail-open 逐支降級，
  //   ⭐ `content:build` **exit 0**、選人畫面看得到英雄，⛔ 而參數一個都沒套用。
  //   ⇒ 這裡把**被引用到的**全部帶出去（⛔ 不是把 catalog 裡的全倒一遍）。
  const templatesUsed = compiled.dependencies
    .filter((doc) => doc.collection === "ability-templates" && doc.id.startsWith("hero-template."))
    .map((doc) => doc.document);
  writeFileSync(resolve(out, `${example.id}.json`), JSON.stringify({
    exampleId: example.id, shippedId: shippedId(example.id), champion: champion.document, abilities, vfxScripts: scripts,
    abilityTemplates: templatesUsed,
    model: { modelKey: row.modelKey, assetId: row.assetId, glbPath: glb, sha256: sha, state: row.state, why: row.why },
    source: { inspiration: example.inspiration, sourceUrl: example.sourceUrl, adaptations: example.adaptations,
      from: "packages/shared/src/content/heroForge/communityExamples.ts" },
  }, null, 2) + "\n");
  writeFileSync(resolve(out, `${shippedId(example.id)}.project.json`), JSON.stringify(project, null, 2) + "\n");
  rows.push({ id: example.id, shippedId: shippedId(example.id), name: champion.document.name, modelState: row.state,
    abilities: abilities.length, vfxScripts: scripts.length, abilityTemplates: templatesUsed.length });
}
writeFileSync(resolve(out, "_compile.json"), JSON.stringify({ schema: "ggd-lol7-compile@1", heroes: rows, blocked }, null, 2) + "\n");
console.log(JSON.stringify({ compiled: rows.length, blocked }, null, 2));
if (blocked.length) process.exitCode = 1;
