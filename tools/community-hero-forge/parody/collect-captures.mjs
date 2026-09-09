// Combine independent browser runs; capture success never awards an art verdict.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
const {values:v}=parseArgs({options:{input:{type:'string'},output:{type:'string'},run:{type:'string',multiple:true}}});
assert(v.input&&v.output&&v.run?.length,'--input <handoff> --output <new directory> --run <capture directory> (repeatable)');
const input=fs.realpathSync(v.input),output=path.resolve(v.output);
assert(!fs.existsSync(output)&&!output.startsWith(input+path.sep),'Output must be fresh and outside the handoff');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.readFileSync(file);
const indexBytes=read(path.join(input,'index.json')),index=JSON.parse(indexBytes),expected=new Map(index.heroes.map(h=>[h.index,h]));
const selected=new Map(),runs=[];
for(const dir of v.run){
 const root=fs.realpathSync(dir),bytes=read(path.join(root,'captures.json')),r=JSON.parse(bytes);
 assert.equal(r.schema,'ggd-first37-browser-capture@1');assert.equal(r.indexSha256,sha(indexBytes),'Different input batch');
 runs.push({directory:path.basename(root),reportSha256:sha(bytes),scriptSha256:r.scriptSha256,origin:r.origin,gpu:r.gpu,nodeVersion:r.nodeVersion,nodeArchitecture:r.nodeArchitecture,errors:r.errors,failedHeroes:r.heroes.filter(h=>!h.completed).map(h=>({index:h.index,errors:h.errors})),consoleErrors:r.consoleErrors,httpFailures:r.httpFailures});
 for(const hero of r.heroes.filter(h=>h.completed)){
  const source=expected.get(hero.index);assert(source,'Unexpected hero');assert.equal(hero.name,source.name);
  assert.equal(hero.projectSha256,sha(read(path.join(input,source.project))),'Stale hero source');
  assert(!selected.has(hero.index),'Duplicate successful hero; explicitly choose one run');
  assert(!hero.errors?.length);assert.deepEqual([...new Set(hero.captures.map(c=>c.slot))].sort(),['E','EX','Q','R','W']);
  const captures=hero.captures.map(c=>{
   assert(c.status.startsWith('完成施放'),'Rejected cast is not visual proof');
   assert.equal((c.actors.match(/材質正常/g)??[]).length,2,'Both real models must be ready');
   const sourcePath=fs.realpathSync(path.join(root,c.file));assert(sourcePath.startsWith(root+path.sep),'Capture outside run');
   const bytes=read(sourcePath);assert.equal(bytes.length,c.bytes);assert.equal(sha(bytes),c.sha256);
   assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG required');
   return {...c,file:`images/${hero.index}/${path.basename(c.file)}`,sourcePath};
  });
  selected.set(hero.index,{...hero,captures});
 }
}
assert.equal(selected.size,expected.size,'Missing successful heroes');
fs.mkdirSync(output,{recursive:true});
const heroes=index.heroes.map(source=>{
 const hero=selected.get(source.index);
 const files=new Set();
 return {...hero,captures:hero.captures.map(({sourcePath,...c})=>{assert(!files.has(c.file),'Duplicate capture path');files.add(c.file);const target=path.join(output,c.file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(sourcePath,target);return c;})};
});
const report={schema:'ggd-hero-browser-capture-collection@1',status:'captured',indexSha256:sha(indexBytes),heroes:heroes.length,activeSlots:heroes.length*5,captures:heroes.reduce((n,h)=>n+h.captures.length,0),humanReview:'pending',formalDeployment:false,runs,results:heroes};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const body=heroes.map(h=>`<section><h2>${escape(h.index)} ${escape(h.name)}</h2><div class="shots">${h.captures.map(c=>`<figure><a href="${encodeURI(c.file)}"><img loading="lazy" src="${encodeURI(c.file)}" alt="${escape(h.name+' '+c.slot+' '+c.ms+'ms')}"></a><figcaption>${escape(c.slot)} · ${c.ms}ms</figcaption></figure>`).join('')}</div></section>`).join('');
fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><meta charset="utf-8"><title>英雄畫面逐項驗收</title><style>body{background:#10161e;color:#eef3fa;font:16px system-ui;margin:24px}h2{margin-top:36px}.shots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0}img{width:100%}figcaption{padding:6px}a{color:inherit}</style><h1>${heroes.length} 名英雄 · ${report.activeSlots} 主動槽</h1><p>畫面收集完成；逐圖人工判讀另記，不代表原作美術或正式部署。</p>${body}`);
console.log(JSON.stringify({heroes:report.heroes,activeSlots:report.activeSlots,captures:report.captures,humanReview:report.humanReview}));
