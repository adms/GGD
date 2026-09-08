/** Evidence-only finalization. Replays scores; never trains/selects/activates. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {digest} from './dataset.mjs';import {summarize,eligible} from './r3-score.mjs';import {compareArms} from './r3-error-report.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function collect(root){
 const get=n=>read(path.join(root,n));
 assert.equal(get('run-state.json').status,'complete-research-only','INCOMPLETE_CORE');
 assert.equal(get('post-diagnostics-v2/state.json').status,'complete-research-evidence','INCOMPLETE_POST');
 assert.equal(get('supplement-v1/state.json').status,'complete-research-evidence','INCOMPLETE_SUPPLEMENT');
 const cases=get('cases.private.json'),manifest=get('dataset-manifest.json'),selection=get('selection.json'),native=get('native-reference.json'),comparison=get('comparison.json'),post=get('post-diagnostics-v2/summary.json'),supplement=get('supplement-v1/summary.json'),training=get('training-run.json');
 assert.equal(digest(cases),manifest.casesSha256);assert.equal(hash(path.join(native.adapter,'adapters.safetensors')),native.adapterSha256);
 for(const pin of get('run-pins.json').pins)assert.equal(hash(pin.path),pin.sha256,'CORE_PIN_CHANGED:'+pin.path);
 const dev=cases.filter(c=>c.split==='dev'),test=cases.filter(c=>c.split==='test');
 assert.deepEqual(summarize(dev,get('dev-'+selection.selected.epoch+'.json')),selection.selected.score);
 for(const [name,stem] of [['base','test-base'],['r3','test-r3'],['r4','test-selected']])assert.deepEqual(summarize(test,get(stem+'.json')),comparison.testScores[name]);
 const r3=manifest.parent,where=path.join(r3,'main-diagnostic-v4'),v4cases=read(path.join(where,'cases.private.json')),v4review=read(path.join(r3,'main-catalog-review-v4.json'));
 const v4=compareArms(v4cases,['base','r3','r4'].map(name=>({name,raw:get('supplement-v1/main-v4-'+name+'.json')})));
 assert.deepEqual(v4.scores,get('supplement-v1/main-v4-report.json').scores);
 const source=get('supplement-v1/source-fidelity-checked.json');
 return {schema:'ggd-r4-evidence-summary@1',createdAt:new Date().toISOString(),root,data:manifest,training,selectedEpoch:selection.selected.epoch,selectionBeforeTest:true,dev:selection.selected.score,devEligible:eligible(selection.selected.score),test:comparison.testScores,cohorts:comparison.cohorts,post:post.reports,mainV4:v4,mainCatalogCounts:v4review.counts,sourceEntry:supplement.smoke,sourceChecklist:source,native,releaseQualified:false,activated:false,scope:'Measured classification/source fidelity; no parameter generation or visual validation.',limitations:['Assistant-authored reviewed labels, not independent Owner Gold.','Original R3 test is exposed regression; added R4 claims use held-out sources but are same-source diagnostics.','Main-v4 changes both availability inputs and two oracles; never compare its aggregate directly to v3 as model improvement.','Whole-proposal coverage checks only caller-supplied requirements, not unlisted source facts.','12 GiB MLX allocation-limit smoke tests are not measurements on a physical 16GB Mac.','All game-contract issues remain separate from model quality; quarantining a card is not a fine-tuning gain.']};
}
export function render(r){
 const lines=['# R4 本機微調實測報告','',`產生時間：${r.createdAt}。僅整理完成的實測，不自動啟用模型。`,'','## 核心結論','',`dev選定epoch ${r.selectedEpoch}；dev既定門檻${r.devEligible?'通過':'未通過'}。是否足夠穩定仍須逐任務、逐題檢查以下回歸，不能以loss或總平均宣告。`,'','## 資料與训练','',`- train/dev/test：${r.data.counts.train}/${r.data.counts.dev}/${r.data.counts.test}。`,`- 實際訓練：${r.training.recipe.epochs} epochs，${r.training.optimizerSteps} optimizer steps，${(r.training.totalSeconds/60).toFixed(2)}分鐘，Metal峰值${(r.training.peakMetalBytes/1024**3).toFixed(2)}GiB。`,`- Qwen3.5-4B非推理、乾淨BF16基底＋LoRA；選模只使用dev，未用test重選。`,'','## 相同題目的核心test對照','','| 任務 | base | R3 | R4 | R4錯誤放行 |','| --- | ---: | ---: | ---: | ---: |'];
 for(const key of ['hero-source','owner-mechanism','mechanism-template']){const t=r.test.r4.tasks[key];lines.push(`| ${key} | ${r.test.base.tasks[key].passed}/${t.total} | ${r.test.r3.tasks[key].passed}/${t.total} | ${t.passed}/${t.total} | ${t.unsafe} |`);}
 lines.push('','原108題與新54題必須分開看，不能讓新增容易題掩蓋原題退步。','','| 題組／任務 | R4正確 | R4錯誤放行 | 相對R3修正 | 相對R3退步 |','| --- | ---: | ---: | ---: | ---: |');
 for(const [cohort,c] of Object.entries(r.cohorts))for(const [task,t] of Object.entries(c.scores.r4.tasks)){const p=c.againstR3[task];lines.push(`| ${cohort} / ${task} | ${t.passed}/${t.total} | ${t.unsafe} | ${p.fixed} | ${p.regressed} |`);}
 lines.push('','## 新版能力目錄','',`目前${r.mainCatalogCounts.enabled}候選／${r.mainCatalogCounts.quarantined}隔離／${r.mainCatalogCounts.draft}draft。召喚預設零容量問題另開#1076；v4使用新請求重測，沒有重套v3輸出。`,'','| 同一v4輸入 | 正確 | 錯誤放行 |','| --- | ---: | ---: |');
 for(const [name,s] of Object.entries(r.mainV4.scores))lines.push(`| ${name} | ${s.passed}/${s.total} | ${s.unsafe} |`);
 lines.push('','完整錯題與模型原值：[v4逐題報告](../supplement-v1/main-v4-REPORT.md)。舊v3分數只作歷史能力目錄對照，不代表当前可用性。','','## 補充診斷與特效保留','','| 題組 | 模型 | 正確 | 錯誤放行 |','| --- | --- | ---: | ---: |');
 for(const d of r.post.filter(d=>!['core-dev','r3-exposed-regression','r4-prospective-same-source-diagnostic'].includes(d.name)))for(const [name,s] of Object.entries(d.scores))lines.push(`| ${d.name} | ${name} | ${s.passed}/${s.total} | ${s.unsafe} |`);
 lines.push('','VFX只建議既有模板；已見家族保留與家族隔離已分列，不作視覺驗證、不輸出調參。','','## 真實來源推論入口','','| 入口 | 請求 | 格式通過 | 記憶體限制 | Metal峰值 |','| --- | ---: | --- | ---: | ---: |');
 for(const s of r.sourceEntry)lines.push(`| ${s.name} | ${s.requests} | ${s.contractPass} | ${s.metadata.memoryLimitGiB}GiB | ${(s.metadata.peakMetalBytes/1024**3).toFixed(2)}GiB |`);
 lines.push('',`完整提案煙霧測試modelChecklistPass=${r.sourceChecklist.modelChecklistPass}；未涵蓋項目：${JSON.stringify(r.sourceChecklist.uncoveredRequirementIds)}。這不是額外泛化分數，也不參與選模。`,'','## 模型與限制','',`- adapter SHA256：${r.native.adapterSha256}。`,`- 基底：${r.native.base}。`,`- adapter：${r.native.adapter}。`,`- 未push、未啟用Editor、未更改遊戲機制；雲端GPU使用0。`,'',...r.limitations.map(x=>'- '+x),'','工具測試通過不能替代以上實測；尚有錯誤或未驗收範圍時，不宣告整體目標完成。');
 return lines.join('\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root]=process.argv.slice(2);assert(root&&path.isAbsolute(root));const out=path.join(root,'final-evidence-v1');assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const report=collect(root);fs.mkdirSync(out);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(out,'REPORT.md'),render(report),{flag:'wx'});console.log(JSON.stringify({out,selectedEpoch:report.selectedEpoch,devEligible:report.devEligible,releaseQualified:false}));
}
