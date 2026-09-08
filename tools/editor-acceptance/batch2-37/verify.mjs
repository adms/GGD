import { register } from 'tsx/esm/api'; register();
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {roster} from './roster.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const save=(p,v)=>{const f=resolve(dir,p);mkdirSync(dirname(f),{recursive:true});writeFileSync(f,JSON.stringify(v,null,2)+'\n');};
const {createHeroSimulationBaseline}=await import(resolve(root,'packages/shared/src/content/heroForge/simulationBaseline.ts'));
const {runHeroAbilityScenario}=await import(resolve(root,'packages/shared/src/content/heroForge/scenario.ts'));
const docs=new Map();
for(const c of readdirSync(resolve(root,'content'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name))for(const f of readdirSync(resolve(root,'content',c)))if(f.endsWith('.json')&&!f.startsWith('_')){const d=JSON.parse(readFileSync(resolve(root,'content',c,f),'utf8'));if(d.id)docs.set(`${c}/${d.id}`,d);}
const baseline=createHeroSimulationBaseline(docs),build=read('report.json');
assert.equal(baseline.digest,build.baseline.digest,'BASELINE_DRIFT');
const supportedStatuses=new Set([...docs].filter(([k])=>k.startsWith('status-effects/')).map(([,v])=>v.id));
const allNodes=(x,p,out=[])=>{if(x&&typeof x==='object'){if(p(x))out.push(x);Object.values(x).forEach(v=>allNodes(v,p,out));}return out;};
const report={schema:'ggd-batch2-behavior-review@1',engineCommit:build.engineCommit,buildHash:hash(build),baselineDigest:baseline.digest,heroes:[],admitted:0};
const sourceActions=new Set(['tag','pull','zone','blind','confuse','rush','prepare','guard','escape','frenzy']);
const consumers=new Set(['cash','release','tag','kick','storm']);
const setup={level:18,rank:1,resourceSetup:'empty',caster:{x:0,z:0,hp:100,mana:100,statuses:[]},target:{x:1,z:0,hp:100,mana:100,statuses:[]}};
const emptyCombo=a=>{const c=structuredClone(a);allNodes(c.effects,n=>true).forEach(n=>{if(n.condition?.kind==='status')n.condition={kind:'chance',p:0};if(n.kind==='consumeStatus')n.statusId='blind';});return c;};
for(const h of roster){
  const row={id:h.id,name:h.name,noNewStatusIds:false,noNewTemplates:false,pairs:[],status:'failed'};report.heroes.push(row);
  try {
    const d=read(`private/compiled/${h.id}.json`),p=read(`private/teachers/${h.id}.project.json`);
    assert.equal(hash(d),build.heroes.find(r=>r.id===h.id).compiledSha256,'COMPILED_CHANGED');
    for(const n of allNodes(Object.values(d.abilityDrafts),n=>n.kind==='applyStatus'||n.kind==='consumeStatus'||n.kind==='status'))if(n.statusId)assert(supportedStatuses.has(n.statusId),`NEW_STATUS:${n.statusId}`);
    row.noNewStatusIds=true;
    for(const s of Object.values(p.acceptedPlan.slots))for(const product of s.products)assert.equal(docs.get(`ability-templates/${product.template.ref}`)?.status,'enabled');
    row.noNewTemplates=true;
    const pairs=[];
    for(const targetMove of h.moves.filter(m=>consumers.has(m.action))){
      const needs=new Set(allNodes(d.abilityDrafts[targetMove.slot].effects,n=>n.condition?.kind==='status').map(n=>n.condition.statusId));
      if(allNodes(d.abilityDrafts[targetMove.slot].effects,n=>n.kind==='consumeStatus'&&n.statusId==='rage').length)needs.add('rage');
      for(const sourceMove of h.moves.filter(m=>['Q','W','E','R'].includes(m.slot)&&m.slot!==targetMove.slot&&sourceActions.has(m.action))){
        const gives=new Set(allNodes(d.abilityDrafts[sourceMove.slot].effects,n=>n.kind==='applyStatus'&&!n.condition).map(n=>n.statusId));
        if([...gives].some(x=>needs.has(x)))pairs.push([sourceMove.slot,targetMove.slot]);
      }
    }
    // Fixed ordering established from authored topology, never choose by score.
    const selected=pairs.slice(0,2);assert.equal(selected.length,2,'TWO_AUTHORED_COMBOS_REQUIRED');
    for(const [source,target] of selected){
      const a=d.abilityDrafts[target],mutant=emptyCombo(a);
      const options={baseline,seed:1234,ticks:60,relatedAbilities:Object.values(d.abilityDrafts),setup:{...structuredClone(setup),priorCast:{slot:source,waitSec:0.8}}};
      const good=runHeroAbilityScenario(d.champion,a,options);
      const bad=runHeroAbilityScenario(d.champion,mutant,options);
      const plain=runHeroAbilityScenario(d.champion,a,{...options,setup:structuredClone(setup)});
      const plainBad=runHeroAbilityScenario(d.champion,mutant,{...options,setup:structuredClone(setup)});
      const metric=r=>r.before.targetHp-r.after.targetHp;
      const item={source,target,status:'failed',positiveDamage:metric(good),withoutComboDamage:metric(bad),unpreparedDamage:metric(plain),unpreparedMutantDamage:metric(plainBad),accepted:[good.status,bad.status,plain.status,plainBad.status]};
      row.pairs.push(item);
      save(`private/evidence/${h.id}.${source}-${target}.json`,{projectSha256:hash(p),compiledSha256:hash(d),good,bad,plain,plainBad});
      assert(item.accepted.every(s=>s==='accepted'),JSON.stringify(item));
      assert(item.positiveDamage>item.withoutComboDamage,'COMBO_HAS_NO_MEASURED_DAMAGE_EFFECT');
      assert.equal(item.unpreparedDamage,item.unpreparedMutantDamage,'BONUS_OCCURRED_WITHOUT_PRECONDITION');
      item.status='passed';
    }
    row.status='passed';
  }catch(e){row.error=String(e);}
  console.log(h.number,h.name,row.status,row.error??'');
}
report.passed=report.heroes.filter(h=>h.status==='passed').length;
report.limits=['Two genuine prior-cast sequences per hero; same fixture without conditional bonuses checks causal effect.',
  'These are damage-conditional checks, not full passive/ally/visual/balance acceptance. Train group teleport/status/cleanup requires its own scenarios.',
  'No teacher is admitted automatically from these checks.'];
save('behavior-report.json',report);
console.log(JSON.stringify({passed:report.passed,total:37,admitted:0}));
if(report.passed!==37)process.exitCode=1;
