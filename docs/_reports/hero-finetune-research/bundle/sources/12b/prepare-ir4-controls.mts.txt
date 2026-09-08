import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {hash,checkEnginePins} from './ir4-compiler.mts';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));checkEnginePins();
const read=(f:string)=>JSON.parse(fs.readFileSync(path.join(here,f),'utf8'));
const rows=read('mechanism-mask-controls-v1/dataset.private.json'),data=read('mechanism-mask-controls-v1/manifest.json');
assert.equal(hash(JSON.stringify(rows)),data.datasetSha256);
const old=read('ir2-jsonschema-smoke-v1/manifest.json');
const requests=rows.map((r:any)=>({id:r.heroId,messages:r.messages,requestDigest:r.requestDigest}));
for(const r of requests)assert.equal(hash(JSON.stringify(r.messages)),r.requestDigest);
const checkerFiles=['evaluate-ir4-controls.mts','ir-v4.mts','ir4-compiler.mts','ir4-json-schema.mts','ir-v2.mts','semantic-ir.mts',
  'native-mechanism-actions.mts','ir-compiler.mts','whole-plan-probes-v3.mts','whole-plan-policy-probes.mts','probe-harness.mts','normalize.mjs','intake.mjs'];
const execution=Object.fromEntries(['seed','thinking','temperature','prefillStepSize','repairAttempts','quantization','model','revision','modelDirectory',
  'metalLimitGiB','loadSeconds','guard'].map(k=>[k,old[k]]));
const manifest={...execution,schema:'ggd-ir4-control-inference-protocol@1',createdAt:new Date().toISOString(),
  selected:requests.map((r:any)=>r.id),heroCount:requests.length,maxTokens:8192,maxPromptTokens:8000,maxContextTokens:16384,caseSeconds:180,workerMinutes:10,
  requestSha256:hash(JSON.stringify(requests)),responseSchemaSha256:data.responseSchemaSha256,
  controlDatasetSha256:data.datasetSha256,checkerFiles,checkerPins:Object.fromEntries(checkerFiles.map(f=>[f,hash(fs.readFileSync(path.join(here,f)))])),
  generatorSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  purpose:'Observe complete six-slot model outputs under native-action IR4 before any mechanism-output SFT; no more facts-only proxy training.',
  notTraining:true,notBlind:true,canPromoteModel:false,releaseQualified:false,grammarConstrainedDecoding:false,
  predeclaredMetrics:['all-two accounting including invalid/truncated outputs','JSON','strict IR4 and anchors','unchanged compiler','diagnostic checks and inherited policy separately','manual complete source adjudication'],
  limitations:['Two same-family historically exposed sources; not final holdout.','Do not compare this aggregate rate against different prior four-hero cohort.','Diagnostics contain preview parameter checks; they are not parameter-invariant semantic accuracy.','No target answers, masks, labels or compiled recipes enter prompts.']};
fs.mkdirSync(out);for(const [f,v] of Object.entries({'manifest.json':manifest,'requests.json':requests}))fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({selected:manifest.selected,requestSha256:manifest.requestSha256},null,2));
