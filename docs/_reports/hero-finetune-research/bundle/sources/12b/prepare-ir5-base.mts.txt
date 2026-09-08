import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {hash,checkEnginePins} from './ir-compiler.mts';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));checkEnginePins();
const read=(f:string)=>JSON.parse(fs.readFileSync(path.join(here,f),'utf8'));
const data=read('ir5-data-stage-v1/manifest.json'),all=read('ir5-data-stage-v1/dataset.private.json'),verified=read('ir5-stage-verification-v1/manifest.json');
assert.equal(data.datasetSha256,hash(JSON.stringify(all)));assert.equal(verified.datasetSha256,data.datasetSha256);assert.equal(verified.passedTests,66);assert.equal(verified.supervisedCastFields,168);
const rows=all.filter((r:any)=>r.split!=='engineering-train-candidate');assert.equal(rows.length,6);
const requests=rows.map((r:any)=>({id:r.heroId,messages:r.messages,requestDigest:r.requestDigest}));
const old=read('ir4-controls-base-v1/manifest.json'),execution=Object.fromEntries(['seed','thinking','temperature','prefillStepSize','repairAttempts','quantization','model','revision',
  'modelDirectory','metalLimitGiB','loadSeconds','guard'].map(k=>[k,old[k]]));
const checkerFiles=['ir5-evaluation.mts','ir-v5.mts','ir5-json-schema.mts','whole-plan-seeds-v2.mts','whole-plan-seeds-v1.mts','contrast-heroes-v1.mts','contrast-probes-v1.mts',
  'whole-plan-probes-ir5.mts','whole-plan-probes-v3.mts','whole-plan-policy-probes.mts','ir-v4.mts','ir4-compiler.mts','native-mechanism-actions.mts','ir-v2.mts','semantic-ir.mts','ir-compiler.mts','probe-harness.mts','normalize.mjs','intake.mjs'];
const manifest={...execution,schema:'ggd-ir5-engineering-base-protocol@1',createdAt:new Date().toISOString(),selected:requests.map((r:any)=>r.id),heroCount:6,
  maxTokens:8192,maxPromptTokens:8000,maxContextTokens:16384,caseSeconds:180,workerMinutes:22,
  requestSha256:hash(JSON.stringify(requests)),responseSchemaSha256:data.responseSchemaSha256,controlDatasetSha256:data.datasetSha256,
  checkerFiles,checkerPins:Object.fromEntries(checkerFiles.map(f=>[f,hash(fs.readFileSync(path.join(here,f)))])),
  preparationSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),verificationManifestSha256:hash(fs.readFileSync(path.join(here,'ir5-stage-verification-v1/manifest.json'))),
  purpose:'Fixed baseline for a masked full-IR engineering LoRA experiment, not another prompt-only search.',
  notTraining:true,notBlind:true,canPromoteModel:false,releaseQualified:false,grammarConstrainedDecoding:false,
  predeclaredMetrics:['all 6 cases counted including invalid outputs','JSON','IR5','compiler','source-known facets','bounded real behavior and separate inherited policy','manual identity and source review'],
  limitations:['2 historically exposed real controls; 4 shared-wording synthetic permutation dev controls. No independent generalization claim.',
    'Synthetic names also indicate global timing; this is a favorable serialization/composition control, not adversarial comprehension evidence.',
    'A future corpus needs neutral-name, mixed-slot-timing, independent wording and mechanism-family controls.',
    'Full-source identity, untested engine behaviors and independent holdout remain unqualified.']};
fs.mkdirSync(out);for(const [name,v] of Object.entries({'manifest.json':manifest,'requests.json':requests}))fs.writeFileSync(path.join(out,name),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({selected:manifest.selected,requestSha256:manifest.requestSha256},null,2));
