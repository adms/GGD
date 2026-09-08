/** Generic engine recipes for gaps in our IR, not per-hero engine code or training Gold. */
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
import {attachSource,recomputeStats} from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/statPipeline.ts';
import {Stat} from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/statTypes.ts';
import {ModOp} from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/modifiers.ts';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));checkEnginePins();
const catalog=currentCatalog(),templates=[...catalog.documents].filter(([k])=>k.startsWith('ability-templates/')).map(([,v])=>v) as any[];
function build(id:string,castType:string,effects:any[]){
  const p=heroPackageProject(catalog,`research-extension-${id}`);
  const s=p.acceptedPlan!.slots.E;
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
for(const seed of [20260908,20260909]){
  rows.push(engineProbe(move.compiled,catalog,'pure-movement-no-damage-or-enemy-push',r=>{
    const start=r.frames[0].actors[0].position.x,foeStart=r.frames[0].actors[1].position.x;
    assert.equal(r.cast('E'),'ok');r.step(60);
    const selfMove=r.world.transform.get(r.caster).pos.x-start,foeMove=r.world.transform.get(r.foe).pos.x-foeStart;
    assert(selfMove>0.2);assert.equal(r.hits('E').length,0);assert.equal(foeMove,0);
    return {selfMove,foeMove,damageEvents:0};
  },seed));
  rows.push(engineProbe(mana.compiled,catalog,'self-mana-fraction-adds-not-sets',r=>{
    attachSource(r.world,r.caster,{id:'no-mana-regen',kind:'item',modifiers:[{stat:Stat.ManaRegen,op:ModOp.Flat,value:-10000}]});
    recomputeStats(r.world,r.caster);const h=r.world.health.get(r.caster),other=r.world.health.get(r.foe).mana;
    h.mana=h.maxMana*0.5;const before=h.mana,cost=mana.compiled.abilityDrafts.E.manaCost[0];
    assert.equal(r.cast('E'),'ok');r.step(10);
    assert(Math.abs(h.mana-(before-cost+h.maxMana*0.15))<1e-5,'MANA_AMOUNT_OR_COST');
    assert.equal(r.world.health.get(r.foe).mana,other);
    return {before,after:h.mana,maxMana:h.maxMana,castCost:cost,restored:h.mana-before+cost};
  },seed));
  for(const [candidate,expected] of [[overlap,4],[unique,1]] as const)rows.push(engineProbe(candidate.compiled,catalog,
    candidate.id,r=>{assert.equal(r.cast('E'),'ok');r.step(50);assert.equal(r.hits('E').length,expected);
      return {expected,hits:r.hits('E').length,ticks:r.hits('E').map((e:any)=>e.tick)};},seed));
}
const mark=templates.find(t=>t.id==='tpl-mark-stacks')!;
const defaults=defaultParamsFor(mark),zero={...defaults,lethalMode:'save',invulnerableSec:0};
assert.equal(paramsSchemaFor(mark).safeParse(zero).success,false);
const min=mark.params.invulnerableSec.min;
const minimum={...defaults,lethalMode:'save',invulnerableSec:min};paramsSchemaFor(mark).parse(minimum);
const lethal=expand(mark,minimum).marks![0].lethal!;
assert(lethal.selfEffects.some((e:any)=>e.kind==='invulnerable'));
checkEnginePins();fs.mkdirSync(out);
const summary={schema:'ggd-research-ir-extension-admission@1',createdAt:new Date().toISOString(),
  runtimeProbes:{total:rows.length,passed:rows.filter(r=>r.passed).length,failures:rows.filter(r=>!r.passed).map(r=>({name:r.name,error:r.error}))},
  sourceScope:'generic synthetic probes motivated by complete source review; not complete hero examples',
  existingEngineSupports:['pure movement without automatic damage','self restore by fraction of maximum mana','line segments with explicit repeat-hit policy'],
  notYetInIR3:['move_only','restore_mana','line_sequence'],
  templateBoundary:{template:'tpl-mark-stacks',zeroInvulnerabilityAccepted:false,minimumInvulnerabilitySeconds:min,
    emittedKinds:lethal.selfEffects.map((e:any)=>e.kind),
    interpretation:'This template cannot disable its invulnerability via exposed parameter; not a claim all engine representations lack pure lethal save.'},
  noLiveEngineEdits:true,fullHeroTrainingAdmitted:false,releaseQualified:false,
  sourcePinSha256:hash(fs.readFileSync(path.join(here,'current-engine-v1/source-pins.json')))};
for(const [f,v] of Object.entries({'manifest.json':summary,'cases.json':rows,'projects.private.json':[move,mana,overlap,unique]}))
  fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary,null,2));
