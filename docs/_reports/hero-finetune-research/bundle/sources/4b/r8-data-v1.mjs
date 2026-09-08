/** Prospective corpus only: source rehearsal + reviewed seven-hero sources + capability correction.
 * Not an LR ablation. Never rewrites R6/R7 data, or turns ambiguous former positives into refusals.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{fileURLToPath}from'node:url';
import{digest}from'./dataset.mjs';import{fileHash}from'./precision-diagnostic.mjs';import{validateCases}from'./r3-data.mjs';
const self=fileURLToPath(import.meta.url),dir=path.dirname(self),read=p=>JSON.parse(fs.readFileSync(p));
export const correctionId='wave-terminal-evidence-v1';
export const correctedDescriptions={
 'tpl-traveling-wave':'沿面向逐段推進的圓形傷害，每段重抓敵人，整串每人只中一次，可調節拍。限不帶終點爆炸模式：須明確移除terminalBurst、不繼承其預設。現版終點爆炸會漏打最後一段新命中者，不能承諾完整獨立終點爆炸。不是碰撞投射物，非同幀全線命中。',
 'tpl-line-blast':'一具模型沿指定方向推進，沿途以圓形取樣重抓敵人，每人沿途只中一次；抵達再用獨立排程範圍爆炸，沿途已命中者仍可再中爆炸。不移動施法者，不是有血條召喚物。取樣節拍由旅行時間及取樣上限決定，不保證任意獨立步距、段數和間隔。',
};
export const withdrawnIds=['r6-stack-main-candidate-traveling-wave-supported','main-candidate-traveling-wave-supported'];
function patchEntry(e){const id=e.templateId??e.id;if(!Object.hasOwn(correctedDescriptions,id))return e;const x={...e,description:correctedDescriptions[id]};if(id==='tpl-traveling-wave'&&Array.isArray(e.requiredChoices))x.requiredChoices=[...e.requiredChoices,'明確省略terminalBurst；不能繼承它的預設，也不將終點漏打當作完整爆炸能力。'];return x;}
export function reviseInput(u){const v=structuredClone(u);let changed=false;for(const k of['catalog','allowedPlans'])if(Array.isArray(v[k])){const next=v[k].map(patchEntry);changed||=JSON.stringify(next)!==JSON.stringify(v[k]);v[k]=next;}if(changed)v.capabilityRevision=correctionId;return{input:v,changed};}
export function build(prior,community,catalog){
 const cases=[],changes=[],withdrawn=[];
 for(const c of prior){
  if(withdrawnIds.includes(c.id)){assert.equal(c.split,'train');withdrawn.push({original:c,reason:'Terminal-positive label lacks runtime support. Independent timing meaning is ambiguous: do not relabel as blanket refuse or promise line-blast handles arbitrary cadence.'});continue;}
  const r=reviseInput(JSON.parse(c.messages[1].content));const next=structuredClone(c);
  if(r.changed){next.messages[1].content=JSON.stringify(r.input);next.requestDigest=digest(next.messages);next.capabilityCorrection=correctionId;changes.push({id:c.id,split:c.split,task:c.task,oldRequestDigest:c.requestDigest,newRequestDigest:next.requestDigest,targetChanged:false});}
  cases.push(next);
 }
 assert.equal(withdrawn.length,2);
 // Unambiguous independently tested replacement, one per existing response contract.
 for(const task of['mechanism-template','mechanism-stack']){
  const old=withdrawn.find(w=>w.original.task===task).original,r=reviseInput(JSON.parse(old.messages[1].content)),id=`r8-lineblast-independent-terminal-${task}`;
  r.input.request='一具模型朝前方推進，沿途以圓形範圍尋找敵人，同一敵人沿途只受傷一次；抵達後另外範圍爆炸，沿途已受傷而仍在爆炸圈內的人也要受到爆炸。不要求獨立指定取樣間隔、段數或步距。';
  const target=task==='mechanism-stack'?{decision:'accept',templateIds:['tpl-line-blast'],onConflict:'reject'}:{decision:'accept',templateId:'tpl-line-blast'},messages=[old.messages[0],{role:'user',content:JSON.stringify(r.input)}];
  cases.push({...structuredClone(old),id,lineage:'r8-lineblast-explicit-independent-arrival',messages,requestDigest:digest(messages),target,acceptedTargets:[target],reviewReason:'tpl-line-blast has separate onTouch/onArrive queues. Preserved real SimWorld evidence includes earlier-hit and first-at-final targets. Explicitly does not request independent arbitrary cadence.',cohort:'r8-runtime-clarified-training',capabilityCorrection:correctionId});
 }
 for(const c of community)cases.push(structuredClone(c));
 cases.sort((a,b)=>digest('r8-v1:'+a.id).localeCompare(digest('r8-v1:'+b.id)));validateCases(cases);
 const counts=Object.fromEntries(['train','dev','test'].map(s=>[s,cases.filter(c=>c.split===s).length]));assert.deepEqual(counts,{train:550,dev:179,test:228});
 for(const c of cases){const u=JSON.parse(c.messages[1].content);for(const key of['catalog','allowedPlans'])for(const e of u[key]??[]){if((e.templateId??e.id)==='tpl-traveling-wave')assert.equal(e.description,correctedDescriptions['tpl-traveling-wave']);}assert(!withdrawnIds.includes(c.id));}
 const sourceUnchanged=prior.filter(c=>['hero-source','owner-mechanism'].includes(c.task));for(const c of sourceUnchanged)assert.deepEqual(cases.find(x=>x.id===c.id),c,'OLD_SOURCE_CHANGED');
 const newCatalog={...structuredClone(catalog),allowedPlans:catalog.allowedPlans.map(patchEntry),capabilityRevision:correctionId,releaseQualified:false,scope:catalog.scope+' Corrected traveling-wave no-terminal and line-blast independent arrival capability evidence; not a production engine change.'};
 return{cases,changes,withdrawn,counts,catalog:newCatalog,oldSourceRowsUnchanged:sourceUnchanged.length};
}
export function prepare(parent,community,extension,out){
 assert([parent,community,extension,out].every(path.isAbsolute));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const cm=read(path.join(community,'manifest.json')),a=read(path.join(community,'ADMISSION.json'));assert(a.rebuiltExactly&&a.allPromptsFit&&a.trainingRowsAdmitted===84);
 for(const p of [...cm.codePins,...cm.sourcePins,...cm.priorAuditPins])assert.equal(fileHash(p.path),p.sha256,'COMMUNITY_PIN_CHANGED');
 const proof=path.join(extension,'wave-no-terminal-admission-v1.json'),p=read(proof);assert(p.completeAuthoringEquivalence&&p.rows.length===6&&!p.newRuntimeSimulation);
 const runtimeProof=path.join(path.dirname(parent),'forge-additional-four-hours-20260906/wave-equivalence-probe-v1.json');assert.equal(fileHash(runtimeProof),p.probeSha256);const rp=read(runtimeProof);
 for(const c of rp.cases.filter(c=>c.scenario!=='near-and-end')){const arm=c.arms.find(a=>a.kind==='tpl-line-blast'&&a.mutation===null);assert(arm&&arm.measured.every(m=>m.events.length===2),'LINEBLAST_INDEPENDENT_BURST_NOT_VERIFIED');}
 const prior=read(path.join(parent,'cases.private.json')),cc=read(path.join(community,'cases.private.json')),data=build(prior,cc,read(path.join(parent,'catalog.json')));assert.equal(digest(cc),cm.casesSha256);
 fs.mkdirSync(out,{recursive:true});const put=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});put('cases.private.json',data.cases);put('catalog.json',data.catalog);put('withdrawn-labels.json',data.withdrawn);put('changed-inputs.json',data.changes);
 for(const split of['train','dev','test']){const rows=data.cases.filter(c=>c.split===split);put(split+'-requests.json',rows.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));}
 fs.writeFileSync(path.join(out,'train.jsonl'),data.cases.filter(c=>c.split==='train').map(({id,messages,target})=>JSON.stringify({id,messages,target})).join('\n')+'\n',{flag:'wx'});
 const sourcePaths=[self,path.join(dir,'r3-data.mjs'),path.join(dir,'dataset.mjs'),path.join(parent,'cases.private.json'),path.join(parent,'catalog.json'),path.join(community,'cases.private.json'),path.join(community,'manifest.json'),path.join(community,'ADMISSION.json'),proof,runtimeProof];
 put('DATA_PREPARATION.json',{schema:'ggd-r8-prospective-source-rehearsal@1',preparedAt:new Date().toISOString(),parent,community,extension,counts:data.counts,casesSha256:digest(data.cases),oldSourceRowsUnchanged:data.oldSourceRowsUnchanged,changedInputCounts:Object.fromEntries(['train','dev','test'].map(s=>[s,data.changes.filter(c=>c.split===s).length])),removedTrainingRows:2,replacementTrainingRows:2,newCommunityTrainingRows:84,trainRows:550,sourcePins:sourcePaths.map(p=>({path:p,sha256:fileHash(p)})),trainingStarted:false,trainingPolicyChosen:false,baseAdapterChosen:false,releaseQualified:false,limitations:['Source/catalog/data changes together: not an LR-only ablation.','Original R7 data and all historical scores remain frozen.','New inputs require identical fresh control/candidate evaluation.','Two ambiguous former requests are preserved in withdrawn-labels, not mislabeled as refuse.','Community test already observed in classical retrieval probe; no use for neural tuning or checkpoint selection.','Full old template and composition task scope retained; no blanket-refuse workaround.']});
 fs.writeFileSync(path.join(out,'DATA_REVIEW.md'),['# R8預備資料：原文保留、新角色、能力校正','','550 train／179 dev／228 test；目前只是資料準備，沒有啟動訓練或選定超參數。','','- R7原英雄／Owner來源資料逐筆不變。','- 兩個舊wave terminal-positive保留原文與原答案但退出train；不是直接改成refuse。','- 同數量補入明確不要求獨立任意節拍的line-blast行進＋獨立終點爆炸正例，單卡和多卡接口各一。','- traveling-wave保留無terminal模式；可合法省略terminalBurst，與既有SimWorld無terminal控制的完整ability逐欄相同。','- 所有受影響輸入的目錄同步改寫，新requestDigest逐筆記錄；舊R6/R7分數不重算或洗掉。','- 七角色84 train、21 dev、42 test保持原切分，額外effects不當模板原生能力。','- 所有舊來源／模板／多卡測試範圍保留；不以縮小用途來提高過關率。','- 下一輪若啟動，需要全新控制組評測、固定選模規則、token預算、GPU獨占及明確截止。',''].join('\n'),{flag:'wx'});
 return{out,counts:data.counts,changedInputs:data.changes.length,oldSourceRowsUnchanged:data.oldSourceRowsUnchanged,trainingStarted:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===self)console.log(JSON.stringify(prepare(...process.argv.slice(2))));
