/** Independent CPU-only before/after exposure probe. No neural training, no model selection. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{fileURLToPath}from'node:url';
import{fileHash}from'./precision-diagnostic.mjs';import{fitExamples,chooseNeighbors,kGrid}from'./nonllm-baseline.mjs';import{selectDev}from'./nonllm-baseline-run.mjs';import{summarize}from'./r6-score.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
async function main(community,priorRoot,parentRoot,out){
 assert([community,priorRoot,parentRoot,out].every(path.isAbsolute));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const admission=read(path.join(community,'ADMISSION.json'));assert(admission.allPromptsFit&&admission.sourceEntailmentOnly);
 const all=read(path.join(community,'cases.private.json')),prior=read(path.join(priorRoot,'cases.private.json')),parent=read(path.join(parentRoot,'cases.private.json')),oldTrain=[...prior,...parent].filter(c=>c.split==='train'),newTrain=all.filter(c=>c.split==='train'),dev=[...prior.filter(c=>c.split==='dev'),...all.filter(c=>c.split==='dev')],test=all.filter(c=>c.split==='test');
 fs.mkdirSync(out,{recursive:true});const put=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 const pins=[...['cases.private.json','manifest.json','ADMISSION.json'].map(n=>path.join(community,n)),path.join(priorRoot,'cases.private.json'),path.join(parentRoot,'cases.private.json'),fileURLToPath(import.meta.url),fileURLToPath(new URL('./nonllm-baseline.mjs',import.meta.url)),fileURLToPath(new URL('./nonllm-baseline-run.mjs',import.meta.url)),fileURLToPath(new URL('./r6-score.mjs',import.meta.url))].map(p=>({path:p,sha256:fileHash(p)}));
 put('POLICY.json',{createdAt:new Date().toISOString(),pins,kGrid,arms:['old-training-only','old-plus-community84'],devRows:dev.length,testRows:test.length,testHeroes:['lux','warwick'],selection:'Separate accuracy-first and safety-first K using old158+community21 dev; both retained. Never choose by test results.',neuralModelSelection:false,trainingChanged:false,releaseQualified:false});
 const trained={};
 for(const[arm,train]of [['old-training-only',oldTrain],['old-plus-community84',[...oldTrain,...newTrain]]]){const started=performance.now(),model=fitExamples(train),fitSeconds=(performance.now()-started)/1000,selection=selectDev(dev,dev.map(c=>model.neighbors(c.messages)),'nearest');trained[arm]={model,selection,fitSeconds,uniqueRows:model.uniqueRows};put(arm+'-SELECTION.json',{selection,fitSeconds,uniqueRows:model.uniqueRows});}
 // Both selections persisted before any test predictions/targets are scored.
 const summary=[];for(const[arm,a]of Object.entries(trained))for(const mode of ['accuracy','safety']){
  const results=test.map(c=>{const t=performance.now(),p=chooseNeighbors(a.model.neighbors(c.messages),a.selection.policies[mode][c.task]);return{id:c.id,requestDigest:c.requestDigest,value:p.value,error:null,seconds:(performance.now()-t)/1000,nearest:p.nearest};});
  const raw={complete:true,metadata:{backend:'node-tfidf',notLLM:true},results};put(arm+'-'+mode+'.json',raw);const s=summarize(test,raw);summary.push({arm,mode,uniqueTrainRows:a.uniqueRows,fitSeconds:a.fitSeconds,total:s.total,passed:s.passed,unsafe:s.unsafe,tasks:s.tasks});
 }
 for(const p of pins)assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED');put('summary.json',{completedAt:new Date().toISOString(),summary,neuralEvaluationsPerformed:0,releaseQualified:false});
 fs.writeFileSync(path.join(out,'REPORT.md'),['# 七角色：非LLM檢索對照','','原訓練資料與原訓練+84題新來源分開建TF-IDF最近例。K僅用179 dev挑選，42題新角色測試不參與選擇。兩個policy均保留，不能看test挑好看的那個。這不證明任何finetune收益，也不是完整引擎能力測試。','','| 訓練暴露 | K政策 | 任務 | 正確 | 錯誤放行 |','| --- | --- | --- | ---: | ---: |',...summary.flatMap(a=>Object.entries(a.tasks).map(([task,t])=>`| ${a.arm} | ${a.mode} | ${task} | ${t.passed}/${t.total} | ${t.unsafe} |`)),''].join('\n'),{flag:'wx'});console.log(JSON.stringify({out,summary}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main(...process.argv.slice(2));
