/** New joint curriculum. Original experiment data/policies are never edited. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';import {validateCases} from './r3-data.mjs';import {buildUnknown} from './r6-owner-unknown.mjs';
import * as seeds from './r6-stack-seeds.mjs';import {buildCompositionRequest,validateCompositionValue} from './composition-client.mjs';import {fileHash} from './precision-diagnostic.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),self=fileURLToPath(import.meta.url);
export function stackCase(catalog,split,id,request,planIds,reason,lineage){
 const targets=planIds===null?[{decision:'refuse',templateIds:[],onConflict:'reject'}]:planIds.flatMap(id=>{const p=catalog.allowedPlans.find(p=>p.id===id);assert(p,'UNKNOWN_PLAN:'+id);return[p.templateIds,...p.equivalentOrders].map(templateIds=>({decision:'accept',templateIds,onConflict:'reject'}));});
 for(const t of targets)assert.equal(validateCompositionValue(catalog,t).pass,true);
 const built=buildCompositionRequest(catalog,{id,request},digest(catalog));
 return{id,task:'mechanism-stack',split,lineage,messages:built.messages,requestDigest:built.requestDigest,target:targets[0],acceptedTargets:targets,reviewReason:reason,cohort:'r6-familiar-plan-complete-requirements',quality:'personally-reviewed-catalog-and-runtime-not-owner-gold',trainingEligible:split==='train'};
}
export function build({original,regression,snapshot,owner,hero,expandedDev,current,catalog,diagnostics}){
 for(const [task,reviewed,n] of [['owner-mechanism',owner,120],['hero-source',hero,90]]){
  const old=original.filter(c=>c.split==='train'&&c.task===task);assert.equal(reviewed.length,n);
  for(const c of reviewed){const before=old.find(o=>o.id===c.id.replace(/-wording-v2$/,''));assert(before);assert.deepEqual(c.target,before.target);assert.equal(c.split,'train');assert.equal(c.lineage,before.lineage);assert.deepEqual(JSON.parse(c.messages[1].content).source,JSON.parse(before.messages[1].content).source);assert.deepEqual(c.messages[0],before.messages[0]);}
 }
 assert.equal(current.length,58);assert.equal(catalog.allowedPlans.length,32);
 // All 170 legacy mechanism rows carry superseded wave/sweep descriptions.
 // Do not mix that old capability narrative back into current-main training.
 // Their original files and evaluation stay intact; R3 inherited exposure is
 // explicit. Current 58 reviewed needs cover all 29 enabled card families.
 const excluded=original.filter(c=>c.split==='train'&&c.task==='mechanism-template');assert.equal(excluded.length,170);
 const retained=[...owner,...hero,...original.filter(c=>c.split==='train'&&c.task==='vfx-semantic')];assert.equal(retained.length,264);
 const unknown=buildUnknown(original,snapshot),stack=[],reviews=[];
 for(const c of current){assert.equal(c.split,'train');const input=JSON.parse(c.messages[1].content),ids=c.target.decision==='refuse'?null:c.acceptedTargets.map(t=>t.templateId);
  stack.push(stackCase(catalog,'train','r6-stack-'+c.id,input.request,ids,'Re-reviewed existing TRAIN need under the full 32-plan vocabulary; none of the three compositions supplies the missing conjunction.','r6-current-train-'+c.id));
 }
 for(const split of ['train','dev','test'])for(const [name,request,ids,reason] of seeds[split]){
  const c=stackCase(catalog,split,'r6-stack-'+split+'-'+name,request,ids,reason,'r6-stack-scenario-'+split+'-'+name);stack.push(c);reviews.push({id:c.id,split,request,targets:c.acceptedTargets,reason,personallyReviewed:true,independentMechanismFamily:false});
 }
 assert.deepEqual(['train','dev','test'].map(s=>stack.filter(c=>c.split===s).length),[90,24,24]);
 const held=regression.filter(c=>c.split!=='train');assert.equal(held.length,245);assert.equal(expandedDev.length,51);assert(expandedDev.every(c=>c.split==='dev'));
 const train=[...retained,...unknown.cases,...current.map(c=>({...c,candidateOnly:false,trainingEligible:true,cohort:'reviewed-current-v4-training'})),...stack.filter(c=>c.split==='train')].sort((a,b)=>digest('r6:'+a.id).localeCompare(digest('r6:'+b.id)));
 const cases=[...train,...held.filter(c=>c.split==='dev'),...expandedDev,...stack.filter(c=>c.split==='dev'),...held.filter(c=>c.split==='test'),...stack.filter(c=>c.split==='test')];validateCases(cases);
 const testRequests=new Set([...held.filter(c=>c.split==='test'),...diagnostics,...stack.filter(c=>c.split==='test')].map(c=>JSON.parse(c.messages[1].content).request).filter(Boolean).map(s=>s.replace(/\s/g,'')));
 for(const c of train){const req=JSON.parse(c.messages[1].content).request;if(req)assert(!testRequests.has(req.replace(/\s/g,'')),'EXPOSED_TEST_REQUEST_IN_TRAIN:'+c.id);}
 assert.deepEqual(['train','dev','test'].map(s=>cases.filter(c=>c.split===s).length),[466,158,186]);
 return{cases,unknownReview:unknown.review,stackReview:reviews,excluded:excluded.map(c=>({id:c.id,originalRequestDigest:c.requestDigest,reason:'Whole row omitted from new training because its catalog repeats superseded wave/sweep capability descriptions. Not claiming every target label is wrong. Original artifacts and R3 inherited exposure remain.'}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===self){
 const [outputs,out]=process.argv.slice(2);assert(path.isAbsolute(outputs)&&path.isAbsolute(out));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const r3=path.join(outputs,'forge-mechanism-priority-r3-20260906'),r4=path.join(outputs,'forge-source-calibration-r4-20260906'),ext=path.join(outputs,'forge-additional-four-hours-20260906'),candidate=path.join(outputs,'forge-current-main-candidate-v4-20260906');
 const ownerRoot=path.join(ext,'owner-training-wording-review-v1'),heroRoot=path.join(ext,'hero-training-wording-review-v1'),devRoot=path.join(ext,'r6-source-dev-candidate-v1'),compRoot=path.join(ext,'composition-diagnostic-v2');
 const owner=read(path.join(ownerRoot,'owner-train-candidate.private.json')),hero=read(path.join(heroRoot,'hero-train-candidate.private.json')),expandedDev=read(path.join(devRoot,'cases.private.json')),current=read(path.join(candidate,'cases.private.json')),catalog=read(path.join(compRoot,'catalog.json'));
 for(const [root,rows,key] of [[ownerRoot,owner,'candidateSha256'],[heroRoot,hero,'candidateSha256'],[devRoot,expandedDev,'casesSha256'],[candidate,current,'casesSha256']])assert.equal(read(path.join(root,'manifest.json'))[key],digest(rows),'CANDIDATE_CHANGED');
 const data=build({original:read(path.join(r3,'cases.private.json')),regression:read(path.join(r4,'cases.private.json')),snapshot:read(path.join(r3,'source-snapshot.json')),owner,hero,expandedDev,current,catalog,diagnostics:[...read(path.join(compRoot,'cases.private.json')),...read(path.join(ext,'source-label-clarification-v1/cases.private.json'))]});
 fs.mkdirSync(out);const put=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
 put('cases.private.json',data.cases);put('catalog.json',catalog);put('owner-unknown-review.json',data.unknownReview);put('stack-new-review.json',data.stackReview);put('excluded-legacy-mechanism-training.json',data.excluded);
 for(const split of ['train','dev','test']){const rows=data.cases.filter(c=>c.split===split);put(split+'-requests.json',rows.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));if(split==='train')fs.writeFileSync(path.join(out,'train.jsonl'),rows.map(({id,messages,target})=>JSON.stringify({id,messages,target})).join('\n')+'\n',{flag:'wx'});}
 const sourceFiles=[self,...['r6-owner-unknown.mjs','r6-stack-seeds.mjs','composition-client.mjs','r3-data.mjs','dataset.mjs'].map(n=>path.join(path.dirname(self),n)),...[[r3,'cases.private.json'],[r3,'source-snapshot.json'],[r4,'cases.private.json'],[ownerRoot,'owner-train-candidate.private.json'],[heroRoot,'hero-train-candidate.private.json'],[devRoot,'cases.private.json'],[candidate,'cases.private.json'],[compRoot,'catalog.json'],[compRoot,'cases.private.json'],[ext,'source-label-clarification-v1/cases.private.json']].map(([p,n])=>path.join(p,n))];
 put('dataset-manifest.json',{schema:'ggd-joint-source-stack-curriculum@6',createdAt:new Date().toISOString(),parent:r3,previousRegression:r4,extension:ext,casesSha256:digest(data.cases),catalogSha256:digest(catalog),counts:{train:466,dev:158,test:186},taskCounts:Object.fromEntries(['train','dev','test'].map(s=>[s,Object.fromEntries(Object.entries(Object.groupBy(data.cases.filter(c=>c.split===s),c=>c.task)).map(([k,v])=>[k,v.length]))])),sourceFiles:sourceFiles.map(p=>({path:p,sha256:fileHash(p)})),retainedTraining:264,excludedLegacyMechanismRows:170,inheritedR3ExposureIncludesLegacy170:true,wordingChanges:24,newOwnerUnknown:54,currentSingleCard:58,newStackTrain:90,newStackTrainIndependentNeeds:32,newStackTrainReusesCurrentTrainNeeds:58,expandedOwnerDev:51,newStackDev:24,newStackTest:24,trainingStarted:false,ownerGold:false,releaseQualified:false,limitations:['Joint curriculum and changed optimizer learning rate are not a single-factor causal ablation.','All source texts remain historical repository snapshots, not latest Owner or external canon.','Original 162 test questions are exposed regression, including historical 17-card catalogs; these are not current capability claims. New stack requests use familiar plan families; not new-family generalization.','The 58 current needs appear in two task contracts in TRAIN only; not 116 independent intents.','Only 29 reviewed single plans and 3 specific runtime-proved compositions. No all-combinations or all-hero guarantee.','No VFX parameter generation, visual validation, cloud, production changes or activation.']});
 console.log(JSON.stringify({out,counts:{train:466,dev:158,test:186},trainingStarted:false}));
}
