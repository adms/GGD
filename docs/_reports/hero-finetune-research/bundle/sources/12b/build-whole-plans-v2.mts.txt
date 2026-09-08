import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {WHOLE_PLANS} from './whole-plan-seeds-v1.mts';
import {compileIR4,checkEnginePins,currentCatalog,hash} from './ir4-compiler.mts';
import {wholePlanProbes} from './whole-plan-probes-v2.mts';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));checkEnginePins();
const catalog=currentCatalog(),rows=WHOLE_PLANS.map(f=>{
  const built=compileIR4(f.ir,f.source,catalog),probes=wholePlanProbes(built.compiled,f.id,catalog);
  assert.equal(built.project.sourceDesign!.ownerText,f.source.hero.originalText);
  return {...f,built,probes};
});
checkEnginePins();fs.mkdirSync(out);
const checkerFiles=['ir-v4.mts','ir4-compiler.mts','native-mechanism-actions.mts','whole-plan-seeds-v1.mts','whole-plan-probes-v2.mts','probe-harness.mts'];
const manifest={schema:'ggd-whole-mechanism-plan-candidates@2',createdAt:new Date().toISOString(),heroes:rows.length,slots:12,
  fullSourceReadByAssistant:true,oldMappingsCopied:false,ownerApproved:false,freshBlind:false,trainingAdmitted:0,
  checkerPins:Object.fromEntries(checkerFiles.map(f=>[f,hash(fs.readFileSync(path.join(here,f)))])),
  sourcePinSha256:hash(fs.readFileSync(path.join(here,'current-engine-v1/source-pins.json'))),
  rows:rows.map(r=>({id:r.id,compiled:true,probesPassed:r.probes.passed,probesTotal:r.probes.total,
    failures:r.probes.rows.filter((p:any)=>!p.passed).map((p:any)=>({name:p.name,seed:p.seed,error:p.error})),
    explicitChoices:r.choices,implicitPreviewProposals:r.built.lowered.proposals,completeExecutableGold:false})),
  fullHeroQualified:0,modelInference:false,modelTraining:false,liveEngineEdited:false,priorRun:'whole-plan-candidates-v1',changes:['Count only unexpired positive shield pools and verify post-expiry incoming damage.','Check native ground range clamp and far-target exclusion, not targeted-cast rejection.']};
for(const [name,data] of Object.entries({'manifest.json':manifest,'whole-heroes.private.json':rows}))
  fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(manifest,null,2));process.exitCode=rows.every(r=>r.probes.passed===r.probes.total)?0:1;
