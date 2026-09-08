/** Cross-check report inputs without regenerating or changing historical results. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {sha} from './intake.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
assert.equal(process.argv.length,3,'USAGE: node verify-ir3-development.mjs NEW_JSON_REPORT');
const output=path.resolve(process.argv[2]);assert.equal(path.dirname(output),here);assert(!fs.existsSync(output));
const read=f=>JSON.parse(fs.readFileSync(path.join(here,f),'utf8'));
const bytes=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(here,f))).digest('hex');
const review=read('IR3_JSONSCHEMA_MANUAL_REVIEW.json'),raw=read('ir3-jsonschema-smoke-v1/raw.json');
assert.equal(review.rawSha256,bytes('ir3-jsonschema-smoke-v1/raw.json'));
assert.equal(review.sourceInputSha256,bytes('source-review-v1/model-inputs.json'));
assert.equal(review.rows.length,4);assert.equal(review.automaticAccept,false);
for(const [i,r] of review.rows.entries()){
  assert.equal(r.id,raw.results[i].id);
  assert.equal(r.responseTextSha256,crypto.createHash('sha256').update(raw.results[i].envelope.text).digest('hex'));
}
const runs=['ir3-smoke-v1','ir3-jsonschema-smoke-v1'];
const measurements=runs.map((run,i)=>{
  const state=read(`${run}/state.json`),a=read(`${run}-assessment/manifest.json`);
  assert.equal(state.status,'completed-inference-only');assert.equal(state.workerPid,null);
  assert.equal(a.rawSha256,bytes(`${run}/raw.json`));
  assert.equal(a.counts.jsonValid,4);assert.equal(a.counts.irValid,i);assert.equal(a.counts.compiled,i);
  assert.equal(a.counts.wholeHeroQualified,0);assert.equal(a.counts.automaticallyAccepted,0);
  const receipt=read(i?'IR3_JSONSCHEMA_GPU_VERIFICATION_V1.json':'IR3_GPU_VERIFICATION_V1.json');
  assert.equal(receipt.run,run);assert(receipt.pinnedArtifactsVerified);assert(receipt.ownWorkerFinished);
  for(const [f,h] of Object.entries(a.checkerPins))assert.equal(bytes(f),h,`CHECKER_DRIFT:${f}`);
  return {run,...a.counts,supervisedSeconds:receipt.supervisedSeconds,resources:receipt.resources};
});
const intent=read('whole-intent-review-v1/manifest.json'),heroes=read('whole-intent-review-v1/whole-heroes.private.json');
assert.equal(sha(heroes),intent.datasetSha256);assert.equal(heroes.length,9);
assert(heroes.every(h=>h.trainingAdmitted===false&&h.completeExecutableGold===false&&h.freshBlind===false));
assert.equal(intent.slots,54);assert.equal(intent.trainingAdmitted,0);
const extensions=[1,2,3].map(v=>{
  const m=read(`extension-admission-v${v}/manifest.json`),cases=read(`extension-admission-v${v}/cases.json`);
  assert.equal(m.runtimeProbes.passed,cases.filter(x=>x.passed).length);
  assert.equal(m.runtimeProbes.total,cases.length);
  if(v>1)assert.equal(m.testScriptSha256,bytes(`extension-admission-probes-v${v}.mts`));
  return {version:v,...m.runtimeProbes};
});
assert.deepEqual(extensions.map(x=>[x.passed,x.total]),[[4,8],[8,12],[12,12]]);
const log=fs.readFileSync(path.join(here,'ir3-extension-tests-v1.txt'),'utf8');
assert(log.includes('tests 54')&&log.includes('pass 54')&&log.includes('fail 0'));
const report=fs.readFileSync(path.join(here,'IR3_DEVELOPMENT_REPORT.md'),'utf8');
const links=[...report.matchAll(/\]\(([^)]+)\)/g)].map(m=>m[1]);
for(const link of links)assert(fs.existsSync(path.resolve(here,link)),`BROKEN_REPORT_LINK:${link}`);
const result={schema:'ggd-ir3-development-verification@1',createdAt:new Date().toISOString(),
  measurements,intent:{heroes:intent.heroes,slots:intent.slots,sourceFamilies:intent.sourceFamilies,
    datasetSha256:intent.datasetSha256,trainingAdmitted:intent.trainingAdmitted},extensions,
  manualReviewDigestsVerified:true,reportLinksVerified:links.length,
  currentTestLogSha256:bytes('ir3-extension-tests-v1.txt'),
  extensionModuleSha256:bytes('native-mechanism-actions.mts'),extensionTestSha256:bytes('native-mechanism-actions.test.mts'),
  sharedGpuLockAbsent:!fs.existsSync('/private/tmp/ggd-forge-training-runtime/gpu.lock'),
  fullHeroQualified:0,modelPromoted:false,goalComplete:false};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
