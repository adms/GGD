import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBindings} from './hero-distillation-model-bindings.mjs';
import {factorTable} from './hero-distillation-freeze.mjs';
const source={sourceAssetId:'asset-a',sourceCharacter:'source',sourceWork:'work'};
const assets={uploadedModels:[{id:'uploaded.a',source}],byCollection:{models:factorTable(['shipped.a'])}};
const project={acceptedPlan:{secretAnswer:'never-export'},presentation:{modelKey:'uploaded.a',
  uploadedModel:{id:'asset-a',file:'model.glb'},modelProvenance:{...source,relationship:'exact',rationale:'teacher-specific'},
  assetLocks:[{kind:'model',sha256:'fixture'},{kind:'icon',teacherHint:'never-export'}],slots:{Q:{answer:'never-export'}}}};

test('asset-only sidecar strips teacher plan, slots, relationship and non-model locks',()=>{
  const result=buildBindings([project],assets);
  assert.deepEqual(result['shipped.a'],{});
  assert.deepEqual(result['uploaded.a'],{uploadedModel:project.presentation.uploadedModel,source,
    assetLocks:[{kind:'model',sha256:'fixture'}]});
  assert(!JSON.stringify(result).includes('never-export'));
  assert(!JSON.stringify(result).includes('teacher-specific'));
});
test('shared asset accepts identical metadata but rejects conflicts and unlisted IDs',()=>{
  assert.deepEqual(buildBindings([project,structuredClone(project)],assets),buildBindings([project],assets));
  const changed=structuredClone(project);changed.presentation.uploadedModel.file='other.glb';
  assert.throws(()=>buildBindings([project,changed],assets),/CONFLICTING_ASSET_BINDINGS/);
  changed.presentation.modelKey='private.b';
  assert.throws(()=>buildBindings([changed],assets),/MODEL_NOT_DECLARED/);
});
test('missing models and drifted public source fail closed',()=>{
  assert.throws(()=>buildBindings([],assets),/MISSING_PUBLIC_UPLOADED_MODEL/);
  const changed=structuredClone(project);changed.presentation.modelProvenance.sourceWork='other';
  assert.throws(()=>buildBindings([changed],assets),/PUBLIC_MODEL_SOURCE_DRIFT/);
});
test('uploaded models may also appear in the full public index',()=>{
  const overlapping=structuredClone(assets);
  overlapping.byCollection.models=factorTable(['shipped.a','uploaded.a']);
  assert.deepEqual(buildBindings([project],overlapping),buildBindings([project],assets));
});
