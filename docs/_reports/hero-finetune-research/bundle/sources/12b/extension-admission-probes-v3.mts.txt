/** Research-only native recipes. v1/v2 failures retained; v3 isolates immediate mana effect from natural regen. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {currentCatalog,checkEnginePins,hash} from './ir-compiler.mts';
import {engineProbe} from './probe-harness.mts';
import {heroPackageProject} from '../../GGD-community-hero-forge/packages/shared/testkit/heroPackageFixture.ts';
import {pinHeroPlanTemplates} from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/templateVersions.ts';
import {compileHeroPackageProject} from '../../GGD-community-hero-forge/packages/shared/src/content/import/heroPackage.ts';
import {zHeroProject} from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/schema.ts';
import {paramsSchemaFor,defaultParamsFor} from '../../GGD-community-hero-forge/packages/shared/src/content/templates/paramsSchema.ts';
import {expand} from '../../GGD-community-hero-forge/packages/shared/src/content/templates/expand.ts';
import {Stat} from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/statTypes.ts';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));checkEnginePins();
const catalog=currentCatalog(),templates=[...catalog.documents].filter(([k])=>k.startsWith('ability-templates/')).map(([,v])=>v) as any[];
function build(id:string,castType:string,effects:any[]){
  const p=heroPackageProject(catalog,`research-extension-${id}`),s=p.acceptedPlan!.slots.E;
  s.products=[{instanceId:'extension-probe',template:{ref:'tpl-effect-sequence',inheritDefaults:true,
    params:{castType,castTimeSec:0,radius:1,side:'enemies',effects}}}];
  s.abilityOverrides={};s.templateConflictPolicy='reject';
  p.acceptedPlan=pinHeroPlanTemplates(p.acceptedPlan!,templates);
  const project=zHeroProject.parse(p),compiled=compileHeroPackageProject(project,catalog,false).compiled;
  return {id,project,compiled};
}
const move=build('move-only','ground',[{kind:'dash',mode:'toPoint',speed:6,maxDistance:2}]);
const mana=build('restore-mana','self',[{kind:'restore',manaPct:0.15,applyTo:'self'}]);
const line=(unique:boolean)=>build(unique?'line-unique':'line-overlap','ground',[{kind:'delayed',shape:'circle',radius:2.75,
  side:'enemies',delaySec:0.1,count:4,intervalSec:0.1,targetMode:'reresolve',advance:{stepDist:0.5,dir:'facing'},
  hitOncePerTarget:unique,effects:[{kind:'damage',damageType:'magic',amount:{flat:10}}]}]);
const overlap=line(false),unique=line(true),rows:any[]=[];
const near=(a:number,b:number,message:string)=>assert(Math.abs(a-b)<1e-5,`${message}: ${a} != ${b}`);
function noAuthoredEnemyPushOrDamage(r:any){
  assert.equal(r.hits('E').length,0,'EXTRA_ABILITY_DAMAGE');
  const displacements=r.events.filter((e:any)=>e.type==='displace');
  assert.equal(displacements.length,1,'EXTRA_DISPLACEMENT_EVENT');
  assert.equal(displacements[0].data.id,r.caster,'DISPLACED_WRONG_ACTOR');
  assert(r.frames.every((f:any)=>f.actors[1].override===null),'ENEMY_FORCED_MOVEMENT');
}
for(const seed of [20260908,20260909]){
  for(const collision of [false,true])rows.push(engineProbe(move.compiled,catalog,
    collision?'move-contact-separation-not-authored-knockback':'move-open-lane-no-hit',r=>{
      const start=structuredClone(r.world.transform.get(r.caster).pos);
      if(!collision)r.world.transform.get(r.foe).pos.z+=6;
      const foeStart=structuredClone(r.world.transform.get(r.foe).pos);r.world.rebuildGrid();
      assert.equal(r.cast('E',{type:'point',point:{x:start.x+2,z:start.z}}),'ok');r.step(60);
      const selfMove=r.world.transform.get(r.caster).pos.x-start.x;
      const foeMove=r.world.transform.get(r.foe).pos.x-foeStart.x;
      noAuthoredEnemyPushOrDamage(r);
      if(collision){assert(selfMove>0.2&&selfMove<2);assert(foeMove>0,'CONTACT_WAS_NOT_EXERCISED');}
      else{near(selfMove,2,'OPEN_LANE_DISTANCE');near(foeMove,0,'OPEN_LANE_FOE_POSITION');}
      return {selfMove,foeMove,abilityDamageEvents:0,enemyForcedMovement:false,
        basicDamageEvents:r.events.filter((e:any)=>e.type==='damage'&&e.data.origin==='basic').length,
        caveat:collision?'Normal body separation moves the enemy; this is NOT a stop-on-unit/no-position-change recipe.':'No enemy on the movement lane.'};
    },seed));
  for(const initialFraction of [0.5,0.99])rows.push(engineProbe(mana.compiled,catalog,
    initialFraction===0.5?'mana-adds-max-fraction-not-sets':'mana-overflow-clamps-at-max',r=>{
      // No regen mutation: check the immediate effect before any simulation step.
      // The post-step stability check accounts for the fixture's measured natural rate.
      const naturalRegenPerSecond=r.world.stats.get(r.caster).final[Stat.ManaRegen];
      assert(Number.isFinite(naturalRegenPerSecond)&&naturalRegenPerSecond>=0);
      assert.equal(r.world.manaEconomy.enforceFloor,false,'FIXTURE_REGEN_FLOOR_CHANGED');
      const h=r.world.health.get(r.caster),other=r.world.health.get(r.foe).mana;
      h.mana=h.maxMana*initialFraction;const before=h.mana,cost=mana.compiled.abilityDrafts.E.manaCost[0];
      const requested=h.maxMana*0.15,expected=Math.min(h.maxMana,before-cost+requested);
      assert.equal(r.cast('E'),'ok');near(h.mana,expected,'IMMEDIATE_MANA_AMOUNT_AND_COST');r.step(10);
      near(h.mana,Math.min(h.maxMana,expected+naturalRegenPerSecond*r.world.dt*10),'MANA_AFTER_NATURAL_REGEN');
      near(r.world.health.get(r.foe).mana,other,'WRONG_TARGET');
      const restores=r.events.filter((e:any)=>e.type==='manaRestore');assert.equal(restores.length,1);
      assert.equal(restores[0].data.target,r.caster);near(restores[0].data.amount,expected-before+cost,'RESTORE_EVENT_AMOUNT');
      near(restores[0].data.overflow,requested-(expected-before+cost),'RESTORE_OVERFLOW');
      assert.equal(r.hits('E').length,0);
      return {initialFraction,before,after:h.mana,maxMana:h.maxMana,castCost:cost,requested,
        restoredAtCast:expected-before+cost,overflow:restores[0].data.overflow,naturalRegenPerSecond,
        regenPolicy:'unmodified; immediate effect checked before stepping, then natural rate accounted separately'};
    },seed));
  for(const [candidate,expected] of [[overlap,4],[unique,1]] as const)rows.push(engineProbe(candidate.compiled,catalog,
    candidate.id,r=>{assert.equal(r.cast('E'),'ok');r.step(50);assert.equal(r.hits('E').length,expected);
      return {expected,hits:r.hits('E').length,ticks:r.hits('E').map((e:any)=>e.tick)};},seed));
}
const mark=templates.find(t=>t.id==='tpl-mark-stacks')!,defaults=defaultParamsFor(mark);
assert.equal(paramsSchemaFor(mark).safeParse({...defaults,lethalMode:'save',invulnerableSec:0}).success,false);
const minimumInvulnerabilitySeconds=mark.params.invulnerableSec.min;
const minimum={...defaults,lethalMode:'save',invulnerableSec:minimumInvulnerabilitySeconds};paramsSchemaFor(mark).parse(minimum);
const lethal=expand(mark,minimum).marks![0].lethal!;assert(lethal.selfEffects.some((e:any)=>e.kind==='invulnerable'));
const capabilityGroups={
  pureMovementNoAuthoredDamage:['move-open-lane-no-hit','move-contact-separation-not-authored-knockback'],
  selfManaRestore:['mana-adds-max-fraction-not-sets','mana-overflow-clamps-at-max'],
  explicitLineRepeatHitPolicy:['line-overlap','line-unique']};
const capabilities=Object.fromEntries(Object.entries(capabilityGroups).map(([k,names])=>{
  const group=rows.filter(r=>names.includes(r.name));return [k,{passed:group.filter(r=>r.passed).length,total:group.length,
    verified:group.length===4&&group.every(r=>r.passed)}];}));
checkEnginePins();fs.mkdirSync(out);
const summary={schema:'ggd-research-ir-extension-admission@3',createdAt:new Date().toISOString(),
  runtimeProbes:{total:rows.length,passed:rows.filter(r=>r.passed).length,failures:rows.filter(r=>!r.passed).map(r=>({name:r.name,error:r.error}))},
  capabilities,sourceScope:'generic synthetic probes; not complete source-hero Gold',
  v1Corrections:{priorRunRetained:'extension-admission-v1',priorScore:'4/8',v2Retained:'extension-admission-v2',v2Score:'8/12',
    mana:'v1 negative flat regen caused per-tick drain; v2 override to zero still received the global base bonus (final 10/s), so its fixture assertion correctly failed. v3 does not override regen: check the immediate restore amount, then account separately for measured natural regen.',
    movement:'Contact caused ordinary body separation, not an authored knockback. Keep this observation and add an off-lane control; do not claim immovable enemies.',
    manifest:'The v1 existingEngineSupports field was premature; v2 and v3 derive per-capability verified flags only from passed probes.'},
  notYetInIR3:['move_only','restore_mana','line_sequence'],
  templateBoundary:{template:'tpl-mark-stacks',zeroInvulnerabilityAccepted:false,minimumInvulnerabilitySeconds,
    emittedKinds:lethal.selfEffects.map((e:any)=>e.kind),
    interpretation:'This template cannot disable its invulnerability via the exposed parameter; other engine representations have not been ruled out.'},
  noLiveEngineEdits:true,fullHeroTrainingAdmitted:false,releaseQualified:false,
  testScriptSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  harnessSha256:hash(fs.readFileSync(path.join(here,'probe-harness.mts'))),
  sourcePinSha256:hash(fs.readFileSync(path.join(here,'current-engine-v1/source-pins.json')))};
for(const [f,v] of Object.entries({'manifest.json':summary,'cases.json':rows,'projects.private.json':[move,mana,overlap,unique]}))
  fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary,null,2));
process.exitCode=rows.every(r=>r.passed)?0:1;
