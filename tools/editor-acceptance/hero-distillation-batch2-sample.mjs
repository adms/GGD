// Bounded CPU-only replay into the intake directory. Never modifies upstream receipts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {SOURCE_COMMIT,DATA} from './hero-distillation-batch2-validation.mjs';
const [repoArg,outArg]=process.argv.slice(2);assert(repoArg&&outArg,'USAGE: SOURCE_REPO INTAKE_DIRECTORY');
const repo=path.resolve(repoArg),out=path.resolve(outArg),read=f=>JSON.parse(fs.readFileSync(path.join(out,f)));
const intake=read('intake.json');assert.equal(intake.sourceCommit,SOURCE_COMMIT);
assert(!fs.existsSync(path.join(out,'sample.json')),'REFUSE_OVERWRITE');
const git=args=>execFileSync('git',args,{cwd:repo});
git(['cat-file','-e',SOURCE_COMMIT+'^{commit}']);
const scopes=['tools/editor-acceptance/batch2-37','packages/shared/src','content',DATA];
assert.equal(git(['diff',SOURCE_COMMIT,'--',...scopes]).length,0,'DIRTY_REPLAY_SOURCE');
assert.equal(git(['ls-files','--others','--exclude-standard','--',...scopes]).length,0,'UNTRACKED_REPLAY_SOURCE');
const harness=await import(pathToFileURL(path.join(repo,'tools/editor-acceptance/batch2-37/sim-harness.mjs')));
const {roster}=await import(pathToFileURL(path.join(repo,'tools/editor-acceptance/batch2-37/roster.mjs')));
const {baseline}=harness.loadBaseline();
const checks=[],raw=[],heroes=[];
const record=(id,name,run,predicate)=>{raw.push({id,name,run});const passed=!!predicate(run);checks.push({id,name,passed});return run;};
for(const id of intake.samplePlan.heroes){
  const draft=read(`evaluator/private/compiled/${id}.json`),hero=roster.find(h=>h.id===id);
  const options={baseline,seed:1234,relatedChampions:draft.relatedChampions??draft.formChampions??[]};
  const before=JSON.stringify(draft),combos=[];
  for(const combo of hero.combos){
    const result=harness.evaluateCombo(draft,combo,options);raw.push({id,kind:'four-timeline-causal-replay',result});
    const {runs,...summary}=result;combos.push(summary);checks.push({id,name:`causal ${combo.source}->${combo.target}`,passed:result.status==='passed'});
  }
  for(const p of harness.probePassiveBehavior(draft,options,hero.passiveScenarios??[])){
    raw.push({id,kind:'passive-control',result:p});checks.push({id,name:`passive ${p.event}`,passed:p.status==='passed'});
  }
  const run=steps=>harness.runSequence(draft,{...options,steps});
  if(id==='b2-naofumi'){
    record(id,'Q shields ally, not caster',run([{kind:'cast',slot:'Q',target:'ally',waitSec:.3}]),r=>r.steps[0].accepted&&r.after.ally.shield>0&&r.after.caster.shield===0);
    record(id,'Q rejects enemy',run([{kind:'cast',slot:'Q',target:'foe',waitSec:.3}]),r=>!r.steps[0].accepted&&r.after.foe.shield===0);
  }
  if(id==='b2-rin'){
    record(id,'Q->W spends bank and does not transfer mana to victim',run([{kind:'cast',slot:'Q',waitSec:.3},{kind:'cast',slot:'W',target:'foe',waitSec:.5}]),r=>r.steps.every(s=>s.accepted)&&r.steps[0].after.caster.statuses.some(s=>s.statusId==='nen-banked')&&!r.after.caster.statuses.some(s=>s.statusId==='nen-banked')&&r.after.foe.mana===r.initial.foe.mana);
  }
  if(id==='b2-noor'){
    for(const slot of ['W','E','Q'])record(id,`physical-only reflect: incoming fixture ${slot}`,run([{kind:'cast',slot:'Q',waitSec:.2},{kind:'cast',actor:'foe',slot,target:'caster',waitSec:.4}]),r=>r.steps.every(s=>s.accepted)&&r.after.caster.statuses.some(s=>s.statusId==='rage')===(slot==='W'));
  }
  if(id==='b2-haga'){
    record(id,'W does not teleport without own mark',run([{kind:'cast',slot:'W',target:'foe',waitSec:.3}]),r=>r.steps[0].accepted&&r.after.caster.x===r.initial.caster.x&&r.after.caster.z===r.initial.caster.z);
    record(id,'E silences rather than stuns',run([{kind:'cast',slot:'E',target:'foe',waitSec:.3}]),r=>r.steps[0].accepted&&r.after.foe.statuses.some(s=>s.statusId==='magic-break'&&s.silenced&&!s.stunned&&!s.root));
  }
  if(id==='b2-kisaragi'){
    const steps=[{kind:'cast',slot:'R',waitSec:.3},{kind:'stop',waitSec:6}];
    const a=record(id,'R enemy three flags; ally/far unaffected; expiry',run(steps),r=>{
      const after=r.steps[0].after;
      return r.steps[0].accepted&&['curse','blind','confusion'].every(id=>after.foe.statuses.some(s=>s.statusId===id))
        &&after.ally.statuses.length===0&&after.far.statuses.length===0&&after.ally.x===r.initial.ally.x&&after.ally.z===r.initial.ally.z
        &&after.far.x===r.initial.far.x&&after.far.z===r.initial.far.z&&!r.after.foe.statuses.some(s=>['curse','blind','confusion'].includes(s.statusId));
    });
    record(id,'R fixed seed is reproducible',run(steps),r=>r.steps.map(s=>s.digest).join()===a.steps.map(s=>s.digest).join());
  }
  assert.equal(JSON.stringify(draft),before,'SOURCE_DRAFT_MUTATED');
  heroes.push({id,combos});console.log(id,checks.filter(c=>c.id===id).every(c=>c.passed)?'passed':'failed');
}
assert.equal(git(['diff',SOURCE_COMMIT,'--',...scopes]).length,0,'SOURCE_CHANGED');
const evidence=gzipSync(JSON.stringify(raw)+'\n'),evidenceName='sample-raw.json.gz';
fs.writeFileSync(path.join(out,evidenceName),evidence,{flag:'wx'});
const result={schema:'ggd-batch2-validation-sample@1',sourceCommit:SOURCE_COMMIT,baselineDigest:baseline.digest,
  sampledHeroes:heroes.length,mechanismProseSlotsRead:30,checks,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,
  causalCombos:heroes.reduce((n,h)=>n+h.combos.length,0),causalTimelines:heroes.reduce((n,h)=>n+h.combos.length*4,0),heroes,
  evidence:{path:evidenceName,sha256:createHash('sha256').update(evidence).digest('hex'),bytes:evidence.length},
  limits:['Risk-selected sample, not all-37 semantic review or statistical quality estimate.','Reuses pinned upstream SimWorld harness; additional assertions authored in this intake.','Rank 1 on level 18 isolated simulation, not live-game import/render/balance.','Teacher-specific tests are not the scorer for arbitrary equivalent generated designs.'],
  modelInferenceStarted:false,trainingChanged:false};
fs.writeFileSync(path.join(out,'sample.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({heroes:result.sampledHeroes,checks:checks.length,failed:result.failed}));
if(result.failed)process.exitCode=1;
