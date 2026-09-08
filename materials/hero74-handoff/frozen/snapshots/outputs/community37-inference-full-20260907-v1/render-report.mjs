import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const a=read('analysis.json'),errors=read('error-review.json'),summary=read('summary.json');
assert.equal(a.reviewedErrorCount,a.errorUnionCount);assert.equal(summary.status,'complete');
assert.equal(a.trainingExecuted,false);assert.equal(a.releaseQualified,false);
const names=['base','r3','r7'],labelNames=['supported','contradicted','not-stated'];
const n2=n=>n.toFixed(2),pct=(x,n)=>n2(100*x/n)+'%';
const rank=[...names].sort((x,y)=>a.details[y].passed-a.details[x].passed);
const delta=c=>{const p=a.comparisons.find(p=>p.before==='base'&&p.after===c);return Object.values(p.byTask).reduce((t,v)=>({fixed:t.fixed+v.fixed,regressed:t.regressed+v.regressed}),{fixed:0,regressed:0});};
const lines=['# 新 37 名英雄：555 題全量本機推論報告','',
 `本批正確數排序：${rank.join(' > ')}。本輪實際完成 555 題 × 3 模型 = 1,665 次推論；沒有重新訓練或修改權重，沒有合格成品模型的宣告。`,
 '', '## 結果與成本','',
 '| 模型 | 正確 | 正確率 | 錯誤放行 | 程序耗時 | Metal 峰值 |',
 '| --- | ---: | ---: | ---: | ---: | ---: |'];
for(const n of names){const d=a.details[n];lines.push(`| ${n} | ${d.passed}/${d.total} | ${n2(d.pct)}% | ${d.unsafe} | ${n2(d.seconds)} 秒 | ${n2(d.peakGiB)} GiB |`);}
lines.push('',`三組程序耗時合計 ${n2(a.totalWorkerWallSeconds)} 秒（${n2(a.totalWorkerWallSeconds/60)} 分鐘），另有模型雜湊驗證等 CPU/I/O 開銷。所有 1,665 次輸出格式合法、正常結束，無生成錯誤或截斷。記憶體指 MLX Metal 分配峰值，不是整機 RAM，也未量測瓦數、電池淨充電或 16 GB 機器實用性。`,
 '', '| 任務 | 基底 | R3 | R7 |','| --- | ---: | ---: | ---: |');
for(const task of ['hero-source','owner-mechanism'])lines.push(`| ${task} | ${names.map(n=>{const t=a.details[n].tasks[task];return `${t.passed}/${t.total} (${pct(t.passed,t.total)})`;}).join(' | ')} |`);
lines.push('', '## 配對收益與退步','');
for(const n of ['r3','r7']){const d=delta(n),pp=a.details[n].pct-a.details.base.pct;lines.push(`- ${n} 相對基底：修正 ${d.fixed} 題、退步 ${d.regressed} 題；淨差 ${pp>=0?'+':''}${n2(pp)} 個百分點。`);}
lines.push('', '修正與退步都依同一題原始答案計算，不用不同任務或不同解碼設定的平均分互相比較。這是目前兩個既有 adapter 對新資料的表現，不能回答「以這批新資料重新訓練後能提升多少」，因為本次沒有做那個實驗。',
 '', '## 分類與來源單元完整性','',
 '標籤分布：supported 259、contradicted 259、not-stated 37。未知類較少，總正確率不能單獨代表三類平衡能力。下表各列是該真實標籤的召回率。',
 '', '| 真實標籤 | 基底 | R3 | R7 |','| --- | ---: | ---: | ---: |');
for(const label of labelNames)lines.push(`| ${label} | ${names.map(n=>{const c=a.details[n].confusion[label],total=Object.values(c).reduce((x,y)=>x+y,0);return `${c[label]}/${total} (${pct(c[label],total)})`;}).join(' | ')} |`);
lines.push(`| 三類平均召回率 | ${names.map(n=>n2(a.details[n].macroRecallPct)+'%').join(' | ')} |`,'',
 '| 來源單元指標 | 基底 | R3 | R7 |','| --- | ---: | ---: | ---: |',
 `| 該單元所有已出題敘述皆正確 | ${names.map(n=>`${a.details[n].sourceGroups.allCorrect}/259`).join(' | ')} |`,
 `| 同時支持正例及其矛盾反例 | ${names.map(n=>a.details[n].sourceGroups.acceptedBothPositiveAndContradiction).join(' | ')} |`,
 '', '259 單元＝37 份角色身分＋222 份技能槽原文。單元全對只代表其已出題敘述全對，並非原技能所有要求已完整涵蓋；每個單元的正反例彼此相關，不當成獨立來源推算統計顯著性。',
 '', '## 錯誤覆核與限制','',
 `至少一個模型答錯的聯集共 ${a.errorUnionCount} 題，已全部逐題回讀模型可見的原文、claim 及答案並記錄覆核理由。原始標籤、prompt、模型輸出均未更改；這是助理覆核，不是 Owner 或獨立人類 Gold。完整來源和各模型輸出在 error-review.json。`,
 '', '已觀察到的主要問題是：明確數量、資源上限、純視覺限定、角色實體，以及明示肯否條件被當成「未提及」。錯誤放行與過度保守必須分開統計：一律拒答可以降低放行數，但不能滿足高準度分類目標。這是輸出行為觀察，未以新實驗證明成因是過擬合、資料量、學習率或特定訓練樣本。',
 '', '共同錯誤放行：');
const shared=errors.filter(e=>names.every(n=>e.outputs[n].score.unsafe));
if(!shared.length)lines.push('','無三者共同錯誤放行。');
for(const e of shared)lines.push('',`- ${e.input.source.name}：${e.input.claim}（正確：${e.expected[0].verdict}）`);
lines.push('', '## 每名英雄','', '| 英雄 | 基底正確 | R3 正確 | R7 正確 |','| --- | ---: | ---: | ---: |');
for(const h of a.perHero)lines.push(`| ${h.heroIndex} ${h.name} | ${names.map(n=>`${h.models[n].passed}/${h.models[n].total}`).join(' | ')} |`);
lines.push('', '## 範圍、停止狀態與可重現性','',
 '- 555 題全部來自校正資料集；首批 43 題包含在內，不能加成 598 題或與首批重複計權。',
 '- 這些是 train-candidate 來源判讀題，不是獨立未見 release test。新題尚未訓練此次模型，不代表已排除全部歷史來源／家族曝光。',
 '- 使用既有本機 BF16 基底與 R3/R7 LoRA，thinking=false、temperature=0、presence penalty=0、相同 prompt／次序／逐題種子；無 grammar 強制與輸出修補。',
 '- 全 555 題實際 tokenizer 檢查：358–624 tokens，另預留 256 輸出，均在 4096 範圍內。短 JSON 分類速度不能外推完整技能生成。',
 '- 逐一載入、12 GiB 限制、18 分鐘 GPU 截止；訓練呼叫 0，不使用雲端、不下載、不融合／量化、不啟用 Editor。',
 '- 執行前後基底及兩個 adapter 雜湊通過；本次 worker 已結束、自己的 GPU lock 已釋放。未啟動舊隊列，原 CANCEL 與 TRAINING_DISABLED 保留。',
 '- 重新執行了校正資料集的 1 項 CPU 結構守衛，通過；它不取代語意品質。analyze.mjs 重播原始 scorer，檢查全量 ID、輸入摘要、種子、格式、完整性與凍結 cases 不變。',
 '- 這不是模板推薦／機制組合／原作考證／遊戲執行／視覺驗證；原本 222 槽模板隔離與無合格模型狀態不因此解除。',
 '', '## 下一步決策','',
 '保持不訓練、不部署。這份結果能支持選擇下一批需人工確認的錯誤類型，不能把高分或只修正幾題當作整體模型成熟。若未來另行授權訓練，先澄清單值數量與必要／充分條件的標註規則，擴充不同來源的對比例，再使用事前凍結的独立來源保留集檢驗；不要把這批錯題直接回灌後用同題提升宣稱泛化。',
 '', '## 文件入口','',
 '- analysis.json：完整混淆矩陣、每名英雄、每組平均／中位／p95 耗時。',
 '- error-review.json 與 review-notes.json：所有錯誤與逐題來源覆核。',
 '- comparison.json：全 555 題的三模型配對。',
 '- *-raw.json：1,665 次原始輸出、token、耗時與平台資訊。',
 '- PREPARATION.json、token-budget.json、models-before.json、models-after.json、summary.json：輸入、模型與執行證據。',
 '- analyze.mjs report 與 render-report.mjs：僅 CPU 報告重建；不會啟動 GPU。',
 '', '主工作流可直接參考此報告及錯誤覆核資料；本輪未確認新的產品缺陷，未開新遠端 issue，也未把模型答案當原作或引擎權威。','');
fs.writeFileSync(path.join(dir,'REPORT.md'),lines.join('\n'));
const pins=['run.mjs','analyze.mjs','render-report.mjs','review-notes.json','analysis.json','error-review.json','REPORT.md','comparison.json','ANALYSIS_VALIDATION.json'].map(name=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')}));
fs.writeFileSync(path.join(dir,'REPORT_VALIDATION.json'),JSON.stringify({createdAt:new Date().toISOString(),allErrorsAssistantReviewed:true,reviewCount:a.reviewedErrorCount,releaseQualified:false,pins},null,2)+'\n');
console.log(JSON.stringify({report:path.join(dir,'REPORT.md'),ranking:rank,reviewedErrors:a.reviewedErrorCount}));
