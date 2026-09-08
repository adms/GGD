/** Evidence for multi-card classification. Test fixtures are not parameter advice.
 * Uses pinned templates, expandStack/reject, full schema, real cast/basic attack/
 * damage pipelines. Never edits production, trains, or upgrades the catalog.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';

async function main(){
 const [repoArg,reviewArg,outArg]=process.argv.slice(2);assert(repoArg&&reviewArg&&outArg);
 const repo=path.resolve(repoArg),out=path.resolve(outArg);assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const revision=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(revision,'4793eaaaf2775b2081f5eca5881db32e0aab0ea8');
 const review=read(reviewArg);assert.equal(review.revision,revision);
 const load=(p:string)=>import(pathToFileURL(path.join(repo,'packages/shared/src',p)).href);
 const {zTemplateDoc}=await load('content/schema/template.ts'),{zAbilityDoc}=await load('content/schema/ability.ts'),{zEffectDef}=await load('content/schema/effect.ts');
 const {defaultParamsFor,paramsSchemaFor}=await load('content/templates/paramsSchema.ts'),{expandStack,mergeExpansion}=await load('content/templates/expand.ts'),{resolveTemplateExpansion}=await load('content/templates/resolve.ts');
 const {SimWorld}=await load('sim/SimWorld.ts'),{SKELETON_ARENA}=await load('sim/world/ArenaDef.ts'),{registerSkeletonContent,SELA}=await load('sim/content/skeleton.ts'),{spawnChampion}=await load('sim/spawnChampion.ts');
 const {Abilities,registerChampion}=await load('sim/content/registry.ts'),{castAbility}=await load('sim/abilities/abilitySystem.ts'),{combatResolveSystem}=await load('sim/combat/damage.ts'),{normalizeCombatEnv}=await load('sim/combatEnv.ts');
 const {Stat}=await load('sim/stats/statTypes.ts'),{runEffects}=await load('sim/effects/effectRunner.ts');registerSkeletonContent();
 const ids=['tpl-on-attack','tpl-on-hit-react','tpl-buff-self','tpl-life-manipulate','tpl-single-strike','tpl-ground-nova'];
 const docs=new Map(ids.map(id=>{const r=review.rows.find((r:any)=>r.templateId===id);assert.equal(r?.status,'enabled');const p=path.join(repo,'content/ability-templates',id+'.json');assert.equal(hash(p),r.sourceSha256);return[id,zTemplateDoc.parse(read(p))];}));
 const card=(ref:string,patch:any={})=>{const t=docs.get(ref);assert(t);const params={...defaultParamsFor(t),...patch};paramsSchemaFor(t).parse(params);return{ref,params};};
 const stack=(name:string,cards:any[])=>{
  const {result,trace}=expandStack(cards.map(c=>({template:docs.get(c.ref),params:c.params})),'reject');
  const skeleton={schema:'ability@1',id:'audit.composition.'+name,name:'Composition audit '+name,slot:result.innateKind?'PASSIVE':'Q',maxRank:1,cooldown:[0],manaCost:[0],range:10,template:{cards,onConflict:'reject'}};
  const resolved=resolveTemplateExpansion(skeleton,docs);assert(resolved.ok,'STACK_REJECTED:'+name+':'+JSON.stringify(trace.conflicts));
  const ability=zAbilityDoc.parse(mergeExpansion(skeleton,result));return{cards,trace,ability};
 };
 let serial=0;
 const boot=(ability:any,seed:number)=>{
  const label='audit.composition.hero-'+serial++,baseAbilities=Object.fromEntries(Object.entries(SELA.abilities).map(([slot,def]:[string,any])=>[slot,{...def,id:label+'.'+slot.toLowerCase(),effects:[],passive:undefined,castTimeSec:0}]));
  const passive=ability?.slot==='PASSIVE';if(ability){Abilities.register(ability.id,ability);if(!passive)baseAbilities.Q=ability;}
  const champion={...SELA,id:label,attackType:'melee',passive:undefined,passiveAbility:passive?ability.id:undefined,abilities:baseAbilities};registerChampion(champion,{overrideAbilities:true});
  const dummy={...SELA,id:label+'-dummy',attackType:'melee',passive:undefined,passiveAbility:undefined};registerChampion(dummy);
  const world=new SimWorld(SKELETON_ARENA,seed);world.combatActive=true;world.combatEnv=normalizeCombatEnv({damageDealt:1,healing:1});world.combatFeel={...world.combatFeel,autoEngage:{...world.combatFeel.autoEngage,enabled:false}};
  const center=SKELETON_ARENA.zones[0].center;
  const spawn=(championId:string,seatId:number,teamId:number,dx:number)=>spawnChampion(world,{championId,seatId,teamId,pos:{x:center.x+dx,z:center.z},zone:0});
  const caster=spawn(champion.id,0,0,0),enemy=spawn(dummy.id,1,1,1),bystander=spawn(dummy.id,2,1,2),friend=spawn(dummy.id,3,0,-2);
  // autoEngage is a movement/engagement preference, not a no-auto-attack switch.
  // Use the real disarm effect to make recipients controlled nonattacking dummies.
  const disarm=zEffectDef.parse({kind:'applyStatus',statusId:'audit-disarmed',duration:5,disarmed:true});
  runEffects([disarm],{world,caster,targets:[enemy,bystander,friend],rank:1,origin:'ability:audit.fixture-disarm',rng:world.rng});
  world.step(new Map());world.rebuildGrid();return{world,caster,enemy,bystander,friend};
 };
 const hp=(s:any)=>Object.fromEntries(['caster','enemy','bystander','friend'].map(k=>[k,s.world.health.get(s[k]).hp]));
 const damageEvents=(w:any)=>structuredClone(w.events.filter((e:any)=>e.type==='damage'));
 const near=(a:number,b:number)=>assert(Math.abs(a-b)<.0001,`${a} != ${b}`);
 const buff=()=>card('tpl-buff-self',{duration:1,castTimeSec:0,modifiers:[{stat:'ad',op:'flat',value:17}]}),restore=()=>card('tpl-life-manipulate',{applyTo:'self',healthPct:.2,manaPct:undefined,castTimeSec:0});
 const attack=()=>card('tpl-on-attack',{condition:undefined,chance:1,event:'onBasicAttack',bonusDamage:{perRank:[22],ratios:[]},damageType:'true',internalCooldown:1});
 const reactive=()=>card('tpl-on-hit-react',{chance:1,reflectDamage:{perRank:[11],ratios:[]},damageType:'true',internalCooldown:1});
 const checks:any[]=[];
 function check(name:string,fn:()=>any){try{checks.push({name,pass:true,evidence:fn()});}catch(e){checks.push({name,pass:false,error:String(e),stack:e instanceof Error?e.stack:undefined});}}
 for(const seed of [20260906,20260907])for(const reverse of [false,true]){
  check(`self-buff-restore-${seed}-${reverse}`,()=>{
   const built=stack('buff-restore-'+seed+'-'+Number(reverse),(reverse?[restore(),buff()]:[buff(),restore()])),s=boot(built.ability,seed),w=s.world;
   for(const id of [s.caster,s.enemy,s.bystander,s.friend]){const h=w.health.get(id);h.hp=h.maxHp*.25;}
   const before={tick:w.tick,hp:hp(s),ad:w.stats.get(s.caster).final[Stat.AttackDamage]},cast=castAbility(w,s.caster,'Q',{type:'self'});assert.equal(cast,'ok');
   const immediate={tick:w.tick,hp:hp(s)};near(immediate.hp.caster,before.hp.caster+w.health.get(s.caster).maxHp*.2);for(const k of ['enemy','bystander','friend'])near(immediate.hp[k],before.hp[k]);assert.equal(immediate.tick,before.tick);
   w.step(new Map());const buffed=w.stats.get(s.caster).final[Stat.AttackDamage];near(buffed,before.ad+17);
   for(let i=0;i<Math.ceil(1/w.dt)+2;i++)w.step(new Map());const expired=w.stats.get(s.caster).final[Stat.AttackDamage];near(expired,before.ad);
   return{cards:built.cards,cast,before,immediate,buffed,expired,claim:'One self cast adds self HP immediately and applies a temporary self numeric buff. Neither enemies nor other friends receive the restore. Both card orders verified.'};
  });
  check(`independent-hooks-${seed}-${reverse}`,()=>{
   const built=stack('hooks-'+seed+'-'+Number(reverse),reverse?[reactive(),attack()]:[attack(),reactive()]),s=boot(built.ability,seed),w=s.world;
   const src=w.stats.get(s.caster).sources.find((s:any)=>s.id==='abilityPassive:'+built.ability.id);assert(src);assert.equal(src.hooks.length,2);
   let outgoing:any[]=[];
   for(let i=0;i<90;i++){w.nav.get(s.caster).attackTarget=s.enemy;w.step(new Map());outgoing.push(...structuredClone(w.events));if(outgoing.some((e:any)=>e.type==='damage'&&String(e.data.origin).startsWith('hook:abilityPassive:')))break;}
   w.nav.get(s.caster).attackTarget=null;
   const swings=outgoing.filter((e:any)=>e.type==='basicAttack'&&e.data.source===s.caster);assert.equal(swings.length,1,'NOT_EXACTLY_ONE_REAL_BASIC_ATTACK');
   const procs=outgoing.filter((e:any)=>e.type==='damage'&&String(e.data.origin).startsWith('hook:abilityPassive:'));assert.equal(procs.length,1,JSON.stringify({procs,swings,damage:outgoing.filter((e:any)=>e.type==='damage')}));assert.equal(procs[0].data.target,s.enemy);
   const before=hp(s),oldEvents=w.events.length;w.damageQueue.push({source:s.enemy,target:s.caster,amount:17,type:'true',crit:false,origin:'ability:audit.incoming'});combatResolveSystem(w);
   const first=hp(s),firstEvents=structuredClone(w.events.slice(oldEvents));const incoming=firstEvents.filter((e:any)=>e.type==='damage'&&e.data.origin==='ability:audit.incoming');assert.equal(incoming.length,1);assert(incoming[0].data.amount>0);near(first.caster,before.caster-incoming[0].data.amount);near(first.enemy,before.enemy-11);near(first.bystander,before.bystander);near(first.friend,before.friend);
   // The step increments the tick after the basic attack. Both hooks fire within
   // one authored ICD window; they need not have identical integer timestamps.
   const afterFirstLedgers=src.hookLastFired.slice();assert(afterFirstLedgers.every((n:number)=>n>=0));assert(Math.max(...afterFirstLedgers)-Math.min(...afterFirstLedgers)<Math.ceil(1/w.dt));
   const againBefore=hp(s);w.damageQueue.push({source:s.bystander,target:s.caster,amount:17,type:'true',crit:false,origin:'ability:audit.incoming-again'});combatResolveSystem(w);
   const againAfter=hp(s);assert(againAfter.caster<againBefore.caster);near(againAfter.bystander,againBefore.bystander);
   // Once the authored reactive ICD expires, the new attacker gets the counter.
   for(let i=0;i<Math.ceil(1/w.dt)+2;i++)w.step(new Map());const laterBefore=hp(s);
   w.damageQueue.push({source:s.bystander,target:s.caster,amount:17,type:'true',crit:false,origin:'ability:audit.incoming-later'});combatResolveSystem(w);const laterAfter=hp(s);near(laterAfter.bystander,laterBefore.bystander-11);near(laterAfter.enemy,laterBefore.enemy);
   assert.equal(castAbility(w,s.caster,'PASSIVE',{type:'self'}),'passive');
   return{cards:built.cards,swings,procs,before,first,firstEvents,againBefore,againAfter,laterBefore,laterAfter,afterFirstLedgers,claim:'Real basic attack fires the outgoing hook; actual damage fires the reactive hook after HP loss. Hooks have separate cooldown slots, and the counter targets only the current attacker. This is not original-damage cancellation or a shared-roll/shared-ICD combo.'};
  });
 }
 check('conflicting-cast-shapes-rejected',()=>{
  const cards=[card('tpl-single-strike'),card('tpl-ground-nova')],{result,trace}=expandStack(cards.map(c=>({template:docs.get(c.ref),params:c.params})),'reject');
  const resolved=resolveTemplateExpansion({schema:'ability@1',id:'audit.conflict',name:'Conflict',slot:'Q',maxRank:1,cooldown:[0],manaCost:[0],range:10,template:{cards,onConflict:'reject'}},docs);assert.equal(resolved.ok,false);assert(trace.conflicts.some((c:any)=>c.key==='castType'));return{cards,trace,result,claim:'Do not silently combine targeted and ground targeting under reject policy.'};
 });
 check('active-payload-in-passive-not-castable',()=>{
  const built=stack('passive-plus-active',[attack(),buff()]),s=boot(built.ability,20260906),before={hp:hp(s),ad:s.world.stats.get(s.caster).final[Stat.AttackDamage]};
  const cast=castAbility(s.world,s.caster,'PASSIVE',{type:'self'});assert.equal(cast,'passive');s.world.step(new Map());near(s.world.stats.get(s.caster).final[Stat.AttackDamage],before.ad);
  return{cards:built.cards,innateKind:built.ability.innateKind,effects:built.ability.effects,cast,before,claim:'Schema-valid active buff beside a permanent passive does not create a usable active button.'};
 });
 check('duplicate-strike-really-doubles-hit',()=>{
  const strike=card('tpl-single-strike',{damageType:'true',damage:{perRank:[23],ratios:[]},castTimeSec:0});
  const run=(count:number)=>{const built=stack('duplicate-'+count,Array.from({length:count},()=>structuredClone(strike))),s=boot(built.ability,20260906),before=hp(s);const cast=castAbility(s.world,s.caster,'Q',{type:'entity',entityId:s.enemy});assert.equal(cast,'ok');combatResolveSystem(s.world);return{count,cast,before,after:hp(s),events:damageEvents(s.world)};};
  const one=run(1),two=run(2),oneLoss=one.before.enemy-one.after.enemy,twoLoss=two.before.enemy-two.after.enemy;assert(oneLoss>0);near(twoLoss,2*oneLoss);assert.equal(one.events.length,1);assert.equal(two.events.length,2);return{one,two,oneLoss,twoLoss,claim:'Duplicate cards are two hits, not harmless deduplication and not automatically one combined hit. Actual HP loss includes the same live stat scaling in both controls.'};
 });
 const pinPaths=[...ids.map(id=>'content/ability-templates/'+id+'.json'),...['content/templates/expand.ts','content/templates/resolve.ts','content/templates/paramsSchema.ts','content/schema/ability.ts','sim/abilities/abilitySystem.ts','sim/abilities/abilityPassives.ts','sim/effects/hooks.ts','sim/effects/applyBuff.ts','sim/effects/applyStatus.ts','sim/effects/restore.ts','sim/combat/damage.ts','sim/systems/BasicAttackSystem.ts'].map(p=>'packages/shared/src/'+p)];
 const result={revision,createdAt:new Date().toISOString(),catalogReviewSha256:hash(reviewArg),scriptSha256:hash(process.argv[1]),pins:pinPaths.map(p=>({path:p,sha256:hash(path.join(repo,p))})),checks,passed:checks.filter(c=>c.pass).length,total:checks.length,trainingApproved:false,releaseQualified:false,catalogModified:false,scope:'Two selected template compositions in both orders and two seeds, plus three negative/duplicate controls. Explicit test parameters, no parameter generation or tuning advice. Pinned-main representative runtime evidence only; not all compositions, all parameter choices, latest-main behavior, or full hero source coverage.'};
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,passed:result.passed,total:result.total,checks:checks.map(({name,pass,error})=>({name,pass,error}))},null,2));if(result.passed!==result.total)process.exitCode=2;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
