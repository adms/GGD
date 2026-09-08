/** Deterministic source lock before the small model sees hero-setting claims. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';import {system} from './r3-data.mjs';
const normalized=s=>s.normalize('NFKC').trim().toLocaleLowerCase();
export function resolveHeroSource(inventory,input){
 assert.equal(inventory.schema,'ggd-forge-main-hero-source-inventory@2','INVENTORY_SCHEMA');
 assert(input&&input.version===inventory.revision,'EXPLICIT_MATCHING_VERSION_REQUIRED');
 assert(['source-read','manual-roster','random-roster'].includes(input.purpose),'PURPOSE_REQUIRED');
 assert(typeof input.query==='string'&&input.query.trim()&&input.query.length<=200,'QUERY_REQUIRED');
 const exact=inventory.rows.find(r=>r.id===input.query);
 const query=normalized(input.query);
 let matches=exact?[exact]:inventory.rows.filter(r=>normalized(r.name).includes(query));
 const envelope={inventoryDigest:digest(inventory),version:inventory.revision,query:input.query,purpose:input.purpose,releaseQualified:false,automaticActivation:false,liveRosterQualified:false};
 if(!matches.length){const gone=inventory.missingOld.filter(r=>r.id===input.query||normalized(r.name).includes(query));return {...envelope,status:gone.length?'historical-only':'not-found',candidates:gone.map(r=>({id:r.id,name:r.name,retired:r.retired})),reason:'No current source is available. Do not substitute another hero or invent missing settings.'};}
 const eligible=r=>input.purpose==='source-read'||(input.purpose==='manual-roster'?r.roster.manualRepositoryEligible:r.roster.randomRepositoryEligible);
 const excluded=matches.filter(r=>!eligible(r)).map(r=>({id:r.id,name:r.name,roster:r.roster}));
 matches=matches.filter(eligible);
 if(!matches.length)return {...envelope,status:'unavailable-for-purpose',candidates:excluded,reason:'Retired, alternate-form or hidden/manual restriction from the pinned repository; not a model judgment.'};
 if(matches.length!==1)return {...envelope,status:'ambiguous',candidates:matches.map(r=>({id:r.id,name:r.name,roster:r.roster})),reason:'Choose an exact hero ID/version. Never merge same-name forms.'};
 const hero=matches[0];
 if(!hero.description)return {...envelope,status:'missing-description',heroId:hero.id,name:hero.name,reason:'Do not copy the base form story into a different ID without authority.'};
 assert.equal(digest(hero.description),hero.descriptionSha256,'SOURCE_DESCRIPTION_CHANGED');
 const setting=hero.setting;
 // Do not recalculate an Owner-assigned origin from old stats or story adjectives.
 if(setting.declaredOrigin)assert.equal(setting.effectiveOrigin,setting.declaredOrigin,'ORIGIN_OVERRIDE_LOST');
 const factText=JSON.stringify({id:hero.id,name:hero.name,descriptionOriginal:hero.description,
  currentSetting:{origin:setting.effectiveOrigin,originAuthority:setting.originAuthority,attackType:setting.attackType,playstyle:setting.playstyle,pitch:setting.pitch},
  repositoryStatus:{retired:hero.roster.retired,hidden:hero.roster.hidden,transformed:hero.roster.transformed,baseId:hero.roster.baseId,liveWhitelistChecked:false},
  note:'Origin is a classification reference, not an automatic grant of route skills. Current repository status is not proof of the live platform whitelist.'});
 return {...envelope,status:'resolved',heroId:hero.id,excluded,source:{id:hero.id,name:hero.name,version:inventory.revision,sha256:digest(factText),text:factText},rawSourceSha256:hero.sourceSha256,roster:hero.roster,warning:'Version-bound research source only. No automatic hero selection, model promotion, live publication or inferred skill grants.'};
}
export function buildHeroClaimRequest(inventory,input){
 assert(typeof input.claim==='string'&&input.claim.trim()&&input.claim.length<=6000,'CLAIM_REQUIRED');
 const resolution=resolveHeroSource(inventory,input);
 if(resolution.status!=='resolved')return {resolution,request:null};
 const source=resolution.source;
 const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify({task:'hero-source',source:{id:source.id,name:source.name,snapshot:source.sha256,text:source.text},claim:input.claim,instruction:'只根據指定版本的完整來源判斷。明確指定的出身優先，不能以旧三圍推導覆寫；出身／路線文案不會自動授予技能。輸出 {"verdict":"supported|contradicted|not-stated"}。'})}];
 return {resolution,request:{id:input.id??'hero-claim-'+source.id,messages,requestDigest:digest(messages)}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [inventoryPath,inputPath,outPath]=process.argv.slice(2);assert(inventoryPath&&inputPath&&outPath);
 const result=buildHeroClaimRequest(JSON.parse(fs.readFileSync(inventoryPath)),JSON.parse(fs.readFileSync(inputPath)));
 fs.writeFileSync(outPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:result.resolution.status,heroId:result.resolution.heroId,modelRequestCreated:!!result.request}));
}
