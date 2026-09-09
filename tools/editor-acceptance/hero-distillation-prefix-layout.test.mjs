import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {reorder} from './hero-distillation-prefix-layout.mjs';

test('reorders public context without mutating answer, identity, split or semantic input',()=>{
  const user={request:{name:'Hero',description:'要求'},outputContract:{format:'hero-plan'},allowedCatalog:{ids:['a','b']},assets:{id:'proxy'}};
  const content=JSON.stringify(user);
  const row={id:'hero:HERO',split:'dev',groupId:'hero',targetSha256:'teacher-hash',inputSha256:createHash('sha256').update(content).digest('hex'),
    messages:[{role:'system',content:'system'},{role:'user',content},{role:'assistant',content:'PRIVATE_TEACHER'}]};
  const before=structuredClone(row),result=reorder(row);
  assert.deepEqual(row,before);assert.deepEqual(JSON.parse(result.messages[1].content),user);
  assert.deepEqual(Object.keys(JSON.parse(result.messages[1].content)).slice(0,2),['allowedCatalog','assets']);
  assert.equal(result.messages[2].content,row.messages[2].content);assert.equal(result.split,'dev');
  assert.equal(result.targetSha256,row.targetSha256);assert.equal(result.layoutSourceInputSha256,row.inputSha256);
  assert.equal(reorder({...row,id:'different:HERO'}).sharedPrefixGroup,result.sharedPrefixGroup);
  assert.throws(()=>reorder({...row,inputSha256:'wrong'}),/INPUT_HASH_DRIFT/);
});

const parent=process.env.HERO74_PARENT,derived=process.env.HERO74_DERIVED;
test('all frozen rows preserve semantic inputs, teacher bytes and family splits', {skip:!parent||!derived},()=>{
  const bytes=(dir,name)=>fs.readFileSync(path.join(dir,name));
  const read=(dir,name)=>JSON.parse(bytes(dir,name));
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const before=read(parent,'manifest.json'),after=read(derived,'manifest.json');
  assert.equal(after.parentManifestSha256,hash(bytes(parent,'manifest.json')));
  assert.equal(after.parentExamplesSha256,before.outputs['examples.json']);
  assert.deepEqual(after.counts,before.counts);
  for(const [dir,manifest]of [[parent,before],[derived,after]])
    for(const [file,expected]of Object.entries(manifest.outputs))assert.equal(hash(bytes(dir,file)),expected,file);
  const old=read(parent,'examples.json'),rows=read(derived,'examples.json');
  assert.equal(rows.length,619);assert.deepEqual(rows,old.map(reorder));
  for(const split of ['train','dev']){
    const data=bytes(derived,split+'.jsonl').toString().trim().split('\n').map(JSON.parse);
    assert.deepEqual(data,rows.filter(row=>row.split===split));
  }
  const train=new Set(rows.filter(row=>row.split==='train').map(row=>row.groupId));
  assert(rows.filter(row=>row.split==='dev').every(row=>!train.has(row.groupId)));
  for(const row of rows){
    const peers=rows.filter(other=>other.heroId===row.heroId);
    assert(peers.every(other=>other.split===row.split));
  }
});
