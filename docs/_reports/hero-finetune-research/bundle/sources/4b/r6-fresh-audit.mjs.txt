import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';import {fileHash} from './precision-diagnostic.mjs';import {build} from './r6-fresh-source.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const normal=s=>mechanicsText(s).replace(/\s/g,'');
function strings(x,out){if(typeof x==='string')out.add(normal(x));else if(Array.isArray(x))for(const v of x)strings(v,out);else if(x&&typeof x==='object')for(const v of Object.values(x))strings(v,out);}
export function noPriorTextExposure(sources,prior){
 const all=new Set();for(const c of prior){strings(c,all);for(const m of c.messages??[]){try{strings(JSON.parse(m.content),all);}catch{}}}
 for(const s of sources){assert(!prior.some(c=>c.sourceId===s.id||c.messages?.some(m=>m.content.includes(s.id))),'PRIOR_ID_EXPOSURE');assert(!all.has(normal(s.description)),'PRIOR_NORMALIZED_TEXT_EXPOSURE');}
 return true;
}
export function verifyFresh(root){
 const out=path.join(root,'fresh-source-v1'),m=read(path.join(out,'manifest.json')),sources=read(path.join(out,'source-snapshot.json')),prior=m.priorAuditFiles.flatMap(p=>read(p.path));
 for(const p of [...m.sourceFiles,...m.priorAuditFiles])assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED');
 noPriorTextExposure(sources,prior);assert.equal(new Set(sources.map(s=>s.id)).size,21);
 const r3=read(path.join(root,'dataset-manifest.json')).parent,data=build(sources,prior,read(path.join(r3,'source-family-splits.json'))),cases=read(path.join(out,'cases.private.json'));assert.deepEqual(cases,data.cases);assert.deepEqual(read(path.join(out,'personal-review.json')),data.reviews);assert.equal(digest(cases),m.casesSha256);assert.deepEqual(read(path.join(out,'requests.json')),cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
 const budget=read(path.join(out,'token-budget.json'));assert.equal(budget.allFit,true);assert.equal(budget.requestsSha256,fileHash(path.join(out,'requests.json')));
 assert.throws(()=>noPriorTextExposure([{id:'new-alias',description:'a\nb'}],[{messages:[{content:JSON.stringify({source:{id:'old-alias',text:'a\nb'}})}]}]),/TEXT_EXPOSURE/);
 return{verifiedAt:new Date().toISOString(),sources:21,cases:63,completeRebuild:true,decodedNormalizedSourceTextOverlap:0,sourceIdOverlap:0,sameTextDifferentIdRejected:true,trainingAllowed:false,selectionAllowed:false,independentHumanGold:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.resolve(process.argv[2]),result=verifyFresh(root);fs.writeFileSync(path.join(root,'fresh-source-v1/verification.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));}
