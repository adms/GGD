import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {splitHeroGroups,adaptPublicPrompt} from './hero-distillation-74-freeze.mjs';

const heroes=Array.from({length:74},(_,i)=>({id:`h${String(i).padStart(2,'0')}`}));
test('deterministic whole-family split is independent of input order',()=>{
  const edges=[['h00','h01'],['h01','h02']];
  const a=splitHeroGroups(heroes,edges),b=splitHeroGroups([...heroes].reverse(),edges);
  assert.deepEqual(a,b);
  assert.equal(Object.values(a.splitByHero).filter(s=>s==='dev').length,15);
  assert.equal(a.groupByHero.h00,a.groupByHero.h02);
  assert.equal(a.splitByHero.h00,a.splitByHero.h02);
});
test('reject duplicate identities, unknown grouping edges and impossible split',()=>{
  assert.throws(()=>splitHeroGroups([{id:'a'},{id:'a'}],[],1),/DUPLICATE_HERO/);
  assert.throws(()=>splitHeroGroups(heroes,[['h00','missing']]),/UNKNOWN_GROUP_EDGE/);
  assert.throws(()=>splitHeroGroups([{id:'a'},{id:'b'}],[['a','b']],1),/CANNOT_FORM/);
});
test('prompt transport adaptation preserves semantic request without mutating source',()=>{
  const p={name:'凜',task:'完整六槽',requirements:['兩條因果連動'],evaluation:'允許等效答案',outputSchema:'ggd-hero-project@2',catalog:'../catalog.json'};
  const original=structuredClone(p),actual=adaptPublicPrompt(p);
  assert.deepEqual(p,original);
  assert.deepEqual(actual,{heroName:'凜',name:'凜',task:p.task,requirements:p.requirements,evaluation:p.evaluation});
  assert.throws(()=>adaptPublicPrompt({...p,outputSchema:'unknown'}),/UNEXPECTED_SOURCE/);
  assert.throws(()=>adaptPublicPrompt({...p,catalog:'private/teacher.json'}),/UNEXPECTED_SOURCE/);
});

const dir=process.env.HERO74_FROZEN;
test('frozen receipt hashes, coverage, family isolation and consistent output wrapper',{skip:!dir},()=>{
  const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
  const manifest=read('manifest.json'),examples=read('examples.json'),quality=read('quality.json').quality;
  if(fs.existsSync(path.join(dir,'input-prior/examples.json'))){
    const oldBytes=fs.readFileSync(path.join(dir,'input-prior/examples.json'));
    assert.equal(createHash('sha256').update(oldBytes).digest('hex'),manifest.oldDatasetSha256);
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir,'input-prior/assets.json'))).digest('hex'),manifest.inputs['old-assets.json']);
    assert.deepEqual(examples.filter(e=>!['first','second'].includes(e.batch)),JSON.parse(oldBytes).filter(e=>!e.heroId.startsWith('community-review-')));
  }
  for(const [name,expected]of Object.entries(manifest.outputs))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex'),expected,name);
  assert.equal(examples.length,619);assert.equal(quality.length,74);assert(quality.every(q=>q.admitted&&q.compile&&q.projectionGameplayPreserved));
  const fresh=examples.filter(e=>['first','second'].includes(e.batch));assert.equal(fresh.length,518);
  assert.equal(new Set(fresh.map(e=>e.heroId)).size,74);
  const train=new Set(examples.filter(e=>e.split==='train').map(e=>e.groupId));
  assert(examples.filter(e=>e.split==='dev').every(e=>!train.has(e.groupId)));
  for(const id of new Set(fresh.map(e=>e.heroId))){
    const rows=fresh.filter(e=>e.heroId===id);assert.equal(rows.length,7);
    assert.equal(new Set(rows.map(e=>e.split)).size,1);
    assert.deepEqual(rows.map(e=>e.slot).sort(),['HERO','PASSIVE','Q','W','E','R','EX'].sort());
  }
  for(const split of ['train','dev']){
    const subset=examples.filter(e=>e.split===split);
    assert.equal(subset.length,manifest.counts[split].tasks);
    assert.deepEqual(fs.readFileSync(path.join(dir,split+'.jsonl'),'utf8').trim().split('\n').map(JSON.parse),subset);
    for(const batch of ['first','second'])assert(fresh.some(e=>e.split===split&&e.batch===batch));
  }
  for(const row of fresh){
    const input=JSON.parse(row.messages[1].content),answer=JSON.parse(row.messages[2].content);
    assert.equal(input.outputContract.format,answer.format);
    assert(!('outputSchema'in input.request));assert(!('catalog'in input.request));
    assert(input.assets.factorTableRule);assert(Array.isArray(input.assets.icons));assert(Array.isArray(input.assets.uploadedModels));
  }
  assert.equal(manifest.authorization.blindCertified,false);
  assert.equal(manifest.frozenWeightsStarted,false);
});
