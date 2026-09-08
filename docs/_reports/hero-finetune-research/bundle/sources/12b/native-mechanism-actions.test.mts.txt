import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lowerNativeAction,zNativeAction} from './native-mechanism-actions.mts';
import {currentCatalog,checkEnginePins} from './ir-compiler.mts';
import {heroPackageProject} from '../../GGD-community-hero-forge/packages/shared/testkit/heroPackageFixture.ts';
import {pinHeroPlanTemplates} from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/templateVersions.ts';
import {compileHeroPackageProject} from '../../GGD-community-hero-forge/packages/shared/src/content/import/heroPackage.ts';
import {zHeroProject} from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/schema.ts';
import {engineProbe} from './probe-harness.mts';
const catalog=currentCatalog();checkEnginePins();
const templates=[...catalog.documents].filter(([k])=>k.startsWith('ability-templates/')).map(([,v])=>v) as any[];
const move={op:'move_only',direction:'aim',travelRule:'fixed_distance',collisionRule:'engine_default',distance:2,speed:6};
const mana={op:'restore_mana',target:'self',basis:'maximum_mana',mode:'add',fraction:0.15};
const line={op:'line_sequence',direction:'cast_facing',count:4,repeatHits:'per_segment',interval:0.1,firstDelay:0.1,
  stepDistance:0.5,radius:2.75,damageType:'magic',tier:'極小'};
function build(action:any,delivery:string){
  const lowered=lowerNativeAction(action,delivery),p=heroPackageProject(catalog,`research-native-${action.op}`),s=p.acceptedPlan!.slots.E;
  s.products=[{instanceId:'native-probe',template:{ref:'tpl-effect-sequence',inheritDefaults:true,
    params:{castType:delivery,castTimeSec:0,radius:1,side:'enemies',effects:lowered.effects}}}];
  s.abilityOverrides={};s.templateConflictPolicy='reject';p.acceptedPlan=pinHeroPlanTemplates(p.acceptedPlan!,templates);
  return compileHeroPackageProject(zHeroProject.parse(p),catalog,false).compiled;
}
for(const [id,input,delivery] of [['move',move,'ground'],['mana',mana,'self'],['line',line,'ground']] as const){
  test(`strict typed extension and real compiler: ${id}`,()=>{
    const before=structuredClone(input),out=lowerNativeAction(input,delivery),compiled=build(input,delivery);
    assert.deepEqual(input,before);
    const expected=structuredClone(out.effects),actual=structuredClone(compiled.abilityDrafts.E.effects);
    if(id==='line'){
      // The real compiler expands damage tiers and rank growth; this test checks
      // the semantic tier plus all non-amount fields, not raw magnitude equality.
      const amount=actual[0].effects[0].amount;
      assert.equal(amount.damageTier,expected[0].effects[0].amount.damageTier);
      assert(Number.isFinite(amount.flat)&&amount.flat>0);
      assert.equal(amount.perRank.length,compiled.abilityDrafts.E.maxRank);
      delete actual[0].effects[0].amount;delete expected[0].effects[0].amount;
    }
    assert.deepEqual(actual,expected);
    assert.equal(out.proposals.length,0);assert.equal(out.automaticAccept,false);assert.equal(out.sourceEntailmentVerified,false);
  });
}
for(const [label,action] of [
  ['move gains onEnd damage',{...move,onEnd:[{kind:'damage'}]}],
  ['point arrival misrepresented',{...move,travelRule:'arrive_at_point'}],
  ['stop on enemy contact misrepresented',{...move,collisionRule:'stop_on_enemy'}],
  ['mana silently sets instead of adds',{...mana,mode:'set'}],
  ['mana restores target instead of self',{...mana,target:'enemy'}],
  ['mana wrong reference pool',{...mana,basis:'current_mana'}],
  ['zero mana restoration',{...mana,fraction:0}],
  ['unbounded mana restoration',{...mana,fraction:1.5}],
  ['zero interval',{...line,interval:0}],
  ['terminal explosion invented',{...line,terminalExplosion:true}],
  ['negative segment count',{...line,count:-1}],
] as const)test(`reject ${label}`,()=>assert.equal(zNativeAction.safeParse(action).success,false));
test('missing repeat-hit policy is not inferred from template default',()=>{
  const a:any={...line};delete a.repeatHits;assert.throws(()=>lowerNativeAction(a,'ground'));
});
test('tuning omissions are recorded, not labeled source values',()=>{
  const out=lowerNativeAction({op:'line_sequence',direction:'cast_facing',count:4,repeatHits:'per_segment'},'ground');
  assert.deepEqual(out.proposals.map(p=>p.field).sort(),['radius','firstDelay','interval','stepDistance','damageType','tier'].sort());
  assert(out.proposals.every(p=>p.basis==='research-preview-policy-not-source'&&p.requiresTuning));
});
test('three extensions reject incompatible delivery',()=>{
  assert.throws(()=>lowerNativeAction(move,'targeted'),/MOVE_DELIVERY/);
  assert.throws(()=>lowerNativeAction(mana,'ground'),/MANA_DELIVERY/);
  assert.throws(()=>lowerNativeAction(line,'targeted'),/LINE_DELIVERY/);
});
for(const seed of [20260908,20260909]){
  test(`pure movement has no ability hit or enemy displacement, open lane ${seed}`,()=>{
    const compiled=build(move,'ground'),r=engineProbe(compiled,catalog,'typed-move',r=>{
      const start={...r.world.transform.get(r.caster).pos};r.world.transform.get(r.foe).pos.z+=6;
      const foe={...r.world.transform.get(r.foe).pos};r.world.rebuildGrid();
      assert.equal(r.cast('E',{type:'point',point:{x:start.x+2,z:start.z}}),'ok');r.step(60);
      assert(Math.abs(r.world.transform.get(r.caster).pos.x-start.x-2)<1e-5);
      assert.deepEqual(r.world.transform.get(r.foe).pos,foe);assert.equal(r.hits('E').length,0);
      return {distance:2};
    },seed);assert(r.passed,r.error);
  });
  test(`self mana is additive after cast cost ${seed}`,()=>{
    const compiled=build(mana,'self'),r=engineProbe(compiled,catalog,'typed-mana',r=>{
      const h=r.world.health.get(r.caster);h.mana=h.maxMana*0.5;const before=h.mana;
      assert.equal(r.cast('E'),'ok');assert(Math.abs(h.mana-before+compiled.abilityDrafts.E.manaCost[0]-h.maxMana*0.15)<1e-5);
      return {delta:h.mana-before};
    },seed);assert(r.passed,r.error);
  });
  for(const [policy,hits] of [['per_segment',4],['once_per_cast',1]] as const)test(`line ${policy} ${seed}`,()=>{
    const compiled=build({...line,repeatHits:policy},'ground'),r=engineProbe(compiled,catalog,'typed-line',r=>{
      assert.equal(r.cast('E'),'ok');r.step(50);assert.equal(r.hits('E').length,hits);
      return {hits:r.hits('E').length};
    },seed);assert(r.passed,r.error);
  });
}
test('frozen IR3 model contract still excludes these extensions',()=>{
  const protocol=JSON.parse(fs.readFileSync(new URL('./ir3-jsonschema-smoke-v1/response-schema.json',import.meta.url),'utf8'));
  assert(!Object.keys(protocol.$defs).some(k=>/move_only|restore_mana|line_sequence/.test(k)));checkEnginePins();
});
