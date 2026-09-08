import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {buildCapabilityManifest} from '../../packages/shared/src/content/editorCapabilities';
import {zAbilityVfxLayers,ABILITY_VFX_LAYER_OVERRIDE_FIELDS} from '../../packages/shared/src/content/schema/abilityVfx';
import {defaultParamsFor,paramsSchemaFor} from '../../packages/shared/src/content/templates/paramsSchema';
import {createDeterministicHeroPlans} from '../../packages/shared/src/content/heroForge/planner';
import {compileGeneratedHeroDraft,generateHeroDraft} from '../../packages/shared/src/content/heroForge/generator';
import {defaultHeroPresentation} from '../../packages/shared/src/content/heroForge/presentation';
import {runHeroAbilityScenario} from '../../packages/shared/src/content/heroForge/scenario';
import type {TemplateDoc} from '../../packages/shared/src/content/schema/template';
const repo=path.resolve(import.meta.dirname,'../..');
const {z}=createRequire(path.join(repo,'packages/shared/package.json'))('zod');
const sha=(v:string|Buffer)=>crypto.createHash('sha256').update(v).digest('hex');
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const put=(p:string,v:unknown)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const catalog=fs.readdirSync(path.join(repo,'content/ability-templates')).filter(n=>n.endsWith('.json')&&n!=='_index.json').map(n=>read(path.join(repo,'content/ability-templates',n)) as TemplateDoc).filter(t=>t.status==='enabled');
const template=catalog.find(t=>t.id==='tpl-ground-nova')!;
if(!template)throw Error('MISSING_TEMPLATE');
const vfxKeys=['fx.prim.ice.nova','fx.prim.fire.nova','fx.prim.ice.shockwave'].filter(k=>fs.existsSync(path.join(repo,'content/vfx',k+'.json')));
if(vfxKeys.length!==3)throw Error('MISSING_VFX');
const [command,input,output]=process.argv.slice(2);
if(command==='snapshot'){
 const tracked=execFileSync('git',['ls-files','packages/shared/src','content/ability-templates','content/vfx','content/projectiles'],{cwd:repo,encoding:'utf8'}).trim().split('\n');
 const files=tracked.map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(repo,p)))}));
 const state={head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),branch:execFileSync('git',['branch','--show-current'],{cwd:repo,encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--short','--untracked-files=all'],{cwd:repo,encoding:'utf8'}),files,capabilities:buildCapabilityManifest(),template,vfxKeys,vfxFields:['attachTo','delayMs',...ABILITY_VFX_LAYER_OVERRIDE_FIELDS]};
 put(input,{...state,digest:sha(JSON.stringify(state))});
}else if(command==='validate'){
 const rows=read(input);const results=[];
 const schema=z.object({outcome:z.enum(['proposed','degraded','refused','advice']),templateId:z.literal('tpl-ground-nova').nullable(),params:z.object({radius:z.number(),damage:z.number().nonnegative(),damageType:z.enum(['magic','physical','true'])}).strict().nullable(),vfxLayers:z.array(z.unknown()),missing:z.array(z.enum(['radius','damage'])),fallbackId:z.literal('cast-nova').nullable()}).strict();
 for(const [index,row] of rows.entries()){
  try{
   const v=schema.parse(row.value??row.target);
   if(v.outcome==='refused'||v.outcome==='advice'){
    if(v.templateId!==null||v.params!==null||v.vfxLayers.length||v.fallbackId!==null)throw Error('UNSAFE_REJECTED_PAYLOAD');
    results.push({id:row.id,pass:true,sim:'not-applicable'});continue;
   }
   if(!v.params||v.templateId!==template.id||v.missing.length)throw Error('MISSING_PROPOSAL');
   if((v.outcome==='degraded')!==(v.fallbackId==='cast-nova'))throw Error('FALLBACK_CONTRACT');
   const layers=zAbilityVfxLayers.parse(v.vfxLayers);
   if(layers.some(l=>!vfxKeys.includes(l.vfxKey)))throw Error('UNKNOWN_VFX');
   const params={...defaultParamsFor(template),...v.params,damage:{perRank:[v.params.damage],ratios:[]}};
   paramsSchemaFor(template).parse(params);
   const plan=createDeterministicHeroPlans({projectId:`train-${index}`,brief:{name:'訓練管線探針',concept:'研究用一次範圍傷害',moveNames:{}},sourceLock:{canonicalId:null,versionId:null},origin:'鬥士',availableTemplateIds:catalog.map(t=>t.id),availableTemplates:catalog})[0]!;
   plan.slots.Q={...plan.slots.Q,templateIds:[template.id],templateParamsById:{[template.id]:params},capabilityIds:[...template.requires]};
   const presentation=defaultHeroPresentation();presentation.slots.Q.vfxLayers=layers;
   const generated=generateHeroDraft(plan,{heroId:`train-${index}`,heroName:'訓練管線探針',presentation,templateParamsById:Object.fromEntries(catalog.map(t=>[t.id,defaultParamsFor(t)]))});
   const compiled=compileGeneratedHeroDraft(generated,catalog);
   if(!compiled.ok)throw Error('COMPILE:'+JSON.stringify(compiled.failures));
   const ability=compiled.draft.abilityDrafts.Q;
   const sim=runHeroAbilityScenario(compiled.draft.champion,ability,{rank:1,ticks:30,seed:20260906,relatedAbilities:Object.values(compiled.draft.abilityDrafts)});
   if(sim.status!=='accepted'||sim.assertions.some(a=>a.status==='fail')||!(sim.after.targetHp<sim.before.targetHp))throw Error('SIM_NO_ENEMY_DAMAGE:'+JSON.stringify({status:sim.status,counts:sim.eventCounts,before:sim.before,after:sim.after}));
   results.push({id:row.id,pass:true,sim:'accepted',effects:ability.effects,vfxLayers:ability.vfxLayers,events:sim.eventCounts,before:sim.before,after:sim.after,scope:'existing scenario; not an independent proof of every target/expiry condition'});
  }catch(e){results.push({id:row.id,pass:false,error:String(e)});}
 }
 put(output,{status:results.every(r=>r.pass)?'pass':'fail',results});
}else throw Error('usage: engine.ts snapshot output | validate input output');
