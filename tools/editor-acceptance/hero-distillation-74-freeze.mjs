// User-authorized re-partition of the TWO current community batches, not a rewrite of old evidence.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {communityTarget,catalogContext,SLOTS} from './hero-distillation-pairs.mjs';
import {modelMetadata,materializeTarget} from './hero-distillation-adapter.mjs';
import {CONTRACT,SYSTEM,learningTarget,factorTable} from './hero-distillation-freeze.mjs';
import {catalogIndex} from './hero-distillation-catalog.mjs';

export const FIRST='2cdc3f902b4dbc0c45b2b49b4b74ed0436ff3d8b';
export const SECOND='0a8da174ead82e2241fa595d0f1c37f3194df334';
const B1='materials/community-hero-forge/',B2='docs/_reports/hero-validation-batch2-37/data/';
const sha=x=>createHash('sha256').update(x).digest('hex'),hash=x=>sha(JSON.stringify(x));
const normalize=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const gameplay=a=>Object.fromEntries(Object.entries(a).filter(([k])=>!['name','description','template','icon'].includes(k)));

export function adaptPublicPrompt(prompt){
  assert.equal(prompt.outputSchema,'ggd-hero-project@2','UNEXPECTED_SOURCE_OUTPUT_SCHEMA');
  assert.equal(prompt.catalog,'../catalog.json','UNEXPECTED_SOURCE_CATALOG');
  const {outputSchema,catalog,...request}=structuredClone(prompt);
  return {heroName:prompt.name,...request};
}

export function splitHeroGroups(heroes,edges,target=15){
  const ids=heroes.map(h=>h.id).sort(),parent=new Map(ids.map(id=>[id,id]));
  assert.equal(new Set(ids).size,ids.length,'DUPLICATE_HERO');
  const find=id=>parent.get(id)===id?id:find(parent.get(id));
  for(const [a,b]of edges){assert(parent.has(a)&&parent.has(b),'UNKNOWN_GROUP_EDGE');const [x,y]=[find(a),find(b)].sort();parent.set(y,x);}
  const groups=new Map();for(const id of ids){const g=find(id);if(!groups.has(g))groups.set(g,[]);groups.get(g).push(id);}
  const ordered=[...groups].sort(([a],[b])=>sha('hero74-split-v1:'+a).localeCompare(sha('hero74-split-v1:'+b)));
  // Deterministic subset-sum holds out whole components, never individual slots.
  const dp=new Map([[0,[]]]);
  for(const [g,members]of ordered)for(const [n,selected]of [...dp].sort((a,b)=>b[0]-a[0]))if(n+members.length<=target&&!dp.has(n+members.length))dp.set(n+members.length,[...selected,g]);
  assert(dp.has(target),'CANNOT_FORM_REQUESTED_GROUP_SPLIT');const dev=new Set(dp.get(target));
  return {groupByHero:Object.fromEntries(ids.map(id=>[id,find(id)])),splitByHero:Object.fromEntries(ids.map(id=>[id,dev.has(find(id))?'dev':'train'])),groups:Object.fromEntries(groups),devGroups:[...dev],edges};
}

export async function freeze(first,second,oldDir,admissionPath,out){
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  const pins={},readers=[];
  function reader(repo,commit,scopes){
    const git=args=>execFileSync('git',args,{cwd:repo,maxBuffer:64*1024*1024});
    const verify=()=>{assert.equal(git(['diff',commit,'--',...scopes]).length,0,'SOURCE_DRIFT');assert.equal(git(['ls-files','--others','--exclude-standard','--',...scopes]).length,0,'UNTRACKED_SOURCE');};verify();readers.push(verify);
    const cache=new Map();return file=>{if(!cache.has(file)){const bytes=git(['show',`${commit}:${file}`]);pins[`${commit}:${file}`]=sha(bytes);cache.set(file,JSON.parse(bytes));}return structuredClone(cache.get(file));};
  }
  const r1=reader(first,FIRST,[B1,'tools/community-hero-forge','packages/shared/src','content','docs/editor-contract']);
  const r2=reader(second,SECOND,[B2,'tools/editor-acceptance/batch2-37','packages/shared/src','content']);
  const index=r1(B1+'index.json'),manifest=r1(B1+'handoff-manifest.json'),policy=r1(B1+'design-policy.json');
  const review=r1(B1+'refinements/parody-review.json'),published=r1(B1+'refinements/parody-publication-proof.json');
  const admissionBytes=fs.readFileSync(admissionPath),admission=JSON.parse(admissionBytes);pins['fresh-first-admission']=sha(admissionBytes);
  assert.equal(admission.passed,37);assert.equal(admission.failed,0);assert.equal(published.passed,37);
  const secondBuild=r2(B2+'report.json'),secondReview=r2(B2+'author-review.json'),part=r2(B2+'partition-report.json');
  assert.equal(secondReview.buildHash,hash(secondBuild));assert.equal(secondReview.scopedReferenceHeroes,37);
  assert.equal(part.groups.length,37);assert.equal(index.heroes.length,37);
  // Latest user instruction supersedes evaluation-only USE, not upstream quality claims.
  const authorization={userQuote:'好 這兩批37英雄及技能等都經過驗證了 請你重新審查加入訓練及驗證集',date:'2026-09-09',
    scope:'Reassign approved demonstrations from both batches to train/internal-dev. Do not edit upstream flags, history, teachers or deployment.',
    supersedes:'Second batch evaluation-only restriction for this NEW dataset version only.',blindCertified:false};
  const heroes=[];
  for(const row of index.heroes){
    const p=r1(B1+row.project),receipt=manifest.files.find(f=>f.path===row.project);assert.equal(pins[`${FIRST}:${B1+row.project}`],receipt.sha256);
    const rr=review.heroes.find(h=>Number(h.number)===Number(row.index));assert(rr);
    assert(admission.results.some(a=>a.projectId===p.projectId&&a.status==='passed'));
    for(const s of SLOTS)assert.equal(p.acceptedPlan.slots[s].purpose,rr.slots[s].description,'CURRENT_REVIEW_DESCRIPTION_DRIFT');
    heroes.push({id:p.projectId,name:p.brief.name,batch:'first',project:p,sourceCommit:FIRST,source:B1+row.project,
      request:{heroName:p.brief.name,identity:p.sourceDesign.identity,task:'依角色身分創作完整六槽英雄。採核准惡搞改編，可簡化原作機制；幽默需有可操作決策或連動，使用現有積木。歷史原稿不是本任務必須逐條還原的需求。',
        approvedPolicy:policy.rules,publicSpecialPolicy:policy.azazelAdaptation},
      inputKind:'reconstructed-approved-adaptation-brief',historicalExposure:'First batch has prior training/dev/test and audit exposure; old versions replaced, not duplicated.'});
  }
  for(const g of part.groups){
    const p=r2(B2+g.privateTeacher),prompt=r2(B2+g.publicPrompt),rr=secondReview.heroes.find(h=>h.id===g.groupId);
    assert.equal(hash(p),rr.projectSha256);assert.equal(rr.admission.scopedDevelopmentReference,true);
    heroes.push({id:p.projectId,name:prompt.name,batch:'second',project:p,sourceCommit:SECOND,source:B2+g.privateTeacher,
      request:adaptPublicPrompt(prompt),inputKind:'existing-public-generation-prompt-adapted-transport-only',
      historicalExposure:'Previously evaluation-only; user explicitly authorized this new split. No longer an independent final holdout once admitted.'});
  }
  const req=createRequire(path.join(first,'package.json'));
  const {register}=await import(pathToFileURL(req.resolve('tsx/esm/api')));register();
  const load=f=>import(pathToFileURL(path.join(first,'packages/shared/src/content',f)));
  const [project,generator,presentation,templateVersions,jcs]=await Promise.all(['heroForge/schema.ts','heroForge/generator.ts','heroForge/presentation.ts','heroForge/templateVersions.ts','import/jcs.ts'].map(load));
  const {shippedHeroCatalog}=await import(pathToFileURL(path.join(first,'packages/shared/testkit/heroPackageFixture.ts')));
  const {inspectDiversity}=await import(pathToFileURL(path.join(first,'tools/community-hero-forge/kit-diversity.mjs')));
  const docs=shippedHeroCatalog().documents,templates=[...docs].filter(([k])=>k.startsWith('ability-templates/')).map(([,v])=>v),configs=[...docs].filter(([k])=>k.startsWith('config/')).map(([,v])=>v);
  const engine={project,generator,presentation,templateVersions,templates},models={};
  for(const h of heroes){const key=h.project.presentation.modelKey,metadata=modelMetadata(h.project.presentation);if(models[key])assert.deepEqual(models[key],metadata);else models[key]=metadata;}
  const compiled={},quality=[];
  const compile=p=>{const result=generator.compileGeneratedHeroDraft(generator.generateHeroDraft(p.acceptedPlan,{heroId:p.projectId,heroName:p.brief.name,modelKey:p.presentation.modelKey,presentation:p.presentation}),templates,configs);assert(result.ok,JSON.stringify(result.failures));return result.draft;};
  for(const h of heroes){
    const q={id:h.id,name:h.name,batch:h.batch,sourceCommit:h.sourceCommit,source:h.source,teacherSha256:hash(h.project),admitted:false};quality.push(q);
    try{
      const p=project.zHeroProject.parse(h.project);
      if(h.batch==='first')assert.equal(jcs.contentSha256(p),admission.results.find(r=>r.projectId===h.id).sourceDigest,'ADMISSION_VERSION_DRIFT');
      for(const slot of Object.values(p.acceptedPlan.slots))for(const product of slot.products)assert.equal(docs.get('ability-templates/'+product.template.ref)?.status,'enabled');
      const draft=compile(p),target=learningTarget(communityTarget(p));
      const projected=materializeTarget(target,{heroId:h.id,heroName:h.name},engine,models).project;
      const again=compile(projected);
      for(const s of SLOTS)assert.deepEqual(gameplay(again.abilityDrafts[s]),gameplay(draft.abilityDrafts[s]),`PROJECTION_GAMEPLAY_CHANGED:${h.id}:${s}`);
      h.target=target;compiled[h.id]=draft;q.admitted=true;q.compile=true;q.projectionGameplayPreserved=true;
    }catch(e){q.error=String(e);q.classification='source-or-version-or-projection-blocker; not automatically a bad-teacher verdict';}
  }
  const good=heroes.filter(h=>quality.find(q=>q.id===h.id).admitted);
  // Freeze requires complete review accounting; don't silently make a small pilot by filtering tool errors.
  if(good.length!==74){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'quality-blocked.json'),JSON.stringify({authorization,quality},null,2)+'\n');throw Error(`ADMISSION_BLOCKED:${good.length}/74; see quality-blocked.json`);}
  const diversity=inspectDiversity(good.map(h=>({id:h.id,name:h.name,draft:compiled[h.id]})));
  const edges=[];
  for(const p of [...diversity.exactDuplicateKitPairs,...diversity.nearDuplicateKitPairs])edges.push(p.heroes);
  for(const p of r2('tools/editor-acceptance/batch2-37/similarity-review.json').pairs)edges.push(p.heroes);
  for(let i=0;i<good.length;i++)for(let k=i+1;k<good.length;k++)if(normalize(good[i].name)===normalize(good[k].name))edges.push([good[i].id,good[k].id]);
  const grouping=splitHeroGroups(good,edges);
  const oldBytes=fs.readFileSync(path.join(oldDir,'examples.json')),old=JSON.parse(oldBytes),native=old.filter(e=>!e.heroId.startsWith('community-review-'));
  const collisions=[];
  for(const h of good)for(const e of native){const n=normalize(JSON.parse(e.messages.find(m=>m.role==='user').content).request.heroName),alias=normalize(h.name);if(alias.length>=2&&(n===alias||n.endsWith(alias)))collisions.push({hero:h.id,existing:e.heroId,split:e.split});}
  // A collision needs explicit family reconciliation, not a row-level split workaround.
  assert.equal(collisions.length,0,'EXISTING_NATIVE_FAMILY_RECONCILIATION_REQUIRED');
  const cat=catalogContext(r1('docs/editor-contract/ggd-bricks.json'),r1('docs/editor-contract/ggd-runtime-capabilities.json'),FIRST),ci=catalogIndex(cat);
  const assetIds={};for(const c of ['models','vfx','projectiles','status-effects','champions'])assetIds[c]=[...docs.keys()].filter(k=>k.startsWith(c+'/')).map(k=>k.slice(c.length+1));
  for(const key of Object.keys(models))if(!assetIds.models.includes(key))assetIds.models.push(key);
  const oldAssets=JSON.parse(fs.readFileSync(path.join(oldDir,'assets.json')));
  pins['old-assets.json']=sha(fs.readFileSync(path.join(oldDir,'assets.json')));
  assert(oldAssets.factorTableRule&&Array.isArray(oldAssets.icons),'MISSING_ASSET_CONTRACT');
  const assets={schema:'ggd-generation-asset-index@2',factorTableRule:oldAssets.factorTableRule,
    byCollection:Object.fromEntries(Object.entries(assetIds).map(([k,v])=>[k,factorTable(v)])),
    uploadedModels:Object.entries(models).map(([id,m])=>({id,source:m.source})),icons:oldAssets.icons,
    warning:'Shared catalog for all 74 heroes. Asset metadata is not per-hero correctness or live readiness certification.'};
  const rows=[...native];
  for(const h of good)for(const slot of ['HERO',...SLOTS]){
    const target=slot==='HERO'?h.target:{format:'hero-slot',slot:h.target.plan.slots[slot],presentationSelection:h.target.presentationSelection.slots[slot]};
    const input={request:h.request,outputContract:{format:target.format,heroId:h.id,heroName:h.name,slot,abilityIdPattern:h.id+'.<lowercase-slot>',planId:h.id+'.plan',contract:CONTRACT},allowedCatalog:ci,assets};
    rows.push({id:h.id+':'+slot,heroId:h.id,groupId:grouping.groupByHero[h.id],slot,split:grouping.splitByHero[h.id],batch:h.batch,engineRevision:FIRST,
      inputKind:h.inputKind,historicalExposure:h.historicalExposure,teacherSha256:hash(h.project),inputSha256:hash(input),targetSha256:hash(target),
      messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify(input)},{role:'assistant',content:JSON.stringify(target)}]});
  }
  const trainingGroups=new Set(rows.filter(r=>r.split==='train').map(r=>r.groupId));assert(rows.filter(r=>r.split==='dev').every(r=>!trainingGroups.has(r.groupId)),'GROUP_LEAKAGE');
  const counts=Object.fromEntries(['train','dev'].map(split=>{const list=rows.filter(r=>r.split===split);return[split,{tasks:list.length,wholeHeroes:list.filter(r=>r.slot==='HERO').length,slots:list.filter(r=>r.slot!=='HERO').length,groups:new Set(list.map(r=>r.groupId)).size}];}));
  readers.forEach(f=>f());assert.equal(sha(fs.readFileSync(path.join(oldDir,'examples.json'))),sha(oldBytes));
  fs.mkdirSync(out,{recursive:true});const outputs={};const save=(name,value,jsonl=false)=>{const text=jsonl?value.map(v=>JSON.stringify(v)).join('\n')+'\n':JSON.stringify(value,null,2)+'\n';fs.writeFileSync(path.join(out,name),text,{flag:'wx'});outputs[name]=sha(text);};
  save('examples.json',rows);for(const split of ['train','dev'])save(split+'.jsonl',rows.filter(r=>r.split===split),true);
  save('quality.json',{authorization,quality,scope:'Automated 74-hero schema/compiler/target-projection review plus source-bound upstream mechanism evidence; not new exhaustive human semantic review.'});
  save('grouping.json',grouping);save('diversity.json',diversity);save('catalog.json',cat);save('assets.json',assets);save('contract.json',CONTRACT);
  save('manifest.json',{schema:'ggd-distillation-frozen-data@1',counts,authorization,inputs:pins,outputs,
    replacedOldCommunityTasks:old.length-native.length,retainedNativeTasks:native.length,newBatchTasks:518,newWholeHeroes:74,
    oldDatasetSha256:sha(oldBytes),sourceCommits:{first:FIRST,second:SECOND},executionEngine:FIRST,
    policy:'74 whole heroes plus 444 auxiliary slots; 15 development heroes by grouped deterministic split, same hero all slots together. Second-batch accepted similar-loop families grouped. No paraphrase multiplication.',
    trainingSelection:'one traversal of all train tasks; no replacement or automatic sweep',frozenWeightsStarted:false,releaseQualified:false,
    promptTransportAdaptation:'Second-batch original outputSchema and relative catalog pointer removed; outputContract and allowedCatalog now define transport. Semantic requirements unchanged; original prompt remains hash-pinned.',
    cautions:['Data admission is not a claim that long-context GPU training is working. Token/runtime preflight required.','Prior native tasks retain their own engine-specific context and split.','Both batches recompile on first-batch engine; projection parity is proven there, not a new replay of all upstream runtime scenarios on that engine.','Current context uses fixed catalog index; existing lookup/full-contract integration still applies.','Old independent holdout claims for newly admitted heroes are retired; no new blind test is established.'],scriptSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))});
  return counts;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,7,'USAGE: FIRST_REPO SECOND_REPO OLD_FROZEN_DIR FRESH_FIRST_ADMISSION NEW_OUTPUT');
  console.log(JSON.stringify(await freeze(...process.argv.slice(2).map(p=>path.resolve(p)))));
}
