// Deterministic asset resolver sidecar, not a new training dataset or retrieval
// source for the LLM. Export only asset metadata already used by frozen heroes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {modelMetadata} from './hero-distillation-adapter.mjs';
import {expandFactorTable} from './hero-distillation-freeze.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');

export function buildBindings(projects,assets){
  const declared=new Map(assets.uploadedModels.map(m=>[m.id,m.source]));
  assert.equal(declared.size,assets.uploadedModels.length,'DUPLICATE_PUBLIC_MODEL_ID');
  const models=Object.fromEntries(expandFactorTable(assets.byCollection.models).map(id=>[id,{}]));
  const uploaded=new Map();
  for(const project of projects){
    const p=project.presentation;
    assert(declared.has(p.modelKey),'MODEL_NOT_DECLARED_IN_FROZEN_ASSETS');
    const metadata=modelMetadata(p);
    assert.deepEqual(metadata.source,declared.get(p.modelKey),'PUBLIC_MODEL_SOURCE_DRIFT');
    if(uploaded.has(p.modelKey))assert.deepEqual(uploaded.get(p.modelKey),metadata,'CONFLICTING_ASSET_BINDINGS');
    else uploaded.set(p.modelKey,metadata);
  }
  for(const id of declared.keys())assert(uploaded.has(id),'MISSING_PUBLIC_UPLOADED_MODEL:'+id);
  for(const [id,metadata]of uploaded){
    // The complete public model index also lists uploaded IDs. Enrich its
    // empty locator placeholder; conflicts between actual metadata fail above.
    models[id]=metadata;
  }
  return models;
}

export function build(manifestFile,assetsDirectory,repo,out){
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  const manifestBytes=fs.readFileSync(manifestFile),manifest=JSON.parse(manifestBytes);
  const amBytes=fs.readFileSync(path.join(assetsDirectory,'manifest.json')),am=JSON.parse(amBytes);
  const assetsBytes=fs.readFileSync(path.join(assetsDirectory,'assets.json'));
  assert.equal(hash(assetsBytes),am.outputs['assets.json'],'FROZEN_ASSETS_DRIFT');
  assert.equal(hash(assetsBytes),manifest.outputs['assets.json'],'SOURCE_ASSETS_MISMATCH');
  const sources={},projects=[];
  for(const [locator,expected]of Object.entries(manifest.inputs)){
    if(!/^[a-f0-9]{40}:.+\.(?:hero-project|project)\.json$/.test(locator))continue;
    const bytes=execFileSync('git',['show',locator],{cwd:repo,maxBuffer:8*1024*1024});
    assert.equal(hash(bytes),expected,'PINNED_PROJECT_DRIFT:'+locator);
    const project=JSON.parse(bytes);
    assert.equal(project.schema,'ggd-hero-project@2','PROJECT_SCHEMA');
    sources[locator]=expected;projects.push(project);
  }
  assert.equal(projects.length,74,'EXPECTED_EXISTING_74_PROJECTS');
  const models=buildBindings(projects,JSON.parse(assetsBytes));
  const data=JSON.stringify(models,null,2)+'\n';
  const receipt={schema:'ggd-distillation-model-bindings@1',
    builderSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
    metadataExtractorSha256:hash(fs.readFileSync(new URL('./hero-distillation-adapter.mjs',import.meta.url))),
    projectManifestSha256:hash(manifestBytes),assetManifestSha256:hash(amBytes),
    publicAssetsSha256:hash(assetsBytes),sources,outputs:{'models.json':hash(data)},
    counts:{existingProjects:projects.length,uploadedModels:JSON.parse(assetsBytes).uploadedModels.length,allModels:Object.keys(models).length},
    scope:'Resolver-only catalog: source metadata, uploaded model locator and model-only asset locks. No plans, abilities, teacher answers or per-hero recommendations exported. Not added to model input or training.',
    assetBytesVerified:false,assetIdentityForGeneratedHeroVerified:false,fullHeroE2EProven:false};
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'models.json'),data,{flag:'wx'});
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return receipt.counts;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,6,'USAGE: V2_MANIFEST V3_DIR GIT_REPO NEW_OUT');
  console.log(JSON.stringify(build(...process.argv.slice(2).map(p=>path.resolve(p)))));
}
