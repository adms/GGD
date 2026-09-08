/** Real cast-entry check for the reviewed-but-unverified pull-throw target path. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
async function main(){
 const [repoArg,outArg]=process.argv.slice(2);assert(repoArg&&outArg);const repo=path.resolve(repoArg),out=path.resolve(outArg);assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const revision=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(revision,'4793eaaaf2775b2081f5eca5881db32e0aab0ea8');
 const load=(p:string)=>import(pathToFileURL(path.join(repo,'packages/shared/src',p)).href);
 const {zTemplateDoc}=await load('content/schema/template.ts');const {zAbilityDoc}=await load('content/schema/ability.ts');const {expand}=await load('content/templates/expand.ts');const {defaultParamsFor}=await load('content/templates/paramsSchema.ts');
 const tpl=zTemplateDoc.parse(JSON.parse(fs.readFileSync(path.join(repo,'content/ability-templates/tpl-pull-throw.json'),'utf8')));
 const {SimWorld}=await load('sim/SimWorld.ts');const {SKELETON_ARENA}=await load('sim/world/ArenaDef.ts');const {registerSkeletonContent,SELA}=await load('sim/content/skeleton.ts');const {spawnChampion}=await load('sim/spawnChampion.ts');
 const {registerChampion}=await load('sim/content/registry.ts');const {castAbility}=await load('sim/abilities/abilitySystem.ts');const {runEffects}=await load('sim/effects/effectRunner.ts');
 registerSkeletonContent();
 const run=(distance:number,targetKind:'point'|'entity'|'effect-only-control')=>{
  const ex=expand(tpl,{...defaultParamsFor(tpl),throwDistance:distance});
  const ability=zAbilityDoc.parse({schema:'ability@1',id:'audit.pull.q',name:'Pull audit',slot:'Q',maxRank:1,cooldown:[0],manaCost:[0],range:10,...ex});
  const champion={...SELA,id:'audit.pull',abilities:{...SELA.abilities,Q:ability}};registerChampion(champion,{overrideAbilities:true});
  const world=new SimWorld(SKELETON_ARENA,20260906);world.combatActive=true;const center=SKELETON_ARENA.zones[0].center;
  const caster=spawnChampion(world,{championId:champion.id,seatId:0,teamId:0,pos:{...center},zone:0});
  const point={x:center.x+2,z:center.z};
  const foes=[-.2,.2].map((dz,i)=>spawnChampion(world,{championId:SELA.id,seatId:i+1,teamId:1,pos:{x:point.x,z:point.z+dz},zone:0}));
  world.step(new Map());world.rebuildGrid();world.abilities.get(caster).slots.Q.rank=1;
  let castResult:string;
  if(targetKind==='effect-only-control'){
   runEffects(ex.effects,{world,caster,targets:[foes[0]],rank:1,origin:'ability:audit.pull.control',direction:{x:1,z:0},rng:world.rng});castResult='effect-control-not-player-cast';
  }else castResult=castAbility(world,caster,'Q',targetKind==='point'?{type:'point',point}:{type:'entity',entityId:foes[0]});
  return {distance,targetKind,castResult,castType:ex.castType,radius:ex.radius??null,point,casterPosition:{...world.transform.get(caster).pos},foes:foes.map(id=>({id,pos:{...world.transform.get(id).pos},override:structuredClone(world.nav.get(id)?.override??null)})),leapEvents:world.events.filter(e=>e.type==='leapStart')};
 };
 const short=run(100,'point'),long=run(1000,'point'),entity=run(500,'entity'),controlShort=run(100,'effect-only-control'),controlLong=run(1000,'effect-only-control');
 assert.equal(short.castResult,'ok');assert.equal(long.castResult,'ok');assert.equal(entity.castResult,'bad-target');
 assert(short.foes.every(f=>f.override?.kind==='leap'));assert.equal(short.leapEvents.length,2);
 assert.deepEqual(short.foes.map(f=>f.override.to),long.foes.map(f=>f.override.to));assert(short.foes.every(f=>Math.abs(f.override.to.x-short.point.x)<.01));
 assert.notDeepEqual(controlShort.foes[0].override.to,controlLong.foes[0].override.to);
 const pins=['content/ability-templates/tpl-pull-throw.json','packages/shared/src/content/templates/expand.ts','packages/shared/src/sim/abilities/abilitySystem.ts','packages/shared/src/sim/effects/leap.ts'].map(p=>({path:p,sha256:createHash('sha256').update(fs.readFileSync(path.join(repo,p))).digest('hex')}));
 const result={revision,createdAt:new Date().toISOString(),short,long,entity,controlShort,controlLong,pins,findings:['Template ground cast resolves all enemies in the default small selection circle, not a selected single enemy.','Both targets leap from caster to the cast point; changing throwDistance 100 to 1000 has no effect on real cast landing.','The no-point isolated effect control responds to throwDistance, exposing why effect-only verification is insufficient.'],scope:'Real template expansion + full ability schema + throwaway registry champion + castAbility entry + leap state. No production edits; no complete ability damage/landing E2E claim.',releaseQualified:false};
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,findings:result.findings,short,long,entity,controlEndpoints:[controlShort.foes[0].override.to,controlLong.foes[0].override.to]},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
