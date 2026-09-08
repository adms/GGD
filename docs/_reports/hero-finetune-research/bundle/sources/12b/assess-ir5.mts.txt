import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {evaluateIR5Output} from './ir5-evaluation.mts';
import {currentCatalog,checkEnginePins,hash} from './ir-compiler.mts';
const here=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const pilot=process.argv[4]?path.resolve(process.argv[4]):null;
for(const p of [base,out,...(pilot?[pilot]:[])])assert.equal(path.dirname(p),here);assert(!fs.existsSync(out));
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8')),proto=read(path.join(base,'manifest.json')),requests=read(path.join(base,'requests.json'));
assert.equal(hash(JSON.stringify(requests)),proto.requestSha256);assert.equal(requests.length,6);
for(const [name,h] of Object.entries(proto.checkerPins))assert.equal(hash(fs.readFileSync(path.join(here,name))),h,'CHECKER_DRIFT');
const state=read(path.join(pilot??base,'state.json'));assert.equal(state.workerPid,null);
assert.equal(state.status,pilot?'completed-pilot-not-promoted':'completed-inference-only');
const rawPath=path.join(pilot??base,pilot?'whole_hero-raw.json':'raw.json'),raw=read(rawPath);assert(raw.complete);assert.equal(raw.results.length,requests.length);
if(pilot){
  const pm=read(path.join(pilot,'manifest.json')),ev=read(path.join(pilot,'evaluation.private.json'));
  assert.equal(hash(JSON.stringify(ev)),pm.evaluationSha256);assert.deepEqual(ev.whole_hero.requests,requests);
  assert.equal(hash(fs.readFileSync(path.join(pilot,raw.adapter.path,'adapters.safetensors'))),raw.adapter.sha256);
  assert.equal(raw.adapter.step,pm.steps);
}else assert.equal(raw.metadata.manifestSha256,hash(fs.readFileSync(path.join(base,'manifest.json'))));
checkEnginePins();const catalog=currentCatalog(),rows:any[]=[],artifacts:any[]=[];
for(let i=0;i<requests.length;i++){
  assert.equal(requests[i].id,raw.results[i].id);assert.equal(requests[i].requestDigest,raw.results[i].requestDigest);
  const {row,artifact}=evaluateIR5Output(requests[i],raw.results[i],catalog);rows.push(row);if(artifact)artifacts.push(artifact);
}
const counts=(a:any[])=>({heroes:a.length,jsonValid:a.filter(r=>r.jsonValid).length,irValid:a.filter(r=>r.irValid).length,compiled:a.filter(r=>r.compiled).length,
  engineeringPassed:a.filter(r=>r.allPredeclaredEngineeringChecksPassed).length,
  sourceFacetsPassed:a.reduce((n,r)=>n+(r.sourceFacets?.passed??0),0),sourceFacetsScored:a.reduce((n,r)=>n+(r.sourceFacets?.total??0),0),
  behaviorPassed:a.reduce((n,r)=>n+(r.behavior?.passed??0),0),behaviorAttempted:a.reduce((n,r)=>n+(r.behavior?.total??0),0),
  fullHeroQualified:0,automaticallyAccepted:0});
const manifest={schema:'ggd-ir5-fixed-engineering-assessment@1',createdAt:new Date().toISOString(),mode:pilot?'fixed-step-lora':'base',
  counts:counts(rows),real:counts(rows.filter(r=>!r.synthetic)),synthetic:counts(rows.filter(r=>r.synthetic)),
  rawSha256:hash(fs.readFileSync(rawPath)),requestSha256:proto.requestSha256,checkerPins:proto.checkerPins,
  assessmentSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),freshBlind:false,modelPromoted:false,
  limitations:proto.limitations,identityFullSourceReview:'not automatically graded; no full-source acceptance claim'};
checkEnginePins();fs.mkdirSync(out);for(const [name,v] of Object.entries({'manifest.json':manifest,'cases.json':rows,'unvalidated-projects.private.json':artifacts}))
  fs.writeFileSync(path.join(out,name),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(manifest,null,2));
