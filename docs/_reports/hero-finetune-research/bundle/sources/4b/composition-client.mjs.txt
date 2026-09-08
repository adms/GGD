/** Public request/response contract. No answer key, training, or activation. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';
const keys=v=>Object.keys(v).sort();
export function validateCatalog(catalog,expectedHash){
 assert.equal(digest(catalog),expectedHash,'CATALOG_CHANGED');assert.equal(catalog.schema,'ggd-reviewed-composition-catalog@1');assert.equal(catalog.releaseQualified,false);
 assert(/^[0-9a-f]{40}$/.test(catalog.revision));for(const k of ['reviewSha256','runtimeProbeSha256'])assert(/^[0-9a-f]{64}$/.test(catalog[k]));
 assert(typeof catalog.system==='string'&&catalog.system.trim());assert(Array.isArray(catalog.allowedPlans)&&catalog.allowedPlans.length>0&&catalog.allowedPlans.length<=128);
 assert.equal(new Set(catalog.allowedPlans.map(p=>p.id)).size,catalog.allowedPlans.length,'DUPLICATE_PLAN');
 const unavailable=new Set(catalog.unavailable.map(r=>r.templateId));
 for(const p of catalog.allowedPlans){
  assert(typeof p.id==='string'&&p.id.length>0&&p.id.length<100);assert(typeof p.description==='string'&&p.description.trim());
  assert(Array.isArray(p.templateIds)&&p.templateIds.length>=1&&p.templateIds.length<=8);assert(p.templateIds.every(id=>/^tpl-[a-z0-9-]+$/.test(id)&&!unavailable.has(id)),'UNAVAILABLE_PLAN_CARD');
  assert(Array.isArray(p.equivalentOrders)&&Array.isArray(p.requiredChoices));assert(p.requiredChoices.every(x=>typeof x==='string'&&x.trim()));
  for(const order of p.equivalentOrders){assert(Array.isArray(order));assert.deepEqual(order.slice().sort(),p.templateIds.slice().sort(),'NOT_AN_EQUIVALENT_CARD_MULTISET');}
 }
 return catalog;
}
export function buildCompositionRequest(catalog,input,expectedHash){
 validateCatalog(catalog,expectedHash);assert(input&&typeof input==='object');assert.deepEqual(keys(input),['id','request']);
 assert(typeof input.id==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(input.id));assert(typeof input.request==='string'&&input.request.length<=4000);
 const request=mechanicsText(input.request);assert(request.trim(),'EMPTY_REQUEST');
 const allowedPlans=catalog.allowedPlans.slice().sort((a,b)=>digest(input.id+a.id).localeCompare(digest(input.id+b.id)));
 const payload={task:'mechanism-stack',sourceVersion:catalog.revision,request,allowedPlans,unavailable:catalog.unavailable,instruction:'只輸出 {"decision":"accept|refuse","templateIds":[...],"onConflict":"reject"}。只能選allowedPlans的一個既有單卡或多卡計畫及明列的等價順序；拒絕時templateIds=[]。不得任意追加、移除或去重卡片，不生成參數。'};
 const messages=[{role:'system',content:catalog.system},{role:'user',content:JSON.stringify(payload)}];
 return{schema:'ggd-composition-request@1',id:input.id,input,catalogSha256:expectedHash,sourceVersion:catalog.revision,messages,requestDigest:digest(messages),releaseQualified:false,activation:false};
}
export function validateCompositionValue(catalog,value){
 if(!value||typeof value!=='object'||Array.isArray(value)||keys(value).join()!=='decision,onConflict,templateIds')return{pass:false,error:'OUTPUT_CONTRACT'};
 if(!['accept','refuse'].includes(value.decision)||value.onConflict!=='reject'||!Array.isArray(value.templateIds)||value.templateIds.length>8||!value.templateIds.every(id=>typeof id==='string'))return{pass:false,error:'OUTPUT_CONTRACT'};
 if(value.decision==='refuse')return value.templateIds.length?{pass:false,error:'REFUSAL_WITH_CARDS'}:{pass:true,error:null,plans:[],decision:'refuse',scope:'No complete plan recommended from this reviewed vocabulary; not proof that every unlisted engine composition is impossible.'};
 const plans=catalog.allowedPlans.filter(p=>[p.templateIds,...p.equivalentOrders].some(ids=>JSON.stringify(ids)===JSON.stringify(value.templateIds)));
 return plans.length?{pass:true,error:null,decision:'accept',templateIds:value.templateIds,plans:plans.map(p=>({id:p.id,description:p.description,requiredChoices:p.requiredChoices})),manualParameterReviewRequired:true}:{pass:false,error:'UNREVIEWED_COMPOSITION'};
}
export function validateCompositionResult(catalog,request,raw,expectedHash){
 assert.deepEqual(request,buildCompositionRequest(catalog,request.input,expectedHash),'REQUEST_CHANGED');
 assert.equal(raw.complete,true,'INCOMPLETE_INFERENCE');assert.equal(raw.metadata.thinking,false);assert.equal(raw.results.length,1);
 const r=raw.results[0];assert.equal(r.id,request.id);assert.equal(r.requestDigest,request.requestDigest);assert.equal(r.error,null,'INFERENCE_FAILED');
 return{...validateCompositionValue(catalog,r.value),requestDigest:request.requestDigest,catalogSha256:expectedHash,sourceVersion:catalog.revision,value:r.value,semanticQualified:false,releaseQualified:false,activation:false,warning:'Contract validation is not semantic proof. A listed plan can still misunderstand the request; all necessary conditions and manual parameter choices require review.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,catalogPath,expectedHash,inputPath,...rest]=process.argv.slice(2);assert(['build','validate'].includes(mode));const read=p=>JSON.parse(fs.readFileSync(p));let result,out;
 if(mode==='build'){assert.equal(rest.length,1);result=buildCompositionRequest(read(catalogPath),read(inputPath),expectedHash);[out]=rest;}
 else{assert.equal(rest.length,2);result=validateCompositionResult(read(catalogPath),read(inputPath),read(rest[0]),expectedHash);out=rest[1];}
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({mode,out,pass:result.pass,requestDigest:result.requestDigest,activation:false}));if(mode==='validate'&&!result.pass)process.exitCode=2;
}
