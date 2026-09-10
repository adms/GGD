/** Data-only R4 intervention: clean-base same recipe, reviewed training additions.
 * Existing test is regression, not a newly sealed independent evaluation.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';import {validateCases} from './r3-data.mjs';
import {ownerTrain,extraUnknownTrain,heroTrain,ownerProspective} from './r4-reviewed-claims.mjs';
export function buildR4(old,snapshot){
 const cases=structuredClone(old).map(c=>({...c,cohort:c.split==='train'?'retained-r3-train':c.split==='dev'?'r3-selection-dev':'r3-exposed-regression'}));
 const review=[],sourceMap=new Map([...snapshot.sources,...snapshot.heroes].map(s=>[s.id,s]));
 function add(short,task,split,claim,verdict,anchor,variant,cohort){
  const sourceId='godie-'+short,source=sourceMap.get(sourceId);assert(source,'UNKNOWN_SOURCE:'+sourceId);
  const original=source.ownerOriginal??source.descriptionOriginal;
  if(anchor)assert(original.includes(anchor),'ANCHOR_MISSING:'+sourceId+':'+anchor);
  const parent=old.find(c=>c.task===task&&c.sourceId===sourceId);assert(parent,'SOURCE_NOT_IN_PREDECLARED_SPLIT');assert.equal(parent.split,split,'SOURCE_SPLIT_LEAK');
  assert.equal(parent.sourceSha256,digest(original),'SOURCE_HASH_CHANGED');
  const input=JSON.parse(parent.messages[1].content);input.claim=claim;
  const messages=[parent.messages[0],{role:'user',content:JSON.stringify(input)}],target={verdict};
  const id='r4-'+task+'-'+short+'-'+variant;
  const row={id,task,split,lineage:parent.lineage,sourceId,sourceSha256:digest(original),target,acceptedTargets:[target],messages,requestDigest:digest(messages),cohort,quality:'personally-reviewed-assistant-label-not-owner-gold',reviewReason:verdict==='supported'?'Entire authored claim supported by full pinned source.':verdict==='contradicted'?'Explicit contrary subject, value, condition, direction, identity or timing in source.':'Full source does not establish the added claim; absence is not a negative statement.'};
  cases.push(row);review.push({id,sourceId,split,cohort,sourceSha256:row.sourceSha256,sourceOriginal:original,input,anchor:anchor??null,claim,verdict,reason:row.reviewReason});
 }
 function triples(rows,task,split,cohort){for(const [id,anchor,...claims] of rows){assert.equal(claims.length,3);for(const [i,verdict] of ['supported','contradicted','not-stated'].entries())add(id,task,split,claims[i],verdict,anchor,String(i),cohort);}}
 triples(ownerTrain,'owner-mechanism','train','r4-reviewed-train');triples(heroTrain,'hero-source','train','r4-reviewed-train');
 for(const [i,[id,claim]] of extraUnknownTrain.entries())add(id,'owner-mechanism','train',claim,'not-stated',null,'extra-'+i,'r4-reviewed-train');
 triples(ownerProspective,'owner-mechanism','test','r4-prospective-same-source-diagnostic');
 cases.sort((a,b)=>digest(a.id).localeCompare(digest(b.id)));validateCases(cases);
 // Original rows remain byte-equivalent after excluding the new provenance field.
 for(const previous of old){const next=cases.find(c=>c.id===previous.id),{cohort,...rest}=next;assert.deepEqual(rest,previous);}
 const trainDigests=new Set(cases.filter(c=>c.split==='train').map(c=>c.requestDigest));
 for(const c of old.filter(c=>c.split!=='train'))assert(!trainDigests.has(c.requestDigest),'OLD_HELDOUT_IN_TRAIN');
 return {cases,review};
}
export function generateR4(oldRoot,root){
 assert(path.isAbsolute(root)&&path.isAbsolute(oldRoot));assert(!fs.existsSync(root),'REFUSE_OVERWRITE');
 const read=n=>JSON.parse(fs.readFileSync(path.join(oldRoot,n))),old=read('cases.private.json'),snapshot=read('source-snapshot.json');
 assert.equal(read('run-state.json').status,'complete-research-only');assert.equal(read('semantic-review.json').casesSha256,digest(old));
 const {cases,review}=buildR4(old,snapshot);fs.mkdirSync(root,{recursive:true});
 const put=(n,x)=>fs.writeFileSync(path.join(root,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
 put('cases.private.json',cases);put('new-question-review.json',review);put('source-snapshot.json',snapshot);
 for(const n of ['catalog.json','personal-source-review.json','contract-check.json'])fs.copyFileSync(path.join(oldRoot,n),path.join(root,n),fs.constants.COPYFILE_EXCL);
 for(const split of ['train','dev','test']){const rows=cases.filter(c=>c.split===split);put(split+'-requests.json',rows.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));if(split==='train')fs.writeFileSync(path.join(root,'train.jsonl'),rows.map(({id,messages,target})=>JSON.stringify({id,messages,target})).join('\n')+'\n',{flag:'wx'});}
 const manifest={schema:'ggd-forge-data-intervention@4',createdAt:new Date().toISOString(),parent:oldRoot,parentCasesSha256:digest(old),casesSha256:digest(cases),counts:Object.fromEntries(['train','dev','test'].map(s=>[s,cases.filter(c=>c.split===s).length])),newReviewedRows:review.length,newTrainRows:review.filter(c=>c.split==='train').length,prospectiveRows:review.filter(c=>c.split==='test').length,tasks:Object.fromEntries([...new Set(cases.map(c=>c.task))].map(t=>[t,Object.fromEntries(['train','dev','test'].map(s=>[s,cases.filter(c=>c.task===t&&c.split===s).length]))])),ownerGold:false,releaseQualified:false,limitations:['Original R3 dev remains checkpoint selection data; its prior outputs informed this iteration.','R3 test has been exposed; report as regression only, never new sealed Gold.','New prospective claims use the same previously held-out source families; never training, but not independent new-source Gold.','Full source text is supplied at inference; this is faithful classification, not memorized lore or full hero generation.','Data-only intervention keeps the original 17-card supplied training contexts; current main 30-card capability adaptation is an external regression diagnostic.','No parameter output, visual validation, cloud GPU, activation or automatic publishing.']};
 put('dataset-manifest.json',manifest);
 put('experiment-policy.json',{...read('experiment-policy.json'),schema:'ggd-forge-source-priority-experiment@4',startedAt:manifest.createdAt,curriculum:'source-entailment-calibration-r4',intervention:'data-only; same clean base, recipe, decoding and original dev selection',trainingEpochs:3});
 put('review-pending.json',{status:'requires-personal-approval',reviewedRows:review.length,casesSha256:manifest.casesSha256,reviewSha256:digest(review),ownerGold:false});
 const dir=path.dirname(fileURLToPath(import.meta.url));put('curriculum-pins.json',['r4-data.mjs','r4-reviewed-claims.mjs','r3-data.mjs','dataset.mjs'].map(n=>({path:path.join(dir,n),sha256:digest(fs.readFileSync(path.join(dir,n),'utf8'))})));
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(generateR4(path.resolve(process.argv[2]),path.resolve(process.argv[3])),null,2));
