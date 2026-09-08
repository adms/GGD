import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { rebuildAllIndexes } from "@ggd/shared/content/node";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { heroImportHeaders, HERO_IMPORT_PREFIX } from "@ggd/shared/content/node/heroImportAuth";
import { CatalogOverlayService, CATALOG_INSTANCE_WORK_ID } from "./catalogOverlay";
import { buildHeroImportServer } from "./heroImportServer";
import { readHeroPackageCatalog } from "./heroPackageIO";
const repo=resolve(__dirname,"../../.."), roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0)) rmSync(root,{recursive:true,force:true});});
function fixture() {
  const root=mkdtempSync(join(tmpdir(),"ggd-overlay-catalog-")); roots.push(root);
  const content=join(root,"content"), history=join(root,"history");
  const put=(path:string,data:unknown)=>{const p=join(content,path);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,data instanceof Uint8Array ? data : JSON.stringify(data));};
  const hero=JSON.parse(readFileSync(join(repo,"content/champions/sela.json"),"utf8")); delete hero.icon;
  hero.id="hero-a";hero.name="原始名稱";hero.description="原文\n角色台詞";hero.modelKey="shared-model";hero.buildPriority=[];hero.passive={name:"被動",hooks:[]};
  for(const slot of ["Q","W","E","R"]) {
    // ⭐ 2026-09-08（合併 PR 1118）—— `delete a.template` 的理由與
    //   `catalogHeroRoutes.test.ts` 的那一行逐字相同：main 的 GH#993 把 sela 的 Q
    //   模板化了，而這個 tmp 內容樹沒有那份模板／投射物。
    const a={...hero.abilities.Q,id:`skill.${slot.toLowerCase()}`,name:slot,slot,effects:[{kind:"damage",damageType:"magic",amount:{flat:20}}],description:"原始技能"}; delete a.icon;delete a.vfxKey;delete a.template;
    hero.abilities[slot]=a;put(`abilities/${a.id}.json`,{...a,schema:"ability@1"});
  }
  const model={id:"shared-model",schema:"model@1",glbPath:"assets/body.glb",scale:1,collisionRadius:0.6,clipMap:{idle:"Idle",run:"Run",attack:"Attack",cast:"Cast",hurt:"Hurt",death:"Death"}};
  put("champions/hero-a.json",hero);put("champions/hero-b.json",{...hero,id:"hero-b",name:"其他英雄"});put("_legacy/champions/archived.json",{...hero,id:"archived"});
  put("models/shared-model.json",model);put("assets/body.glb",new Uint8Array([1,2,3]));
  const arena=JSON.parse(readFileSync(join(repo,"content/config/arena-rules.json"),"utf8"));
  for (const round of Object.values(arena.rounds) as Record<string,unknown>[]) delete round.weaponLootTable;
  // Global arena NPCs must stay in the archive without becoming new playable
  // clones when an unrelated mage is restored.
  const replace=(value:any):any=>typeof value==="string"&&value==="godie-zombiex"?"hero-b":Array.isArray(value)?value.map(replace):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,replace(child)])):value;
  put("config/arena-rules.json",replace(arena));
  put("assets-manifest.json",{schema:"ggd-assets-manifest@1",entries:[{path:"assets/body.glb",bytes:3,sha256:sha256Bytes(new Uint8Array([1,2,3]))}]});
  rebuildAllIndexes(content);
  const service=new CatalogOverlayService(content,repo,history,"test");
  const old={generation:1,docs:{"champions/hero-a":{...hero,name:"舊覆蓋名稱",baseStats:{...hero.baseStats,ad:38}}},deleted:{}};
  const now={generation:2,docs:{...old.docs,"champions/hero-a":{...hero,name:"新覆蓋名稱",baseStats:{...hero.baseStats,ad:99}},"models/shared-model":{...model,scale:2}},deleted:{}};
  return {root,content,history,hero,model,put,service,old,now};
}
it("prepares the historical merged hero through the real private channel, preserving shared content and assets",async()=>{
  const f=fixture(), secret="catalog-private-test-secret-1234567890";
  const app=buildHeroImportServer({contentDir:f.content,repoRoot:repo,importDir:f.history,gameVersion:"test",secret});
  const call=async(action:string,payload:unknown)=>{
    const path=HERO_IMPORT_PREFIX+"/catalog/"+action,raw=Buffer.from(JSON.stringify(payload));
    return app.inject({method:"POST",url:path,headers:{...heroImportHeaders(secret,"POST",path,raw),"content-type":"application/json"},payload:raw});
  };
  try {
    const saved=await call("capture",{overlay:f.old}); expect(saved.statusCode,saved.body).toBe(200);
    const versionId=saved.json().version.versionId, heroPath="catalog/champions/hero-a.json";
    const preview=await call("preview",{overlay:f.now,command:{heroPath,versionId}});expect(preview.statusCode,preview.body).toBe(200);
    const p=preview.json();expect(p.issues).toEqual([]); expect(p.blockedSources).toEqual([]);
    const source=p.documents.find((x:any)=>x.path===heroPath);expect(JSON.parse(source.source).name).toBe("舊覆蓋名稱");
    const request={overlay:f.now,command:{heroPath,versionId,expectedCurrentVersion:p.currentVersion,planDigest:p.planDigest}};
    const prepared=await call("prepare",request);expect(prepared.statusCode,prepared.body).toBe(200);const plan=prepared.json();
    const hero=plan.writes.find((x:any)=>x.key==="champions/hero-a").doc;expect(hero.baseStats.ad).toBe(38);expect(hero.description).toBe(f.hero.description);
    const model=plan.writes.find((x:any)=>x.key===`models/${hero.modelKey}`).doc;expect(model.scale).toBe(1);expect(model.clipMap).toEqual(f.model.clipMap);
    expect(plan.writes.some((x:any)=>x.key==="champions/hero-b"||x.key==="models/shared-model")).toBe(false);
    expect(plan.writes.filter((x:any)=>x.key.startsWith("champions/")).map((x:any)=>x.key)).toEqual(["champions/hero-a"]);
    const reopened=new CatalogOverlayService(f.content,repo,f.history,"test");expect(reopened.readAsset(model.glbPath)).toEqual(Buffer.from([1,2,3]));
    expect(readHeroPackageCatalog(f.content,f.history).readAsset(model.glbPath)).toEqual(Buffer.from([1,2,3]));
    expect(reopened.store.readWorkFiles(CATALOG_INSTANCE_WORK_ID,plan.versionId)).not.toBeNull();expect(reopened.store.active()).toBeNull();
    const applied={generation:3,docs:{...f.now.docs,...Object.fromEntries(plan.writes.map((x:any)=>[x.key,x.doc]))},deleted:{}};
    const captured=await call("capture",{overlay:applied});expect(captured.statusCode,captured.body).toBe(200);expect(captured.json().incomplete).toBeNull();
    expect(JSON.parse(readFileSync(join(f.content,"champions/hero-a.json"),"utf8")).name).toBe(f.hero.name);
    const stale=await call("prepare",{...request,overlay:applied});expect(stale.statusCode).toBe(409);
    const path=HERO_IMPORT_PREFIX+"/catalog/capture";expect((await app.inject({method:"POST",url:path,payload:{overlay:f.old}})).statusCode).toBe(401);
    const signed=Buffer.from(JSON.stringify({overlay:f.old}));const wrong=await app.inject({method:"POST",url:path,headers:{...heroImportHeaders(secret,"POST",path,signed),"content-type":"application/json"},payload:Buffer.from(JSON.stringify({overlay:f.now}))});expect(wrong.statusCode).toBe(401);
  } finally {await app.close();}
});
it("keeps archived heroes unshipped and rejects missing dependencies before preparation",async()=>{
  const f=fixture(),saved=f.service.capture(f.old); const command={heroPath:"catalog/_legacy/champions/archived.json",versionId:saved.version.versionId};
  const p:any=await f.service.handle("preview",{overlay:f.now,command});expect(p.issues.join(" ")).toContain("未上架");
  await expect(f.service.handle("prepare",{overlay:f.now,command:{...command,expectedCurrentVersion:p.currentVersion,planDigest:p.planDigest}})).rejects.toThrow("未上架");
  f.put("models/shared-model.json",{...f.model,glbPath:"assets/missing.glb"});const missing=f.service.capture({generation:0,docs:{},deleted:{}});
  const bad:any=await f.service.handle("preview",{overlay:f.now,command:{heroPath:"catalog/champions/hero-a.json",versionId:missing.version.versionId}});expect(bad.issues.join(" ")).toContain("missing.glb");
});
