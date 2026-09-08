/** Local handoff builder. Reads GGD; writes only this artifact directory. No HTTP writes. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { recipes, statProfiles } from "./recipes.mts";
import { shippedHeroCatalog } from "../GGD-community-hero-forge/packages/shared/testkit/heroPackageFixture.ts";
import { HERO_SLOTS, HERO_SECTION_IDS, HERO_PROJECT_SCHEMA, HERO_PLAN_SCHEMA } from "../GGD-community-hero-forge/packages/shared/src/content/heroForge/constants.ts";
import { zHeroProject } from "../GGD-community-hero-forge/packages/shared/src/content/heroForge/schema.ts";
import { defaultHeroPresentation } from "../GGD-community-hero-forge/packages/shared/src/content/heroForge/presentation.ts";
import { archetypeForOrigin, attributesForOrigin, ORIGIN_ATTACK_TYPE } from "../GGD-community-hero-forge/packages/shared/src/content/heroForge.ts";
import { defaultAbilityMaxRank } from "../GGD-community-hero-forge/packages/shared/src/content/schema/ability.ts";
import { compileHeroPackageProject, buildHeroImportPackage, validateHeroImportPackage } from "../GGD-community-hero-forge/packages/shared/src/content/import/heroPackage.ts";
import { packageZipInput, buildRuntimePackageZip } from "../GGD-community-hero-forge/packages/shared/src/content/import/packageZip.ts";
import { readPackageZip } from "../GGD-community-hero-forge/packages/shared/src/content/import/readPackageZip.ts";
import { contentSha256 } from "../GGD-community-hero-forge/packages/shared/src/content/import/jcs.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../GGD-community-hero-forge");
const sourcePath = resolve(here, "../GGD社群英雄功能驗收設計稿_37名角色.md");
const source = readFileSync(sourcePath,"utf8");
const catalog = shippedHeroCatalog();
const templateMap = new Map([...catalog.documents.entries()].filter(([k]) => k.startsWith("ability-templates/")).map(([,v]) => [v.id,v]));
const sections = [...source.matchAll(/^### (\d{2})｜([^\n]+)\n([\s\S]*?)(?=^### \d{2}｜|^## 三、)/gm)];
if (sections.length !== 37 || recipes.length !== 37) throw new Error(`Roster count ${sections.length}/${recipes.length}`);
for (const dir of ["projects","upload-text","recipes","runtime","evidence","packages-local-preview"]) mkdirSync(resolve(here,dir),{recursive:true});
const json = (path:string,value:any) => writeFileSync(resolve(here,path),JSON.stringify(value,null,2)+"\n");
const hash = (s:string|Uint8Array) => createHash("sha256").update(s).digest("hex");
const staticProfile = JSON.parse(readFileSync(resolve(repo,"content/editor-target-profile.json"),"utf8"));
// Deliberately not an active-server claim. Main must regenerate against its actual target.
const target = { gameRevision: "offline-community-handoff-20260907", contentVersion: staticProfile.content.contentVersion, migrationFingerprint: staticProfile.migrationFingerprint, processorFingerprint: staticProfile.authoringProcessor.fingerprint };
const all:any[] = [];
const report:any = { schema:"ggd-community-handoff-evidence@1", generatedAt:new Date().toISOString(), scope:"local authoring/schema/compiler/SimWorld/ZIP only", activeServerVerified:false, target, repoHead:execFileSync("git",["rev-parse","HEAD"],{cwd:repo,encoding:"utf8"}).trim(), sourceSha256:hash(source), heroCount:37, slotCount:222, heroes:all };
const usedTemplates = new Set<string>();
const pointRefs = new Set(["tpl-ground-nova","tpl-random-barrage","tpl-periodic-field","tpl-leap-strike","tpl-teleport"]);
const selfRefs = new Set(["tpl-buff-self","tpl-instant-blast","tpl-summon-agent","tpl-charge-push"]);
const replace = (obj:any,hero:string,slot:string) => JSON.parse(JSON.stringify(obj).replaceAll("$hero",hero).replaceAll("$slot",slot.toLowerCase()));
function vfx(family:string,shape:string) {
  const wanted = `fx.prim.${family}.${shape}`;
  if(catalog.documents.has(`vfx/${wanted}`)) return wanted;
  for (const s of ["pulse","pulse-sm","nova"]) if(catalog.documents.has(`vfx/fx.prim.${family}.${s}`)) return `fx.prim.${family}.${s}`;
  throw new Error(`No registered VFX ${family}`);
}

for (let i=0;i<37;i++) {
  const match=sections[i]!, r=recipes[i]!, index=match[1]!, id=`community-review-${index}-20260907`;
  if(match[2]!==r.name || r.moves.length!==6) throw new Error(`Order/slots ${r.name}`);
  const sourceSection=match[0];
  const ownerMoves=[...match[3]!.matchAll(/^- \*\*(PASSIVE|Q|W|E|R|EX)｜(.+?)\*\*：(.+)$/gm)];
  if(ownerMoves.length!==6) throw new Error(`Source slots ${r.name}`);
  const sourceBySlot=Object.fromEntries(ownerMoves.map(m=>[m[1],{name:m[2],description:m[3]}]));
  const identity=match[3]!.split(/^- \*\*PASSIVE/m)[0]!.trim();
  const mage=["法師","法鬥","軟輔"].includes(r.origin);
  const modelKey=mage?"champ.sela":"champ.thorne";
  const iconHero=mage?"sela":"thorne";
  const presentation=defaultHeroPresentation();
  presentation.modelKey=modelKey;
  presentation.championIcon=`assets/icons/champions/${iconHero}.webp`;
  const slotRows:any[]=[];
  const slots:any={};
  for(let si=0;si<6;si++) {
    const slot=HERO_SLOTS[si]!, move=r.moves[si]!, owner=sourceBySlot[slot];
    const template:any=templateMap.get(move.ref);
    if(!template||template.status!=="enabled") throw new Error(`Unavailable ${move.ref}`);
    usedTemplates.add(move.ref);
    const passive=slot==="PASSIVE";
    const abilityId=`${id}.${slot.toLowerCase()}`;
    const family=move.family??r.family;
    const tint=(r.name==="阿薩謝爾"&&slot==="W"?[0.97,0.97,1]:r.color).map((v:number)=>Math.round(v*255));
    const mainFx=vfx(family,move.shape), cueFx=vfx(family,"pulse-sm");
    // Cast-only cues stay off passive slots. Missing passive attribution is recorded explicitly.
    const anchor=selfRefs.has(move.ref)?"self":pointRefs.has(move.ref)?"point":"target";
    if(!passive) {
      presentation.slots[slot].script={schema:"vfx-script@1",id:abilityId,abilityId,segments:[
        {kind:"anim",on:"castStart",at:"caster",pulse:"cast",replaces:"caster.action",replacesForMs:350},
        {kind:"vfx",on:"castStart",at:"self",vfxId:cueFx,durationSec:0.2,tint,alpha:0.6,w3xScale:0.7},
        {kind:"vfx",on:"castEffect",at:anchor,vfxId:mainFx,durationSec:slot==="R"?0.65:0.35,tint,alpha:0.85,w3xScale:slot==="R"?1.25:0.85},
        ...(move.ref==="tpl-lock-combo"?[{kind:"vfx",on:"strike",strikeIndex:move.params.hitCount,at:"target",vfxId:mainFx,durationSec:0.2,tint,alpha:0.9,w3xScale:1}]:[])
      ]} as any;
    }
    presentation.slots[slot].icon=`assets/icons/abilities/${iconHero}.${passive?"q":slot==="EX"?"r":slot.toLowerCase()}.webp`;
    const bands=passive?{}:{rangeTier:r.ranged?"大":"中",cooldownTier:slot==="R"||slot==="EX"?"大":"小",manaCostTier:slot==="R"||slot==="EX"?"大":"小",castTimeTier:slot==="R"?"大":"小",...move.bands};
    const params=replace(move.params,id,slot);
    const effects=replace(move.effects??[],id,slot);
    const actual=move.actual+(effects.length?` 附加效果：${JSON.stringify(effects)}。`:"");
    slots[slot]={slot,name:owner.name,purpose:`【目前模板可執行】${actual}\n【目標設計】${owner.description}${move.gap?`\n【待補機制】${move.gap}`:""}`,maxRank:defaultAbilityMaxRank(slot),products:[{instanceId:`${id}-${slot.toLowerCase()}-1`,template:{ref:move.ref,inheritDefaults:true,params}}],templateConflictPolicy:"reject",tuning:{cooldownSec:passive?0:slot==="R"||slot==="EX"?60:10,manaCost:passive?0:slot==="R"||slot==="EX"?100:40,range:passive?0:r.ranged?8:6},abilityOverrides:{provenance:"editor-json",...bands,...(effects.length?{effects}: {})},capabilityIds:[...template.requires],directionOptionIds:[],fallbackOptionIds:[]};
    slotRows.push({slot,name:owner.name,ownerDescription:owner.description,template:slots[slot].products[0].template,abilityOverrides:slots[slot].abilityOverrides,maxRank:slots[slot].maxRank,currentBehavior:actual,semanticStatus:move.gap?"adaptation-requires-review":"base-mapping-needs-behavior-test",requiredRefinement:move.gap||"核對 Owner 原文與模擬／畫面後才可驗收。",vfx:{family,requestedShape:move.shape,resolvedVfxId:mainFx,tint,anchor,passiveTriggerPending:passive,script:presentation.slots[slot].script},animation:{baseClip:passive?null:"cast",hitClip:"attack",customClipRequired:true,rigOwner:modelKey},acceptance:{originalMechanic:"not-verified",templateSimulation:"pending",visual:"not-run",communityReview:"not-run"}});
  }
  const concept=`${r.name} 社群英雄功能驗收稿。${identity}\n\n視覺方向：${r.visual}\n以 GGD ${r.origin} 的三圍與正規化生成屬性，使用標準魔力。六槽原文與待補機制保存在各槽 purpose。現有模型／圖示為 GGD 代理資產，未包含原作外觀。這是待審查稿，不是原設計機制已通過。`;
  const stats={...statProfiles[r.origin]};
  if(["殺老師","高速婆婆","米卡莎","SUN樂"].includes(r.name))stats.ms="大";
  if(r.name==="一拳超人")stats.ad="大";
  const project=zHeroProject.parse({schema:HERO_PROJECT_SCHEMA,projectId:id,revision:1,sourceLock:{canonicalId:null,versionId:null},brief:{name:r.name,concept,moveNames:Object.fromEntries(HERO_SLOTS.map(slot=>[slot,slots[slot].name]))},acceptedPlan:{schema:HERO_PLAN_SCHEMA,planId:`${id}.plan`,title:r.name,summary:concept,sourceLock:{canonicalId:null,versionId:null},origin:r.origin,archetype:archetypeForOrigin(r.origin as any),attackType:r.ranged?"ranged":ORIGIN_ATTACK_TYPE[r.origin as keyof typeof ORIGIN_ATTACK_TYPE]??"melee",budget:{power:50,complexity:60},statOverrides:stats,slots},presentation,receipts:[],sections:Object.fromEntries(HERO_SECTION_IDS.map(s=>[s,{revision:1,state:"draft",fieldOwnership:{}}])),validationState:Object.fromEntries(HERO_SECTION_IDS.map(s=>[s,{revision:1,status:"idle",diagnosticCodes:[]}]))});
  const projectFile=`projects/${index}.hero-project.json`;
  json(projectFile,project);
  const recipe={schema:"ggd-workflow-upload-sidecar@1",formatNotice:"工作流旁檔，不是網站額外支援的匯入格式；正式資料為 companion HeroProject。",index,projectId:id,displayName:r.name,identity,sourceOwnerText:sourceSection,projectFile,sourceLock:{canonicalId:null,versionId:null},sourceBindingPolicy:"取得真實作品 canonicalId/versionId 後再綁定；不得把顯示名當已存在版本。",origin:r.origin,archetype:project.acceptedPlan!.archetype,attackType:project.acceptedPlan!.attackType,attributesPreview:attributesForOrigin(r.origin as any),statOverrides:stats,presentation:{modelKey,proxyAssets:true,visualDirection:r.visual,modelStateMap:{idle:"idle",run:"run",attack:"attack",cast:"cast",hurt:"hurt",death:"death"},requiredCharacterAssets:"本體、武器、專屬動作與圖示依逐槽描述製作；目前只有 GGD shipping 代理資產。",sfxPolicy:"sfxKey=null，採既有 generic-cast，未借用原作語音。"},slots:slotRows,reviewText:sourceSection.split("**審查重點**：")[1]?.trim()??"",releaseStatus:"needs-semantic-and-visual-review"};
  json(`recipes/${index}.upload-recipe.json`,recipe);
  const row:any={index,name:r.name,projectId:id,projectFile,projectSha256:contentSha256(project),schema:"passed",compilation:"pending",simulation:"pending",zipRoundtrip:"pending",originalMechanics:"not-accepted",visual:"not-run",communitySubmission:"not-performed",capabilityGaps:slotRows.filter(s=>s.requiredRefinement&&s.semanticStatus==="adaptation-requires-review").map(s=>({slot:s.slot,detail:s.requiredRefinement}))};
  try {
    const result=compileHeroPackageProject(project,catalog,true);
    const replay=(result.scenarios as any).replay;
    row.compilation="passed";
    row.simulation={kit:replay.kit.status,errors:replay.errors,slots:replay.scenarios.map((s:any)=>({slot:s.slot,status:s.status,eventCounts:s.eventCounts,before:s.before,after:s.after}))};
    row.runtimeHero=result.runtime.find(d=>d.collection==="champions"&&d.id===id)?.document;
    row.assetCount=result.assets.length;
    row.assetBytes=result.assets.reduce((n,a)=>n+a.bytes.length,0);
    row.dependencies=result.dependencies.map(d=>`${d.collection}/${d.id}`);
    json(`runtime/${index}.compiled.json`,{schema:"ggd-local-runtime-evidence@1",runtime:result.runtime,generated:result.generated,compiled:result.compiled});
    json(`evidence/${index}.simulation.json`,result.scenarios);
    const pkg=buildHeroImportPackage(project,catalog,target);
    const validated=validateHeroImportPackage(pkg,catalog);
    if(validated.diagnostics.length)throw new Error(JSON.stringify(validated.diagnostics));
    const zipped=await buildRuntimePackageZip(packageZipInput(pkg,`${index}-${id}`));
    const reopened=readPackageZip(zipped.bytes);
    const reopenedProject=reopened.documents.find(d=>d.path.startsWith("authoring/hero-projects/"))?.document;
    if(contentSha256(reopenedProject)!==contentSha256(project))throw new Error("Project roundtrip mismatch");
    row.zipRoundtrip="passed";
    row.packageFile=`packages-local-preview/${zipped.filename}`;
    row.zipBytes=zipped.bytes.length;
    row.archiveSha256=zipped.archiveSha256;
    row.packageDigest=pkg.manifest.packageDigest;
    writeFileSync(resolve(here,row.packageFile),zipped.bytes);
  }catch(e:any){row.error=e?.message??String(e);row.compilation=row.compilation==="pending"?"failed":row.compilation;}
  all.push(row);
  const text=[`# ${index}｜${r.name}：社群上傳內容與套用設定`,"",`英雄檔：\`${projectFile}\`  \n工作流資料：\`recipes/${index}.upload-recipe.json\``,"",identity,"",`出身：${r.origin}；定位：${project.acceptedPlan!.archetype}；攻擊：${project.acceptedPlan!.attackType}。三圍由 GGD 自動生成，屬性只用級距微調。`,"",`三圍／成長預覽：\`${JSON.stringify(recipe.attributesPreview)}\``,"",`屬性覆寫：\`${JSON.stringify(stats)}\``,"",`模型：\`${modelKey}\`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。`,"",`演出方向：${r.visual}`,"",`模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。每槽 below 的原設計仍是功能審查目標。`,"",...slotRows.flatMap(s=>[`## ${s.slot}｜${s.name}`,"",`**目標上傳描述**：${s.ownerDescription}`,"",`**套用模板**：\`${s.template.ref}\`；衝突策略 reject；最高等級 ${s.maxRank}。`,"","```json",JSON.stringify({template:s.template,abilityOverrides:s.abilityOverrides},null,2),"```","",`**目前模板行為**：${s.currentBehavior}`,"",`**微調／補強要求**：${s.requiredRefinement}`,"",`**特效**：\`${s.vfx.resolvedVfxId}\`，tint ${JSON.stringify(s.vfx.tint)}，錨點 ${s.vfx.anchor}。${s.slot==="PASSIVE"?"被動不掛 cast-only 演出；正確事件歸屬待補。":"castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。"}`,"",`**動作**：${s.slot==="PASSIVE"?"以真實觸發事件驅動提示，不新增假施法。":"現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。"}`,""]),"## 整體審查", "",recipe.reviewText,"",`本地證據：schema ${row.schema}；compiler ${row.compilation}；kit ${typeof row.simulation==="object"?row.simulation.kit:row.simulation}；ZIP ${row.zipRoundtrip}。`,"",`原設計機制、畫面、多人與社群審核尚未驗收。${row.error?`失敗原因：${row.error}`:""}`,""].join("\n");
  writeFileSync(resolve(here,`upload-text/${index}-${r.name.replaceAll("/","-")}.md`),text);
  console.log(`${index} ${r.name}: compile=${row.compilation} kit=${typeof row.simulation==="object"?row.simulation.kit:row.simulation} zip=${row.zipRoundtrip}${row.error?` ${row.error.slice(0,700)}`:""}`);
  json("evidence/report.json",report);
}
const templateSnapshot=[...usedTemplates].sort().map(id=>{const t:any=templateMap.get(id);return {id,status:t.status,requires:t.requires,digest:contentSha256(t),params:Object.fromEntries(Object.entries(t.params).map(([key,p]:any)=>[key,{type:p.type,default:p.default,min:p.min,max:p.max,values:p.values,unit:p.unit,optional:p.optional,inert:p.inert}]))};});
json("evidence/template-catalog.json",templateSnapshot);
json("evidence/source-lock.json",{repoHead:report.repoHead,contentProfileDigest:contentSha256(staticProfile),sourceSha256:report.sourceSha256,builderSha256:hash(readFileSync(fileURLToPath(import.meta.url))),recipesSha256:hash(readFileSync(resolve(here,"recipes.mts"))),templates:templateSnapshot.map(t=>({id:t.id,digest:t.digest})),note:"working tree may include main-workflow changes; fingerprints describe bytes read, not a clean committed release"});
report.finishedAt=new Date().toISOString();
report.counts={schemaPassed:all.filter(r=>r.schema==="passed").length,compilePassed:all.filter(r=>r.compilation==="passed").length,kitAccepted:all.filter(r=>r.simulation?.kit==="accepted").length,zipRoundtripPassed:all.filter(r=>r.zipRoundtrip==="passed").length,originalMechanicsAccepted:0,visualAccepted:0};
json("evidence/report.json",report);
json("index.json",{schema:"ggd-workflow-handoff-index@1",date:"2026-09-07",notice:"Index/recipe are workflow sidecars. Import native HeroProject or rebuild ZIP with active target.",heroCount:37,slotCount:222,heroes:all.map(r=>({index:r.index,name:r.name,projectId:r.projectId,project:r.projectFile,recipe:`recipes/${r.index}.upload-recipe.json`,previewPackage:r.packageFile??null,validation:{schema:r.schema,compiler:r.compilation,kit:r.simulation?.kit??"not-run",zip:r.zipRoundtrip},needsMechanicReview:true})),evidence:"evidence/report.json"});
console.log(JSON.stringify(report.counts));
if(all.some(r=>r.error))process.exitCode=1;
