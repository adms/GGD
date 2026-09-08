import { z } from "zod";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { OverlayContentSource, type OverlayBundle } from "@ggd/shared/content/overlay";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { assetMediaType } from "@ggd/shared/content/assetReferences";
import { ImportStore } from "./importStore";
import { catalogHeroes, type CatalogFiles, type CatalogHero } from "./catalogHero";
import { instantiateCatalogHero } from "./catalogHeroInstance";
import { HERO_CATALOG_WORK_ID, readHeroCatalog } from "./catalogVersions";
import { CATALOG_INSTANCE_WORK_ID, readCatalogInstanceAsset } from "./catalogAssets";

export { CATALOG_INSTANCE_WORK_ID };
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const overlaySchema = z.object({generation: z.number().int().nonnegative(), docs: z.record(z.unknown()), deleted: z.record(z.boolean())});
const commandSchema = z.object({heroPath: z.string().regex(/^catalog\/(?:_legacy\/)?champions\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/), versionId: digest, expectedCurrentVersion: digest.optional(), planDigest: digest.optional()});
const fail = (message: string, statusCode = 409): never => { throw Object.assign(new Error(message), {statusCode}); };

/** Project the actual merged version without changing the saved original bytes.
 * Raw shipped files and the separate overlay remain in the immutable archive. */
export function effectiveCatalogFiles(raw: CatalogFiles) {
  const files = new Map(raw), manifest = JSON.parse(Buffer.from(raw.get("catalog-version.json")!).toString());
  const overlay = raw.has("catalog/overlay.json") ? overlaySchema.parse(JSON.parse(Buffer.from(raw.get("catalog/overlay.json")!).toString())) : null;
  const heroes = new Map<string, CatalogHero>(catalogHeroes(raw).filter(x=>x.catalog!=="overlay").map(x=>[x.path,{...x}]));
  if (overlay) {
    for (const [key, doc] of Object.entries(overlay.docs)) {
      const path = `catalog/${key}.json`; files.set(path, Buffer.from(JSON.stringify(doc,null,2)+"\n"));
      if (key.startsWith("champions/")) {
        const value = doc as {id: string; name?: string};
        heroes.set(path, {id:value.id, name:value.name ?? value.id, path, catalog:"shipping"});
      }
    }
    for (const [key, deleted] of Object.entries(overlay.deleted)) if (deleted) {
      files.delete(`catalog/${key}.json`); heroes.delete(`catalog/${key}.json`);
    }
  }
  files.set("catalog-version.json", Buffer.from(JSON.stringify({...manifest, heroes:[...heroes.values()]})));
  return files;
}

/** The private compiler side of full-hero overlay restore. The platform supplies
 * one authenticated overlay snapshot; this class never writes the shipped tree
 * or publishes an overlay. Both local and hosted restores use the same planner. */
export class CatalogOverlayService {
  readonly store: ImportStore;
  private previous?: string;
  constructor(readonly root: string, readonly repoRoot: string, importDir: string, readonly gameRevision: string) {
    this.store = new ImportStore({dir: importDir});
  }
  readAsset = (path: string): Uint8Array | null => readCatalogInstanceAsset(this.store,path);
  private current(overlay: OverlayBundle) {
    return readHeroCatalog(this.root, {gameRevision:this.gameRevision,repoRoot:this.repoRoot,overlay:Buffer.from(JSON.stringify(overlay)),allowIncomplete:true,readArchivedAsset:this.readAsset});
  }
  private retain(current: ReturnType<CatalogOverlayService["current"]>) {
    this.previous ??= this.store.listWorkVersions(HERO_CATALOG_WORK_ID)[0]?.versionId;
    const result = this.store.putWorkVersion({workId:HERO_CATALOG_WORK_ID,projectId:HERO_CATALOG_WORK_ID,packageDigest:current.versionId},current.files,{reuseUnchangedFrom:this.previous});
    this.previous=result.record.versionId; return result;
  }
  capture(overlay: OverlayBundle) {
    const current=this.current(overlay), result=this.retain(current);
    return {version:result.record, heroes:catalogHeroes(effectiveCatalogFiles(current.files)), incomplete:current.manifest.incomplete ?? null};
  }
  private plan(overlay: OverlayBundle, input: unknown) {
    const command=commandSchema.parse(input), historical=this.store.readWorkFiles(HERO_CATALOG_WORK_ID,command.versionId);
    if(!historical) return fail("找不到指定完整版本。",404);
    const current=this.current(overlay), effective=effectiveCatalogFiles(current.files);
    if(command.expectedCurrentVersion && command.expectedCurrentVersion!==current.versionId) return fail("內容已更新，請重新比較後再回復。");
    const comparison=instantiateCatalogHero(effective,effectiveCatalogFiles(historical),command.heroPath);
    const planDigest=contentSha256({currentVersion:current.versionId,versionId:command.versionId,heroPath:command.heroPath,changes:comparison.changes,affected:comparison.affected});
    return {command,current,effective,comparison,planDigest};
  }
  async handle(action: string, input: unknown) {
    const body=z.object({overlay:overlaySchema,command:z.unknown().optional()}).parse(input), overlay=body.overlay;
    if(action==="capture") return this.capture(overlay);
    if(action==="heroes") { const current=this.current(overlay); return {heroes:catalogHeroes(effectiveCatalogFiles(current.files)),currentVersion:current.versionId}; }
    if(action==="versions") {
      const {cursor}=z.object({cursor:digest.optional()}).parse(body.command ?? {}), records=this.store.listWorkVersions(HERO_CATALOG_WORK_ID);
      const start=cursor ? records.findIndex(x=>x.versionId===cursor) : 0;
      if(start<0) return fail("找不到此歷史游標。",404);
      return {items:records.slice(start,start+50).map(x=>({versionId:x.versionId,createdAt:x.createdAt,fileCount:x.files.length,bytes:x.files.reduce((n,f)=>n+f.bytes,0)})),nextCursor:records[start+50]?.versionId ?? null};
    }
    if(action!=="preview" && action!=="prepare") return fail("不支援此完整版本操作。",404);
    const plan=this.plan(overlay,body.command), {target,changes,affected}=plan.comparison;
    const issues=[...target.issues];
    if(target.hero.catalog==="legacy") issues.push("此版本是未上架的歷史英雄；須另經投稿與審查才能上架。");
    const preview={hero:target.hero,versionId:plan.command.versionId,currentVersion:plan.current.versionId,planDigest:plan.planDigest,heroDigest:target.digest,changes,affected,issues,blockedSources:[],generatorSources:target.generatorSources,
      files:target.facts,documents:[...target.files].filter(([p])=>p.startsWith("catalog/")&&p.endsWith(".json")).map(([path,bytes])=>({path,source:Buffer.from(bytes).toString(),currentSource:plan.effective.has(path) ? Buffer.from(plan.effective.get(path)!).toString() : null}))};
    if(action==="preview") return preview;
    if(plan.command.expectedCurrentVersion!==plan.current.versionId || plan.command.planDigest!==plan.planDigest) return fail("內容已更新，請重新比較後再回復。");
    if(issues.length) return fail(issues.join("；"),422);
    const docs: Record<string,unknown>={...overlay.docs};
    const deleted={...overlay.deleted};
    const writes=changes.filter(x=>x.path.startsWith("catalog/")).map(x=>({key:x.path.slice(8,-5),doc:JSON.parse(Buffer.from(target.files.get(x.path)!).toString())}));
    for(const write of writes) { docs[write.key]=write.doc; delete deleted[write.key]; }
    const source=new OverlayContentSource(new FsContentSource(this.root),{generation:overlay.generation,docs,deleted});
    const loaded=await new ContentLoader(source).load({policy:"fail-closed"});
    // The source tree and current overlay are compared again after the async
    // loader. Only the platform can commit, and it rechecks its own generation.
    if(this.current(overlay).versionId!==plan.current.versionId) return fail("驗證期間內容已變更，未套用回復。");
    const previous=this.retain(plan.current).record;
    const assets=target.facts.filter(x=>x.path.startsWith("assets/")).map(x=>({...x,contentType:assetMediaType(x.path)}));
    const identity={heroPath:plan.command.heroPath,sourceVersion:plan.command.versionId,currentVersion:plan.current.versionId,planDigest:plan.planDigest,contentVersion:loaded.manifest.contentVersion,writes,assets};
    const versionId=contentSha256(identity), files=new Map(target.files);
    files.set("catalog-instance.json",Buffer.from(JSON.stringify(identity)));
    const stored=this.store.putWorkVersion({workId:CATALOG_INSTANCE_WORK_ID,projectId:CATALOG_INSTANCE_WORK_ID,packageDigest:versionId},files);
    return {...identity,schema:"ggd-catalog-overlay-plan@1",versionId:stored.record.versionId,workId:CATALOG_INSTANCE_WORK_ID,previousVersion:previous.versionId,expectedGeneration:overlay.generation,heroId:target.hero.id,heroName:target.hero.name};
  }
}
