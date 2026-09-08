/** Reproduce growth-charge receiver routing through real hook dispatch. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
async function main(){
 const [repoArg,outArg]=process.argv.slice(2);assert(repoArg&&outArg);const repo=path.resolve(repoArg),out=path.resolve(outArg);assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const revision=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(revision,'4793eaaaf2775b2081f5eca5881db32e0aab0ea8');
 const load=(p:string)=>import(pathToFileURL(path.join(repo,'packages/shared/src',p)).href);
 const {zTemplateDoc}=await load('content/schema/template.ts');const {expand}=await load('content/templates/expand.ts');const {defaultParamsFor}=await load('content/templates/paramsSchema.ts');
 const tpl=zTemplateDoc.parse(JSON.parse(fs.readFileSync(path.join(repo,'content/ability-templates/tpl-growth-charge.json'),'utf8')));
 const {SimWorld}=await load('sim/SimWorld.ts');const {SKELETON_ARENA}=await load('sim/world/ArenaDef.ts');const {registerSkeletonContent,SELA}=await load('sim/content/skeleton.ts');const {spawnChampion}=await load('sim/spawnChampion.ts');const {attachSource}=await load('sim/stats/statPipeline.ts');const {fireHooks}=await load('sim/effects/hooks.ts');
 registerSkeletonContent();
 const run=(everyNth:number,selfControl:boolean)=>{
  const world=new SimWorld(SKELETON_ARENA,20260906);world.combatActive=true;const center=SKELETON_ARENA.zones[0].center;
  const spawn=(seat:number,team:number)=>spawnChampion(world,{championId:SELA.id,seatId:seat,teamId:team,pos:{x:center.x+seat/4,z:center.z},zone:0});
  const killer=spawn(0,0),victims=Array.from({length:everyNth},(_,i)=>spawn(i+1,1));world.step(new Map());
  const ex=expand(tpl,{...defaultParamsFor(tpl),everyNth});const hooks=ex.passive.ranks[0].hooks.map((h:any)=>selfControl?{...h,target:'self'}:h);
  attachSource(world,killer,{id:'ability:audit.growth',kind:'ability',hooks});
  const before={killer:{...world.champion.get(killer).attrBonus},victims:victims.map(v=>({...world.champion.get(v).attrBonus}))};
  const fired=victims.map(v=>fireHooks(world,killer,'onKill',v));
  const after={killer:{...world.champion.get(killer).attrBonus},victims:victims.map(v=>({...world.champion.get(v).attrBonus})),killerProgress:{...world.champion.get(killer).attrGrantProgress},victimProgress:victims.map(v=>({...world.champion.get(v).attrGrantProgress}))};
  assert(fired.every(n=>n===1));return {everyNth,selfControl,hooks,before,after,fired};
 };
 const one=run(1,false),eight=run(8,false),control=run(8,true);
 assert.equal(one.after.killer.agi,one.before.killer.agi);assert.equal(one.after.victims[0].agi,one.before.victims[0].agi+1);
 assert.equal(eight.after.killer.agi,eight.before.killer.agi);assert.equal(Object.keys(eight.after.killerProgress).length,0);assert(eight.after.victimProgress.every(p=>Object.values(p)[0]===1));
 assert.equal(control.after.killer.agi,control.before.killer.agi+1);assert.deepEqual(control.after.victims,control.before.victims);
 const pins=['content/ability-templates/tpl-growth-charge.json','packages/shared/src/content/templates/expand.ts','packages/shared/src/sim/effects/hooks.ts','packages/shared/src/sim/effects/grantAttribute.ts','packages/shared/src/sim/systems/DeathSystem.ts'].map(p=>({path:p,sha256:createHash('sha256').update(fs.readFileSync(path.join(repo,p))).digest('hex')}));
 const result={revision,createdAt:new Date().toISOString(),one,eight,control,pins,diagnosis:'growth-charge omits hook.target=self. onKill victim is the grantAttribute receiver and counter owner, not killer.',scope:'Real expanded hooks attached to real SimWorld source and fired via fireHooks, with actual onKill signature from DeathSystem; does not simulate eight player kills or modify any shipped content.',releaseQualified:false,quarantineTemplate:'tpl-growth-charge'};
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,diagnosis:result.diagnosis,one,eight,control},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
