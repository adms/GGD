import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeOverlay} from './hero-distillation-match-entry.mts';
test('imported runtime overlay retains exact document values without repair',()=>{
  const document={id:'hero.q',schema:'ability@1',effects:[]};
  const result=runtimeOverlay([{path:'compiled/abilities/hero.q.json',document}]);
  assert.equal(result.docs['abilities/hero.q'],document);assert.deepEqual(result.deleted,{});
});
test('invalid paths, identities, duplicates and empty runtime are rejected',()=>{
  for(const rows of [[],[{path:'compiled/../a.json',document:{id:'a'}}],
    [{path:'compiled/champions/a.json',document:{id:'b'}}],
    Array(2).fill({path:'compiled/champions/a.json',document:{id:'a'}})])assert.throws(()=>runtimeOverlay(rows));
});
