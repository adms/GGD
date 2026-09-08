/** One bounded R3 warm-start curriculum; no failed prompt policy reuse. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {digest} from './dataset.mjs';import {system,validateCases} from './r3-data.mjs';import {calibrationSeeds} from './r5-calibration-seeds.mjs';
export function build(r3Cases,r4Cases,candidates,review){
 assert.deepEqual(review.counts,{total:46,enabled:29,quarantined:6,draft:11});assert.equal(candidates.length,58);assert.equal(calibrationSeeds.length,26);
 const retained=r3Cases.filter(c=>c.split==='train').map(c=>({...c,cohort:'r3-reviewed-training-replay'}));assert.equal(retained.length,434);
 const held=r4Cases.filter(c=>c.split!=='train').map(c=>({...c,cohort:c.split==='dev'?'original-dev-selection':'r4-exposed-regression'}));assert.equal(held.length,245);
 const newCases=[],add=(c,input)=>{const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}];newCases.push({...c,messages,requestDigest:digest(messages)});};
 for(const [i,[source,...claims]] of calibrationSeeds.entries())for(const [j,verdict] of ['supported','contradicted','not-stated'].entries()){
  const id=`r5-controlled-source-${i}-${j}`,target={verdict};
  add({id,task:'owner-mechanism',split:'train',lineage:`controlled-source-${i}`,sourceId:`synthetic-r5-${i}`,target,acceptedTargets:[target],cohort:'controlled-counterfactual-training',quality:'personally-authored-reviewed-fictional-mechanics-not-Owner-source',reviewReason:'Controlled full source explicitly entails, conflicts with, or omits the claim; not derived from an exposed answer.'},{task:'owner-mechanism',source:{id:`synthetic-r5-${i}`,name:'人工機制判讀練習',snapshot:digest(source),text:source},claim:claims[j],instruction:'只根據此份鎖定來源判斷 claim。輸出 {"verdict":"supported|contradicted|not-stated"}。不判斷整招是否已能用模板實現。'});
 }
 const enabled=new Set(review.rows.filter(r=>r.status==='enabled').map(r=>r.templateId));
 for(const c of candidates)for(let variant=0;variant<2;variant++){
  const input=JSON.parse(c.messages[1].content),id=`r5-main-order-${variant}-${c.id}`;
  assert.deepEqual(input.catalog.map(x=>x.templateId).sort(),[...enabled].sort());for(const t of c.acceptedTargets)if(t.templateId)assert(enabled.has(t.templateId));
  input.catalog.sort((a,b)=>digest(id+a.templateId).localeCompare(digest(id+b.templateId)));
  add({...c,id,target:c.acceptedTargets[variant%c.acceptedTargets.length],candidateOnly:false,trainingEligible:true,cohort:'reviewed-main-v4-order-variant-training',quality:'reviewed-capability-classification-not-full-runtime-Gold',reviewReason:'Same 58 reviewed intents, two declared catalog-order variants; not 116 independent sources.'},input);
 }
 const cases=[...retained,...newCases,...held].sort((a,b)=>digest('r5:'+a.id).localeCompare(digest('r5:'+b.id)));
 // Keep dev/test order identical to R4 for replayed raw control results and seeds.
 const ordered=[...cases.filter(c=>c.split==='train'),...held];validateCases(ordered);
 const oldHeldSources=new Set(held.filter(c=>c.sourceId).map(c=>c.sourceId));assert(ordered.filter(c=>c.split==='train').every(c=>!oldHeldSources.has(c.sourceId)));
 for(const c of newCases){assert(!held.some(h=>h.requestDigest===c.requestDigest));const input=JSON.parse(c.messages[1].content);if(input.request)assert(!held.some(h=>JSON.parse(h.messages[1].content).request===input.request),'EXPOSED_REQUEST_REUSE');}
 assert.equal(ordered.filter(c=>c.split==='train').length,628);return{cases:ordered,newCases};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [r3,r4,candidateRoot,out]=process.argv.slice(2);for(const p of [r3,r4,candidateRoot,out])assert(p&&path.isAbsolute(p));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const read=p=>JSON.parse(fs.readFileSync(p)),review=read(path.join(r3,'main-catalog-review-v4.json')),candidateManifest=read(path.join(candidateRoot,'manifest.json')),candidateCases=read(path.join(candidateRoot,'cases.private.json'));assert.equal(candidateManifest.reviewSha256,digest(review));assert.equal(candidateManifest.casesSha256,digest(candidateCases));
 const data=build(read(path.join(r3,'cases.private.json')),read(path.join(r4,'cases.private.json')),candidateCases,review);fs.mkdirSync(out);const put=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
 put('cases.private.json',data.cases);put('new-question-review.json',data.newCases.map(c=>({id:c.id,sourceType:c.quality,input:JSON.parse(c.messages[1].content),acceptedTargets:c.acceptedTargets,reason:c.reviewReason,personallyReviewed:true})));
 const counts=Object.fromEntries(['train','dev','test'].map(s=>[s,data.cases.filter(c=>c.split===s).length]));
 put('dataset-manifest.json',{schema:'ggd-r3-warmstart-curriculum@5',createdAt:new Date().toISOString(),parent:r3,rejectedIteration:r4,casesSha256:digest(data.cases),counts,retainedTraining:434,controlledFictionalSources:26,controlledClaims:78,currentMainIntents:58,catalogOrderVariantsPerIntent:2,newTrainingRows:194,failedPromptPolicyUsed:false,mainReviewSha256:digest(review),ownerGold:false,releaseQualified:false,limitations:['All R4 evaluation is exposed regression; original dev only selects among baseline and new checkpoint.','78 controlled claims are fictional calibration, not newly discovered Owner text.','116 main rows are 58 reviewed intents with two catalog permutations, not independent data.','Classification only; no parameters, visual validation, game changes, publication or activation.']});
 put('semantic-review.json',{status:'approved-for-bounded-research-training',casesSha256:digest(data.cases),newRowsPersonallyReviewed:194,originalTrainingRetainedWithoutMessageOrLabelChanges:true,ownerGold:false,trainingScope:'source entailment calibration plus reviewed v4 capability matching; no claim of all original skill runtime correctness',reviewedSyntheticSources:calibrationSeeds.map(([source,...claims],i)=>({id:`synthetic-r5-${i}`,source,claims,verdictOrder:['supported','contradicted','not-stated']}))});
 for(const s of ['train','dev','test']){const rows=data.cases.filter(c=>c.split===s);put(s+'-requests.json',rows.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));if(s==='train')fs.writeFileSync(path.join(out,'train.jsonl'),rows.map(({id,messages,target})=>JSON.stringify({id,messages,target})).join('\n')+'\n',{flag:'wx'});}
 console.log(JSON.stringify({out,counts,newReviewedRows:194,trainingStarted:false}));
}
