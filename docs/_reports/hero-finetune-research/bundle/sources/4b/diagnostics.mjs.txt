import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {writeJSON,digest} from './dataset.mjs';
import {score} from './scorer.mjs';
import {literalRuleProposal} from './rules.mjs';
const root=path.resolve(process.argv[2]),repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const state=read('state.json'),comparison=read('comparison.json'),cases=read('cases.private.json');
assert.equal(state.status,'pipeline-complete-unqualified');
const dir=path.join(root,'diagnostics');fs.mkdirSync(dir,{recursive:true});
const rules=cases.map(c=>{const start=performance.now(),value=literalRuleProposal(c.messages);return{id:c.id,value,seconds:(performance.now()-start)/1000,score:score(c,value)};});
const all=[...comparison.rows.flatMap(r=>['A','B'].map(k=>({id:k+':'+r.id,value:r[k].value}))),...rules.map(r=>({id:'rule:'+r.id,value:r.value}))];
writeJSON(path.join(dir,'engine-input.json'),all);
execFileSync(process.execPath,['--import',path.join(repo,'node_modules/tsx/dist/loader.mjs'),path.join(repo,'tools/forge-training/engine.ts'),'validate',path.join(dir,'engine-input.json'),path.join(dir,'engine-results.json')],{cwd:repo,timeout:60000,stdio:'pipe'});
const engine=JSON.parse(fs.readFileSync(path.join(dir,'engine-results.json'))).results;
assert.equal(engine.length,all.length);
const ratio=(passed,total)=>({passed,total,rate:total?passed/total:null});
const statistics={};
for(const key of ['A','B']){
 const raw=JSON.parse(fs.readFileSync(state.stages['test-'+key].output)),rows=comparison.rows.map(r=>r[key]);
 const eligible=rows.filter(r=>['proposed','degraded'].includes(cases.find(c=>c.id===r.id).spec.outcome));
 const refused=rows.filter(r=>cases.find(c=>c.id===r.id).spec.outcome==='refused');
 const advice=rows.filter(r=>cases.find(c=>c.id===r.id).spec.outcome==='advice');
 const groups={};for(const r of rows){const family=cases.find(c=>c.id===r.id).familyId;const g=groups[family]??={passed:0,total:0};g.passed+=Number(r.score.pass);g.total++;}
 const generationSeconds=rows.reduce((s,r)=>s+r.seconds,0),tokens=rows.reduce((s,r)=>s+r.tokens,0),passed=rows.filter(r=>r.score.pass).length;
 statistics[key]={firstOutput:ratio(passed,rows.length),jsonParsed:ratio(rows.filter(r=>r.error===null&&r.value!==null).length,rows.length),engineContractAndScenario:ratio(engine.filter(r=>r.id.startsWith(key+':')&&r.pass).length,rows.length),unsupportedBlocked:ratio(refused.filter(r=>r.score.pass).length,refused.length),correctClarification:ratio(advice.filter(r=>r.score.pass).length,advice.length),overRefusal:ratio(eligible.filter(r=>r.value?.outcome==='refused').length,eligible.length),critical:rows.filter(r=>r.score.critical).length,groups,cost:{loadSeconds:raw.metadata.loadSeconds,loadCondition:'fresh process; filesystem cache may be warm, not a cold-disk benchmark',generationSeconds,tokens,secondsPerSuccessfulFirstOutput:passed?generationSeconds/passed:null,meanTokens:tokens/rows.length,aggregateTokensPerSecond:tokens/generationSeconds,retries:0,manualEditingCost:'not-measured',electricityCost:'not-measured',apiSpendUSD:0}};
}
const ruleSummary={status:'post-hoc-literal-grammar-comparator',notPreregistered:true,notUsedToSelectOrTrain:true,sourceDigest:digest(fs.readFileSync(new URL('./rules.mjs',import.meta.url),'utf8')),results:rules,bySplit:Object.fromEntries(['train','dev','test'].map(split=>{const rows=rules.filter(r=>cases.find(c=>c.id===r.id).split===split);return[split,ratio(rows.filter(r=>r.score.pass&&engine.find(e=>e.id==='rule:'+r.id).pass).length,rows.length)];})),scope:'Recognizes only the authored literal grammar. Unknown paraphrases abstain. This does not establish rule coverage of real Owner requests.'};
writeJSON(path.join(dir,'rule-comparison.json'),ruleSummary);
const report={status:'diagnostic-only',originalComparisonDigest:digest(comparison),statistics,uncertainty:{confidenceInterval:null,reason:'Only four eligible compositional families from one authored grammar; no independent human-confirmed source families. A population/generalization interval would be misleading.',eligibleFamilyCount:4,humanConfirmed:0,seedReplications:1,order:'A then B; no AB/BA counterbalancing',notProven:['natural-language paraphrase generalization','friend/out-of-range negative target behavior','status expiry and onHit/onMiss scenarios','visual quality','16GB hardware','end-to-end human editing cost']},ruleComparison:'rule-comparison.json',candidatePromotion:false};
writeJSON(path.join(dir,'metrics.json'),report);
fs.writeFileSync(path.join(dir,'REPORT.md'),['# 補充診斷：規則、成本與證據邊界','','本報告在 A/B 完成後補算；不修改原 scorer、test、候選或配方。','','| 指標 | A | B |','| --- | ---: | ---: |',...['jsonParsed','engineContractAndScenario','unsupportedBlocked','correctClarification','overRefusal'].map(k=>`| ${k} | ${statistics.A[k].passed}/${statistics.A[k].total} | ${statistics.B[k].passed}/${statistics.B[k].total} |`),'',`總生成 token：A ${statistics.A.cost.tokens}；B ${statistics.B.cost.tokens}。每個首次成功結果攤提生成秒數：A ${statistics.A.cost.secondsPerSuccessfulFirstOutput.toFixed(3)}；B ${statistics.B.cost.secondsPerSuccessfulFirstOutput.toFixed(3)}。不是人工修正／整機電費。`,`新 process 模型載入秒數 A ${statistics.A.cost.loadSeconds}，B ${statistics.B.cost.loadSeconds}；檔案快取可能已暖，不稱為 cold-disk。`,'','## 規則比較','',`後設 literal grammar parser：train ${ruleSummary.bySplit.train.passed}/${ruleSummary.bySplit.train.total}、dev ${ruleSummary.bySplit.dev.passed}/${ruleSummary.bySplit.dev.total}、test ${ruleSummary.bySplit.test.passed}/${ruleSummary.bySplit.test.total}。只讀與模型相同的公開輸入，不讀 spec／target；通過另需相同 scorer 與引擎檢查。`,'這個 parser 是看過已編寫的 grammar 後才建的，不是預先登錄的第三組，也不是自然語言泛化測試。若規則已能完成這批固定模板需求，合成 A/B 增益本身並不足以證明值得投入微調。','', '## 不確定性','',report.uncertainty.reason,'每組僅一個 seed，依序 A→B，沒有次序交錯。家族成績、逐案規則結果與原始引擎檢查均保留。尚未覆蓋的目標／持續時間／觸發時序不能由正向傷害 scenario 推論為通過。','','[機器可讀指標](metrics.json) · [規則逐案](rule-comparison.json) · [引擎逐案](engine-results.json)'].join('\n')+'\n');
console.log(JSON.stringify({rules:ruleSummary.bySplit,statistics},null,2));
