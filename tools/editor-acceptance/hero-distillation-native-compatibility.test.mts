import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {audit,differences,inspectContract} from './hero-distillation-native-compatibility.mts';
test('difference paths detect nested values, missing keys and array shape',()=>{
  assert.deepEqual(differences({a:[1,2]},{a:[1,3]}),['/a/1']);
  assert.deepEqual(differences({a:undefined},{}),['/a']);
  assert.deepEqual(differences({'a/b':{'~':1}},{'a/b':{'~':2}}),['/a~1b/~0']);
  assert.deepEqual(differences([],{}),['/']);
  assert.deepEqual(differences({a:[1]},{a:[1]}),[]);
});
test('contract audit rejects moving branches rather than silently selecting latest',async()=>{
  await assert.rejects(()=>inspectContract(path.resolve('.'),'origin/main'),/EXACT_REVISION_REQUIRED/);
});
test('real two-hero audit reproduces the immutable report; no compatibility promoted',async()=>{
  const base=path.resolve('docs/_reports/hero-finetune-research');
  const expected=JSON.parse(fs.readFileSync(path.join(base,'hero74-native-compatibility-control-v2/report.json'),'utf8'));
  const output=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'ggd-native-compat-test-')),'audit');
  const actual=await audit(path.resolve('.'),path.join(base,'hero74-generation-compile-control-v2'),expected.candidateRevision,output);
  assert.deepEqual(actual,expected);
  assert.deepEqual(actual.counts,{nativeWholeHeroes:2,candidateCompilePassed:2,runtimeIdentical:0,sourceCatalogRuntimeIdentical:0});
  assert.equal(actual.fullHeroE2EProven,false);assert.equal(actual.modelPromoted,false);
  assert.equal(actual.contracts['6aeb6aeb39c1d3a4a16c185f035b3c0c65896b92'].championAuthoringKindAccepted,false);
  assert.equal(actual.contracts[expected.candidateRevision].championAuthoringKindAccepted,true);
  assert.deepEqual(actual.rows.map((r:any)=>r.differenceCount),[5,12]);
  assert.deepEqual(actual.rows.map((r:any)=>r.candidateWithSourceCatalog.differenceCount),[3,12]);
});
