/** Pinned-main composition evidence. Schema compatibility is NOT semantic coverage. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

async function main() {
 const [repoArg,reviewArg,outArg]=process.argv.slice(2);assert(repoArg&&reviewArg&&outArg);
 const repo=path.resolve(repoArg),out=path.resolve(outArg);assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const review=JSON.parse(fs.readFileSync(reviewArg,'utf8'));
 const revision=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.equal(revision,'4793eaaaf2775b2081f5eca5881db32e0aab0ea8');assert.equal(review.revision,revision);
 const load=(p:string)=>import(pathToFileURL(path.join(repo,'packages/shared/src',p)).href);
 const {zTemplateDoc}=await load('content/schema/template.ts');
 const {zAbilityDoc}=await load('content/schema/ability.ts');
 const {defaultParamsFor}=await load('content/templates/paramsSchema.ts');
 const {expandStack,mergeExpansion}=await load('content/templates/expand.ts');
 const {resolveTemplateExpansion}=await load('content/templates/resolve.ts');
 const docs=new Map<string,any>(review.rows.filter((r:any)=>r.status==='enabled').map((r:any)=>{
  const t=zTemplateDoc.parse(JSON.parse(fs.readFileSync(path.join(repo,'content/ability-templates',r.templateId+'.json'),'utf8')));
  assert.equal(hash(path.join(repo,'content/ability-templates',r.templateId+'.json')),r.sourceSha256);
  return [t.id,t];
 }));
 const card=(ref:string,patch:Record<string,unknown>={})=>{const t=docs.get(ref);assert(t,'UNAVAILABLE:'+ref);return {ref,params:{...defaultParamsFor(t),...patch}};};
 const inspect=(cards:any[])=>{
  const {result,trace}=expandStack(cards.map(c=>({template:docs.get(c.ref),params:c.params})),'reject');
  const skeleton={schema:'ability@1',id:'audit.stack.q',name:'Research composition',slot:result.innateKind?'PASSIVE':'Q',maxRank:1,cooldown:[0],manaCost:[0],range:10,template:{cards,onConflict:'reject'}};
  const resolved=resolveTemplateExpansion(skeleton,docs);
  const schema=zAbilityDoc.safeParse(mergeExpansion(skeleton,result));
  return {cards,resolveOk:resolved.ok,resolveFailure:resolved.ok?null:resolved.failure,schemaOk:schema.success,schemaIssues:schema.success?[]:schema.error.issues,expansion:result,trace,semanticallyQualified:false};
 };
 const ids=[...docs.keys()].sort(),pairs:any[]=[];
 // Both orders, including repeat-card compositions. Do not infer semantics from this matrix.
 for(const a of ids)for(const b of ids){const r=inspect([card(a),card(b)]);pairs.push({refs:[a,b],resolveOk:r.resolveOk,schemaOk:r.schemaOk,conflicts:r.trace.conflicts,schemaIssues:r.schemaIssues,semanticallyQualified:false});}
 const probes:any={
  independentHooks:inspect([card('tpl-on-attack'),card('tpl-on-hit-react')]),
  tripleGrowth:inspect(['str','agi','int'].map(attr=>card('tpl-growth-charge',{attr,everyNth:8}))),
  rallyAndImmediateRestore:inspect([card('tpl-teleport',{destination:'rallyToCaster'}),card('tpl-life-manipulate')]),
  independentSelfBuffRestore:inspect([card('tpl-buff-self'),card('tpl-life-manipulate',{applyTo:'self'})]),
  conflictingTargeting:inspect([card('tpl-single-strike'),card('tpl-ground-nova')]),
  procPlusActivePayload:inspect([card('tpl-on-attack'),card('tpl-buff-self')]),
  doubleHit:inspect([card('tpl-single-strike'),card('tpl-single-strike')]),
 };
 assert.deepEqual(probes.independentHooks.expansion.passive.ranks[0].hooks.map((h:any)=>h.on),['onBasicAttack','onDamageTaken']);
 assert.equal(probes.independentHooks.resolveOk,true);assert.equal(probes.independentHooks.schemaOk,true);
 assert.equal(probes.tripleGrowth.resolveOk,true);assert.equal(probes.tripleGrowth.schemaOk,true);
 assert.deepEqual(probes.tripleGrowth.expansion.passive.ranks[0].hooks.map((h:any)=>h.effects[0].attr),['str','agi','int']);
 assert.equal(probes.conflictingTargeting.resolveOk,false);
 assert(probes.conflictingTargeting.trace.conflicts.some((c:any)=>c.key==='castType'));
 assert.equal(probes.rallyAndImmediateRestore.resolveOk,true);assert.equal(probes.rallyAndImmediateRestore.schemaOk,true);
 assert.equal(probes.procPlusActivePayload.expansion.innateKind,'passive');
 assert.equal(probes.doubleHit.expansion.effects.length,2);
 // Real effect interpreter proves stacking does not await movement completion.
 const {SimWorld}=await load('sim/SimWorld.ts');const {SKELETON_ARENA}=await load('sim/world/ArenaDef.ts');
 const {registerSkeletonContent,SELA}=await load('sim/content/skeleton.ts');const {spawnChampion}=await load('sim/spawnChampion.ts');
 const {normalizeCombatEnv}=await load('sim/combatEnv.ts');const {runEffects}=await load('sim/effects/effectRunner.ts');
 registerSkeletonContent();const world=new SimWorld(SKELETON_ARENA,20260906);world.combatActive=true;world.combatEnv=normalizeCombatEnv({damageDealt:1,healing:1});
 const center=SKELETON_ARENA.zones[0].center;
 const caster=spawnChampion(world,{championId:SELA.id,seatId:0,teamId:0,pos:{...center},zone:0});
 const friend=spawnChampion(world,{championId:SELA.id,seatId:1,teamId:0,pos:{x:center.x+2,z:center.z},zone:0});
 world.step(new Map());const hp=world.health.get(friend);hp.hp=hp.maxHp*.25;
 const before={tick:world.tick,hp:hp.hp,pos:{...world.transform.get(friend).pos}};
 runEffects(probes.rallyAndImmediateRestore.expansion.effects,{world,caster,targets:[friend],rank:1,origin:'ability:audit.rally',rng:world.rng});
 const after={tick:world.tick,hp:hp.hp,pos:{...world.transform.get(friend).pos}};
 assert.equal(after.tick,before.tick);assert(after.hp>before.hp);assert.deepEqual(after.pos,before.pos);
 // Isolated real grant handlers: verifies per-attribute counter behavior, NOT onKill dispatch.
 const champ=world.champion.get(caster),initial={...champ.attrBonus};
 const grants=probes.tripleGrowth.expansion.passive.ranks[0].hooks.flatMap((h:any)=>h.effects);
 const ticks:any[]=[];
 for(let i=1;i<=8;i++){runEffects(grants,{world,caster,targets:[caster],rank:1,origin:'ability:audit.growth',rng:world.rng});ticks.push({invocations:i,bonus:{...champ.attrBonus}});}
 for(const attr of ['str','agi','int']){assert.equal(ticks[6].bonus[attr]??0,initial[attr]??0);assert.equal(ticks[7].bonus[attr],(initial[attr]??0)+1);}
 const result={revision,createdAt:new Date().toISOString(),catalogReviewSha256:hash(reviewArg),counts:{templates:ids.length,orderedPairs:pairs.length,conflictFree:pairs.filter(p=>p.resolveOk).length,conflictFreeAndSchemaValid:pairs.filter(p=>p.resolveOk&&p.schemaOk).length},pairs,probes,runtime:{rally:{before,after,claim:'restore executes in takeoff tick, not after landing',scope:'expanded effects through real interpreter, not full player cast E2E'},tripleGrowth:{initial,ticks,claim:'three attribute counters pay on eighth handler invocation',scope:'real effects only; onKill dispatch not exercised'}},rules:['Use reject policy; never silently lastWins.','Each requirement needs its own source-grounded coverage; schema success is insufficient.','Concatenated effects execute immediately in order, without awaiting leap/delayed/DoT completion.','Independent trigger hooks may merge, but shared counters, cooldowns and target rules require runtime checks.','An active payload beside innateKind=passive does not prove the player can cast it.','Repeat cards can double damage or advance shared counters; not a harmless duplicate.'],releaseQualified:false,trainingApproved:false,fullRuntimeValidated:false};
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,counts:result.counts,runtime:result.runtime},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
