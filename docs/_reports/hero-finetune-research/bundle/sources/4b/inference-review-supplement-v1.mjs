/** Preserve the reviewed, previously unpaired 20-case composition diagnostic for inference only. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';
import {fileHash} from './precision-diagnostic.mjs';
import {exposure} from './r7-selected-baseline-v1.mjs';
import {validateCompositionValue} from './composition-client.mjs';
const self=fileURLToPath(import.meta.url), read=p=>JSON.parse(fs.readFileSync(p));
export function prepare(outputs,out){
 assert([outputs,out].every(path.isAbsolute));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const name='forge-additional-four-hours-20260906/composition-diagnostic-v2',root=path.join(outputs,name),file=path.join(root,'cases.private.json'),original=read(file),receipt=read(path.join(root,'manifest.json')),reviews=read(path.join(root,'personal-review.json'));
 assert.equal(original.length,20);assert.equal(digest(original),receipt.casesSha256);for(const p of receipt.sourceFiles)assert.equal(fileHash(p.path),p.sha256,'SOURCE_CHANGED');
 const disabled=path.join(outputs,'forge-source-rehearsal-r8-v1-20260906/TRAINING_DISABLED.json');assert.equal(read(disabled).trainingCallsAllowed,false);
 const selected=exposure(path.join(outputs,'forge-low-lr-r7-v2-20260906')),training={r3:read(path.join(selected.parent,'cases.private.json')).filter(c=>c.split==='train'),r7:selected.train};
 const main=read(path.join(outputs,'forge-final-three-hours-20260906/inference-review-data-v1/cases.private.json')),mainKeys=new Set(main.map(c=>digest(c.messages)));
 const mapping=original.map(c=>{assert.equal(c.task,'mechanism-stack');assert.equal(c.requestDigest,digest(c.messages));assert(!mainKeys.has(digest(c.messages)),'ALREADY_IN_MAIN_QUEUE');const r=reviews.find(r=>r.id===c.id);assert(r?.personallyReviewed&&r.trainingEligible===false);assert.equal(digest(r.acceptedTargets),digest(c.acceptedTargets));const input=JSON.parse(c.messages[1].content);assert.equal(input.request,r.request);for(const t of c.acceptedTargets)assert(validateCompositionValue({allowedPlans:input.allowedPlans},t).pass,'INVALID_TARGET_CONTRACT');return{id:c.id,inputSha256:digest(c.messages),task:c.task,members:[{dataset:name,id:c.id,split:c.split,expected:c.acceptedTargets,withdrawn:false}],conflictingLabels:false,knownWithdrawnLabel:false,scoringQualified:true,exposure:Object.fromEntries(Object.entries(training).map(([arm,rows])=>[arm,{exactTrainingInputSeen:rows.some(t=>digest(t.messages)===digest(c.messages)),fullSourceTextSeen:null}]))};});
 const cases=original.map(c=>({...c,split:'inference-review'}));fs.mkdirSync(out);const put=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 put('cases.private.json',cases);put('mapping.private.json',mapping);const request='chunk-001-mechanism-stack-requests.json';put(request,cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
 const manifest={createdAt:new Date().toISOString(),outputs,cohorts:[{name,file,sha256:fileHash(file),rows:20}],uniqueRequests:20,communityPlanned:0,taskCounts:{'mechanism-stack':20},chunks:[{name:'chunk-001-mechanism-stack',task:'mechanism-stack',count:20,ids:cases.map(c=>c.id),request,requestsSha256:fileHash(path.join(out,request))}],trainingCallsAllowed:false,checkpointSelectionAllowed:false,precisionSelectionAllowed:false,modifiedOriginalInputs:0,modifiedOriginalLabels:0,modelArms:['base','r3','r7'],pins:[self,disabled,file,path.join(root,'manifest.json'),path.join(root,'personal-review.json'),...receipt.sourceFiles.map(p=>p.path),...['cases.private.json','mapping.private.json',request].map(n=>path.join(out,n))].map(p=>({path:p,sha256:fileHash(p)})),scope:'Supplement to the 2695-case queue, not a restart of the expired R7 post run. Original reviewed requests and labels retained. Known composition families; not independent Owner Gold or current-engine certification.',releaseQualified:false};put('manifest.json',manifest);
 fs.writeFileSync(path.join(out,'INVENTORY.md'),'# 組合診斷補充隊列\n\n原composition-diagnostic-v2的20題：10接受、10拒絕，皆曾審查，皆不在2695題主隊列的完全相同輸入中。保留原始messages／答案；不訓練、不重選checkpoint、不重啟截止後的R7舊程序。已知組合家族，不是獨立Owner Gold。\n\n此處只是準備，須完成token長度檢查並取得三模型實際輸出才能宣稱已測。與主隊列分開報告，未增加語意家族數。\n',{flag:'wx'});
 return{out,rows:20,trained:false,executed:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===self)console.log(JSON.stringify(prepare(...process.argv.slice(2))));
