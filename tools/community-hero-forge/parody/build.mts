import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {shippedHeroCatalog} from '../../../packages/shared/testkit/heroPackageFixture.ts';
import {applyCommunityDesignRefinement,zCommunityDesignRefinement} from '../../../packages/shared/src/content/heroForge/communityRefinements/apply.ts';
import {generateHeroDraft,compileGeneratedHeroDraft} from '../../../packages/shared/src/content/heroForge/generator.ts';
import {paramsSchemaFor,defaultParamsFor} from '../../../packages/shared/src/content/templates/paramsSchema.ts';
import {contentSha256} from '../../../packages/shared/src/content/import/jcs.ts';
import {redesign,rewritten} from './designs.mjs';
import {adaptExisting,signatures} from './adapt-existing.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const base=path.join(root,'materials/community-hero-forge'),source=path.dirname(fileURLToPath(import.meta.url));
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=(b:any)=>createHash('sha256').update(b).digest('hex');
const bytes=(v:any)=>JSON.stringify(v,null,2)+'\n';
const write=(p:string,v:any)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes(v));};
const baseline=read(path.join(source,'baseline-refinements.json'));
const catalog=shippedHeroCatalog();
const templates=[...catalog.documents].filter(([p])=>p.startsWith('ability-templates/')).map(([,d])=>d as any);
const configs=[...catalog.documents].filter(([p])=>p.startsWith('config/')).map(([,d])=>d);
// Final stats apply the configured environment multiplier, then the base bonus.
// Convert the requested final zero into existing modifier inputs; no engine exception.
const env:any=catalog.documents.get('config/combat-env'),bonus:any=catalog.documents.get('config/base-bonus');
const zeroDefenses=['armor','mr'].map(stat=>{
 const multiplier=env.multipliers.defense*(stat==='mr'?env.multipliers.magicResistMult:1);
 const perLevel:any=catalog.documents.get('config/per-level-bonus');
 assert(!(perLevel.perLevel[stat]?.amount),`ZERO_DEFENSE_LEVEL_DEPENDENT:${stat}`);
 assert(multiplier>0,`ZERO_DEFENSE_UNREPRESENTABLE:${stat}`);
 return {stat,op:'override',value:-(bonus.bonus[stat]??0)/multiplier};
});
const byId=new Map(templates.map(t=>[t.id,t]));
const check=process.argv.includes('--check'),outArg=process.argv.indexOf('--out');
const out=outArg>=0?path.resolve(process.argv[outArg+1]!):'/private/tmp/ggd-first37-parody';
fs.mkdirSync(out,{recursive:true});
const report:any={schema:'ggd-first37-parody-build@1',baselineCommit:baseline.sourceCommit,engineChangesAllowed:false,sourceHashes:Object.fromEntries(['designs.mjs','adapt-existing.mjs','kit.mjs','baseline-refinements.json','build.mts','../../../content/config/combat-env.json','../../../content/config/base-bonus.json','../../../content/config/per-level-bonus.json'].map(n=>[n,sha(fs.readFileSync(path.join(source,n)))])),heroes:[],failures:[]};
for(let i=1;i<=37;i++){
 const n=String(i).padStart(2,'0'),project=read(path.join(base,`projects/${n}.hero-project.json`));
 const recipePath=path.join(base,`recipes/${n}.upload-recipe.json`),recipe=read(recipePath),old=baseline.refinements[n];
 const patch:any=old?structuredClone(old):{schema:'ggd-community-design-refinement@1',projectId:project.projectId,sourceSha256:sha(fs.readFileSync(recipePath)),slots:{}};
 patch.version=(old?.version??0)+1;
 const design=redesign(n),adapt=design?null:adaptExisting(n,patch,{zeroDefenses});
 const row:any={number:n,name:project.brief.name,signature:design?.signature??signatures[n],closest:design?.closest??null,difference:design?.difference??'保留已驗證核心，改編代價及可讀提示詳見各槽。',version:patch.version,group:design?'rewrite':n==='32'?'owner-update':['23','30','35','37'].includes(n)?'preserve-core':'local-adaptation',combos:design?.combos??adapt?.combos??[],slots:{},area:adapt?.area};report.heroes.push(row);
 try{
  const changed=design?Object.entries(design.moves).map(([slot,move])=>({slot,move})):adapt.additions.filter(a=>a.move);
  for(const {slot,move} of changed as any[]){
   const original=recipe.slots.find((s:any)=>s.slot===slot);
   const overrides=slot==='PASSIVE'?{}:{range:6,cooldown:[slot==='R'?30:10],manaCost:[slot==='R'?60:40],...move.overrides};
   const visual=move.vfx??(slot==='PASSIVE'?null:'fx.prim.arcane.pulse-sm');
   if(visual)assert(catalog.documents.has(`vfx/${visual}`),`VFX_NOT_IN_CATALOG:${visual}`);
   const tint=project.presentation.slots[slot].script?.segments.find((s:any)=>s.kind==='vfx'&&s.tint)?.tint;
   const script=slot==='PASSIVE'?undefined:{schema:'vfx-script@1',id:`${project.projectId}.${slot.toLowerCase()}`,abilityId:`${project.projectId}.${slot.toLowerCase()}`,segments:[{kind:'anim',on:'castStart',at:'caster',pulse:'cast'},...(visual?[{kind:'vfx',on:'castEffect',at:move.cards[0]?.params.castType==='self'?'self':'target',vfxId:visual,durationSec:.4,...(tint?{tint}:{})}]:[])]};
   patch.slots[slot]={products:move.cards.map((c:any,j:number)=>({instanceId:`${slot.toLowerCase()}-parody-${j+1}`,template:{...c,params:{...defaultParamsFor(byId.get(c.ref)!),...c.params}}})),purpose:`【核准惡搞改編】${move.text}`,note:`${row.signature}\n${move.text}\n原文留在sourceDesign。既有模型綁定保留；畫面與發布驗收另記，不以編譯取代。`,removeOverrides:[...new Set([...Object.keys(original.abilityOverrides??{}),...Object.keys(old?.slots[slot]?.abilityOverrides??{}),'effects','radiusTier','rangeTier','castTimeTier','cooldownTier','manaCostTier','statusCost'])],abilityOverrides:{provenance:'editor-json',...overrides},...(script?{presentationScript:script}:{})};
  }
  // Complete unchanged slots from their preserved generated baseline; all six now have explicit dispositions.
  for(const slot of ['PASSIVE','Q','W','E','R','EX']){
   if(!patch.slots[slot]){const p=project.acceptedPlan.slots[slot];patch.slots[slot]={products:structuredClone(p.products),purpose:p.purpose,note:'保留既有機制。',abilityOverrides:structuredClone(p.abilityOverrides),removeOverrides:[]};}
   const d=patch.slots[slot];
   if(!design&&!changed.some((x:any)=>x.slot===slot)){d.purpose=`【本次玩法】${row.signature}\n`+d.purpose;d.note=`本次保留核心並核對定位、代價、反制。${row.signature}\n`+d.note;}
   d.purpose=d.purpose.split('【原設計】')[0].trim();
   for(const p of d.products){
    const template=byId.get(p.template.ref);assert.equal(template?.status,'enabled');
    p.template.params={...defaultParamsFor(template),...p.template.params};paramsSchemaFor(template).parse(p.template.params);
    for(const k of Object.keys(p.template.params))assert(template.params[k],`${n}/${slot}: unknown ${k}`);
    p.template.contentSha256=contentSha256(template);patch.templateVersions??={};patch.templateVersions[p.template.contentSha256]=structuredClone(template);
   }
   row.slots[slot]={originalDescriptionPreserved:true,requiredRefinement:project.sourceDesign.slots[slot].requiredRefinement,disposition:design?'owner-approved-simplification':'preserved-core-with-explicit-adaptation',originalDesignCompletionClaimed:false,name:project.acceptedPlan.slots[slot].name,description:d.purpose.split('【原設計】')[0],templates:d.products.map((p:any)=>p.template.ref)};
  }
  const scope=(x:any):any=>Array.isArray(x)?x.map(scope):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='stackKey'&&v==='b2-protection'?`${project.projectId}.protection`:scope(v)])):x;
  patch.slots=scope(patch.slots);
  zCommunityDesignRefinement.parse(patch);
  const next=applyCommunityDesignRefinement({...project,revision:0},patch,templates);
  const compiled=compileGeneratedHeroDraft(generateHeroDraft(next.acceptedPlan!,{heroId:next.projectId,heroName:next.brief.name,modelKey:next.presentation.modelKey,presentation:next.presentation}),templates,configs);
  assert(compiled.ok,JSON.stringify(compiled.failures));
  row.compiledSha256=sha(bytes(compiled.draft));row.patchSha256=sha(bytes(patch));
  const target=path.join(base,`refinements/${n}.json`);
  if(check)assert.equal(fs.readFileSync(target,'utf8'),bytes(patch),`${n}: generated refinement is stale`);else write(target,patch);
  write(path.join(out,`${n}.compiled.json`),compiled.draft);write(path.join(out,`${n}.project.json`),next);
  console.log(`${n} ${row.name}: compiled; ${row.group}`);
 }catch(e){row.error=String(e);report.failures.push({number:n,error:String(e)});console.error(n,String(e).slice(0,1400));}
}
assert.equal(new Set(report.heroes.map((h:any)=>h.signature)).size,37);
write(path.join(out,'build.json'),report);
console.log(JSON.stringify({heroes:37,compiled:37-report.failures.length,failures:report.failures,output:out}));
if(report.failures.length)process.exitCode=1;
