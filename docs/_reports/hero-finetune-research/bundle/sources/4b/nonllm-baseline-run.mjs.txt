/** Post-hoc CPU baseline study, independent of every frozen model run. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath}from'node:url';
import {digest}from'./dataset.mjs';import {score,summarize}from'./r6-score.mjs';import{paired}from'./r3-score.mjs';
import{fitExamples,kGrid,thresholdGrid,chooseNeighbors,catalogRanking,chooseCatalog,publicInput}from'./nonllm-baseline.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));const hash=p=>digest(fs.readFileSync(p,'utf8'));const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
export function selectDev(cases,prepared,kind){
 const grid=kind==='nearest'?kGrid:thresholdGrid,rows=[];
 for(const task of [...new Set(cases.map(c=>c.task))]){
  if(kind==='catalog'&&['hero-source','owner-mechanism'].includes(task))continue;
  for(const parameter of grid){let correct=0,unsafe=0,total=0;
   for(let i=0;i<cases.length;i++){const c=cases[i];if(c.task!==task)continue;const p=kind==='nearest'?chooseNeighbors(prepared[i],parameter):chooseCatalog(prepared[i],parameter);const s=score(c,p.value);correct+=+s.pass;unsafe+=+s.unsafe;total++;}
   rows.push({task,parameter,correct,unsafe,total});
  }
 }
 const policies={};for(const mode of ['accuracy','safety']){policies[mode]={};for(const task of new Set(rows.map(r=>r.task))){const options=rows.filter(r=>r.task===task).sort((a,b)=>mode==='accuracy'?(b.correct-a.correct||a.unsafe-b.unsafe||a.parameter-b.parameter):(a.unsafe-b.unsafe||b.correct-a.correct||a.parameter-b.parameter));policies[mode][task]=options[0].parameter;}}
 return{rows,policies};
}
async function main(root,parent,out){
 assert([root,parent,out].every(path.isAbsolute));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const cases=read(path.join(root,'cases.private.json')),inherited=read(path.join(parent,'cases.private.json')),train=[...inherited,...cases].filter(c=>c.split==='train');
 const dev=cases.filter(c=>c.split==='dev'),test=cases.filter(c=>c.split==='test');
 const trainInputs=new Set(train.map(c=>digest(publicInput(c.messages))));for(const c of [...dev,...test])assert(!trainInputs.has(digest(publicInput(c.messages))),'EXACT_PUBLIC_INPUT_LEAK:'+c.id);
 const sourceTrain=new Set(train.filter(c=>['hero-source','owner-mechanism'].includes(c.task)).map(c=>digest(JSON.parse(c.messages[1].content).source.text)));
 for(const c of [...dev,...test].filter(c=>['hero-source','owner-mechanism'].includes(c.task)))assert(!sourceTrain.has(digest(JSON.parse(c.messages[1].content).source.text)),'SOURCE_TEXT_LEAK:'+c.id);
 fs.mkdirSync(out);const pins=[path.join(root,'cases.private.json'),path.join(parent,'cases.private.json'),fileURLToPath(import.meta.url),fileURLToPath(new URL('./nonllm-baseline.mjs',import.meta.url)),fileURLToPath(new URL('./r6-score.mjs',import.meta.url)),fileURLToPath(new URL('./r3-score.mjs',import.meta.url))].map(p=>({path:p,sha256:hash(p)}));
 write(path.join(out,'POLICY.json'),{createdAt:new Date().toISOString(),root,parent,pins,kGrid,thresholdGrid,trainRows:train.length,inheritedTrainingIncluded:true,devCount:dev.length,testCount:test.length,selection:'Both accuracy-first and safety-first dev policies retained. No post/test selection.',features:'Chinese character 2/3-gram TF-IDF. Source tasks use claim grams, grams present/absent in source, numeric-presence flags and overlap bin. IDs/snapshot/name/oracles excluded from prediction features.',scope:'Post-hoc classical baselines, not an optimized rules engine or independent blind Gold. A lexical success is not runtime proof. Frozen wave-oracle caveat applies.',modelTrainingChanged:false,releaseQualified:false});
 let rssObserved=process.memoryUsage().rss;const fitStart=performance.now(),model=fitExamples(train),fitSeconds=(performance.now()-fitStart)/1000;
 const dNear=dev.map(c=>model.neighbors(c.messages)),dCatalog=dev.map(c=>catalogRanking(c.messages));
 const selection={nearest:selectDev(dev,dNear,'nearest'),catalog:selectDev(dev,dCatalog,'catalog')};write(path.join(out,'SELECTION.json'),selection); // Saved before test predictions or scoring.
 const summaries=[];
 function evaluate(name,group,modelFiles){
  const baseline={};for(const kind of ['nearest','catalog'])for(const mode of ['accuracy','safety'])baseline[kind+'-'+mode]=[];
  for(const c of group){const started=performance.now(),n=model.neighbors(c.messages),cr=catalogRanking(c.messages),preparationSeconds=(performance.now()-started)/1000;
   for(const kind of ['nearest','catalog'])for(const mode of ['accuracy','safety']){
    if(kind==='catalog'&&cr===null)continue;
    const parameter=selection[kind].policies[mode][c.task];if(parameter===undefined)continue;const t=performance.now(),p=kind==='nearest'?chooseNeighbors(n,parameter):chooseCatalog(cr,parameter);
    baseline[kind+'-'+mode].push({id:c.id,requestDigest:c.requestDigest,value:p.value,error:null,seconds:preparationSeconds+(performance.now()-t)/1000,parameter,trace:kind==='nearest'?{neighbors:p.nearest,contractRejected:p.contractRejected}:{top:p.top}});
   }
   rssObserved=Math.max(rssObserved,process.memoryUsage().rss);
  }
  const byArm={},details={};for(const[arm,results]of Object.entries(baseline)){
   if(!results.length)continue;const ids=new Set(results.map(r=>r.id)),subset=group.filter(c=>ids.has(c.id));const raw={complete:true,metadata:{backend:'node-cpu-tfidf',notLLM:true},results};
   write(path.join(out,name+'-'+arm+'.json'),raw);byArm[arm]=summarize(subset,raw);details[arm]={tasks:byArm[arm].tasks,total:byArm[arm].total,passed:byArm[arm].passed,unsafe:byArm[arm].unsafe,meanSeconds:results.reduce((a,r)=>a+r.seconds,0)/results.length};
  }
  const comparisons=[];for(const[arm,file]of modelFiles){assert(fs.existsSync(file),'MISSING_MODEL_EVIDENCE');const raw=read(file),s=summarize(group,raw);details[arm]={total:s.total,passed:s.passed,unsafe:s.unsafe,tasks:s.tasks,source:file,sha256:hash(file)};
   for(const[b,sb]of Object.entries(byArm)){const ids=new Set(sb.rows.map(r=>r.id)),sm={...s,rows:s.rows.filter(r=>ids.has(r.id))};comparisons.push({before:b,after:arm,byTask:paired(sb,sm)});}
  }
  write(path.join(out,name+'-comparison.json'),{name,details,comparisons,trainingAllowed:false,selectionAllowed:false,waveOracleCaveat:'../forge-low-lr-r7-v2-20260906/POSTFREEZE_DATA_CAVEAT.md'});summaries.push({name,details});
 }
 evaluate('core-dev',dev,[['base',path.join(root,'base-dev.json')],['r3',path.join(root,'r3-dev.json')]]);
 evaluate('core-test',test,[['base',path.join(root,'base-test.json')],['r3',path.join(root,'r3-test.json')]]);
 const post=[['new-source-63',path.join(root,'fresh-source-v1/cases.private.json')],['previous-source-72',path.join(path.dirname(root),'forge-contrastive-r5-20260906/fresh-source-diagnostic-v1/cases.private.json')],['hero-140',path.join(parent,'main-hero-diagnostic-v1/cases.private.json')],['fidelity-114',path.join(parent,'fidelity-diagnostic-v2/cases.private.json')],['current-main-v4',path.join(parent,'main-diagnostic-v4/cases.private.json')]];
 for(const[name,file]of post)evaluate(name,read(file),['base','r3'].map(a=>[a,path.join(root,'post-v1',name+'-'+a+'.json')]));
 for(const p of pins)assert.equal(hash(p.path),p.sha256,'PIN_CHANGED');
 const result={completedAt:new Date().toISOString(),trainingRows:model.trainingRows,uniqueTrainingRows:model.uniqueRows,fitSeconds,observedMaxRssBytes:rssObserved,notTruePeakMemory:true,summaries,selection,releaseQualified:false,postHoc:true};write(path.join(out,'summary.json'),result);
 const lines=['# 非LLM規則／檢索基準：事後研究比較','','最近訓練例基準使用R3＋R6實際train聯集；不是純關鍵詞規則。目錄基準只用當次公開目錄與需求，不讀訓練答案。兩者不使用LLM。來源任務未實作目錄查表，不以空答案假裝比較。','',`去重後${model.uniqueRows}筆（原始${model.trainingRows}）；TF-IDF建立${fitSeconds.toFixed(3)}秒；觀測RSS最大${(rssObserved/1024**2).toFixed(1)}MiB（非整機或真正峰值）。`,'','同題、同scorer；不偽裝成相同推論backend。accuracy與safety分別用158 dev選參數，再凍結測試與post。這是事後比較，不是獨立未見Gold，也未證明最佳規則方案。R3沒有接受R6新增train，但本基準有；與R7完整訓練後的比較才能更接近相同資料暴露。','','| 題組 | 任務 | 方法 | 正確 | 錯誤放行 |','| --- | --- | --- | ---: | ---: |'];
 for(const s of summaries)for(const[arm,d]of Object.entries(s.details))for(const[task,t]of Object.entries(d.tasks))lines.push(`| ${s.name} | ${task} | ${arm} | ${t.passed}/${t.total} | ${t.unsafe} |`);
 lines.push('','## 限制','','- 字面相似不等於完整語意涵蓋；最近例、關鍵詞命中都可能忽略否定、對象或時間。','- 未在此流程編写每個英雄ID的規則；source ID/name/snapshot、case ID與測試答案不進入特徵。','- 所有模型題集仍沿用原凍結oracle；traveling-wave已另證實能力／標籤問題，相關題分數不能當runtime支持。','- 不以這兩個有限基準落後來證明fine-tune不可替代，也不以過度refuse換取合格結論。','- 未變更R6/R7模型、資料、解碼、選模、截止或啟用狀態。R7仍待實際完成比較。','');
 fs.writeFileSync(path.join(out,'REPORT.md'),lines.join('\n'),{flag:'wx'});console.log(JSON.stringify({out,uniqueTrainingRows:model.uniqueRows,fitSeconds,groups:summaries.length,releaseQualified:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main(...process.argv.slice(2));
