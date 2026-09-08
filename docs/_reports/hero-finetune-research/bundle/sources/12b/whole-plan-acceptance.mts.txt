import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {WHOLE_PLANS} from './whole-plan-seeds-v1.mts';
import {compileIR4,currentCatalog,checkEnginePins,hash} from './ir4-compiler.mts';
import {wholePlanProbes} from './whole-plan-probes-v3.mts';
import {wholePlanPolicyProbes} from './whole-plan-policy-probes.mts';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));checkEnginePins();const catalog=currentCatalog();
const rows=WHOLE_PLANS.map(f=>{const built=compileIR4(f.ir,f.source,catalog);
  const source=wholePlanProbes(built.compiled,f.id,catalog),policy=wholePlanPolicyProbes(built.compiled,catalog);
  return {id:f.id,source,policy,sourceAndPolicyChecksPassed:source.passed===source.total&&policy.passed===policy.total,
    fullHeroQualified:false,trainingAdmitted:false};});
const negative=compileIR4(WHOLE_PLANS[1].ir,WHOLE_PLANS[1].source,catalog).compiled;negative.abilityDrafts.EX.cooldown=[0];
const negativePolicy=wholePlanPolicyProbes(negative,catalog);
assert(negativePolicy.rows.every(r=>!r.passed&&r.error?.includes('INHERITED_EX_COOLDOWN_POLICY')));
checkEnginePins();fs.mkdirSync(out);
const manifest={schema:'ggd-whole-plan-source-and-policy-acceptance@1',createdAt:new Date().toISOString(),heroes:rows.length,
  sourceChecks:{passed:rows.reduce((n,r)=>n+r.source.passed,0),total:rows.reduce((n,r)=>n+r.source.total,0)},
  policyChecks:{passed:rows.reduce((n,r)=>n+r.policy.passed,0),total:rows.reduce((n,r)=>n+r.policy.total,0)},
  zeroAuthoredCooldownRejectedBothSeeds:negativePolicy.rows.every(r=>!r.passed),
  checkerPins:Object.fromEntries(['whole-plan-acceptance.mts','whole-plan-policy-probes.mts','whole-plan-probes-v3.mts','whole-plan-seeds-v1.mts','ir-v4.mts','ir4-compiler.mts'].map(f=>[f,hash(fs.readFileSync(path.join(here,f)))])),
  oldMutationScoresNotRewritten:true,modelInference:false,modelTraining:false,trainingAdmitted:0,fullHeroQualified:0};
for(const [name,value] of Object.entries({'manifest.json':manifest,'cases.json':{rows,negativePolicy}}))fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(manifest,null,2));process.exitCode=rows.every(r=>r.sourceAndPolicyChecksPassed)?0:1;
