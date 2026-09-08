import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTRAST_HEROES,contrastHero} from './contrast-heroes-v1.mts';
import {contrastProbes} from './contrast-probes-v1.mts';
import {compileIR5} from './ir-v5.mts';
import {currentCatalog,checkEnginePins,hash} from './ir-compiler.mts';
const catalog=currentCatalog();checkEnginePins();
test('12 combinations remain one family with no independent or training claims',()=>{
  assert.equal(CONTRAST_HEROES.length,12);assert.equal(new Set(CONTRAST_HEROES.map(f=>f.id)).size,12);
  assert.equal(new Set(CONTRAST_HEROES.map(f=>f.sourceFamily)).size,1);
  assert.equal(CONTRAST_HEROES.filter(f=>f.split==='engineering-train-candidate').length,8);
  for(const f of CONTRAST_HEROES){assert(!f.fullHeroRecipeTrainingAdmitted&&!f.freshBlind&&!f.ownerApproved&&!f.independentSourceHero);
    assert.equal(hash(f.source.hero.originalText),f.source.hero.sourceSha256);
    for(const s of f.source.slots){assert(f.source.hero.originalText.includes(s.originalText));assert.equal(hash(s.originalText),s.sourceSha256);}
    assert.equal(f.ir.relations.length,0);
    for(const s of ['Q','W','E']){assert.equal(f.ir.slots[s].castTiming.seconds,null);assert.equal(f.ir.slots[s].castTiming.requirement,f.timing);}
  }
});
for(const f of CONTRAST_HEROES)test(`full six-slot behavior engineering control: ${f.id}`,()=>{
  const b=compileIR5(f.ir,f.source,catalog),r=contrastProbes(b.compiled,f,catalog);
  assert.equal(r.passed,r.total,JSON.stringify(r.rows.filter(r=>!r.passed).map(r=>({name:r.name,error:r.error}))));
  assert.equal(r.total,16);assert.equal(new Set(r.rows.map(r=>r.slot)).size,6);assert.equal(r.fullHeroQualified,false);
});
for(const [name,mutate,diagnostic] of [
  ['remove required windup',(f:any)=>f.ir.slots.Q.castTiming={requirement:'not_specified',seconds:null,evidence:null},'SOURCE_CAST_PHASE'],
  ['single unit becomes ground',(f:any)=>f.ir.slots.Q.delivery='ground','SOURCE_TARGET_CONTRACT'],
  ['field becomes one explosion',(f:any)=>f.ir.slots.W.actions[0].count=1,'PRIMARY_SPATIAL_HITS'],
  ['line loses repeated hits',(f:any)=>f.ir.slots.E.actions[0].repeatHits='once_per_cast','PRIMARY_SPATIAL_HITS'],
  ['field follows caster',(f:any)=>{f.ir.slots.W.delivery='self';f.ir.slots.W.actions[0].anchor='caster';},'PRIMARY_SPATIAL_HITS'],
  ['magic becomes physical',(f:any)=>f.ir.slots.Q.actions[0].damageType='physical','SOURCE_DAMAGE_TYPE'],
  ['source small tier becomes minimal',(f:any)=>f.ir.slots.Q.actions[0].tier='極小','SOURCE_TIER'],
  ['max mana restore changed',(f:any)=>f.ir.slots.EX.actions[0].fraction=0.05,'MAX_MANA_ADDITIVE'],
  ['shield lost all-damage absorption',(f:any)=>f.ir.slots.R.actions[0].absorbs='magic','SHIELD_LEAK'],
] as const)test(`independent runtime oracle rejects schema-valid semantic mutation: ${name}`,()=>{
  const f=contrastHero(0,'required');mutate(f);const b=compileIR5(f.ir,f.source,catalog),r=contrastProbes(b.compiled,f,catalog,[20260908]);
  assert(r.rows.some(r=>!r.passed&&r.error.includes(diagnostic)),JSON.stringify(r.rows.map(r=>({name:r.name,error:r.error}))));
});
test('required label added to explicit instant source fails behavioral oracle',()=>{
  const f=contrastHero(0,'none');f.ir.slots.Q.castTiming.requirement='required';
  // Anchoring alone cannot distinguish a negated quote; the source-derived oracle must catch this.
  const b=compileIR5(f.ir,f.source,catalog),r=contrastProbes(b.compiled,f,catalog,[20260908]);
  assert(r.rows.some(r=>!r.passed&&r.error.includes('SOURCE_CAST_PHASE')));
});
