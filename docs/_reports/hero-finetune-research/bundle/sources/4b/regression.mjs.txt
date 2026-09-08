import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {digest,writeJSON,mechanicsText} from './dataset.mjs';
const [mode,oldArg,rootArg]=process.argv.slice(2),old=path.resolve(oldArg),root=path.resolve(rootArg);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const source=fs.readFileSync(path.join(old,'benchmark.mjs'),'utf8');
assert.equal(digest(source),'8f1d14d5de7167fbcd1b7e0bd4fa72391db247edacbaef85ea023fcb0d38cc1d');
const corpus=read(path.join(old,'corpus.private.json'));
const dir=path.join(root,'known-corpus-regression');
if(mode==='prepare'){
 fs.mkdirSync(dir,{recursive:true});
 const requests=corpus.cases.map(c=>{
  const original=read(path.join(old,'run',`4B-424242-${c.id}.json`));
  const messages=structuredClone(original.request.messages);
  for(const message of messages.filter(m=>m.role==='user')){
   const input=JSON.parse(message.content);
   if(typeof input.prompt!=='string')throw Error('UNKNOWN_OWNER_TEXT_LOCATION');
   input.prompt=mechanicsText(input.prompt);message.content=JSON.stringify(input);
  }
  messages[0].content+='\nRequired output JSON Schema (no grammar available in this MLX regression):\n'+JSON.stringify(original.request.response_format.json_schema.schema);
  return{id:c.id,messages,requestDigest:digest(messages)};
 });
 writeJSON(path.join(dir,'requests.json'),requests);
 const policy=read(path.join(root,'experiment-policy.json'));policy.maxSequenceTokens=4096;
 writeJSON(path.join(dir,'policy.json'),policy);
 writeJSON(path.join(dir,'protocol.json'),{scope:'known development corpus retention, not new heldout quality',cases:24,seeds:1,thinking:false,grammar:false,schemaInPrompt:true,maxSequenceTokens:4096,requestDigest:digest(requests),frozenScorer:digest(source),note:'Not comparable to old GGUF grammar-constrained percentages. Old alpha=0 oracle is not current engine validation.'});
}else if(mode==='score'){
 const context=vm.createContext({Object,Array,JSON,Number,Set,Infinity});
 const helpers=source.slice(source.indexOf('const canonical='),source.indexOf('const models='));
 const functions=source.slice(source.indexOf('function schemaErrors('),source.indexOf('function selfTest('));
 vm.runInContext(helpers+'\n'+functions+'\nthis.gradeResult=grade;',context);
 const a=read(path.join(dir,'A.json')),b=read(path.join(dir,'B.json'));
 assert(a.complete&&b.complete);assert.equal(a.results.length,24);assert.equal(b.results.length,24);
 const excluded=read(path.join(old,'adjudication.json')).excludeFromValidCohort;
 const pairs={bothCorrect:0,fixed:0,regressed:0,bothWrong:0};
 const rows=corpus.cases.map(c=>{
  const ar=a.results.find(r=>r.id===c.id),br=b.results.find(r=>r.id===c.id);
  assert.equal(ar.requestDigest,br.requestDigest);assert.equal(ar.seed,br.seed);
  const A=context.gradeResult(c,ar.value),B=context.gradeResult(c,br.value);
  const pair=A.pass?(B.pass?'bothCorrect':'regressed'):(B.pass?'fixed':'bothWrong');
  if(!excluded.includes(c.id))pairs[pair]++;
  return{id:c.id,category:c.category,excluded:excluded.includes(c.id),A:{...ar,score:A},B:{...br,score:B},pair};
 });
 const valid=rows.filter(r=>!r.excluded);
 const summary={scope:'known-corpus regression only; not unseen generalization',A:valid.filter(r=>r.A.score.pass).length,B:valid.filter(r=>r.B.score.pass).length,total:valid.length,pairs,rows,engineQualification:false};
 writeJSON(path.join(dir,'comparison.json'),summary);
 fs.writeFileSync(path.join(dir,'REPORT.md'),`# 已知題庫：微調前後回歸\n\n同一 BF16 MLX、同一提示與抽樣、non-thinking、沒有 grammar；輸出 schema 額外放入提示。不可直接比舊 GGUF 百分比。\n\nA ${summary.A}/${summary.total}；B ${summary.B}/${summary.total}。配對 ${JSON.stringify(pairs)}。\n\n沿用原本 vfx-01 排除協議；全部 24 題輸出保留。這是已知開發題庫的跨接口保留測試，不是新未見品質，也不是現行引擎驗證（例如舊 alpha=0 規格與實際 schema 不同）。不依此重新選候選或調參。\n\n[逐案結果](comparison.json)\n`);
 console.log(JSON.stringify({A:summary.A,B:summary.B,total:summary.total,pairs}));
}else throw Error('prepare|score OLD_BENCHMARK_ROOT RUN_ROOT');
