import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeOverlay,authoringOverlay} from './hero-distillation-match-entry.mts';
test('imported runtime overlay retains exact document values without repair',()=>{
  const document={id:'hero.q',schema:'ability@1',effects:[]};
  const result=runtimeOverlay([{path:'compiled/abilities/hero.q.json',document}]);
  assert.equal(result.docs['abilities/hero.q'],document);assert.deepEqual(result.deleted,{});
});
test('loader receives source tier without the compiled derived value',()=>{
  const item={id:'speed-item',modifiers:[{stat:'ms',msBonusTier:'small'}]};
  const pkg={documents:[{path:'authoring/hero-projects/a.json',document:{projectId:'a',brief:{name:'A'},acceptedPlan:{},presentation:{}}},
    {path:'authoring/items/speed-item.json',document:item}],compiled:[{document:{...item,modifiers:[{stat:'ms',msBonusTier:'small',value:0.2}]}}]};
  const snapshot=JSON.stringify(pkg);
  const generator={generateHeroDraft:()=>({champion:{id:'a'},abilityDrafts:{Q:{id:'a.q'}}})};
  const overlay=authoringOverlay(pkg,generator,'a');
  assert.deepEqual(overlay.docs['items/speed-item'],item);
  assert(!Object.hasOwn(overlay.docs['items/speed-item'].modifiers[0],'value'));
  assert.equal(JSON.stringify(pkg),snapshot);
  assert.throws(()=>authoringOverlay(pkg,generator,'wrong'),/SOURCE_PROJECT_ID_DRIFT/);
});
test('invalid paths, identities, duplicates and empty runtime are rejected',()=>{
  for(const rows of [[],[{path:'compiled/../a.json',document:{id:'a'}}],
    [{path:'compiled/champions/a.json',document:{id:'b'}}],
    Array(2).fill({path:'compiled/champions/a.json',document:{id:'a'}})])assert.throws(()=>runtimeOverlay(rows));
});
