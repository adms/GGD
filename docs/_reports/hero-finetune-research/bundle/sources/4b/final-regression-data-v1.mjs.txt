/** Frozen broader regression inputs. No new training, model selection, or historical rewrite. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{fileURLToPath}from'node:url';
import{digest}from'./dataset.mjs';import{fileHash}from'./precision-diagnostic.mjs';import{reviseInput,correctionId}from'./r8-data-v1.mjs';import{score}from'./r6-score.mjs';
const self=fileURLToPath(import.meta.url),dir=path.dirname(self),read=p=>JSON.parse(fs.readFileSync(p));
export const definitions=[
 ['source-63-regression','forge-low-lr-r7-v2-20260906/fresh-source-v1',63],
 ['previous-source-72','forge-contrastive-r5-20260906/fresh-source-diagnostic-v1',72],
 ['current-main-v4-corrected','forge-mechanism-priority-r3-20260906/main-diagnostic-v4',40],
 ['hero-140','forge-mechanism-priority-r3-20260906/main-hero-diagnostic-v1',140],
 ['fidelity-114','forge-mechanism-priority-r3-20260906/fidelity-diagnostic-v2',114],
 ['vfx-118','forge-source-calibration-r4-20260906/post-diagnostics-v2',118,'vfx-'],
 ['composition-regression-20','forge-additional-four-hours-20260906/composition-diagnostic-v2',20],
 ['source-clarification-15','forge-additional-four-hours-20260906/source-label-clarification-v1',15],
];
export function build(groups,train){
 const cases=[],changes=[],labels=[],manifestGroups=[];
 for(const g of groups){assert.equal(g.cases.length,g.count);const ids=[];
  for(const old of g.cases){const c=structuredClone(old),r=reviseInput(JSON.parse(c.messages[1].content));assert.notEqual(c.split,'train');
   if(r.changed){c.messages[1].content=JSON.stringify(r.input);c.requestDigest=digest(c.messages);c.capabilityCorrection=correctionId;changes.push({id:c.id,group:g.name,oldRequestDigest:old.requestDigest,newRequestDigest:c.requestDigest});}
   if(c.id==='main-diagnostic-v4-wave-terminal'){
    assert.equal(JSON.parse(c.messages[1].content).request,'分段前進的傷害波，前進中每人只中一次，最後另一次終點範圍爆炸；允許兩段分開算。');assert.deepEqual(c.acceptedTargets,[{decision:'accept',templateId:'tpl-traveling-wave'}]);
    c.target={decision:'accept',templateId:'tpl-line-blast'};c.acceptedTargets=[c.target];c.reviewReason='Corrected from runtime evidence, before final-model evaluation: independently scheduled arrival damage is required; tpl-line-blast separately hits both earlier and final-first targets. No independently arbitrary cadence, segment count or step distance is requested. traveling-wave terminal can omit the last-new target and is not sufficient.';
    labels.push({id:c.id,group:g.name,original:old,revisedTarget:c.target,revisedAcceptedTargets:c.acceptedTargets,reason:c.reviewReason});
   }else assert.deepEqual(c.acceptedTargets,old.acceptedTargets);
   assert(c.acceptedTargets.every(t=>score(c,t).pass),'ILLEGAL_EXPECTED:'+c.id);ids.push(c.id);cases.push(c);
  }
  manifestGroups.push({name:g.name,count:g.count,ids,exactTrainRequestOverlap:cases.filter(c=>ids.includes(c.id)&&train.some(t=>t.requestDigest===c.requestDigest)).map(c=>c.id)});
 }
 assert.equal(cases.length,582);assert.equal(new Set(cases.map(c=>c.id)).size,582);assert.equal(labels.length,1);
 return{cases,changes,labels,groups:manifestGroups};
}
export function prepare(outputs,r8,out){
 assert([outputs,r8,out].every(path.isAbsolute));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const sourcePaths=[];
 const groups=definitions.map(([name,relative,count,prefix=''])=>{const root=path.join(outputs,relative),cp=path.join(root,prefix+'cases.private.json'),rp=path.join(root,prefix+'requests.json'),cases=read(cp);assert.deepEqual(read(rp),cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));sourcePaths.push(cp,rp);return{name,count,cases};});
 const trainPath=path.join(r8,'cases.private.json'),proofPath=path.join(outputs,'forge-additional-four-hours-20260906/wave-equivalence-probe-v1.json'),proof=read(proofPath),admissionPath=path.join(outputs,'forge-final-three-hours-20260906/wave-no-terminal-admission-v1.json'),admission=read(admissionPath);assert.equal(admission.probeSha256,fileHash(proofPath));assert(admission.completeAuthoringEquivalence);
 for(const c of proof.cases.filter(c=>c.scenario!=='near-and-end'))assert(c.arms.find(a=>a.kind==='tpl-line-blast'&&a.mutation===null).measured.every(m=>m.events.length===2));
 const data=build(groups,read(trainPath).filter(c=>c.split==='train'));fs.mkdirSync(out);const put=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 put('cases.private.json',data.cases);put('requests.json',data.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));put('changed-inputs.json',data.changes);put('corrected-labels.json',data.labels);
 const fidelityBundle=path.join(outputs,'forge-mechanism-priority-r3-20260906/fidelity-diagnostic-v2/bundle.private.json');sourcePaths.push(trainPath,proofPath,admissionPath,fidelityBundle);
 put('manifest.json',{schema:'ggd-final-broader-regression@1',createdAt:new Date().toISOString(),outputs,r8,groups:data.groups,rows:582,casesSha256:digest(data.cases),requestsSha256:fileHash(path.join(out,'requests.json')),correctedLabels:1,changedInputs:data.changes.length,correctionId,fidelityBundle,sourcePins:sourcePaths.map(p=>({path:p,sha256:fileHash(p)})),codePins:[self,...['r8-data-v1.mjs','dataset.mjs','precision-diagnostic.mjs','r6-score.mjs','r3-score.mjs','classification-score.mjs','composition-client.mjs'].map(n=>path.join(dir,n))].map(p=>({path:p,sha256:fileHash(p)})),trainingAllowed:false,checkpointSelectionAllowed:false,precisionSelectionAllowed:false,independentHumanGold:false,previouslyExposedRegression:true,historicalScoresRewritten:false,releaseQualified:false});
 fs.writeFileSync(path.join(out,'REVIEW.md'),['# 最終較廣回歸資料校正','','固定 8 組、582 題，所有原始題組與舊成績不改。這是已曝光的回歸測試，不是新的獨立泛化證據。','','- 全部受影響目錄同步更新 traveling-wave 無 terminal 限制及 line-blast 獨立抵達傷害能力。','- 僅修正 `main-diagnostic-v4-wave-terminal` 一題答案；原題没有要求任意獨立節拍，line-blast 的兩段獨立傷害有實際 SimWorld 控制組證據。','- 原完整題、原答案、校正理由留在 corrected-labels.json；其他答案逐欄不變。','- 不以這些結果選訓練 checkpoint 或量化精度，不回填訓練。','- native、融合 BF16、固定 8bit 須全部同題重跑，另保留 18 組整段提案／逐項回查檢查。','- 12GiB 推論上限不代表 16GB Mac 實機已驗證。',''].join('\n'),{flag:'wx'});
 return{out,rows:582,changedInputs:data.changes.length,correctedLabels:1,trainingAllowed:false};
}
export function verify(root){const m=read(path.join(root,'manifest.json'));for(const p of[...m.sourcePins,...m.codePins])assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED:'+p.path);const cs=read(path.join(root,'cases.private.json'));assert.equal(digest(cs),m.casesSha256);assert.equal(fileHash(path.join(root,'requests.json')),m.requestsSha256);assert.deepEqual(read(path.join(root,'requests.json')),cs.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));const rebuilt=build(definitions.map(([name,relative,count,prefix=''])=>({name,count,cases:read(path.join(m.outputs,relative,prefix+'cases.private.json'))})),read(path.join(m.r8,'cases.private.json')).filter(c=>c.split==='train'));assert.deepEqual(cs,rebuilt.cases);assert.deepEqual(read(path.join(root,'corrected-labels.json')),rebuilt.labels);assert.deepEqual(read(path.join(root,'changed-inputs.json')),rebuilt.changes);assert.deepEqual(m.groups,rebuilt.groups);const b=read(path.join(root,'token-budget.json'));assert(b.allFit&&b.cpuOnly&&!b.thinking);assert.equal(b.requestsSha256,m.requestsSha256);assert.equal(b.count,582);return m;}
if(process.argv[1]&&path.resolve(process.argv[1])===self)console.log(JSON.stringify(prepare(...process.argv.slice(2))));
