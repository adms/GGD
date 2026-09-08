import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {writeJSON} from './dataset.mjs';
import {score} from './scorer.mjs';
const root=path.resolve(process.argv[2]),read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const state=read('state.json'),comparison=read('comparison.json'),pkg=read('package-manifest.json');
if(state.status!=='pipeline-complete-unqualified'||read('integrity-audit.json').status!=='pass')throw Error('AUDIT_REQUIRED');
const train=JSON.parse(fs.readFileSync(state.stages.train.output)),cases=read('cases.private.json');
const destination=path.join(root,'research-adapter');fs.mkdirSync(destination,{recursive:true});
for(const file of pkg.adapterArtifacts){
 if(hash(file.path)!==file.sha256)throw Error('ADAPTER_DRIFT');
 const target=path.join(destination,path.basename(file.path));
 if(!fs.existsSync(target))fs.copyFileSync(file.path,target,fs.constants.COPYFILE_EXCL);
 if(hash(target)!==file.sha256)throw Error('BACKUP_DRIFT');
}
const license=pkg.base.files.find(f=>f.name==='LICENSE');
if(!license||hash(path.join(pkg.base.path,'LICENSE'))!==license.sha256)throw Error('LICENSE_DRIFT');
if(!fs.existsSync(path.join(destination,'LICENSE')))fs.copyFileSync(path.join(pkg.base.path,'LICENSE'),path.join(destination,'LICENSE'),fs.constants.COPYFILE_EXCL);
if(hash(path.join(destination,'LICENSE'))!==license.sha256)throw Error('LICENSE_BACKUP_DRIFT');
writeJSON(path.join(destination,'research-manifest.json'),{base:{repo:pkg.base.repo,revision:pkg.base.revision},adapterFiles:pkg.adapterArtifacts.map(f=>({name:path.basename(f.path),sha256:f.sha256,bytes:f.bytes})),qualification:'synthetic-research-only',productionReady:false,thinking:false,requiresBaseModel:true,scope:pkg.scope});
const optional=n=>fs.existsSync(path.join(root,n))?read(n):null;
const deployment=optional('deployment-roundtrip.json'),quantized=optional('quantized-dev.json'),regression=optional('known-corpus-regression/comparison.json');
const qstats=quantized?{passed:quantized.results.filter(r=>score(cases.find(c=>c.id===r.id),r.value).pass).length,total:quantized.results.length,peakMetalGiB:quantized.metadata.peakMetalBytes/1024**3,meanSeconds:quantized.results.reduce((s,r)=>s+r.seconds,0)/quantized.results.length}:null;
const selectedDev=JSON.parse(fs.readFileSync(comparison.candidate.result));
const selectedDevPassed=selectedDev.results.filter(r=>score(cases.find(c=>c.id===r.id),r.value).pass).length;
if(qstats){qstats.pairs={bothCorrect:0,fixed:0,regressed:0,bothWrong:0};for(const q of quantized.results){const a=selectedDev.results.find(r=>r.id===q.id),c=cases.find(c=>c.id===q.id);if(a.requestDigest!==q.requestDigest||a.seed!==q.seed)throw Error('QUANTIZED_PAIR_DRIFT');const ap=score(c,a.value).pass,bp=score(c,q.value).pass;qstats.pairs[ap?(bp?'bothCorrect':'regressed'):(bp?'fixed':'bothWrong')]++;}}
if(deployment){
 const original=path.join(root,'mac-deployment-report.pre-deployment.json');
 if(!fs.existsSync(original))fs.copyFileSync(path.join(root,'mac-deployment-report.json'),original,fs.constants.COPYFILE_EXCL);
 writeJSON(path.join(root,'mac-deployment-report.json'),{...JSON.parse(fs.readFileSync(original)),status:'research-deployment-tested-on-M5-Max',fused:'roundtrip-pass',quantized:qstats?'roundtrip-and-dev-tested':'roundtrip-pass-task-not-tested',conversionReceipt:'deployment-roundtrip.json',quantizedInference:qstats,quantizedPath:deployment.quantizedPath,mac16GB:'not-tested',releaseQualified:false,previousSnapshot:'mac-deployment-report.pre-deployment.json'});
}
const categories={};for(const row of comparison.rows){const key=cases.find(c=>c.id===row.id).spec.outcome;const x=categories[key]??={A:0,B:0,total:0};x.A+=Number(row.A.score.pass);x.B+=Number(row.B.score.pass);x.total++;}
const quantizedBytes=deployment?.files.filter(f=>f.path.startsWith(deployment.quantizedPath+path.sep)).reduce((s,f)=>s+f.bytes,0);
const summary={status:'research-only',effectiveness:'evidence-insufficient',syntheticSignal:comparison.diagnosticSignal,finishedAt:new Date().toISOString(),wallSeconds:(Date.now()-Date.parse(state.startedAt))/1000,formalTrainingSeconds:train.totalSeconds,trainingPeakGiB:train.peakMetalBytes/1024**3,baseRevision:pkg.base.revision,selectedEpoch:comparison.candidate.epoch,A:comparison.A,B:comparison.B,pairs:comparison.pairs,newCritical:comparison.newCritical,categories,selectedDevPassed,quantizedDev:qstats,quantizedBytes:quantizedBytes??null,knownRegression:regression?{A:regression.A,B:regression.B,total:regression.total,pairs:regression.pairs}:null,durableAdapter:destination,temporaryQuantizedModel:deployment?.quantizedPath??null,mac16GB:'not-tested',humanGold:0,cloudGpuSpendUSD:0,editorActivated:false};
writeJSON(path.join(root,'FINAL_SUMMARY.json'),summary);
const fmt=n=>n.toFixed(2),lines=['# 本機微調交付報告','','## 結論','','已實作並實際跑完 Qwen3.5-4B non-thinking / MLX LoRA 研究流程。有效性判定仍為 **evidence-insufficient**：沒有人工核可的獨立 Owner Gold，不是可正式發布的英雄鑄造模型。',`合成診斷訊號：${comparison.diagnosticSignal}；新增重大錯誤 ${comparison.newCritical}。`,
 '', '## 固定 A/B 合成 holdout','','A 為未微調基底，B 為 dev 選出的 epoch '+comparison.candidate.epoch+'。同一資料、前處理、檢索、BF16 runtime 與抽樣，沒有 grammar。','','| 指標 | A | B |','| --- | ---: | ---: |',`| 全題 | ${comparison.A.passed}/${comparison.A.total} | ${comparison.B.passed}/${comparison.B.total} |`,`| 可完成題 | ${comparison.A.eligiblePassed}/${comparison.A.eligibleTotal} | ${comparison.B.eligiblePassed}/${comparison.B.eligibleTotal} |`,`| 重大錯誤 | ${comparison.A.critical} | ${comparison.B.critical} |`,`| 平均秒/題 | ${fmt(comparison.A.meanSeconds)} | ${fmt(comparison.B.meanSeconds)} |`,'',`配對：${JSON.stringify(comparison.pairs)}。重大錯誤分類是保守的：合法題遭過度拒絕時缺少必填機制欄位也可能列入，不能把全部 critical 當作危險技能真的被執行。`,'','| 預期決策 | A | B |','| --- | ---: | ---: |',...Object.entries(categories).map(([k,v])=>`| ${k} | ${v.A}/${v.total} | ${v.B}/${v.total} |`),
 '', '## 本機資源與部署','',`正式訓練 ${fmt(train.totalSeconds/60)} 分鐘，峰值 Metal ${fmt(summary.trainingPeakGiB)} GiB；全任務到本報告 ${fmt(summary.wallSeconds/3600)} 小時，包含建置、下載、失敗試跑與前處理修正。沒有租用雲端 GPU（GPU 費用 USD 0；不代表 Codex 帳單為零）。`,
 qstats?`固定 4-bit/group64 dev：${qstats.passed}/${qstats.total}；選定 BF16 adapter dev：${selectedDevPassed}/${selectedDev.results.length}。逐題配對 ${JSON.stringify(qstats.pairs)}；同分不代表完全相同。4-bit 獨立 worker 峰值 Metal ${fmt(qstats.peakMetalGiB)} GiB、平均 ${fmt(qstats.meanSeconds)} 秒/題、模型檔案 ${fmt(quantizedBytes/1024**3)} GiB。`:'4-bit 任務評測沒有完成，不能宣稱部署已驗證。',
 deployment?`融合與序列化收據：[deployment-roundtrip.json](deployment-roundtrip.json)。融合最大 logit 差 ${deployment.fusionMaxLogitDifference}，BF16/4-bit 保存重載最大差 ${deployment.fusedReloadMaxLogitDifference}/${deployment.quantizedReloadMaxLogitDifference}。兩個 dev next-token probe 只驗證數值接線，不代表品質。`:'融合尚無成功收據。','16GB MacBook 未實測；Metal 峰值不等於整機 RAM，仍需納入系統、Editor、上下文與 KV cache。',
 '', '## 已知題庫回歸','',regression?`BF16 同協定 A ${regression.A}/${regression.total}，B ${regression.B}/${regression.total}；${JSON.stringify(regression.pairs)}。[完整回歸](known-corpus-regression/REPORT.md)。這是已知舊題跨接口保留檢查，不是未見泛化，亦不可直接和舊 GGUF + grammar 分數比較。`:'尚無已知題庫回歸結果。',
 '', '## 交付與限制','',`研究 adapter 已另存並校驗於 [research-adapter](research-adapter)，約 31 MiB。大型 BF16/4-bit 在 /private/tmp，可能被系統清理，並非永久部署。量化模型位置：${deployment?.quantizedPath??'未完成'}。`,
 '原文 request 與 hash 保留；模型只讀經程式去除完整台詞的 mechanicsText。216 個合成案例：144 train／24 dev／48 holdout；只有一種語言 grammar 與一種引擎模板。不是完整英雄技能用途、VFX 美感、平衡或全機制能力的證明。',
 '接下來必須以人工核可的真實原文／配置建立獨立 source-family holdout，才可決定擴充或停止投入。沒有改動 Editor、發布旗標、既有引擎，也沒有 commit／push。',
 '', '[完整階段報告](experiment-report.md) · [完整性稽核](integrity-audit.json) · [逐題 A/B](comparison.json) · [失敗與修正紀錄](IMPLEMENTATION_NOTES.md) · [機器可讀摘要](FINAL_SUMMARY.json)'];
const diagnostic=optional('diagnostics/metrics.json'),rules=optional('diagnostics/rule-comparison.json');
if(diagnostic&&rules)lines.push('','## 後補的規則／成本比較','',`固定字面語法規則 train ${rules.bySplit.train.passed}/${rules.bySplit.train.total}、dev ${rules.bySplit.dev.passed}/${rules.bySplit.dev.total}、test ${rules.bySplit.test.passed}/${rules.bySplit.test.total}，含相同 scorer 與引擎檢查。這是看過已編寫 grammar 後建立的比較，不是預先登錄的第三組。`, '目前合成題可由規則完成，因此不足以證明實際需要 fine-tune。下一輪資料必須含真實、多措辭且人工核可的需求，不能只擴增相同模板。','[分項指標、成本、家族與不確定性](diagnostics/REPORT.md)');
fs.writeFileSync(path.join(root,'FINAL_REPORT.md'),lines.join('\n')+'\n');
console.log(JSON.stringify(summary,null,2));
