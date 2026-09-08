import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { readPackageZip } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/import/readPackageZip.ts';
import { contentSha256 } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/import/jcs.ts';
import { heroTemplateInstance, heroTemplateInstances } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/heroForge/templateVersions.ts';
import { ImportStore } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/apps/content-api/src/importStore.ts';
const root='/private/tmp/ggd-community37-generator-rebuild';
const target=JSON.parse(readFileSync(join(root,'target-current.json'),'utf8'));
const history=new ImportStore({dir:'/private/tmp/ggd-model-upload-acceptance/imports/build-sources'});
const rows=[];
const numbers=process.argv.slice(2).map(Number);if(!numbers.length)numbers.push(...Array.from({length:37},(_,i)=>i+1));
for(const number of numbers){
 const dir=join(root,String(number).padStart(2,'0'));if(!existsSync(join(dir,'author.json')))continue;
 const author=JSON.parse(readFileSync(join(dir,'author.json'),'utf8'));if(author.status!=='built')continue;
 const old=readPackageZip(new Uint8Array(readFileSync(author.oldArchive))), current=readPackageZip(new Uint8Array(readFileSync(author.archive)));
 const heroPath=`authoring/hero-projects/${author.projectId}.json`;
 const before:any=old.documents.find(e=>e.path===heroPath)!.document, after:any=current.documents.find(e=>e.path===heroPath)!.document;
 const plan=structuredClone(after.acceptedPlan);delete plan.generatorVersion;delete plan.templateVersions;
 for(const slot of Object.values(plan.slots) as any[])for(const card of slot.products)delete card.template.contentSha256;
 assert.deepEqual(plan,before.acceptedPlan,`${number}: original plan or tuning changed`);
 for(const key of ['brief','sourceLock','sourceDesign','refinementNotes','presentation'])assert.deepEqual(after[key],before[key],`${number}: ${key} changed`);
 const oldTemplates=new Map(old.documents.filter(e=>e.path.startsWith('authoring/ability-templates/')).map(e=>[(e.document as any).id,e.document]));
 const aliases=new Map<string,{source:any,instance:any}>();
 for(const [digest,source] of Object.entries(after.acceptedPlan.templateVersions??{}) as any){
   assert.equal(contentSha256(source),digest);
   assert.deepEqual(source,oldTemplates.get(source.id),`${number}: pin is not the exact reviewed template`);
   const instance=heroTemplateInstance(digest,source);aliases.set(instance.id,{source,instance});
 }
 const dependencies=(pkg:any)=>{
   const map=new Map<string,unknown>();
   for(const entry of pkg.documents){
     if(entry.path===heroPath)continue;
     let path=entry.path,document=entry.document;
     if(path.startsWith('authoring/ability-templates/')&&aliases.has(document.id)){
       const alias=aliases.get(document.id)!;assert.deepEqual(document,alias.instance);
       path=`authoring/ability-templates/${alias.source.id}.json`;document=alias.source;
     }
     if(map.has(path))assert.deepEqual(map.get(path),document);map.set(path,document);
   }
   return Object.fromEntries([...map].sort(([a],[b])=>a.localeCompare(b)));
 };
 assert.deepEqual(dependencies(current),dependencies(old),`${number}: dependency content changed`);
 const normalize=(value:any,inTemplate=false):any=>{
   if(Array.isArray(value))return value.map(v=>normalize(v,inTemplate));
   if(!value||typeof value!=='object')return value;
   const output:any=Object.fromEntries(Object.entries(value).map(([key,v])=>[key,normalize(v,inTemplate||key==='template')]));
   if(inTemplate&&typeof value.ref==='string'){
     const alias=aliases.get(value.ref),source=alias?.source??oldTemplates.get(value.ref);
     if(source){
       if(alias)assert.equal(value.contentSha256,contentSha256(alias.instance));
       else if(value.contentSha256)assert.equal(value.contentSha256,contentSha256(source));
       output.ref=source.id;delete output.contentSha256;
     }
   }
   return output;
 };
 assert.deepEqual(normalize(current.compiled),normalize(old.compiled),`${number}: compiled gameplay changed`);
 assert.equal(current.assets.length,old.assets.length);
 for(const asset of current.assets){const previous=old.assets.find(e=>e.path===asset.path);assert(previous,`${number}: added asset ${asset.path}`);assert.deepEqual(Buffer.from(asset.bytes),Buffer.from(previous.bytes),`${number}: asset bytes changed ${asset.path}`);}
 const oldSimulation:any=old.validation.find(e=>e.path==='validation/hero-simulation.json')!.document;
 const simulation:any=current.validation.find(e=>e.path==='validation/hero-simulation.json')!.document;
 assert.deepEqual(simulation.slots,oldSimulation.slots,`${number}: six-slot simulation changed`);
 assert.deepEqual(simulation.kit,oldSimulation.kit,`${number}: kit simulation changed`);
 assert.deepEqual(simulation.baseline,oldSimulation.baseline,`${number}: simulation baseline changed`);
 const normalizeDraft=(draft:any)=>{const copy=structuredClone(draft);if(copy.templateInstances){assert.deepEqual(copy.templateInstances,heroTemplateInstances(after.acceptedPlan));delete copy.templateInstances;}return normalize(copy);};
 for(const key of ['generated','compiled'])assert.deepEqual(normalizeDraft(simulation.replay[key]),normalizeDraft(oldSimulation.replay[key]),`${number}: ${key} replay changed`);
 const replay=structuredClone(simulation.replay),oldReplay=structuredClone(oldSimulation.replay);
 assert.equal(replay.revision,after.revision);assert.equal(oldReplay.revision,before.revision);
 for(const key of ['generated','compiled','revision']){delete replay[key];delete oldReplay[key];}
 assert.deepEqual(replay,oldReplay,`${number}: replay events changed`);
 const provenance:any=current.validation.find(e=>e.path==='validation/hero-build-provenance.json')!.document;
 assert.equal(provenance.generatorVersion,after.acceptedPlan.generatorVersion);assert.equal(provenance.planGeneratorVersion,provenance.generatorVersion);
 assert.equal(provenance.processorFingerprint,target.authoringProcessor.fingerprint);assert.equal(current.manifest.base.gameRevision,target.gameVersion);assert.equal(current.manifest.base.contentVersion,target.base.contentVersion);
 for(const [kind,version]of [['hero-generator',provenance.generatorVersion],['hero-processor',provenance.processorVersion]]){
   const manifest=history.readWorkFile(`ggd-${kind}-source`,version,'source-manifest.json');assert(manifest);assert.equal(contentSha256(JSON.parse(manifest.toString())),version);
 }
 const proof={number,name:author.name,projectId:author.projectId,oldSubmissionId:author.oldSubmissionId,oldArchive:author.oldArchive,archive:author.archive,packageDigest:current.manifest.packageDigest,base:current.manifest.base,provenance,status:'verified-equivalent',sourceAndRefinementsExact:true,templateVersionsExact:aliases.size,compiledGameplayExactAfterVerifiedTemplateReferenceMapping:true,assetFilesExact:current.assets.length,sixSlotSimulationExact:true,kitSimulationExact:true,replayExactExceptVerifiedTemplateMetadataAndRevision:true,scope:'Only reviewed template identities, generator provenance, authoring revision metadata and the service target changed; all gameplay fields, source text, template definitions, asset bytes and simulation results match the prior reviewed package.'};
 writeFileSync(join(dir,'equivalence.json'),JSON.stringify(proof,null,2)+'\n');rows.push(proof);console.log(number,author.name,'EQUIVALENT',current.assets.length,'assets');
}
writeFileSync(join(root,'package-equivalence-current.json'),JSON.stringify({schema:'ggd-community37-generator-rebuild-audit@1',verified:rows.length,slots:rows.length*6,gameVersion:target.gameVersion,processor:target.authoringProcessor.fingerprint,rows},null,2)+'\n');
