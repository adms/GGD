import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { readCatalogGeneratorSources } from "./catalogGeneratorSources";
import { captureHeroCatalogVersion, HERO_CATALOG_WORK_ID } from "./catalogVersions";
import { HeroCatalogHistory } from "./catalogHistory";
import { projectCatalogHero } from "./catalogHero";
import { ImportStore } from "./importStore";
import Fastify from "fastify";
import { registerEditorSourceRoutes } from "./editorSourceRoutes";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, {recursive:true,force:true}); });
const product = "catalog/champions/godie-e00s.json", source = "tools/skill-remake/heroes/godie-e00s.py";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ggd-generator-catalog-")); roots.push(root);
  const write = (path: string, data: string | Uint8Array) => { mkdirSync(dirname(join(root,path)),{recursive:true}); writeFileSync(join(root,path),data); };
  write("tools/parallel-gates/sync-io.json", JSON.stringify({steps:[{name:"skillremake:json",writes:["content/champions/godie-e00s.json","content/abilities/godie-e00s.q.json"]}]}));
  write("tools/parallel-gates/normalizers.json", '{"normalizers":[]}');
  write("packages/shared/src/content/import/editorSource.ts",readFileSync(resolve(__dirname,"../../../packages/shared/src/content/import/editorSource.ts")));
  write(source, '# 原文\nSOURCE = "原始英雄"\n');
  write("tools/skill-remake/common.py", '# 共用模板\nVALUE = 1\n');
  write("tools/skill-remake/batch1.py", '# generator entry\n');
  write("skill-tag-manifest.json", '{}');
  write("content/champions/godie-e00s.json", '{"id":"godie-e00s","name":"原始英雄"}');
  write("content/abilities/godie-e00s.q.json", '{"id":"godie-e00s.q","name":"技能"}');
  write("content/manifest.json", '{}'); write("content/assets-manifest.json", '{"entries":[]}');
  const content = join(root,"content"), storeDir = join(root,"history"), store = new ImportStore({dir:storeDir});
  return {root,content,storeDir,store,write,capture:()=>captureHeroCatalogVersion(content,store,{gameRevision:"test",repoRoot:root})};
}

it("retains exact source, shared generator templates, and product bindings through store restart", () => {
  const f = fixture(), first = f.capture(), oldSource = readFileSync(join(f.root,source));
  const archive = first.manifest.generatorSources!;
  expect(archive.bindings).toHaveLength(2); expect(archive.generators).toHaveLength(1);
  expect(archive.bindings.every(x=>x.sourcePath === 'generator-source/'+source)).toBe(true);
  f.write(source,'# 新原文\nSOURCE = "新英雄"\n');
  const next = f.capture(); expect(next.record.versionId).not.toBe(first.record.versionId);
  expect(next.manifest.generatorSources!.generators[0]!.versionId).not.toBe(archive.generators[0]!.versionId);
  const reopened = new ImportStore({dir:f.storeDir}), files = reopened.readWorkFiles(HERO_CATALOG_WORK_ID, first.record.versionId)!;
  expect(files.get('generator-source/'+source)).toEqual(oldSource);
  const hero = projectCatalogHero(files,product);
  expect(hero.generatorSources[0]!.source).toBe(oldSource.toString());
  expect(hero.files.has('generator-source/tools/skill-remake/common.py')).toBe(true);
  f.write("tools/skill-remake/common.py", '# template changed\nVALUE = 2\n');
  expect(f.capture().manifest.generatorSources!.generators[0]!.versionId).not.toBe(next.manifest.generatorSources!.generators[0]!.versionId);
  expect(reopened.active()).toBeNull();
});

it("archives source before the real source-edit route overwrites it, and aborts when history fails", async () => {
  const f = fixture(), history = new HeroCatalogHistory(f.content,f.storeDir,"test",f.root), app = Fastify();
  const original = readFileSync(join(f.root,source)); let runs = 0;
  registerEditorSourceRoutes(app,{repoRoot:f.root,contentDir:f.content,beforeRegenerate:()=>{history.capture();},runRegenerate:()=>{runs++;}});
  try {
    const { sha256Hex } = await import('@ggd/shared/content/import/editorSource');
    const response = await app.inject({method:"POST",url:"/content-api/editor-source",payload:{collection:"champions",id:"godie-e00s",expectedSourceSha256:sha256Hex(original.toString()),source:'# next\n'}});
    expect(response.statusCode,response.body).toBe(200); expect(runs).toBe(1);
    const previous = f.store.listWorkVersions(HERO_CATALOG_WORK_ID)[0]!;
    expect(f.store.readWorkFile(HERO_CATALOG_WORK_ID,previous.versionId,'generator-source/'+source)).toEqual(original);
    f.write('tools/skill-remake/common.py','changed');
    rmSync(join(f.root,'skill-tag-manifest.json'));
    const failed = await app.inject({method:"POST",url:"/content-api/editor-source",payload:{collection:"champions",id:"godie-e00s",expectedSourceSha256:sha256Hex('# next\n'),source:'# must not apply\n'}});
    expect(failed.statusCode).toBe(503); expect(runs).toBe(1);
    expect(readFileSync(join(f.root,source),'utf8')).toBe('# next\n');
  } finally { await app.close(); }
});

it("detects changed source files and added source modules during capture", () => {
  const f=fixture(), before=readCatalogGeneratorSources(f.root,[product]);
  f.write(source,'changed'); expect(()=>before.verify()).toThrow('來源已更新');
  const after=readCatalogGeneratorSources(f.root,[product]);
  f.write('tools/skill-remake/new_module.py','NEW = True'); expect(()=>after.verify()).toThrow('來源目錄已更新');
});

it("rejects escaped sources and corrupted archived generator dependencies", () => {
  const f=fixture(); rmSync(join(f.root,source)); symlinkSync('/etc/hosts',join(f.root,source));
  expect(()=>f.capture()).toThrow('來源路徑越界'); rmSync(join(f.root,source)); f.write(source,'original');
  const captured=f.capture(), files=new Map(captured.files);
  files.set('generator-source/tools/skill-remake/common.py',Buffer.from('tampered'));
  expect(()=>projectCatalogHero(files,product)).toThrow('產生器來源缺少或已改變');
});

it("keeps older catalogs without saved sources explicit instead of inventing provenance", () => {
  const f=fixture(), old=captureHeroCatalogVersion(f.content,f.store,{gameRevision:'old'});
  expect(old.manifest.generatorSources).toBeUndefined(); expect(old.manifest.generatorSourcesUnavailable).toContain('未取得');
  expect(projectCatalogHero(old.files,product).generatorSources).toEqual([]);
});
