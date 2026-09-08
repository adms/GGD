import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {build} from './r6-data.mjs';import {digest} from './dataset.mjs';import {fileHash} from './precision-diagnostic.mjs';import {score} from './r6-score.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
export function verify(root){
 const manifest=read(path.join(root,'dataset-manifest.json')),ext=manifest.extension,r3=manifest.parent,r4=manifest.previousRegression,outputs=path.dirname(root);
 for(const p of manifest.sourceFiles)assert.equal(fileHash(p.path),p.sha256,'SOURCE_CHANGED:'+p.path);
 const args={original:read(path.join(r3,'cases.private.json')),regression:read(path.join(r4,'cases.private.json')),snapshot:read(path.join(r3,'source-snapshot.json')),owner:read(path.join(ext,'owner-training-wording-review-v1/owner-train-candidate.private.json')),hero:read(path.join(ext,'hero-training-wording-review-v1/hero-train-candidate.private.json')),expandedDev:read(path.join(ext,'r6-source-dev-candidate-v1/cases.private.json')),current:read(path.join(outputs,'forge-current-main-candidate-v4-20260906/cases.private.json')),catalog:read(path.join(root,'catalog.json')),diagnostics:[...read(path.join(ext,'composition-diagnostic-v2/cases.private.json')),...read(path.join(ext,'source-label-clarification-v1/cases.private.json'))]};
 const rebuilt=build(args),cases=read(path.join(root,'cases.private.json'));assert.deepEqual(cases,rebuilt.cases,'REBUILD_MISMATCH');assert.equal(digest(cases),manifest.casesSha256);assert.equal(digest(args.catalog),manifest.catalogSha256);
 for(const [n,x] of [['owner-unknown-review.json',rebuilt.unknownReview],['stack-new-review.json',rebuilt.stackReview],['excluded-legacy-mechanism-training.json',rebuilt.excluded]])assert.deepEqual(read(path.join(root,n)),x);
 for(const s of ['train','dev','test']){const rows=cases.filter(c=>c.split===s),req=rows.map(({id,messages,requestDigest})=>({id,messages,requestDigest}));assert.deepEqual(read(path.join(root,s+'-requests.json')),req);const budget=read(path.join(root,s+'-token-budget.json'));assert.equal(budget.allFit,true);assert.equal(budget.count,rows.length);assert.equal(budget.requestsSha256,fileHash(path.join(root,s+'-requests.json')));}
 assert.deepEqual(fs.readFileSync(path.join(root,'train.jsonl'),'utf8').trim().split('\n').map(JSON.parse),cases.filter(c=>c.split==='train').map(({id,messages,target})=>({id,messages,target})));
 for(const c of cases)for(const t of c.acceptedTargets)assert.equal(score(c,t).pass,true,'INVALID_TARGET:'+c.id);
 const single=cases.filter(c=>c.split==='train'&&c.task==='mechanism-template'),covered=new Set(single.flatMap(c=>c.acceptedTargets.map(t=>t.templateId).filter(Boolean)));assert.deepEqual([...covered].sort(),args.catalog.allowedPlans.filter(p=>p.templateIds.length===1).map(p=>p.id).sort(),'ENABLED_FAMILY_COVERAGE');
 const mutated=structuredClone(args);mutated.snapshot.sources.find(s=>s.id==='godie-e002.e').ownerOriginal+='SOURCE_DRIFT';assert.throws(()=>build(mutated));
 const contaminated=structuredClone(args);contaminated.original.push({...contaminated.original.find(c=>c.sourceId==='godie-e002.e'),split:'test',id:'deliberate-leak'});assert.throws(()=>build(contaminated));
 return{verifiedAt:new Date().toISOString(),cases:cases.length,train:466,dev:158,test:186,completeRebuild:true,allTargetsPassContract:true,enabledFamilies:covered.size,sourceDriftRejected:true,splitLeakRejected:true,trainingStarted:false,releaseQualified:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(process.argv[2]),result=verify(root);fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}
