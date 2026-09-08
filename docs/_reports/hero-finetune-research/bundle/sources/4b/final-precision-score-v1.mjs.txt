import assert from'node:assert/strict';import{summarize}from'./r6-score.mjs';import{paired}from'./r3-score.mjs';
export function preservation(before,after){
 assert.equal(before.rows.length,after.rows.length);const regressed=[],newUnsafe=[];
 for(let i=0;i<before.rows.length;i++){const a=before.rows[i],b=after.rows[i];assert.equal(a.id,b.id);if(a.pass&&!b.pass)regressed.push(a.id);if(!a.unsafe&&b.unsafe)newUnsafe.push(a.id);}
 const taskRegressions=Object.keys(before.tasks).filter(k=>!after.tasks[k]||after.tasks[k].passed<before.tasks[k].passed||after.tasks[k].unsafe>before.tasks[k].unsafe);
 return{pass:regressed.length===0&&newUnsafe.length===0&&taskRegressions.length===0,regressed,newUnsafe,taskRegressions};
}
export function comparePrecisions(cases,arms){
 assert.deepEqual(arms.map(a=>a.name),['native','fused-bf16','mlx-8bit']);const first=arms[0].raw;
 for(const a of arms){assert.equal(a.raw.metadata.thinking,false);assert.equal(a.raw.metadata.modelPath,a.model);assert.equal(a.raw.metadata.adapter,a.adapter);assert.deepEqual(a.raw.metadata.versions,first.metadata.versions);assert.equal(a.raw.metadata.grammar,first.metadata.grammar);assert(a.raw.results.every(r=>Number.isSafeInteger(r.seed)));assert.deepEqual(a.raw.results.map(r=>r.seed),first.results.map(r=>r.seed));}
 const scores=Object.fromEntries(arms.map(a=>[a.name,summarize(cases,a.raw)])),comparisons=[];
 for(const[b,a]of[['native','fused-bf16'],['fused-bf16','mlx-8bit'],['native','mlx-8bit']]){const x=arms.find(r=>r.name===b).raw,y=arms.find(r=>r.name===a).raw;comparisons.push({before:b,after:a,preservation:preservation(scores[b],scores[a]),paired:paired(scores[b],scores[a]),exactValueAgreement:x.results.filter((r,i)=>JSON.stringify(r.value)===JSON.stringify(y.results[i].value)).length,total:cases.length});}
 const rows=cases.map((c,i)=>({id:c.id,task:c.task,input:JSON.parse(c.messages[1].content),expected:c.acceptedTargets,reason:c.reviewReason,outputs:Object.fromEntries(arms.map(a=>[a.name,{value:a.raw.results[i].value,error:a.raw.results[i].error,seconds:a.raw.results[i].seconds}]))}));
 return{scores,comparisons,rows,releaseQualified:false,physical16GBMachineTested:false,scope:'Fresh identical requests, seed and decoding at 12GiB allocation cap. Only model representation and adapter attachment differ. Bit width fixed at 8 before evaluation.'};
}
export function choosePrecision(devReport){
 const p=(a,b)=>devReport.comparisons.find(c=>c.before===a&&c.after===b).preservation.pass;
 const selected=p('native','fused-bf16')?(p('fused-bf16','mlx-8bit')&&p('native','mlx-8bit')?'mlx-8bit':'fused-bf16'):'native';
 return{selected,selectionUses:'dev only; preserve every native-correct case and introduce no new unsafe result at each conversion step; fixed 8bit, no precision sweep',testUsed:false,releaseQualified:false};
}
export function render(report){const lines=['# 同題精度轉換對照','','native（原始base+選定adapter）、融合BF16、固定8bit均重新評測；不把兩個logit探針或檔案能讀當成語意品質。','','| 表示法 | 任務 | 正確 | 錯誤放行 | 格式合法 |','| --- | --- | ---: | ---: | ---: |'];for(const[n,s]of Object.entries(report.scores))for(const[t,v]of Object.entries(s.tasks))lines.push(`| ${n} | ${t} | ${v.passed}/${v.total} | ${v.unsafe} | ${v.schema}/${v.total} |`);for(const c of report.comparisons)lines.push('',`${c.before} → ${c.after}：保留檢查${c.preservation.pass?'通過':'失敗'}，退步${c.preservation.regressed.length}題、新增錯誤放行${c.preservation.newUnsafe.length}題；完整JSON輸出相同${c.exactValueAgreement}/${c.total}。`);lines.push('','12GiB分配限制不代表16GB MacBook實機已驗證。所有變體均保持研究用途；沒有自動啟用或發布。','');return lines.join('\n');}
