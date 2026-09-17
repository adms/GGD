/**
 * ⭐ 第四／五批 37 名 → `champion@1` ＋ 六份 `ability@1` ＋ `vfx-script@1`（GH#1185 / GH#1205）。
 *
 * > owner 2026-09-16（逐字）：「全部英雄上架是預設的 不需要我審查通過」
 * > owner 2026-09-15（逐字）：「你要替我發佈全部角色 這是這一個新版的主要目的」
 *
 * ⭐ **同一條管線的第四批**（`lol7_compile.mts` 是第三批），⛔ 不是新的產生器：
 * | 什麼 | 從哪來 |
 * |---|---|
 * | 招式 · 數值 · 說明 · 出身 | ⭐ `communityLolBatch2.ts`（11 名）與 `communityAcquired.ts`（26 名），出貨 TS |
 * | 屬性 · 成長 · 級距 · 模板實例 | ⭐ `compileHeroPackageProject()`（出貨的編輯器編譯器） |
 * | modelKey | ⭐ 配方自己帶的（`recipe.modelKey` / `ACQUIRED_MODEL_OPTIONS`）—— 45 顆**已經在出貨 content/models 裡**（實測 45/45） |
 *
 * ⚠️ 與第三批的兩個差別（都寫下來，⛔ 不要下一輪再推導一次）：
 * ① ⛔ **不讀素材庫**：第三批要從 `GGD-Asset-Library` 補 GLB 位元組，因為那七顆模型還沒進 git；
 *    這一批 45 顆模型文件都已經在 `content/models/`（PR #1236／#1262 之後），⇒ 位元組由出貨 catalog 自己給。
 * ② ⛔ **不含 8 名舊角接管**（`godie-*`）：那八名會**覆寫既有官方英雄卡**，要另外一批做（先留底＋rollback 版本）。
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { shippedHeroCatalog } from "../../packages/shared/testkit/heroPackageFixture";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "../../packages/shared/src/content/heroForge/communityLolBatch2";
import { createCommunityHeroRecipe } from "../../packages/shared/src/content/heroForge/communityExamples";
import { COMMUNITY_ACQUIRED_HEROES, ACQUIRED_MODEL_OPTIONS, createAcquiredHeroProject } from "../../packages/shared/src/content/heroForge/communityAcquired";
import { compileHeroPackageProject } from "../../packages/shared/src/content/import/heroPackage";
import { snapshotHeroGenerator } from "../../packages/shared/src/content/import/heroBuildSources";
import type { TemplateDoc } from "../../packages/shared/src/content/schema/template";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
};
const out = arg("out");
if (!out) throw new Error("用法：batch37_compile.mts --out <目錄> [--only <id,id>]");
const only = new Set((arg("only") ?? "").split(",").map((s) => s.trim()).filter(Boolean));

const catalog = shippedHeroCatalog();
// ⭐ 排除這一支自己的產物 ⇒ 可重跑（同第三批：判準是 id 前綴，⛔ 不是「檔案在不在」）。
for (const key of [...catalog.documents.keys()]) {
  const id = key.split("/").slice(1).join("/");
  if (id.startsWith("lol-") || id.startsWith("acquired-")) catalog.documents.delete(key);
}
const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const generatorVersion = snapshotHeroGenerator(resolve(import.meta.dirname, "../..")).versionId;
mkdirSync(out, { recursive: true });

type Row = { shippedId: string; modelKey: string; from: string; make: () => ReturnType<typeof createAcquiredHeroProject>; source: Record<string, unknown> };
const rows: Row[] = [];
for (const recipe of COMMUNITY_LOL_BATCH2_EXAMPLES) {
  const shippedId = `lol-${recipe.id}`;
  rows.push({
    shippedId, modelKey: String(recipe.modelKey ?? ""), from: "packages/shared/src/content/heroForge/communityLolBatch2.ts",
    make: () => createCommunityHeroRecipe(recipe, shippedId, templates, generatorVersion),
    source: { inspiration: recipe.inspiration, sourceUrl: recipe.sourceUrl, adaptations: recipe.adaptations },
  });
}
for (const hero of COMMUNITY_ACQUIRED_HEROES) {
  if (hero.id.startsWith("godie-")) continue; // 舊角接管另一批（會覆寫既有官方卡）
  const modelKey = String(hero.modelKey ?? ACQUIRED_MODEL_OPTIONS[hero.id]?.[0] ?? "");
  rows.push({
    shippedId: hero.id, modelKey, from: "packages/shared/src/content/heroForge/communityAcquired.ts",
    make: () => createAcquiredHeroProject(hero.id, hero.id, templates, generatorVersion),
    source: { inspiration: hero.inspiration, sourceUrl: hero.sourceUrl, adaptations: hero.adaptations, sourceWork: hero.sourceWork },
  });
}

const compiled: unknown[] = [];
const blocked: unknown[] = [];
for (const row of rows) {
  if (only.size && !only.has(row.shippedId)) continue;
  if (!row.modelKey) { blocked.push({ id: row.shippedId, why: "⛔ 配方沒有 modelKey" }); continue; }
  const model = catalog.documents.get(`models/${row.modelKey}`);
  if (!model) { blocked.push({ id: row.shippedId, why: `⛔ content/models 裡沒有 ${row.modelKey}` }); continue; }
  // ⭐ 只在記憶體裡宣告 hero body（同第三批①）：卡寫進去之後綁定本身就讓它成為 hero body。
  catalog.documents.set(`models/${row.modelKey}`, { ...(model as Record<string, unknown>), heroBody: true });
  const project = row.make();
  project.presentation.modelKey = row.modelKey;
  const result = compileHeroPackageProject(project, catalog, false);
  const fresh = result.runtime.filter((doc) => !catalog.documents.has(`${doc.collection}/${doc.id}`));
  const champion = fresh.find((doc) => doc.collection === "champions");
  const abilities = fresh.filter((doc) => doc.collection === "abilities").map((doc) => doc.document);
  const scripts = fresh.filter((doc) => doc.collection === "vfx-scripts").map((doc) => doc.document);
  if (!champion) throw new Error(`⛔ ${row.shippedId} 沒有編出 champion@1`);
  if (abilities.length !== 6) throw new Error(`⛔ ${row.shippedId} 只有 ${abilities.length} 份技能 —— 六格要齊`);
  const other = fresh.filter((doc) => !["champions", "abilities", "vfx-scripts"].includes(doc.collection));
  if (other.length) throw new Error(`⛔ ${row.shippedId} 編出了預期外的新文件：${other.map((d) => `${d.collection}/${d.id}`).join(", ")}`);
  // ⛔⛔ 模板**實例**住 dependencies（第三批量到的坑：少搬它們 ⇒ 技能靜默降級而 content:build exit 0）
  const templatesUsed = result.dependencies
    .filter((doc) => doc.collection === "ability-templates" && doc.id.startsWith("hero-template."))
    .map((doc) => doc.document);
  writeFileSync(resolve(out, `${row.shippedId}.json`), JSON.stringify({
    exampleId: row.shippedId, shippedId: row.shippedId, champion: champion.document, abilities, vfxScripts: scripts,
    abilityTemplates: templatesUsed,
    model: { modelKey: row.modelKey, state: "in-content", why: "模型文件已在出貨 content/models" },
    source: { ...row.source, from: row.from },
  }, null, 2) + "\n");
  compiled.push({ id: row.shippedId, name: (champion.document as { name?: string }).name, abilities: abilities.length, vfxScripts: scripts.length, abilityTemplates: templatesUsed.length });
}
writeFileSync(resolve(out, "_compile.json"), JSON.stringify({ schema: "ggd-batch37-compile@1", heroes: compiled, blocked }, null, 2) + "\n");
console.log(JSON.stringify({ compiled: compiled.length, blocked }, null, 2));
if (blocked.length) process.exitCode = 1;
if (!existsSync(resolve(out, "_compile.json"))) process.exitCode = 1;
