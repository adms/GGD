/** Audit pinned main without changing runtime or the active R3 curriculum. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

async function main() {
 const [repoArg,outArg]=process.argv.slice(2);assert(repoArg&&outArg);
 const repo=path.resolve(repoArg),out=path.resolve(outArg);
 assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const revision=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.equal(revision,'4793eaaaf2775b2081f5eca5881db32e0aab0ea8');
 const load=(p:string)=>import(pathToFileURL(path.join(repo,'packages/shared/src',p)).href);
 const {zTemplateDoc}=await load('content/schema/template.ts');
 const {zEffectDef}=await load('content/schema/effect.ts');
 const {zAbilityDoc}=await load('content/schema/ability.ts');
 const {defaultParamsFor,paramsSchemaFor}=await load('content/templates/paramsSchema.ts');
 const {expand}=await load('content/templates/expand.ts');
 const docs=fs.readdirSync(path.join(repo,'content/ability-templates')).filter(n=>n.endsWith('.json')&&!n.startsWith('_')).sort().map(n=>zTemplateDoc.parse(JSON.parse(fs.readFileSync(path.join(repo,'content/ability-templates',n),'utf8'))));
 const probe=(id:string,patch:Record<string,unknown>={})=>{const doc=docs.find(t=>t.id===id);assert(doc);return expand(doc,{...defaultParamsFor(doc),...patch});};
 const schemas=docs.filter(t=>t.status==='enabled').map(t=>{
  const defaults=defaultParamsFor(t),params=paramsSchemaFor(t).safeParse(defaults),ex=expand(t,defaults);
  const effectResults=ex.effects.map((e:any,i:number)=>{const r=zEffectDef.safeParse(e);return {index:i,kind:e.kind,ok:r.success,issues:r.success?[]:r.error.issues};});
  const ability=zAbilityDoc.safeParse({schema:'ability@1',id:'probe.'+t.family,name:'Audit '+t.family,slot:ex.innateKind?'PASSIVE':'Q',maxRank:1,cooldown:[0],manaCost:[0],range:10,...ex});
  return {id:t.id,paramsOk:params.success,paramsIssues:params.success?[]:params.error.issues,effectResults,abilityOk:ability.success,abilityIssues:ability.success?[]:ability.error.issues};
 });
 const checks:any[]=[];
 const check=(id:string,fn:()=>unknown)=>{try{checks.push({id,ok:true,evidence:fn()});}catch(e){checks.push({id,ok:false,error:String(e)});}};
 check('line-sweep-is-segmented-not-projectile',()=>{const ex=probe('tpl-line-sweep'),e=ex.effects[0];assert.equal(e.kind,'delayed');assert.equal(e.targetMode,'reresolve');assert.equal(e.hitOncePerTarget,true);assert.equal(e.count,6);assert.equal(e.intervalSec,.05);return e;});
 check('traveling-wave-has-distinct-terminal-burst',()=>{const e=probe('tpl-traveling-wave').effects[0];assert.equal(e.kind,'delayed');assert(e.finalEffects.some((x:any)=>x.kind==='damageArea'));return e;});
 check('periodic-field-reresolves-current-circle',()=>{const e=probe('tpl-periodic-field').effects[0];assert.equal(e.targetMode,'reresolve');assert.equal(e.anchor,'caster');assert.equal(e.count,5);assert.equal(e.effects[0].amount.mult,.2);return e;});
 check('blink-strike-is-not-zero-payload-teleport',()=>{const e=probe('tpl-blink-strike').effects[0];assert.equal(e.kind,'blink');assert.equal(e.to,'targetUnit');assert(e.onArrive.some((x:any)=>x.kind==='damage'));return e;});
 check('combo-finisher-is-wired',()=>{const e=probe('tpl-combo-finisher').effects[0];assert.equal(e.kind,'comboStrikes');assert(e.perStrike.length>0&&e.finisher.length>0);return e;});
 check('summon-agent-creates-body-not-proxy',()=>{const e=probe('tpl-summon-agent').effects[0];assert.equal(e.kind,'summon');assert.equal(e.body,'self');return e;});
 check('growth-charge-single-stat-on-kill',()=>{const e=probe('tpl-growth-charge').passive.ranks[0].hooks[0];assert.equal(e.on,'onKill');assert.equal(e.effects.length,1);assert.equal(e.effects[0].kind,'grantAttribute');return e;});
 check('seven-pure-model-families-have-no-damage',()=>{const ids=['locust-orb','locust-line','locust-strike','locust-travel','locust-swarm','dragon-serpent','dragon-quake'];for(const id of ids){const e=probe('tpl-'+id).effects[0];assert.equal(e.kind,'spawnModelFx');assert.equal(e.onTouch,undefined);assert.equal(e.onArrive,undefined);}return ids;});
 // Real handlers on real SimWorld entities, not a hand-written model of HP.
 let runtime:any;
 try {
  const {SimWorld}=await load('sim/SimWorld.ts');
  const {SKELETON_ARENA}=await load('sim/world/ArenaDef.ts');
  const {registerSkeletonContent,SELA}=await load('sim/content/skeleton.ts');
  const {spawnChampion}=await load('sim/spawnChampion.ts');
  const {normalizeCombatEnv}=await load('sim/combatEnv.ts');
  const {runEffects}=await load('sim/effects/effectRunner.ts');
  registerSkeletonContent();const world=new SimWorld(SKELETON_ARENA,20260906);world.combatActive=true;world.combatEnv=normalizeCombatEnv({damageDealt:1,healing:1});
  const c=SKELETON_ARENA.zones[0].center;
  const caster=spawnChampion(world,{championId:SELA.id,seatId:0,teamId:0,pos:{...c},zone:0});
  const enemy=spawnChampion(world,{championId:SELA.id,seatId:1,teamId:1,pos:{x:c.x+2,z:c.z},zone:0});
  world.step(new Map());
  const a=world.health.get(caster),b=world.health.get(enemy);a.hp=a.maxHp*.25;b.hp=b.maxHp*.25;
  const before={caster:a.hp,enemy:b.hp};
  const drain=probe('tpl-drain-leech'),heal=drain.effects.find((e:any)=>e.kind==='heal');assert(heal);
  runEffects([heal],{world,caster,targets:[enemy],rank:1,origin:'ability:probe.drain-target',rng:world.rng});
  const after={caster:a.hp,enemy:b.hp};
  a.hp=a.maxHp*.25;b.hp=b.maxHp*.25;
  const controlBefore={caster:a.hp,enemy:b.hp};
  runEffects([{...heal,applyTo:'self'}],{world,caster,targets:[enemy],rank:1,origin:'ability:probe.self-control',rng:world.rng});
  const controlAfter={caster:a.hp,enemy:b.hp};
  assert(after.enemy>before.enemy&&after.caster===before.caster,'Unconfirmed drain target diagnosis');
  assert(controlAfter.caster>controlBefore.caster&&controlAfter.enemy===controlBefore.enemy,'Self control failed');
  a.hp=a.maxHp*.25;const restore=probe('tpl-life-manipulate',{applyTo:'self',healthPct:.5,manaPct:undefined}).effects[0];
  const restoreBefore=a.hp;runEffects([restore],{world,caster,targets:[],rank:1,origin:'ability:probe.restore',rng:world.rng});
  assert(Math.abs(a.hp-a.maxHp*.75)<.001,'restore does not add expected half max');
  runtime={ok:true,drain:{heal,before,after,controlBefore,controlAfter,diagnosis:'default drain heal restores the selected enemy, not the caster',scope:'isolated real heal payload from expanded template; not full skill cast E2E'},restore:{effect:restore,before:restoreBefore,after:a.hp,max:a.maxHp,diagnosis:'restore adds max-health fraction, does not set current HP to that fraction'}};
 } catch(e) {runtime={ok:false,error:String(e)};}
 const pins=['content/templates/expand.ts','content/schema/effects/heal.ts','content/schema/effects/spawnModelFx.ts','sim/effects/heal.ts','sim/effects/restore.ts'].map(p=>({path:'packages/shared/src/'+p,sha256:createHash('sha256').update(fs.readFileSync(path.join(repo,'packages/shared/src',p))).digest('hex')}));
 const result={revision,createdAt:new Date().toISOString(),schemas,checks,runtime,pins,releaseQualified:false,scope:'default params/full ability schema, selected expansion constraints and isolated real handler behavior; no production mutation'};
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({out,schemaFailures:schemas.filter(r=>!r.paramsOk||!r.abilityOk),checks:checks.map(({id,ok})=>({id,ok})),runtime},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
