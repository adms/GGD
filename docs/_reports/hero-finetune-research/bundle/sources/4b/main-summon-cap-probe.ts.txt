/** Reproduce template maxAlive semantics through the real cast entry. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
async function main(){
 const [repoArg,outArg]=process.argv.slice(2);assert(repoArg&&outArg);const repo=path.resolve(repoArg),out=path.resolve(outArg);assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const revision=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(revision,'4793eaaaf2775b2081f5eca5881db32e0aab0ea8');
 const load=(p:string)=>import(pathToFileURL(path.join(repo,'packages/shared/src',p)).href);
 const {zTemplateDoc}=await load('content/schema/template.ts'),{zAbilityDoc}=await load('content/schema/ability.ts'),{expand}=await load('content/templates/expand.ts'),{defaultParamsFor}=await load('content/templates/paramsSchema.ts');
 const tpl=zTemplateDoc.parse(JSON.parse(fs.readFileSync(path.join(repo,'content/ability-templates/tpl-summon-agent.json'),'utf8')));
 const {SimWorld}=await load('sim/SimWorld.ts'),{SKELETON_ARENA}=await load('sim/world/ArenaDef.ts'),{registerSkeletonContent,SELA}=await load('sim/content/skeleton.ts'),{spawnChampion}=await load('sim/spawnChampion.ts'),{registerChampion}=await load('sim/content/registry.ts'),{castAbility}=await load('sim/abilities/abilitySystem.ts');
 registerSkeletonContent();
 const run=(label:string,patch:Record<string,unknown>)=>{
  const ex=expand(tpl,{...defaultParamsFor(tpl),...patch});
  const ability=zAbilityDoc.parse({schema:'ability@1',id:'audit.summon-cap.q',name:'Summon cap audit',slot:'Q',maxRank:1,cooldown:[0],manaCost:[0],range:10,...ex});
  const champion={...SELA,id:'audit.summon-cap',abilities:{...SELA.abilities,Q:ability}};registerChampion(champion,{overrideAbilities:true});
  const world=new SimWorld(SKELETON_ARENA,20260906);world.combatActive=true;
  const caster=spawnChampion(world,{championId:champion.id,seatId:0,teamId:0,pos:{...SKELETON_ARENA.zones[0].center},zone:0});
  world.step(new Map());world.rebuildGrid();world.abilities.get(caster).slots.Q.rank=1;
  const castResult=castAbility(world,caster,'Q',{type:'self'});
  const ids=[...world.summon.keys()],events=structuredClone(world.events);
  world.step(new Map());
  return {label,patch,castResult,expandedEffects:ex.effects,countImmediately:ids.length,countAfterOneStep:world.summon.size,bodies:ids.map(id=>({id,owner:world.summon.get(id)?.ownerId,hp:world.health.get(id)?.hp,maxHp:world.health.get(id)?.maxHp,championId:world.stats.get(id)?.championId})),events};
 };
 const defaults=run('unmodified-template-defaults',{}),twoDefaultCap=run('two-bodies-default-cap',{count:2}),positiveCap=run('two-bodies-cap-two',{count:2,maxAlive:2}),omittedCap=run('two-bodies-explicitly-omit-cap',{count:2,maxAlive:undefined});
 for(const r of [defaults,twoDefaultCap,positiveCap,omittedCap])assert.equal(r.castResult,'ok');
 assert.equal(defaults.countImmediately,0);assert.equal(twoDefaultCap.countImmediately,0);assert.equal(positiveCap.countImmediately,2);assert.equal(omittedCap.countImmediately,2);
 assert(positiveCap.bodies.every(b=>b.hp>0&&b.maxHp>0));
 const users=fs.readdirSync(path.join(repo,'content/abilities')).filter(n=>n.endsWith('.json')).flatMap(n=>{
  const d=JSON.parse(fs.readFileSync(path.join(repo,'content/abilities',n),'utf8')),cards=Array.isArray(d.template)?d.template:d.template?[d.template]:[];
  return cards.filter((c:any)=>c.ref==='tpl-summon-agent').map((c:any)=>({id:d.id,params:c.params??{},effectiveMaxAlive:expand(tpl,{...defaultParamsFor(tpl),...(c.params??{})}).effects.find((e:any)=>e.kind==='summon')?.maxAlive??'omitted'}));
 });
 const pins=['content/ability-templates/tpl-summon-agent.json','packages/shared/src/content/templates/expand.ts','packages/shared/src/sim/effects/summon.ts','packages/shared/src/sim/abilities/abilitySystem.ts'].map(p=>({path:p,sha256:createHash('sha256').update(fs.readFileSync(path.join(repo,p))).digest('hex')}));
 const result={revision,createdAt:new Date().toISOString(),defaults,twoDefaultCap,positiveCap,omittedCap,users,pins,findings:['Template maxAlive default 0 is documented as no limit, but the real summon handler treats 0 as zero capacity.','Real cast returns ok but creates no body; changing only maxAlive to 2 or explicitly omitting the cap makes two live bodies.','This is a default-contract failure, not absence of all summon support. Positive-cap control does not validate every summon lifecycle/AI behavior.'],scope:'Pinned-main template expansion, full ability schema and castAbility to real SimWorld bodies; no production edits or full shipped skill E2E claim.',releaseQualified:false};
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,findings:result.findings,counts:[defaults,twoDefaultCap,positiveCap,omittedCap].map(r=>({label:r.label,count:r.countImmediately})),users},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
