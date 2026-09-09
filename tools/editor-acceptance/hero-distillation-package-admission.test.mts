import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assetReader,admitProject} from './hero-distillation-package-admission.mts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ggd-package-admission-test-'));
const hash=(x:any)=>createHash('sha256').update(x).digest('hex');
for(const name of ['a','b'])fs.mkdirSync(path.join(root,name,'assets'),{recursive:true});
const a=path.join(root,'a'),b=path.join(root,'b');
fs.writeFileSync(path.join(a,'assets/model.glb'),'original');
fs.writeFileSync(path.join(b,'assets/model.glb'),'different');
test('only contained assets; missing bytes do not become placeholders',()=>{
  const r=assetReader([a]);
  assert.equal(Buffer.from(r.readAsset('assets/model.glb')!).toString(),'original');
  assert.equal(r.evidence['assets/model.glb'].sha256,hash('original'));
  assert.equal(r.readAsset('assets/missing.glb'),undefined);
  assert.deepEqual(r.evidence['assets/missing.glb'],{exists:false});
  for(const p of ['../secret','assets/../secret','/assets/model.glb','assets\\x','assets//x'])assert.throws(()=>r.readAsset(p),/UNSAFE_ASSET_PATH/);
});
test('conflicting roots and symlinks escaping a root fail closed',()=>{
  assert.throws(()=>assetReader([a,b]).readAsset('assets/model.glb'),/AMBIGUOUS_ASSET_BYTES/);
  fs.symlinkSync(path.join(b,'assets/model.glb'),path.join(a,'assets/escape.glb'));
  assert.throws(()=>assetReader([a]).readAsset('assets/escape.glb'),/ASSET_SYMLINK_ESCAPE/);
});
const project={projectId:'test',presentation:{modelKey:'body',uploadedModel:{sha256:hash('original'),byteSize:8}}};
function engine(){return {
  documents:new Map(),uploadSchema:{uploadedHeroModelPath:()=> 'assets/model.glb'},
  upload:{verifyUploadedHeroModel:async(m:any,bytes:Uint8Array)=>{
    assert.equal(hash(bytes),m.sha256,'MODEL_BYTES_WRONG');
    return {model:m,document:{id:'body'},inspected:{triangles:1,meshes:1},warnings:[]};
  }},pkg:{compileHeroPackageProject:(p:any,c:any,simulate:boolean)=>{
    assert.equal(simulate,true);assert.equal(c.validatedUploadedModel.projectId,p.projectId);
    assert.deepEqual(c.documents.get('models/body'),{id:'body'});return {project:p};
  }}};}
test('verified bytes grant only this project model admission; source not edited',async()=>{
  const p={format:'hero-project',project},before=JSON.stringify(p),e=engine();
  const result=await admitProject(p,e,assetReader([a]));
  assert.equal(result.verifiedModel.sha256,hash('original'));
  assert.equal(JSON.stringify(p),before);assert.equal(e.documents.size,0);
});
test('no compiler bypass on missing bytes, wrong hash or model binding',async()=>{
  const e=engine();let compiled=0;e.pkg.compileHeroPackageProject=()=>{compiled++;return {};};
  const output={format:'hero-project',project};
  const missing=path.join(root,'missing');fs.mkdirSync(missing);
  await assert.rejects(()=>admitProject(output,e,assetReader([missing])),/UPLOADED_MODEL_BYTES_MISSING/);
  await assert.rejects(()=>admitProject(output,e,assetReader([b])),/MODEL_BYTES_WRONG/);
  const wrong=structuredClone(output);wrong.project.presentation.modelKey='wrong';
  await assert.rejects(()=>admitProject(wrong,e,assetReader([a])),/MODEL_BINDING_MISMATCH/);
  assert.equal(compiled,0);
});
test('native content is not silently converted or declared importable',async()=>{
  await assert.rejects(()=>admitProject({format:'native-content'},engine(),assetReader([a])),/NATIVE_IMPORT_BRIDGE_PENDING/);
});
test('pinned engine admission failure is retained; no repair or fallback',async()=>{
  const e=engine();e.pkg.compileHeroPackageProject=()=>{throw Error('required mechanism missing');};
  await assert.rejects(()=>admitProject({format:'hero-project',project},e,assetReader([a])),/required mechanism missing/);
});
test('real teacher control preserves all 17 cases and never claims live import',()=>{
  const dir=path.resolve('docs/_reports/hero-finetune-research/hero74-package-admission-control-v1');
  const report=JSON.parse(fs.readFileSync(path.join(dir,'report.json'),'utf8'));
  assert.equal(report.scriptSha256,hash(fs.readFileSync(new URL('./hero-distillation-package-admission.mts',import.meta.url))));
  assert.deepEqual(report.counts,{wholeHeroes:17,packageAdmissionPassed:15,nativeBridgePending:2,failed:0});
  assert.equal(report.sourceEvidence.arm,'teacher-control');assert.equal(report.sourceEvidence.modelInferenceCalls,0);
  assert.equal(report.fullHeroE2EProven,false);assert.equal(report.modelPromoted,false);
  for(const row of report.rows){
    assert.equal(row.fullHeroE2EProven,false);assert.equal(row.humanRepairs,0);
    if(!row.packageAdmissionPassed)continue;
    const bytes=fs.readFileSync(path.join(dir,row.artifact));assert.equal(hash(bytes),row.artifactSha256);
    const artifact=JSON.parse(bytes.toString());assert(artifact.scenarios);assert.equal(artifact.project.projectId,row.heroId);
    assert(row.assetCount>0);assert(row.dependencyCount>0);
    for(const asset of artifact.assets){assert.equal(row.assets[asset.path].exists,true);
      assert.equal('sha256:'+row.assets[asset.path].sha256,asset.contentSha256);assert.equal(row.assets[asset.path].bytes,asset.byteSize);}
  }
});
