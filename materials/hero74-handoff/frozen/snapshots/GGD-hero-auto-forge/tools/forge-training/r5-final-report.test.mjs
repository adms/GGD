import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {collect,render} from './r5-final-report.mjs';

// Renderer-only fixture, no model bytes, training or benchmark inference.
function fixture(){
 const score={passed:1,total:2,unsafe:1},tasks=Object.fromEntries(['hero-source','owner-mechanism','mechanism-template'].map(k=>[k,{...score}]));
 const names=['fresh-source','current-main-v4','main-hero-diagnostic-v1','fidelity-diagnostic-v2','vfx-test','vfx-family-disjoint','vfx-seen-family-retention','r3-exposed-regression','r4-prospective-same-source-diagnostic'];
 return{createdAt:'fixture-not-real-model-result',selectedIsUnchangedR3:false,selectedStep:157,trainingComplete:true,training:{optimizerSteps:157,totalSeconds:60,peakMetalBytes:1024**3},manifest:{counts:{train:628,dev:83,test:162}},core:{scores:Object.fromEntries(['base','r3','r5'].map(k=>[k,{tasks}])),comparisons:[{before:'r3',after:'r5',byTask:{'owner-mechanism':{fixed:1,regressed:1,bothWrong:1}}}]},postGroups:names.map(name=>({name,scores:Object.fromEntries(['base','r3','r5'].map(k=>[k,{...score}]))})),measuredGates:{originalDev:false,currentMain:false},entry:{results:[{id:'fixture-entry',contractPass:true,semanticMatch:false,seconds:.5,peakMetalBytes:1024**3}]},sourceChecklist:{modelChecklistPass:false},baseIdentity:{revision:'fixture-revision',filesVerified:1},native:{base:'fixture-base',adapter:'fixture-adapter',adapterSha256:'fixture-hash'},catalogCounts:{enabled:29,quarantined:6,draft:11},remaining:['Fixture scope remains unproven.']};
}
test('renderer keeps failed safety gates and distinguishes schema from semantic matches',()=>{
 const s=render(fixture());assert(s.includes('step 157'));assert(s.includes('628train／83dev／162'));assert(s.includes('| owner-mechanism | 1/2 | 1/2 | 1/2 | 1 |'));
 assert(s.includes('originalDev：未通過'));assert(s.includes('| fixture-entry | true | false |'));assert(s.includes('16GB實機'));assert(s.includes('尚未')||s.includes('未驗證'));assert(s.includes('Fixture scope remains unproven.'));
 const missing=fixture();missing.postGroups=missing.postGroups.slice(1);assert.throws(()=>render(missing),/MISSING_GROUP:fresh-source/);
});
test('unchanged control and partial-training recovery are never reported as a completed new model',()=>{
 const f=fixture();f.selectedIsUnchangedR3=true;f.selectedStep=0;f.trainingComplete=false;f.training=null;f.recovery={validatedMetricPrefix:320};const s=render(f);
 assert(s.includes('沒有選用新微調權重'));assert(s.includes('本輪訓練未完成'));assert(s.includes('320例'));assert(!s.includes('本輪完整一pass'));
});
test('incomplete core refuses before any final-evidence output directory is created',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forge-r5-final-report-test-'));fs.writeFileSync(path.join(root,'run-state.json'),JSON.stringify({status:'running'}));
 assert.throws(()=>collect(root),/INCOMPLETE_CORE/);assert(!fs.existsSync(path.join(root,'final-evidence-v1')));
});
