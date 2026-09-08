import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepare,mechanicsText,digest} from './dataset.mjs';
import {score,scorerChecks} from './scorer.mjs';
import {validatePolicy} from './cli.mjs';
import {literalRuleProposal} from './rules.mjs';
import {reviewIntake,exportApproved,readArtifact} from './intake.mjs';
import {verifyDatasetExports,pinDatasetExports} from './input-integrity.mjs';
import {validateWorkflow} from './workflow.mjs';
test('local-only policy, lineage split and independent semantic guard',()=>{
 const policy={schema:'ggd-forge-experiment@1',startedAt:'2026-09-05T19:24:15Z',deadline:'2026-09-06T03:24:15Z',trainingCutoff:'2026-09-06T00:24:15Z',reportReserveSeconds:3600,platform:'darwin-arm64',compute:'local-mlx',cloudGpu:false,cloudFallback:false,cloudGpuSpendLimit:0,externalTeacher:false,publish:false,activateInEditor:false,base:'Qwen/Qwen3.5-4B',thinking:false,scope:'test',primaryMetric:'test',promisingImprovementPP:10,newCriticalAllowed:0,trainingRecipes:1,maximumGpuJobs:1,maxMemoryGiB:80,maxSequenceTokens:2048,maxOutputTokens:512,seed:1,temperature:0.7,topP:0.8,topK:20,presencePenalty:1.5,dataQualification:'pending',releaseQualified:false,mac16GB:'not-tested'};
 assert.equal(validatePolicy(policy),policy);
 const flow={schema:'ggd-forge-workflow@1',mode:'finalize-existing',root:'/tmp/run',python:'/usr/bin/false',modelReceipt:'/tmp/receipt',runtimeRoot:'/tmp/runtime',behaviorOutput:'/tmp/run/behavior',deployDestination:null,knownCorpusRoot:null,allowNewGpuDiagnostics:false};assert.equal(validateWorkflow(flow),flow);assert.throws(()=>validateWorkflow({...flow,publish:true}));assert.throws(()=>validateWorkflow({...flow,mode:'cloud'}));
 for(const change of [{cloudGpu:true},{cloudFallback:true},{cloudGpuSpendLimit:1},{externalTeacher:true},{deadline:'2026-09-07T03:24:15Z'},{surprise:1}])assert.throws(()=>validatePolicy({...policy,...change}));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forge-training-test-'));
 const cases=prepare(root,{digest:'test',vfxKeys:['fx.prim.ice.nova'],vfxFields:['alpha','delayMs','timeScale']});
 assert.equal(cases.length,216);assert.equal(scorerChecks(cases).status,'pass');
 for(const c of cases)assert.equal(score(c,literalRuleProposal(c.messages)).pass,true);
 const unfamiliar=structuredClone(cases[0].messages);const input=JSON.parse(unfamiliar[1].content);input.request='請自由設計一招';unfamiliar[1].content=JSON.stringify(input);assert.equal(literalRuleProposal(unfamiliar),null);
 assert.equal(mechanicsText('傷害「台詞\n「內層」」90「另一句」點'),'傷害90點');
 for(const malformed of ['「未閉合','錯誤」'])assert.throws(()=>mechanicsText(malformed));
 for(const c of cases){assert(c.request.includes('「'));assert.equal(digest(c.request),c.source.ownerTextSha256);assert.equal(c.mechanicsText,mechanicsText(c.request));assert(!JSON.stringify(c.messages).match(/[「」]/));assert.equal(JSON.parse(c.messages[1].content).request,c.mechanicsText);}
 const splits=new Map();for(const c of cases){assert(!splits.has(c.familyFingerprint)||splits.get(c.familyFingerprint)===c.split);splits.set(c.familyFingerprint,c.split);assert(c.retrievalIds.every(id=>cases.find(t=>t.id===id).split==='train'));}
 // Hand-authored anchor independent of prepare() and its target builder.
 const c={spec:{outcome:'proposed',radius:500,damage:90,damageType:'magic',attachTo:'caster',vfxKey:'fx.prim.ice.nova',overrides:{alpha:0.5}}};
 const good={outcome:'proposed',templateId:'tpl-ground-nova',params:{radius:500,damage:90,damageType:'magic'},vfxLayers:[{vfxKey:'fx.prim.ice.nova',attachTo:'caster',alpha:0.5}],missing:[],fallbackId:null};
 assert.equal(score(c,good).pass,true);
 const bad=structuredClone(good);bad.params.damage=91;assert.equal(score(c,bad).critical,true);
 assert.equal(score({spec:{outcome:'refused'}},good).pass,false);
 assert.equal(score({spec:{outcome:'advice',condition:'radius'}},{outcome:'advice',templateId:null,params:null,vfxLayers:[],missing:['radius'],fallbackId:null}).pass,true);
 assert.equal(score(c,null).pass,false);
 assert.equal(verifyDatasetExports(root).cases,216);const checkPinned=pinDatasetExports(root);fs.appendFileSync(path.join(root,'train.jsonl'),'{}\n');assert.throws(()=>verifyDatasetExports(root),/DATA_EXPORT_DRIFT:train/);assert.throws(checkPinned,/DATA_CHANGED_DURING_RUN:train/);
 const seed=cases[0],record={schema:'ggd-forge-training-example@1',id:'intake-test',task:'fill-slot',familyId:'family-test',lineageRootId:'lineage-test',split:'train',source:{ownerText:seed.request,ownerTextSha256:digest(seed.request),revision:'test-only',licenseRef:'test-fixture',releaseCorpus:false},pins:{engineCommit:'test'},request:{ownerText:seed.request,context:JSON.parse(seed.messages[1].content).context},target:seed.target,expectation:seed.spec};
 const intakePolicy={schema:'ggd-forge-intake-policy@1',contract:'ground-nova-research@1',pins:record.pins,vfxKeys:['fx.prim.ice.nova'],vfxFields:['alpha','delayMs','timeScale'],allowedLicenseRefs:['test-fixture'],approvedReviews:[],splitAssignments:[{lineageRootId:'lineage-test',split:'train'}],blockedLineageRoots:[],blockedOwnerHashes:[]};
 let reviewed=reviewIntake([{...record,qualityTier:'gold',review:{status:'human-confirmed'}}],intakePolicy);assert.equal(reviewed[0].eligibleForEngine,false);assert.equal(exportApproved(reviewed,[{id:record.id,pass:true}]).length,0);
 const approval={contentDigest:reviewed[0].contentDigest,status:'human-confirmed',reviewerRef:'TEST-ONLY-NOT-A-REAL-REVIEW',reviewedAt:'2026-09-06T00:00:00Z',evidenceRef:'test-only'};
 reviewed=reviewIntake([record],{...intakePolicy,approvedReviews:[approval]});assert.equal(exportApproved(reviewed,[{id:record.id,pass:false}]).length,0);assert.equal(exportApproved(reviewed,[{id:record.id,pass:true}]).length,1);
 const changed=structuredClone(record);changed.source.ownerText+='改動';changed.source.ownerTextSha256=digest(changed.source.ownerText);changed.request.ownerText=changed.source.ownerText;assert.equal(reviewIntake([changed],{...intakePolicy,approvedReviews:[approval]})[0].eligibleForEngine,false);
 const leaked={...record,id:'other',lineageRootId:'other-root',split:'test'};assert(reviewIntake([record,leaked],{...intakePolicy,splitAssignments:[...intakePolicy.splitAssignments,{lineageRootId:'other-root',split:'test'}]}).every(r=>r.reasons.includes('CROSS_SPLIT_LINEAGE')));
 assert.throws(()=>readArtifact(root,'../outside.json'));assert.equal(reviewIntake([{...record,source:{...record.source,releaseCorpus:true}}],intakePolicy)[0].qualityTier,'rejected');
});
test('cancel stops the actual coordinator before any GPU worker', {skip:!process.env.FORGE_CANCEL_TEST}, async()=>{
 const source=process.env.FORGE_CANCEL_TEST,root=fs.mkdtempSync(path.join(os.tmpdir(),'forge-cancel-test-'));
 fs.copyFileSync(path.join(source,'experiment-policy.json'),path.join(root,'experiment-policy.json'));
 const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
 const child=spawn(process.execPath,[cli,'run','--root',root,'--python','/usr/bin/false','--model-receipt',path.join(source,'model-download.json'),'--runtime-root',path.join(root,'runtime')]);
 let output='';child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('"stage":"preflight"'))fs.writeFileSync(path.join(root,'CANCEL'),'{}');});
 child.stderr.resume();
 const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('cancel timeout'));},60000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);resolve(code);});});
 assert.equal(code,2);const state=JSON.parse(fs.readFileSync(path.join(root,'state.json')));
 assert.equal(state.status,'cancelled');assert(!state.stages.doctor);
 assert(!fs.existsSync(path.join(root,'runtime/gpu.lock')));
 const lease=path.join(root,'worker-lease.json');if(fs.existsSync(lease))assert.equal(JSON.parse(fs.readFileSync(lease)).pid,null);
});
