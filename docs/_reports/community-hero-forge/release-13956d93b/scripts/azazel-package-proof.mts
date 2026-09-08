import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {inflateRawSync} from 'node:zlib';
const root=path.dirname(new URL(import.meta.url).pathname),repo=process.cwd();
const use=(p:string)=>import(pathToFileURL(path.join(repo,p)).href);
const {readPackageZip}=await use('packages/shared/src/content/import/readPackageZip.ts');
const {ContentLoader}=await use('packages/shared/src/content/loader.ts');
const {FsContentSource}=await use('packages/shared/src/content/node/FsContentSource.ts');
const {OverlayContentSource}=await use('packages/shared/src/content/overlay.ts');
const {createHeroSimulationBaseline,HERO_SIMULATION_COLLECTIONS}=await use('packages/shared/src/content/heroForge/simulationBaseline.ts');
const {runHeroAbilityScenario}=await use('packages/shared/src/content/heroForge/scenario.ts');
const {DEFAULT_HERO_SCENARIO_SETUP}=await use('packages/shared/src/content/heroForge/scenarioSetup.ts');
const archive=path.join(root,'rebuilt-37-attempt2/32/package.zip');
const pkg=readPackageZip(new Uint8Array(await fs.readFile(archive)),{inflate:(bytes:Uint8Array,maxBytes:number)=>new Uint8Array(inflateRawSync(bytes,{maxOutputLength:maxBytes}))});
const overlay=await(await fetch('http://127.0.0.1:8097/api/v1/content-overlay/bundle')).json();
const loaded=await new ContentLoader(new OverlayContentSource(new FsContentSource(path.join(root,'content')),overlay)).load({policy:'fail-closed'});
const docs=new Map<string,any>();for(const collection of HERO_SIMULATION_COLLECTIONS)for(const doc of loaded.store.all(collection))docs.set(`${collection}/${doc.id}`,doc);
const baseline=createHeroSimulationBaseline(docs);
const id='community-review-32-20260907';
const champion=pkg.compiled.find((x:any)=>x.path===`compiled/champions/${id}.json`).document;
const abilities=pkg.compiled.filter((x:any)=>x.path.startsWith(`compiled/abilities/${id}.`)).map((x:any)=>x.document);
const ex=abilities.find((x:any)=>x.id===id+'.ex');assert.equal(ex.effects[0].kind,'consumeStatus');
const project=pkg.documents.find((x:any)=>x.path.startsWith('authoring/hero-projects/')).document;
assert.equal(project.acceptedPlan.slots.EX.name,project.sourceDesign.slots.EX.name); assert(project.sourceDesign.slots.EX.name.includes('THE END OF SON'));
const checks=[];
for(const [label,waitSec,resourceSetup] of [['curse-active',1.5,'ready'],['curse-expired',7,'ready'],['no-resources',1.5,'empty'],['before-r-hit',.1,'ready']] as const){
 const r=runHeroAbilityScenario(champion,ex,{baseline,ticks:90,relatedAbilities:abilities,relatedProjectiles:pkg.compiled.filter((x:any)=>x.path.startsWith('compiled/projectiles/')).map((x:any)=>x.document),setup:{...DEFAULT_HERO_SCENARIO_SETUP,resourceSetup,priorCast:{slot:'R',waitSec}}});
 const reversed=JSON.stringify(r.events).includes('反轉增益');
 const damage=r.events.filter((e:any)=>e.type==='damage' && e.data.origin===`ability:${ex.id}`);
 if(label==='curse-active'){assert.equal(r.status,'accepted');assert(reversed);assert.equal(damage.length,0);assert(r.events.some((e:any)=>e.type==='healthSpend'));}
 else if(label==='no-resources'){assert.equal(r.rejectionReason,'no-resource');assert(!r.events.some((e:any)=>e.type==='abilityCast' && e.data.abilityId===ex.id));}
 else{assert.equal(r.status,'accepted');assert(!reversed);assert(damage.length>0);}
 checks.push({label,status:r.status,rejectionReason:r.rejectionReason,reversed,ordinaryExDamageEvents:damage.length,events:r.events,assertions:r.assertions});
}
await fs.writeFile(path.join(root,'evidence/azazel-package-proof.json'),JSON.stringify({schema:'ggd-current-package-azazel-proof@1',status:'passed',archive,packageDigest:pkg.manifest.packageDigest,contentVersion:loaded.manifest.contentVersion,checks},null,2)+'\n');
console.log(JSON.stringify({status:'passed',cases:checks.map(({label,status,reversed,ordinaryExDamageEvents})=>({label,status,reversed,ordinaryExDamageEvents}))}));
