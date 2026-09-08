/** Bound a manual recommendation to an explicitly chosen reviewed catalog.
 * Structural validation is not semantic approval or a live capability refresh.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';import {validateRecommendation} from './classification-client.mjs';
const keys=x=>Object.keys(x).sort();
export function buildCurrentRequest(review,input,expectedReviewSha256){
 assert.equal(digest(review),expectedReviewSha256,'REVIEW_CHANGED');
 assert.equal(review.releaseQualified,false,'RESEARCH_CATALOG_REQUIRED');assert(/^[0-9a-f]{40}$/.test(review.revision));
 assert(Number.isInteger(review.reviewVersion)&&review.reviewVersion>=1);assert.equal(typeof review.system,'string');assert(review.system.trim());
 assert.deepEqual(keys(input),['id','request']);assert(typeof input.id==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(input.id),'REQUEST_ID');
 assert(typeof input.request==='string'&&input.request.length<=4000,'REQUEST_TEXT');const request=mechanicsText(input.request);assert(request.trim(),'EMPTY_REQUEST');
 assert(Array.isArray(review.rows)&&review.rows.length>0);assert.equal(new Set(review.rows.map(r=>r.templateId)).size,review.rows.length,'DUPLICATE_TEMPLATE');
 for(const r of review.rows){assert(/^tpl-[a-z0-9-]+$/.test(r.templateId));assert(['enabled','quarantined','draft'].includes(r.status),'UNKNOWN_STATUS');assert(/^[0-9a-f]{64}$/.test(r.sourceSha256),'MISSING_SOURCE_PIN');assert(typeof r.description==='string'&&r.description.trim());}
 assert.deepEqual(review.counts,{total:review.rows.length,...Object.fromEntries(['enabled','quarantined','draft'].map(s=>[s,review.rows.filter(r=>r.status===s).length]))},'CATALOG_COUNT_DRIFT');
 const candidates=review.rows.filter(r=>r.status==='enabled').map(({templateId,status,description})=>({templateId,status,description})).sort((a,b)=>digest(input.id+a.templateId).localeCompare(digest(input.id+b.templateId)));
 const unavailable=review.rows.filter(r=>r.status!=='enabled').map(({templateId,status,issue})=>({templateId,status,...(issue===undefined?{}:{issue})}));
 const content={task:'mechanism-template',sourceVersion:review.revision,request,catalog:candidates,unavailable,instruction:'只使用此份版本目錄。輸出 {decision,templateId}，拒絕時 templateId=null。一張卡必須承擔全部必要條件，不自行組合、不把隔離卡當成已修好；不生成參數。'};
 const messages=[{role:'system',content:review.system},{role:'user',content:JSON.stringify(content)}];
 return{schema:'ggd-reviewed-template-request@1',id:input.id,task:'mechanism',input,sourceVersion:review.revision,reviewVersion:review.reviewVersion,catalogReviewSha256:expectedReviewSha256,messages,requestDigest:digest(messages),candidates,unavailable,sourceRequest:input.request,mechanicsRequest:request,activation:false,releaseQualified:false,warning:'Pinned catalog recommendation only; not live capabilities, complete multi-card coverage or semantic approval.'};
}
export function validateCurrentResult(review,request,raw,expectedReviewSha256){
 assert.deepEqual(request,buildCurrentRequest(review,request.input,expectedReviewSha256),'REQUEST_CHANGED');
 assert.equal(raw.requestDigest,request.requestDigest,'OUTPUT_FOR_OTHER_REQUEST');
 assert.equal(raw.inputIntegrityVerified,true,'UNVERIFIED_INFERENCE_REQUEST');assert.equal(raw.thinking,false);assert.equal(raw.activation,false);assert.equal(raw.error,null,'INFERENCE_FAILED');
 const result=validateRecommendation(request,raw.value);
 return{...result,requestDigest:request.requestDigest,catalogReviewSha256:expectedReviewSha256,sourceVersion:review.revision,reviewVersion:review.reviewVersion,semanticQualified:false,gameBehaviorValidated:false,releaseQualified:false,activation:false,scope:'One reviewed card per request. Manual review still required; a valid enabled ID may nevertheless be semantically wrong.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,reviewPath,expectedHash,inputPath,...rest]=process.argv.slice(2);assert(['build','validate'].includes(mode));
 const read=p=>JSON.parse(fs.readFileSync(p));let result,out;
 if(mode==='build'){assert.equal(rest.length,1);result=buildCurrentRequest(read(reviewPath),read(inputPath),expectedHash);[out]=rest;}
 else{assert.equal(rest.length,2);result=validateCurrentResult(read(reviewPath),read(inputPath),read(rest[0]),expectedHash);out=rest[1];}
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({mode,out,requestDigest:result.requestDigest,pass:result.pass,releaseQualified:false}));if(mode==='validate'&&!result.pass)process.exitCode=2;
}
