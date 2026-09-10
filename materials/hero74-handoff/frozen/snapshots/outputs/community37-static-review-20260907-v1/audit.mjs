import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(), base=path.join(root,'GGD社群英雄上傳內容_37名');
const out=path.join(root,'outputs/community37-static-review-20260907-v1');
if(fs.existsSync(out)) throw new Error('Refuse overwrite existing audit');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const canon=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canon).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';
const same=(a,b)=>canon(a)===canon(b);
const index=read(path.join(base,'index.json')), evidence=read(path.join(base,'evidence/report.json'));
const design=fs.readFileSync(path.join(root,'GGD社群英雄功能驗收設計稿_37名角色.md'),'utf8');
const merged=fs.readFileSync(path.join(root,'GGD社群英雄完整上傳內容與工作流交接_37名.md'),'utf8');
const snapshot=[],rows=[],issues=[],counts={},assertions={},flags={};
function remember(p){snapshot.push({path:path.relative(root,p),sha256:hash(p)});}
for(const file of ['GGD社群英雄功能驗收設計稿_37名角色.md','GGD社群英雄完整上傳內容與工作流交接_37名.md']) remember(path.join(root,file));
for(const file of ['index.json','evidence/report.json','evidence/source-lock.json','evidence/template-catalog.json','recipes.mts','build.mts','機制補強與驗收.md','來源查證補充.md'])remember(path.join(base,file));
let exactSources=0,projectHashes=0,projectionMatches=0,activeVfx=0,castMismatch=0;
for(const h of index.heroes){
 const recipeFile=path.join(base,h.recipe),projectFile=path.join(base,h.project),runtimeFile=path.join(base,`runtime/${h.index}.compiled.json`),simFile=path.join(base,`evidence/${h.index}.simulation.json`);
 for(const f of [recipeFile,projectFile,runtimeFile,simFile])remember(f);
 const r=read(recipeFile),p=read(projectFile),runtime=read(runtimeFile),sim=read(simFile);
 exactSources+=design.includes(r.sourceOwnerText)?1:0;
 projectHashes+=('sha256:'+crypto.createHash('sha256').update(canon(p)).digest('hex')===evidence.heroes.find(e=>e.index===h.index).projectSha256)?1:0;
 for(const scene of sim.slots)for(const a of scene.assertions??[])assertions[a.id]=(assertions[a.id]??0)+1;
 for(const s of r.slots){
  const a=runtime.runtime.find(d=>d.collection==='abilities'&&d.document.slot===s.slot)?.document;
  if(!a)throw new Error(`Missing runtime ${h.index}/${s.slot}`);
  const expected={castType:a.castType,maxRank:a.maxRank,cooldown:a.cooldown,manaCost:a.manaCost,range:a.range,...(a.castTimeSec!==undefined?{castTimeSec:a.castTimeSec}:{}),damageAndMechanics:a.effects??[],passive:a.passive??[],marks:a.marks??[]};
  if(same(expected,s.effectiveRuntime))projectionMatches++;else issues.push({hero:h.name,slot:s.slot,kind:'effectiveRuntime projection difference',expected,actual:s.effectiveRuntime});
  for(const [k,v]of Object.entries({owner:s.ownerDescription,current:s.currentBehavior,gap:s.requiredRefinement}))if(!merged.includes(v))issues.push({hero:h.name,slot:s.slot,kind:'merged missing text',field:k});
  activeVfx+=s.vfx.script?1:0;
  const animation=s.vfx.script?.segments.find(x=>x.kind==='anim');
  if(animation&&animation.replacesForMs!==a.castTimeSec*1000)castMismatch++;
  counts[s.template.ref]=(counts[s.template.ref]??0)+1;
  const slotFlags=[];
  if(s.slot==='PASSIVE')slotFlags.push('PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC');
  if(s.template.ref==='tpl-line-sweep'&&a.effects.some(e=>e.hitOncePerTarget===true)&&s.currentBehavior.includes('可重複命中'))slotFlags.push('CURRENT_TEXT_CONTRADICTS_DEDUP');
  if(s.template.ref==='tpl-traveling-wave'&&a.effects.some(e=>e.finalEffects?.some(f=>f.kind==='damageArea')))slotFlags.push('UNDISCLOSED_TERMINAL_DAMAGE');
  if(s.template.ref==='tpl-lock-combo'&&a.effects.some(e=>e.kind==='dot')&&a.effects.some(e=>e.kind==='leap'))slotFlags.push('DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE');
  if(h.index==='15'&&['Q','W','E','EX'].includes(s.slot))slotFlags.push('BILLY_MAPPING_OR_REFINEMENT_WRONG');
  for(const flag of slotFlags)(flags[flag]??=[]).push(`${h.index}:${h.name}:${s.slot}`);
  rows.push({heroIndex:h.index,hero:h.name,identity:r.identity,slot:s.slot,name:s.name,ownerDescription:s.ownerDescription,currentBehavior:s.currentBehavior,requiredRefinement:s.requiredRefinement,semanticStatus:s.semanticStatus,template:s.template,abilityOverrides:s.abilityOverrides,effectiveRuntime:s.effectiveRuntime,flags:slotFlags,acceptance:s.acceptance,source:path.relative(root,recipeFile),usage:'reference-only; no training gold approval; no inference performed'});
 }
}
const summary={scope:'Static reference audit only. No build, simulation, training, GPU inference, upload, or source mutation.',heroes:index.heroes.length,slots:rows.length,exactSourceSections:exactSources,canonicalProjectHashesMatch:projectHashes,effectiveRuntimeProjectionsMatch:projectionMatches,activeVfxScripts:activeVfx,animationDurationDifferentFromCastTime:castMismatch,templateCounts:counts,storedAssertionCounts:assertions,flags,structuralIssues:issues,providedValidationCounts:evidence.counts,originalMechanicsAcceptedByProvidedReport:0,trainingGoldApproved:0,independentGameplayTestsRun:0,sourceSnapshot:snapshot};
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'STATIC_AUDIT.json'),JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(path.join(out,'SLOT_REFERENCE.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
fs.writeFileSync(path.join(out,'SLOT_REFERENCE.md'),'# 37 名／222 槽靜態對照\n\n此檔為來源投影及有限規則檢查，非 222 槽完整遊戲驗收或標準答案。未列旗標不表示正確。原作外部來源未重新查證。\n\n'+rows.map(r=>`## ${r.heroIndex} ${r.hero} / ${r.slot} ${r.name}\n\n- 原設計：${r.ownerDescription}\n- 現有摘要：${r.currentBehavior}\n- 待補說明：${r.requiredRefinement}\n- 原始狀態：${r.semanticStatus}\n- 本次靜態旗標：${r.flags.join(', ')||'無上述有限規則旗標；不等於通過'}\n- 來源：${r.source}\n\n編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：\n\n\`\`\`json\n${JSON.stringify(r.effectiveRuntime,null,2)}\n\`\`\`\n`).join('\n'));
console.log(JSON.stringify({...summary,sourceSnapshot:`${snapshot.length} source files hashed`,flags:Object.fromEntries(Object.entries(flags).map(([k,v])=>[k,v.length]))},null,2));

