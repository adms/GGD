/** Read-only, post-selection review packet. This never changes scores or gates.
 * Generated rows are NOT marked personally reviewed by this script.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {collect} from './r6-final-report-v2.mjs';
import {fileHash} from './precision-diagnostic.mjs';
import {validateDiagnostic} from './r3-fidelity-diagnostic.mjs';

const read=p=>JSON.parse(fs.readFileSync(p));
const labels=['supported','contradicted','not-stated'];

export function triage(report,before='r3',after='selected'){
 const rows=[];
 for(const r of report.rows){
  const a=r.outputs[before],b=r.outputs[after];assert(a&&b);
  const flags=[];
  if(!a.score.unsafe&&b.score.unsafe)flags.push('new-unsafe');
  if(a.score.pass&&!b.score.pass)flags.push('regression');
  if(!a.score.pass&&b.score.pass)flags.push('fix');
  if(b.score.unsafe)flags.push('remaining-unsafe');
  if(!b.score.pass)flags.push('remaining-failure');
  if(flags.length)rows.push({id:r.id,task:r.task,flags,input:r.input,expected:r.expected,reason:r.reason??null,outputs:r.outputs,personalReviewStatus:'pending'});
 }
 const counts=Object.fromEntries(['new-unsafe','regression','fix','remaining-unsafe','remaining-failure'].map(k=>[k,rows.filter(r=>r.flags.includes(k)).length]));
 return{before,after,counts,rows,selectionAllowed:false,personalReviewComplete:false};
}

export function confusion(report,arm,task){
 const rows=report.rows.filter(r=>r.task===task);assert(rows.length);
 const matrix=Object.fromEntries(labels.map(v=>[v,Object.fromEntries([...labels,'invalid'].map(p=>[p,0]))]));
 for(const r of rows){
  const expected=r.expected[0].verdict;assert(labels.includes(expected));
  const o=r.outputs[arm],predicted=o.score.schema&&labels.includes(o.value?.verdict)?o.value.verdict:'invalid';
  matrix[expected][predicted]++;
 }
 const perClass=Object.fromEntries(labels.map(v=>{
  const support=Object.values(matrix[v]).reduce((a,b)=>a+b,0),predicted=labels.reduce((s,k)=>s+matrix[k][v],0),tp=matrix[v][v];
  return[v,{support,predicted,correct:tp,precision:predicted?tp/predicted:null,recall:support?tp/support:null}];
 }));
 return{task,arm,total:rows.length,matrix,perClass,scope:'Descriptive only. Invalid contracts remain errors. Correlated, curated cases are not random real-world samples; no population accuracy or statistical significance claim.'};
}

export function audit(root){
 const final=collect(root),persisted=read(path.join(root,'final-evidence-v2/summary.json'));
 assert.equal(final.adapterSha256,persisted.adapterSha256);assert.equal(final.selectedStep,persisted.selectedStep);
 assert.deepEqual(final.testScores,persisted.testScores);assert.deepEqual(final.measuredGates,persisted.measuredGates);
 const names=['test-report.json',...['new-source-63','previous-source-72','current-main-v4','hero-140','fidelity-114','vfx-118','composition-regression-20','source-clarification-15'].map(n=>'post-v1/'+n+'-report.json')];
 const reports=names.map(name=>({name,report:read(path.join(root,name))}));
 const groups=reports.map(({name,report})=>({name,vsR3:triage(report),vsBase:triage(report,'base'),confusions:['hero-source','owner-mechanism'].filter(task=>report.rows.some(r=>r.task===task)).flatMap(task=>['base','r3','selected'].map(arm=>confusion(report,arm,task)))}));
 const manifest=read(path.join(root,'dataset-manifest.json')),bundle=read(path.join(manifest.parent,'fidelity-diagnostic-v2/bundle.private.json')),bundles={};
 for(const arm of ['base','r3','selected']){
  const replay=validateDiagnostic(bundle,read(path.join(root,'post-v1/fidelity-114-'+arm+'.json')));
  assert.deepEqual(replay,read(path.join(root,'post-v1/fidelity-bundles-'+arm+'.json')));bundles[arm]=replay;
 }
 const selectedBundle=bundles.selected.counts;
 return{createdAt:new Date().toISOString(),root,selectedStep:final.selectedStep,newAdapterSelected:final.newAdapterSelected,adapterSha256:final.adapterSha256,groups,bundles,wholeProposalEvidence:{selectedCorrect:selectedBundle.correctGates,total:selectedBundle.plans,unsafeAccepts:selectedBundle.unsafeWholeProposalAccepts,allBoundedChecklistDecisionsCorrect:selectedBundle.correctGates===selectedBundle.plans&&selectedBundle.unsafeWholeProposalAccepts===0,completeOwnerCoverage:false},reportPins:names.map(n=>({path:path.join(root,n),sha256:fileHash(path.join(root,n))})),personalReviewComplete:false,selectionChanged:false,trainingAllowed:false,activation:false,releaseQualified:false};
}

function render(r){
 const lines=['# R6 結果逐題複核待辦','','本文件由原始結果產生，**不代表每題已親自複核**；不更改分數、答案、門檻或選模。','',`選定step ${r.selectedStep}；${r.newAdapterSelected?'有選中本輪權重':'保留原R3，不能當新微調收益'}。`,'','每組獨立列出對R3的变化；「新增錯誤放行」可能出現在前後都答錯的題，不能只看退步數。','','| 題組 | 修正 | 答對變錯 | 新增錯誤放行 | 仍錯誤放行 | 仍答錯 |','| --- | ---: | ---: | ---: | ---: | ---: |'];
 for(const g of r.groups){const c=g.vsR3.counts;lines.push(`| ${g.name} | ${c.fix} | ${c.regression} | ${c['new-unsafe']} | ${c['remaining-unsafe']} | ${c['remaining-failure']} |`);}
 lines.push('','## 完整提案／反向遺漏檢查','','不是把114個單句正確率當成18份整體提案的通過率。这里只能涵蓋已人工列出的機制需求，不能宣稱完整Owner文字全涵蓋。','','| 模型 | 整體決策正確 | 錯誤放行不完整／錯誤提案 |','| --- | ---: | ---: |');
 for(const [arm,b] of Object.entries(r.bundles))lines.push(`| ${arm} | ${b.counts.correctGates}/${b.counts.plans} | ${b.counts.unsafeWholeProposalAccepts} |`);
 lines.push('','JSON提供三類混淆矩陣、逐類precision/recall及完整錯題原文。各題有來源關聯，而且題集經挑選，不以此計算或宣稱母體準度、統計顯著性或所有英雄泛化。','','人工複核需另記錄實際看過的題與理由；生成器不自動填入reviewed。','');return lines.join('\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(process.argv[2]),out=path.join(root,'priority-error-review-v1');assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const result=audit(root);fs.mkdirSync(out);
 fs.writeFileSync(path.join(out,'review-packet.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(out,'REVIEW.md'),render(result),{flag:'wx'});
 console.log(JSON.stringify({out,personalReviewComplete:false,wholeProposalEvidence:result.wholeProposalEvidence,groups:result.groups.map(g=>({name:g.name,counts:g.vsR3.counts}))}));
}
