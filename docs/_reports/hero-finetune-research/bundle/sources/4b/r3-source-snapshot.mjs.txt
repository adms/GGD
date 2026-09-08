/** Inventory only: source snapshots and conflicts are not automatic semantic approval. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),parent=path.dirname(repo),[root]=process.argv.slice(2);
if(!root||!path.isAbsolute(root))throw Error('ABSOLUTE_OUTPUT_REQUIRED');
const pins=[],hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=p=>{const raw=fs.readFileSync(p,'utf8');pins.push({path:p,sha256:hash(raw)});return raw;};
const sourceModule=path.join(parent,'ggd-editor-pack-v2/tools/hero_skill_source_overrides.mjs'),tsvPath=path.join(parent,'ggd-editor-pack-v2/tools/owner_skill_descriptions_20260808.tsv'),olderModule=path.join(parent,'ggd-editor-pack-v2/tools/hero_skill_owner_overrides.mjs');
read(sourceModule);const tsv=read(tsvPath);read(olderModule);
const {OWNER_SKILL_SOURCE_OVERRIDES:owner}=await import(pathToFileURL(sourceModule)),{OWNER_SKILL_DESCRIPTION_OVERRIDES:older}=await import(pathToFileURL(olderModule));
const latestNames=new Map([...tsv.matchAll(/^(godie-[^\t]+)\t([^\t]+)\t/gm)].map(m=>[m[1],m[2]]));
const sources=Object.entries(owner).sort(([a],[b])=>a.localeCompare(b)).map(([id,o])=>{
 const file=path.join(repo,'content/abilities',id+'.json'),runtime=fs.existsSync(file)?JSON.parse(read(file)):null;
 return{id,name:latestNames.get(id)??runtime?.name??id,sourceTier:latestNames.has(id)?'latest-owner-tsv':'source-override-base',sourcePath:latestNames.has(id)?tsvPath:sourceModule,ownerOriginal:o.description,ownerSha256:hash(o.description),sourceNote:o.note??null,reviewStatus:'pending-personal-semantic-review',runtimePresent:!!runtime,runtimeDescription:runtime?.description??null,runtimeDescriptionEqual:runtime?.description===o.description,olderOverrideDescription:older[id]?.description??null,olderOverrideEqual:older[id]?.description===o.description,trainingEligible:false};
});
const registry=JSON.parse(read(path.join(repo,'docs/hero-archetypes.json')));
const heroes=registry.champions.map(h=>{const file=path.join(repo,'content/champions',h.id+'.json'),c=JSON.parse(read(file));return{id:h.id,name:c.name,sourcePath:file,descriptionOriginal:c.description??'',descriptionSha256:hash(c.description??''),attackType:c.attackType,role:c.role,derivedOrigin:h['出身'],counterpartId:h.counterpartId??null,reviewStatus:'pending-personal-semantic-review',trainingEligible:false,scope:'repository hero setting; derived origin is not external lore or human Gold'};});
for(const p of pins)if(hash(fs.readFileSync(p.path))!==p.sha256)throw Error('SOURCE_CHANGED_DURING_SNAPSHOT');
fs.mkdirSync(root,{recursive:true});const put=(n,v)=>fs.writeFileSync(path.join(root,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
put('source-snapshot.json',{schema:'ggd-forge-r3-source-snapshot@1',createdAt:new Date().toISOString(),authority:'Latest TSV wins over source base overrides; historical owner overrides and runtime descriptions are compared, never silently merged.',sources,heroes});put('source-inventory-pins.json',pins);
put('source-inventory-summary.json',{ownerRows:sources.length,latestTsvRows:sources.filter(s=>s.sourceTier==='latest-owner-tsv').length,sourceBaseRows:sources.filter(s=>s.sourceTier!=='latest-owner-tsv').length,runtimeDescriptionDiffers:sources.filter(s=>!s.runtimeDescriptionEqual).length,olderOverrideDiffers:sources.filter(s=>s.olderOverrideDescription!==null&&!s.olderOverrideEqual).length,heroRows:heroes.length,personallyReviewedByThisScript:0,trainingApprovedByThisScript:0});
console.log(fs.readFileSync(path.join(root,'source-inventory-summary.json'),'utf8'));
