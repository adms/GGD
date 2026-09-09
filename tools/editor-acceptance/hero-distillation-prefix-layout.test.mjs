import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
