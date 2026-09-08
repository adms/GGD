/** Read-only pinned-main probe. Fixture parameters are not authoring advice.
 * Full template expansion/schema -> real tier resolvers -> castAbility -> SimWorld.
 * No training-data edits, output relabeling, GPU calls, or production mutations.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
async function main(){
 const [repo,out]=process.argv.slice(2);assert(path.isAbsolute(repo)&&path.isAbsolute(out));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const revision=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(revision,'4793eaaaf2775b2081f5eca5881db32e0aab0ea8');
 const read=(p:string)=>JSON.parse(fs.readFileSync(path.join(repo,p),'utf8')),hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const load=(p:string)=>import(pathToFileURL(path.join(repo,'packages/shared/src',p)).href);
 const {zTemplateDoc}=await load('content/schema/template.ts'),{zAbilityDoc}=await load('content/schema/ability.ts'),{zEffectDef}=await load('content/schema/effect.ts');
 const {defaultParamsFor,paramsSchemaFor}=await load('content/templates/paramsSchema.ts'),{expand,mergeExpansion}=await load('content/templates/expand.ts');
 const {resolveDamageTier,damageTiersFromDoc}=await load('content/damageTiers.ts'),{resolveRadiusTier,aoeTiersFromDoc}=await load('content/aoeTiers.ts');
 const damageTiers=damageTiersFromDoc(read('content/config/damage-tiers.json')),aoeTiers=aoeTiersFromDoc(read('content/config/aoe-tiers.json'));
 const {SimWorld}=await load('sim/SimWorld.ts'),{SKELETON_ARENA}=await load('sim/world/ArenaDef.ts'),{registerSkeletonContent,SELA}=await load('sim/content/skeleton.ts'),{spawnChampion}=await load('sim/spawnChampion.ts');
 const {Abilities,registerChampion}=await load('sim/content/registry.ts'),{castAbility}=await load('sim/abilities/abilitySystem.ts'),{normalizeCombatEnv}=await load('sim/combatEnv.ts'),{runEffects}=await load('sim/effects/effectRunner.ts'),{delayedQueue}=await load('sim/effects/delayed.ts');registerSkeletonContent();
 const docs=Object.fromEntries(['tpl-traveling-wave','tpl-line-blast'].map(id=>[id,zTemplateDoc.parse(read('content/ability-templates/'+id+'.json'))]));
 let serial=0;
 function build(kind:string){
  const t=docs[kind],patch=kind==='tpl-traveling-wave'?{stepSize:200,stepCount:4,stepIntervalSec:.1,aoePerStep:50,terminalBurst:200,damage:{perRank:[200],ratios:[]},damageType:'true',castTimeSec:0}:{path:'forward',distance:11,speed:27.5,touchRadius:11/12,touchDamageTier:'極小',blastRadiusTier:'極小',blastApRatio:0,blastDamageTier:'極小',damageType:'true',castTimeSec:0};
  const params={...defaultParamsFor(t),...patch};paramsSchemaFor(t).parse(params);const expansion=expand(t,params),id='audit.wave.'+(serial++);
  const authored=zAbilityDoc.parse(mergeExpansion({schema:'ability@1',id,name:id,slot:'Q',maxRank:1,cooldown:[0],manaCost:[0],range:20},expansion));
  const ability=resolveRadiusTier(resolveDamageTier(authored,damageTiers),aoeTiers);return{kind,params,expansion,authored,ability};
 }
 function run(kind:string,seed:number,targets:{label:string,x:number,z:number}[],mutate?:'no-terminal'|'include-origin'){
  const built=build(kind),ability=structuredClone(built.ability);
  if(mutate){assert.equal(kind,'tpl-traveling-wave');const e=ability.effects[0];assert.equal(e.kind,'delayed');if(mutate==='no-terminal')delete e.finalEffects;else e.finalEffects[0].includeOrigin=true;}
  const id='audit.wave.champion.'+serial++,baseAbilities=Object.fromEntries(Object.entries(SELA.abilities).map(([slot,a]:[string,any])=>[slot,{...a,id:id+'.'+slot.toLowerCase(),effects:[],passive:undefined,castTimeSec:0}]));
  Abilities.register(ability.id,ability);baseAbilities.Q=ability;const champ={...SELA,id,passive:undefined,passiveAbility:undefined,abilities:baseAbilities};registerChampion(champ,{overrideAbilities:true});
  const dummy={...SELA,id:id+'.dummy',passive:undefined,passiveAbility:undefined};registerChampion(dummy);
  const world=new SimWorld(SKELETON_ARENA,seed);world.combatActive=true;world.combatEnv=normalizeCombatEnv({damageDealt:1,healing:1});world.combatFeel={...world.combatFeel,autoEngage:{...world.combatFeel.autoEngage,enabled:false}};
  const c=SKELETON_ARENA.zones[0].center,caster=spawnChampion(world,{championId:champ.id,seatId:0,teamId:0,pos:{...c},zone:0});
  const bodies=targets.map((t,i)=>({...t,id:spawnChampion(world,{championId:dummy.id,seatId:i+1,teamId:1,pos:{x:c.x+t.x,z:c.z+t.z},zone:0})}));
  const disarm=zEffectDef.parse({kind:'applyStatus',statusId:'audit-wave-disarm',duration:5,disarmed:true,root:true});runEffects([disarm],{world,caster,targets:[caster,...bodies.map(b=>b.id)],rank:1,origin:'ability:audit.fixture',rng:world.rng});world.step(new Map());
  world.transform.get(caster).facing={x:1,z:0};world.rebuildGrid();
  const before=bodies.map(b=>({label:b.label,id:b.id,hp:world.health.get(b.id).hp,pos:structuredClone(world.transform.get(b.id).pos)}));
  const cast=castAbility(world,caster,'Q',{type:'point',point:{x:c.x+11,z:c.z}});assert.equal(cast,'ok');
  const queue=structuredClone(delayedQueue(world)).map((q:any)=>({point:q.point,advance:q.advance,reresolve:q.reresolve,strikes:q.strikes,struck:[...(q.struck??[])],effects:q.effects,finalEffects:q.finalEffects}));
  const events:any[]=[];
  for(let i=0;i<40;i++){world.step(new Map());for(const e of world.events)if(e.type==='damage'&&e.data.origin==='ability:'+ability.id)events.push(structuredClone(e));}
  const measured=bodies.map((b,i)=>({label:b.label,id:b.id,before:before[i],after:{hp:world.health.get(b.id).hp,alive:world.health.get(b.id).alive,pos:structuredClone(world.transform.get(b.id).pos)},events:events.filter(e=>e.data.target===b.id)}));
  for(const m of measured){assert.equal(m.after.alive,true,'FIXTURE_TARGET_DIED');assert.deepEqual(m.after.pos,m.before.pos,'FIXTURE_TARGET_MOVED');assert(m.events.every(e=>e.data.amount>0));}
  return{kind,seed,mutation:mutate??null,params:built.params,authored:built.authored,cast,queue,measured};
 }
 const cases:any[]=[];
 for(const seed of [20260906,20260907]){
  for(const scenario of [{name:'already-hit-terminal-target',targets:[{label:'earlier',x:8.4,z:0}]},{name:'new-at-final-step',targets:[{label:'new-final',x:11,z:0}]},{name:'near-and-end',targets:[{label:'near',x:4,z:0},{label:'end',x:11,z:0}]}]){
   const arms=[run('tpl-traveling-wave',seed,scenario.targets),run('tpl-line-blast',seed,scenario.targets),run('tpl-traveling-wave',seed,scenario.targets,'no-terminal'),run('tpl-traveling-wave',seed,scenario.targets,'include-origin')];
   cases.push({seed,scenario:scenario.name,arms});
  }
 }
 const pinPaths=['content/ability-templates/tpl-traveling-wave.json','content/ability-templates/tpl-line-blast.json','content/config/damage-tiers.json','content/config/aoe-tiers.json',...['content/templates/expand.ts','content/templates/paramsSchema.ts','content/schema/ability.ts','content/damageTiers.ts','content/aoeTiers.ts','sim/effects/spawnModelFx.ts','sim/effects/delayed.ts','sim/effects/damageArea.ts','sim/abilities/abilitySystem.ts'].map(p=>'packages/shared/src/'+p)];
 const result={revision,createdAt:new Date().toISOString(),scriptSha256:hash(process.argv[1]),pins:pinPaths.map(p=>({path:p,sha256:hash(path.join(repo,p))})),cases,trainingAllowed:false,catalogChanged:false,productionChanged:false,scope:'Two seeds, controlled legal parameters and three geometries. Two explicitly marked in-memory mutation controls are diagnostic only; production and model labels unchanged. No proof of all configurations or visual fidelity.'};
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,cases:cases.map(c=>({seed:c.seed,scenario:c.scenario,arms:c.arms.map(a=>({kind:a.kind,mutation:a.mutation,targets:a.measured.map(m=>({label:m.label,hits:m.events.length,events:m.events.map(e=>({tick:e.tick,amount:e.data.amount}))}))}))}))},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
