import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {normalizeFinal} from './normalize.mjs';
import {validateIR4} from './ir-v4.mts';
import {compileIR4,currentCatalog,checkEnginePins,hash} from './ir4-compiler.mts';
import {wholePlanProbes} from './whole-plan-probes-v3.mts';
import {wholePlanPolicyProbes} from './whole-plan-policy-probes.mts';
const here=path.dirname(fileURLToPath(import.meta.url)),run=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
assert.equal(path.dirname(run),here);assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));
const read=(f:string)=>JSON.parse(fs.readFileSync(path.join(run,f),'utf8'));
const p=read('manifest.json'),raw=read('raw.json'),state=read('state.json'),requests=read('requests.json');
assert.equal(state.status,'completed-inference-only');assert.equal(state.workerPid,null);assert(raw.complete);
assert.equal(raw.results.length,p.heroCount);assert.equal(requests.length,p.heroCount);assert.equal(hash(JSON.stringify(requests)),p.requestSha256);
assert.equal(raw.metadata.manifestSha256,hash(fs.readFileSync(path.join(run,'manifest.json'))));
assert.deepEqual(state.checkerPinsBeforeInference,p.checkerPins);
for(const [f,h] of Object.entries(p.checkerPins))assert.equal(hash(fs.readFileSync(path.join(here,f))),h);
checkEnginePins();const catalog=currentCatalog(),rows:any[]=[],artifacts:any[]=[];
for(let i=0;i<requests.length;i++){
  const req=requests[i],res=raw.results[i];assert.equal(req.id,res.id);assert.equal(req.requestDigest,res.requestDigest);
  const input=JSON.parse(req.messages[1].content),source={id:req.id,hero:input.source,slots:input.slots,sources:input.sources};
  const n=normalizeFinal(res.envelope),row:any={id:req.id,jsonValid:n.ok,irValid:false,compiled:false,sourceEntailmentVerified:false,automaticallyAccepted:false};
  if(!n.ok)row.error=n.error;else{
    try{row.gaps=validateIR4(n.value,source).gaps;row.irValid=true;}catch(e){row.irError=String(e);}
    if(row.irValid)try{
      const built=compileIR4(n.value,source,catalog);row.compiled=true;
      const diagnostic=wholePlanProbes(built.compiled,req.id,catalog),policy=wholePlanPolicyProbes(built.compiled,catalog);
      row.diagnosticChecks={passed:diagnostic.passed,total:diagnostic.total,failures:diagnostic.rows.filter(x=>!x.passed).map(x=>({name:x.name,error:x.error}))};
      row.policyChecks={passed:policy.passed,total:policy.total,failures:policy.rows.filter(x=>!x.passed).map(x=>({name:x.name,error:x.error}))};
      artifacts.push({id:req.id,...built,diagnostic,policy});
    }catch(e){row.compilerOrHarnessError=String(e);}
  }rows.push(row);
}
checkEnginePins();fs.mkdirSync(out);
const manifest={schema:'ggd-ir4-control-inference-assessment@1',createdAt:new Date().toISOString(),run:path.basename(run),
  counts:{heroes:rows.length,jsonValid:rows.filter(r=>r.jsonValid).length,irValid:rows.filter(r=>r.irValid).length,compiled:rows.filter(r=>r.compiled).length,
    diagnosticPassed:rows.reduce((n,r)=>n+(r.diagnosticChecks?.passed??0),0),diagnosticAttempted:rows.reduce((n,r)=>n+(r.diagnosticChecks?.total??0),0),
    fullHeroQualified:0,automaticallyAccepted:0},
  rawSha256:hash(fs.readFileSync(path.join(run,'raw.json'))),checkerPins:p.checkerPins,
  manualReviewRequired:true,diagnosticProbesNotParameterInvariant:true,
  limitations:['Inherited policy is separately scored, not a source number.','Some old positive probes encode preview timing/shape; failures need manual source adjudication, not automatic semantic failure.','This is a two-hero exposed control cohort, not comparable to prior four-hero aggregate rates.'],
  modelTraining:false,freshBlind:false,modelPromoted:false};
for(const [f,v] of Object.entries({'manifest.json':manifest,'cases.json':rows,'unvalidated-projects.private.json':artifacts}))fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...manifest,rows},null,2));
