import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validate,sha} from './build.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,'data',n)));
test('curated source supplement preserves authority, covers sources, and fails closed on corruption',()=>{
 const cases=read('cases.private.json'),refs=read('corrected-reference.json'),manifest=read('dataset-manifest.json');
 assert.equal(validate(cases,refs).cases,555);
 const raw=fs.readFileSync(path.join(dir,'data/train.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const chat=fs.readFileSync(path.join(dir,'data/train.chatml.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(raw.length,555);assert.equal(chat.length,555);
 for(let i=0;i<cases.length;i++){
  assert.deepEqual(raw[i],{id:cases[i].id,messages:cases[i].messages,target:cases[i].target});
  assert.deepEqual(chat[i].messages.slice(0,-1),cases[i].messages);
  assert.deepEqual(JSON.parse(chat[i].messages.at(-1).content),cases[i].target);
 }
 assert.equal(manifest.casesSha256,sha(cases));
 assert.equal(manifest.counts.templateMappingsAdmitted,0);assert.equal(manifest.trainingStarted,false);
 assert.equal(read('TRAINING_DISABLED.json').trainingEnabled,false);
 assert.equal(read('dataset-registration.json').automaticMerge,false);
 const line=refs.filter(r=>r.originalTemplate.ref==='tpl-line-sweep');assert.equal(line.length,22);
 for(const r of line){assert(r.currentBehavior.includes('同一目標去重'));assert(r.currentBehavior.includes('不是交疊段可'));}
 const waves=refs.filter(r=>r.originalTemplate.ref==='tpl-traveling-wave');assert.equal(waves.length,6);
 for(const r of waves)assert(r.currentBehavior.includes('終點另掛半徑'));
 const combos=refs.filter(r=>r.originalTemplate.ref==='tpl-lock-combo');assert.equal(combos.length,13);
 for(const r of combos)assert(r.currentBehavior.includes('獨立收尾'));
 const billy=refs.find(r=>r.heroIndex==='15'&&r.slot==='W');assert(billy.requiredRefinement.includes('無氣勢弱版'));
 const corrupt=structuredClone(cases);corrupt[0].messages[1].content+=' ';
 assert.throws(()=>validate(corrupt,refs));
 const promote=structuredClone(refs);promote[0].templateTrainingAdmitted=true;
 assert.throws(()=>validate(cases,promote));
 const leaked=structuredClone(cases),input=JSON.parse(leaked[0].messages[1].content);
 input.target=leaked[0].target;leaked[0].messages[1].content=JSON.stringify(input);leaked[0].requestDigest=sha(leaked[0].messages);
 assert.throws(()=>validate(leaked,refs));
});
