/** Current repository source/identity inventory; not live roster approval. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
async function main(){
 const [repoArg,oldPath,outPath]=process.argv.slice(2);assert(repoArg&&oldPath&&outPath);const repo=path.resolve(repoArg);
 const revision=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(revision,'4793eaaaf2775b2081f5eca5881db32e0aab0ea8');assert(!fs.existsSync(outPath),'REFUSE_OVERWRITE');
 const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8')),sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
 const load=(p:string)=>import(pathToFileURL(path.join(repo,'packages/shared/src/content',p)).href);
 const {originOf}=await load('statNormalization.ts');const {isTransformedBody,baseFormIdOf}=await load('championForms.ts');
 const old=read(oldPath),oldById=new Map(old.heroes.map((h:any)=>[h.id,h]));const roster=read(path.join(repo,'content/config/roster.json'));
 const retired=new Set(roster.retiredChampions),hidden=new Set(roster.hiddenChampions);
 const abilities=new Map(fs.readdirSync(path.join(repo,'content/abilities')).filter(n=>n.endsWith('.json')&&!n.startsWith('_')).map(n=>{const raw=fs.readFileSync(path.join(repo,'content/abilities',n),'utf8'),d=JSON.parse(raw);return [d.id,{doc:d,sha256:sha(raw),path:'content/abilities/'+n}];}));
 const resolveRef=(id:unknown,slot:string)=>{if(id===undefined)return null;assert(typeof id==='string');const a:any=abilities.get(id);return {id,slot,name:a?.doc.name??null,description:a?.doc.description??null,sourcePath:a?.path??null,sourceSha256:a?.sha256??null,resolved:!!a,slotMatches:a?.doc.slot===slot};};
 const rows=fs.readdirSync(path.join(repo,'content/champions')).filter(n=>n.endsWith('.json')&&!n.startsWith('_')).sort().map(n=>{
  const rel='content/champions/'+n,raw=fs.readFileSync(path.join(repo,rel),'utf8'),d=JSON.parse(raw),h:any=oldById.get(d.id);
  const description=d.description??null,unchanged=!!h&&h.descriptionOriginal===description,transformed=isTransformedBody(d.id);
  const derivedWithoutOverride=originOf({...d,origin:undefined}),effectiveOrigin=originOf(d);
  return {id:d.id,name:d.name,sourceVersion:revision,sourcePath:rel,sourceSha256:sha(raw),description,descriptionSha256:description===null?null:sha(description),unchangedFromR3:unchanged,
   reviewStatus:!description?'missing-description':unchanged?'prior-personal-review-exact-bytes-match':'personally-read-new-main-description',trainingEligible:false,
   setting:{attackType:d.attackType,declaredOrigin:d.origin??null,effectiveOrigin,derivedWithoutOverride,originAuthority:d.origin?'explicit-main-origin-override':'main-originOf-derived-default',attributes:d.attributes,role:d.role,playstyle:d.playstyle??[],pitch:d.pitch??null,transform:d.transform??null},
   roster:{retired:retired.has(d.id),hidden:hidden.has(d.id),transformed,baseId:baseFormIdOf(d.id),manualRepositoryEligible:!retired.has(d.id)&&!hidden.has(d.id)&&!transformed,randomRepositoryEligible:!retired.has(d.id)&&!transformed,liveWhitelistChecked:false},
   skillIdentities:{abilities:Object.entries(d.abilities??{}).map(([slot,a]:[string,any])=>({slot,id:a.id,name:a.name})),passive:resolveRef(d.passiveAbility,'PASSIVE'),ex:resolveRef(d.exAbility,'EX')},
  };
 });
 const missingOld=old.heroes.filter((h:any)=>!rows.some(r=>r.id===h.id)).map((h:any)=>({id:h.id,name:h.name,retired:retired.has(h.id),status:'absent-from-current-content',historicalDescriptionSha256:h.descriptionSha256,trainingEligible:false}));
 const pins=['content/config/roster.json','packages/shared/src/content/statNormalization.ts','packages/shared/src/content/championForms.ts'].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(repo,p)))}));
 const refs=rows.flatMap(r=>[r.skillIdentities.passive,r.skillIdentities.ex]).filter(Boolean);
 const result={schema:'ggd-forge-main-hero-source-inventory@2',revision,createdAt:new Date().toISOString(),rows,missingOld,roster:{...roster,note:roster.note},pins,counts:{documents:rows.length,descriptions:rows.filter(r=>r.description).length,missingDescriptions:rows.filter(r=>!r.description).length,exactR3Matches:rows.filter(r=>r.unchangedFromR3).length,newDescriptions:rows.filter(r=>r.description&&!r.unchangedFromR3).length,retired:rows.filter(r=>r.roster.retired).length,transformed:rows.filter(r=>r.roster.transformed).length,declaredOrigins:rows.filter(r=>r.setting.declaredOrigin).length,originOverridesDifferFromDerived:rows.filter(r=>r.setting.declaredOrigin&&r.setting.effectiveOrigin!==r.setting.derivedWithoutOverride).length,missingOld:missingOld.length,passiveExRefs:refs.length,unresolvedRefs:refs.filter(r=>!r!.resolved||!r!.slotMatches).length},trainingEligible:false,releaseQualified:false,scope:'Pinned repository source truth only. Full original description kept; attributes and roster status not inferred by model. No live overlay or whitelist access; source audit is not all-hero runtime verification.'};
 fs.writeFileSync(outPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({outPath,counts:result.counts,missingOld},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
