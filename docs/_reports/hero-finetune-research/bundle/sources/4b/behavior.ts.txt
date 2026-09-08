import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Abilities,SimWorld,SKELETON_ARENA,registerChampion,spawnChampion,rankUpAbility,type ChampionDef,type AbilityDef,type SimEvent,type IntentFrame} from '../../packages/shared/src/sim';
import {asSeatId,asTeamId} from '../../packages/shared/src/ids';
import {defaultParamsFor} from '../../packages/shared/src/content/templates/paramsSchema';
import {toLen} from '../../packages/shared/src/content/templates/expand';
import {createDeterministicHeroPlans} from '../../packages/shared/src/content/heroForge/planner';
import {generateHeroDraft,compileGeneratedHeroDraft} from '../../packages/shared/src/content/heroForge/generator';
import {defaultHeroPresentation} from '../../packages/shared/src/content/heroForge/presentation';
import type {TemplateDoc} from '../../packages/shared/src/content/schema/template';
const root=path.resolve(process.argv[2]!),repo=path.resolve(import.meta.dirname,'../..'),out=path.resolve(process.argv[3]??path.join(root,'behavior-matrix'));
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=(x:string|Buffer)=>crypto.createHash('sha256').update(x).digest('hex');
if(fs.existsSync(out))throw Error('REFUSE_OVERWRITE');
const snapshot=read(path.join(root,'engine-snapshot.json'));
for(const f of snapshot.files)if(hash(fs.readFileSync(path.join(repo,f.path)))!==f.sha256)throw Error('ENGINE_DRIFT');
const templates:TemplateDoc[]=fs.readdirSync(path.join(repo,'content/ability-templates')).filter(n=>n.endsWith('.json')&&n!=='_index.json').map(n=>read(path.join(repo,'content/ability-templates',n))).filter(t=>t.status==='enabled');
const template=templates.find(t=>t.id==='tpl-ground-nova')!;
const cases=read(path.join(root,'cases.private.json')),comparison=read(path.join(root,'comparison.json'));
const inputs=cases.filter((c:any)=>c.split==='test'&&c.spec.outcome==='proposed').map((c:any)=>({id:'reference:'+c.id,spec:c.spec,value:c.target}));
for(const pair of comparison.rows)for(const k of ['A','B']){const c=cases.find((c:any)=>c.id===pair.id);if(c.spec.outcome==='proposed'&&pair[k].score.pass)inputs.push({id:k+':'+pair.id,spec:c.spec,value:pair[k].value});}
function scenario(champion:ChampionDef,ability:AbilityDef,radius:number,cast:boolean){
 Abilities.register(ability.id,ability);registerChampion({...champion,abilities:{...champion.abilities,Q:ability}},{overrideAbilities:true});
 const world=new SimWorld(SKELETON_ARENA,20260906),center=SKELETON_ARENA.zones[0]!.center;
 const d=toLen(radius),locations=[{x:0,z:0},{x:d*0.5,z:0},{x:0,z:d*0.5},{x:d*1.8,z:0}];
 const ids=locations.map((p,i)=>spawnChampion(world,{championId:champion.id,seatId:asSeatId(i),teamId:asTeamId(i===0||i===2?0:1),pos:{x:center.x+p.x,z:center.z+p.z},zone:0,level:18}));
 world.step(new Map());world.rebuildGrid();
 const caster=ids[0]!,component=world.abilities.get(caster)!;component.unspentPoints=20;rankUpAbility(world,caster,'Q');
 for(const id of ids){const h=world.health.get(id)!;h.hp=h.maxHp*0.5;h.mana=h.maxMana;}
 const before=ids.map(id=>world.health.get(id)!.hp),events:SimEvent[]=[],trail:number[]=[];
 const frame:IntentFrame={commands:cast?[{kind:'castAbility',slot:'Q',target:{type:'point',point:{...world.transform.get(caster)!.pos}}}]:[]};
 for(let tick=0;tick<30;tick++){world.step(tick===0?new Map([[asSeatId(0),frame]]):new Map());events.push(...world.events.map(e=>({...e,data:{...e.data}})));trail.push(world.digest());}
 return{ids,before,after:ids.map(id=>world.health.get(id)!.hp),events,trail};
}
function verdict(cast:ReturnType<typeof scenario>,control:ReturnType<typeof scenario>){
 const delta=cast.after.map((hp,i)=>(cast.before[i]!-hp)-(control.before[i]!-control.after[i]!));
 const hits=(run:ReturnType<typeof scenario>,i:number)=>run.events.filter(e=>e.type==='damage'&&e.data.source===run.ids[0]&&e.data.target===run.ids[i]).length;
 const hitDelta=cast.ids.map((_,i)=>hits(cast,i)-hits(control,i));
 const assertions={castAccepted:cast.events.some(e=>e.type==='abilityCast')&&!cast.events.some(e=>e.type==='castRejected'),insideEnemyDamaged:delta[1]!>0,exactlyOneEnemyHit:hitDelta[1]===1,noNonEnemyHits:[0,2,3].every(i=>hitDelta[i]===0),casterUnaffected:Math.abs(delta[0]!)<1e-8,allyUnaffected:Math.abs(delta[2]!)<1e-8,outsideEnemyUnaffected:Math.abs(delta[3]!)<1e-8};
 return{pass:Object.values(assertions).every(Boolean),assertions,controlAdjustedHpLoss:delta,controlAdjustedDamageEvents:hitDelta};
}
const results=[];let mutation:any=null;
for(const [index,input]of inputs.entries()){
 const v=input.value,params={...defaultParamsFor(template),...v.params,damage:{perRank:[v.params.damage],ratios:[]}};
 const plan=createDeterministicHeroPlans({projectId:'behavior-'+index,brief:{name:'行為驗證',concept:'範圍反例',moveNames:{}},sourceLock:{canonicalId:null,versionId:null},origin:'鬥士',availableTemplateIds:templates.map(t=>t.id),availableTemplates:templates})[0]!;
 plan.slots.Q={...plan.slots.Q,templateIds:[template.id],templateParamsById:{[template.id]:params},capabilityIds:[...template.requires]};
 const presentation=defaultHeroPresentation();presentation.slots.Q.vfxLayers=v.vfxLayers;
 const generated=generateHeroDraft(plan,{heroId:'behavior-'+index,heroName:'行為驗證',presentation,templateParamsById:Object.fromEntries(templates.map(t=>[t.id,defaultParamsFor(t)]))});
 const compiled=compileGeneratedHeroDraft(generated,templates);if(!compiled.ok)throw Error('COMPILE');
 const ability=compiled.draft.abilityDrafts.Q,champion=compiled.draft.champion;
 const control=scenario(champion,ability,input.spec.radius,false),cast=scenario(champion,ability,input.spec.radius,true);
 results.push({id:input.id,...verdict(cast,control),radiusWc3:input.spec.radius,compiledDigest:hash(JSON.stringify(ability)),cast,control});
 if(index===0){const bad={...ability,radius:0.001};const faulty=scenario(champion,bad,input.spec.radius,true);mutation={kind:'compiled-radius-collapsed',...verdict(faulty,control),expected:'insideEnemyDamaged must fail',detected:!verdict(faulty,control).assertions.insideEnemyDamaged};}
}
fs.mkdirSync(out);const report={status:results.every(r=>r.pass)&&mutation?.detected?'pass':'fail',scope:'ground-nova fixed-radius target filtering; paired same-seed no-cast control',rows:results.length,referenceRows:24,modelRows:results.length-24,mutation,engineSnapshot:snapshot.digest,sourceHash:hash(fs.readFileSync(import.meta.filename)),notTested:['onHit/onMiss trigger conditions','status start and expiry','VFX rendered timing, attachment or appearance','unseen natural language'],results};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,rows:report.rows,failed:results.filter(r=>!r.pass).map(r=>({id:r.id,assertions:r.assertions,delta:r.controlAdjustedHpLoss})),mutation},null,2));
if(report.status!=='pass')process.exitCode=2;
