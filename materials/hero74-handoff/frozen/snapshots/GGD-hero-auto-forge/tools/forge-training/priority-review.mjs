/** Supplemental user-priority review; never changes the frozen macro experiment. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {summarizeClassification} from './classification-score.mjs';
const task='mechanism-template',sha=x=>crypto.createHash('sha256').update(x).digest('hex');
export function mechanismEligible(s,p){const t=s.tasks[task];return t.total>0&&100*t.passed/t.total>=p.mechanismEligibility.minAccuracyPct&&t.unsafe===0&&t.decisionPassed===t.total&&t.schemaPassed===t.total;}
export function rankCandidates(candidates,p){
 if(p.schema!=='ggd-forge-user-priority@1'||p.mechanismEligibility.minAccuracyPct!==95)throw Error('UNRECOGNIZED_PRIORITY_POLICY');
 if(!candidates.length||new Set(candidates.map(c=>c.epoch)).size!==candidates.length)throw Error('INVALID_CANDIDATES');
 return [...candidates].sort((a,b)=>{const x=a.score.tasks[task],y=b.score.tasks[task];if(!x||!y||x.total!==y.total||x.total<=0)throw Error('INCOMPARABLE_DEV');
  return Number(mechanismEligible(b.score,p))-Number(mechanismEligible(a.score,p))||y.passed-x.passed||x.unsafe-y.unsafe||y.decisionPassed-x.decisionPassed||y.schemaPassed-x.schemaPassed||b.score.tasks['vfx-semantic'].passed-a.score.tasks['vfx-semantic'].passed||a.epoch-b.epoch;});
}
export function auditMechanisms(A,B,dev,p){
 const a=A.rows.filter(r=>r.task===task),b=B.rows.filter(r=>r.task===task);
 if(!a.length||a.length!==b.length||a.length!==A.tasks[task].total||b.length!==B.tasks[task].total||a.some((r,i)=>r.id!==b[i].id)||new Set(a.map(r=>r.id)).size!==a.length)throw Error('INCOMPLETE_MECHANISM_PAIRS');
 for(const [rows,s] of [[a,A],[b,B]])for(const [field,flag] of [['passed','pass'],['schemaPassed','schemaPass'],['decisionPassed','decisionPass'],['unsafe','unsafe']])if(rows.filter(r=>r[flag]).length!==s.tasks[task][field])throw Error('MECHANISM_SUMMARY_MISMATCH');
 const pairs={fixed:0,regressed:0,bothCorrect:0,bothWrong:0},regressions=[],unresolved=[];
 for(let i=0;i<a.length;i++){pairs[a[i].pass&&b[i].pass?'bothCorrect':!a[i].pass&&b[i].pass?'fixed':a[i].pass&&!b[i].pass?'regressed':'bothWrong']++;if(a[i].pass&&!b[i].pass)regressions.push(b[i].id);if(!b[i].pass||!b[i].schemaPass||!b[i].decisionPass||b[i].unsafe)unresolved.push(b[i].id);}
 const x=A.tasks[task],y=B.tasks[task],noRegression=pairs.regressed===0&&y.decisionPassed>=x.decisionPassed&&y.schemaPassed>=x.schemaPassed&&y.unsafe<=x.unsafe;
 const gate=mechanismEligible(dev,p)&&mechanismEligible(B,p)&&noRegression&&pairs.fixed>0;
 return{scope:'mechanism classification only, not complete hero-setting or multi-skill fidelity',base:x,candidate:y,pairs,regressions,unresolved,noRegression,mechanismResearchGate:gate,disposition:gate?'mechanism-research-candidate-only':'keep-base-do-not-promote',heroSettingStatus:p.heroSettingStatus,wholeGoalQualified:false,releaseQualified:false};
}
export function checkPairMetadata(a,b,adapter){
 if(a.metadata?.adapter!==null||b.metadata?.adapter!==adapter||!a.metadata?.modelPath||a.metadata.modelPath!==b.metadata?.modelPath||a.metadata.thinking!==false||b.metadata.thinking!==false)throw Error('TEST_MODEL_OR_ADAPTER_MISMATCH');
}
async function main(){
 const [mode,root]=process.argv.slice(2);if(!['select','report'].includes(mode)||!path.isAbsolute(root??''))throw Error('usage: priority-review.mjs select|report ABSOLUTE_RUN');
 const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8')),put=(n,x)=>fs.writeFileSync(path.join(root,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'}),fileHash=n=>sha(fs.readFileSync(path.join(root,n)));
 const p=read('priority-policy.json'),cases=read('cases.private.json'),pins={policySha256:fileHash('priority-policy.json'),casesSha256:fileHash('cases.private.json')};
 if(mode==='select'){
  const config=read('workflow-config.json'),adapterRoot=path.join(config.runtime,path.basename(root)+'-adapter');
  const epochs=JSON.parse(fs.readFileSync(path.join(adapterRoot,'training-run.json'),'utf8')).recipe.epochs;
  const candidates=[];for(let epoch=1;epoch<=epochs;epoch++){
   const raw=read('dev-'+epoch+'.json'),score=summarizeClassification(cases.filter(c=>c.split==='dev'),raw),adapter=path.join(adapterRoot,'epoch-'+epoch);
   if(raw.metadata?.adapter!==adapter||raw.metadata?.modelPath!==config.model||raw.metadata.thinking!==false)throw Error('DEV_MODEL_OR_ADAPTER_MISMATCH');
   candidates.push({epoch,adapter,adapterSha256:sha(fs.readFileSync(path.join(adapter,'adapters.safetensors'))),devResultSha256:fileHash('dev-'+epoch+'.json'),score});
  }
  const ranked=rankCandidates(candidates,p),selected=ranked[0];put('priority-selection.json',{...pins,selectedAt:new Date().toISOString(),selectionUses:'dev only; no test input read by this command',selected,rankedEpochs:ranked.map(c=>c.epoch),originalEpoch:read('selection.json').epoch,heroSettingStatus:p.heroSettingStatus,wholeGoalQualified:false});
  console.log(JSON.stringify({priorityEpoch:selected.epoch,mechanismDev:selected.score.tasks[task],rankedEpochs:ranked.map(c=>c.epoch)}));return;
 }
 const chosen=read('priority-selection.json');if(chosen.policySha256!==pins.policySha256||chosen.casesSha256!==pins.casesSha256)throw Error('PRIORITY_INPUT_CHANGED');
 if(sha(fs.readFileSync(path.join(chosen.selected.adapter,'adapters.safetensors')))!==chosen.selected.adapterSha256)throw Error('PRIORITY_ADAPTER_CHANGED');
 if(fileHash('dev-'+chosen.selected.epoch+'.json')!==chosen.selected.devResultSha256)throw Error('PRIORITY_DEV_CHANGED');
 const original=read('selection.json'),same=original.epoch===chosen.selected.epoch;
 // A different dev-selected epoch needs its own fixed test output, never a score substitution.
 const rawName=same?'test-B.json':'priority-test-B.json';if(!fs.existsSync(path.join(root,rawName)))throw Error('PRIORITY_TEST_REQUIRED:'+chosen.selected.adapter);
 const raw=read(rawName),baseRaw=read('test-A.json');checkPairMetadata(baseRaw,raw,chosen.selected.adapter);
 const dev=summarizeClassification(cases.filter(c=>c.split==='dev'),read('dev-'+chosen.selected.epoch+'.json'));if(JSON.stringify(dev)!==JSON.stringify(chosen.selected.score))throw Error('PRIORITY_DEV_SCORE_CHANGED');
 const test=cases.filter(c=>c.split==='test'),A=summarizeClassification(test,baseRaw),B=summarizeClassification(test,raw),review=auditMechanisms(A,B,dev,p);
 const detail=review.unresolved.map(id=>{const c=test.find(c=>c.id===id),r=raw.results.find(r=>r.id===id);return{id,request:c.originalInput??c.messages,target:c.target,acceptedTargets:c.acceptedTargets,actual:r.value};});
 put('priority-review.json',{...pins,...review,selectedEpoch:chosen.selected.epoch,sameAsOriginalSelection:same,testResultSha256:fileHash(rawName),unresolvedDetails:detail});
 const fmt=t=>`${t.passed}/${t.total}`;
 fs.writeFileSync(path.join(root,'PRIORITY_RESULTS.md'),`# 英雄設定／機制優先驗收\n\n英雄設定：**尚未驗證**。完整目標與正式啟用：**未通過**。\n\n機制優先權重：epoch ${chosen.selected.epoch}；僅以 dev 選擇，與原 macro 選擇${same?'相同':'不同'}。\n\n| 機制指標 | 基底 | 微調 |\n|---|---:|---:|\n| 分類 | ${fmt(review.base)} | ${fmt(review.candidate)} |\n| 決策 | ${review.base.decisionPassed}/${review.base.total} | ${review.candidate.decisionPassed}/${review.candidate.total} |\n| 格式 | ${review.base.schemaPassed}/${review.base.total} | ${review.candidate.schemaPassed}/${review.candidate.total} |\n| 錯誤接受 | ${review.base.unsafe} | ${review.candidate.unsafe} |\n\n修正 ${review.pairs.fixed} 題；退步 ${review.pairs.regressed} 題；兩者皆錯 ${review.pairs.bothWrong} 題。\n\n機制研究門檻：${review.mechanismResearchGate?'通過，但非完整英雄資格':'未通過；不晉級'}。特效分數不抵銷機制錯誤。\n\n未解決題目：${review.unresolved.join('、')||'此固定機制切片內無'}。逐題資料見 priority-review.json。\n\n這是助手審查的目錄分類研究集，未驗證完整英雄設定、所有原始技能、任意組合或真實 16GB 裝置。原 A/B 與評分不改寫。\n`,{flag:'wx'});
 console.log(JSON.stringify({...review,unresolved:review.unresolved.length}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
