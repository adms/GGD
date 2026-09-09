// Model/teacher JSON -> pinned-engine authoring document -> compile -> disk
// reload -> recompile. Structural evidence only, never playable-hero approval.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {materializeTarget,SLOTS} from './hero-distillation-adapter.mjs';
import {expandFactorTable} from './hero-distillation-freeze.mjs';
import {isDeepStrictEqual} from 'node:util';
const script=fileURLToPath(import.meta.url);
const delivery=path.resolve(path.dirname(script),'../..');
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file:string,value:unknown)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const jsonDocs=(root:string)=>fs.readdirSync(root).filter(n=>n.endsWith('.json')&&n!=='_index.json').sort().map(n=>read(path.join(root,n)));

export function engineLoader(repo:string){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ggd-generation-engine-'));
  const cache=new Map<string,any>(),evidence:Record<string,any>={};
  async function loadEngine(revision:string){
    if(cache.has(revision))return cache.get(revision);
    assert(/^[a-f0-9]{40}$/.test(revision),'EXACT_ENGINE_REVISION_REQUIRED');
    const root=path.join(folder,revision);fs.mkdirSync(root);
    const archive=execFileSync('git',['archive','--format=tar',revision,
      'package.json','packages/shared/package.json','packages/shared/src',
      'content/config','content/ability-templates','content/vfx-subtypes'],{cwd:repo,maxBuffer:128*1024*1024});
    execFileSync('tar',['-xf','-','-C',root],{input:archive});
    fs.symlinkSync(path.join(delivery,'node_modules'),path.join(root,'node_modules'),'dir');
    const dependencies=path.join(delivery,'packages/shared/node_modules');
    assert(fs.existsSync(path.join(dependencies,'zod/package.json')),'SHARED_DEPENDENCIES_MISSING');
    fs.symlinkSync(dependencies,path.join(root,'packages/shared/node_modules'),'dir');
    const files=['heroForge/schema.ts','schema/ability.ts','schema/champion.ts','heroForge/generator.ts',
      'runtimeResolver.ts','templates/resolve.ts','heroForge/presentation.ts','heroForge/templateVersions.ts'];
    const imports=await Promise.all(files.map(f=>{
      const file=path.join(root,'packages/shared/src/content',f);
      return fs.existsSync(file)?import(pathToFileURL(file).href):Promise.resolve(null);
    }));
    const [project,ability,champion,generator,runtime,resolver,presentation,templateVersions]=imports;
    assert(project&&ability&&champion&&generator&&runtime&&resolver&&presentation,'ENGINE_MODULE_MISSING');
    const templates=jsonDocs(path.join(root,'content/ability-templates')),
      configs=jsonDocs(path.join(root,'content/config')),subtypes=jsonDocs(path.join(root,'content/vfx-subtypes'));
    const templateMap=new Map(templates.map(t=>[t.id,t]));
    const e={revision,project,ability,champion,generator,presentation,templateVersions,templates,configs,subtypes,
      templateMap,resolveTemplateExpansion:resolver.resolveTemplateExpansion,runtime:runtime.createRuntimeResolver(templateMap,configs)};
    evidence[revision]={revision,archiveSha256:hash(archive),archiveBytes:archive.length,
      zodVersion:read(path.join(dependencies,'zod/package.json')).version,
      sourceFiles:Object.fromEntries(files.filter(f=>fs.existsSync(path.join(root,'packages/shared/src/content',f)))
        .map(f=>[f,hash(fs.readFileSync(path.join(root,'packages/shared/src/content',f)))]))};
    cache.set(revision,e);return e;
  }
  return {loadEngine,evidence};
}

export function compileMaterialized(output:any,e:any){
  if(output.format==='hero-project'){
    const p=e.project.zHeroProject.parse(output.project);
    const draft=e.generator.generateHeroDraft(p.acceptedPlan,{heroId:p.projectId,heroName:p.brief.name,
      modelKey:p.presentation.modelKey,presentation:p.presentation});
    const result=e.generator.compileGeneratedHeroDraft(draft,e.templates,e.configs,e.subtypes);
    assert(result.ok,'PROJECT_COMPILE_FAILED:'+JSON.stringify(result.failures));
    return result.draft;
  }
  assert.equal(output.format,'native-content','UNSUPPORTED_MATERIALIZED_FORMAT');
  const champion=e.champion.zChampionDoc.parse(output.champion),abilities:Record<string,any>={};
  for(const slot of SLOTS){
    let authored=e.ability.zAbilityDoc.parse(output.abilities[slot]);
    if(authored.template!==undefined){
      const expanded=e.resolveTemplateExpansion(authored,e.templateMap);
      assert(expanded.ok,'NATIVE_TEMPLATE_FAILED:'+JSON.stringify(expanded.failure));
      authored=e.ability.zAbilityDoc.parse(expanded.merged);
    }
    abilities[slot]=e.runtime.resolve(authored);
  }
  return {champion,abilityDrafts:abilities};
}

export function compileFullCase(row:any,target:any,e:any,models:any){
  assert.equal(row.slot,'HERO','PRIMARY_WHOLE_HERO_ONLY');
  assert.equal(row.engineRevision,e.revision,'ENGINE_REVISION_MISMATCH');
  assert.deepEqual(row.messages.map((m:any)=>m.role),['system','user'],'PUBLIC_MESSAGES_ONLY');
  assert.equal(hash(JSON.stringify(row.messages)),row.messagesSha256,'PUBLIC_MESSAGE_DRIFT');
  assert.equal(hash(row.messages[1].content),row.inputSha256,'PUBLIC_INPUT_DRIFT');
  const u=JSON.parse(row.messages[1].content),c=u.outputContract;
  assert.equal(c.heroId,row.heroId,'CONTRACT_HERO_MISMATCH');assert.equal(c.slot,'HERO');
  assert.equal(c.format,row.format);assert.equal(target.format,row.format,'OUTPUT_FORMAT_MISMATCH');
  assert.equal(c.heroName,u.request.heroName,'CONTRACT_NAME_MISMATCH');
  const modelKey=target.format==='hero-plan'?target.presentationSelection?.modelKey:target.champion?.modelKey;
  assert(Object.hasOwn(models,modelKey),'MODEL_NOT_IN_PUBLIC_CATALOG');
  // Retained native cases carry their original catalog, not the later 74-hero
  // catalog. A resolver superset must never widen a particular case's choices.
  const allowed=new Set([...expandFactorTable(u.assets.byCollection.models),...u.assets.uploadedModels.map((m:any)=>m.id)]);
  assert(allowed.has(modelKey),'MODEL_NOT_IN_CASE_PUBLIC_CATALOG');
  const declared=u.assets.uploadedModels.find((m:any)=>m.id===modelKey);
  if(declared?.source)assert(isDeepStrictEqual(models[modelKey].source,declared.source),'SELECTED_ASSET_SOURCE_MISMATCH');
  const output=materializeTarget(target,{heroId:row.heroId,heroName:c.heroName},e,models);
  return {output,compiled:compileMaterialized(output,e)};
}

export async function run(options:Record<string,string|boolean>){
  const evaluation=path.resolve(String(options['--evaluation'])),modelDir=path.resolve(String(options['--models'])),
    repo=path.resolve(String(options['--source-repo'])),out=path.resolve(String(options['--out']));
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  const teacher=options['--teacher-control']===true;
  assert(teacher?!options['--inference']&&!options['--arm']:options['--inference']&&['base','lora'].includes(String(options['--arm'])),'ONE_OUTPUT_SOURCE_REQUIRED');
  const em=read(path.join(evaluation,'manifest.json'));
  for(const name of ['plan.json','public-cases.jsonl'])assert.equal(hash(fs.readFileSync(path.join(evaluation,name))),em.outputs[name],'EVAL_DRIFT');
  const plan=read(path.join(evaluation,'plan.json'));
  const cases=fs.readFileSync(path.join(evaluation,'public-cases.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  const mm=read(path.join(modelDir,'manifest.json')),modelsBytes=fs.readFileSync(path.join(modelDir,'models.json'));
  assert.equal(hash(modelsBytes),mm.outputs['models.json'],'MODELS_DRIFT');
  const models=JSON.parse(modelsBytes.toString());
  const assetsDir=path.resolve(String(options['--assets-dir'])),assetsManifest=read(path.join(assetsDir,'manifest.json')),
    assetsBytes=fs.readFileSync(path.join(assetsDir,'assets.json'));
  assert.equal(hash(assetsBytes),assetsManifest.outputs['assets.json'],'FROZEN_ASSETS_DRIFT');
  assert.equal(hash(assetsBytes),mm.publicAssetsSha256,'SIDECAR_ASSETS_MISMATCH');
  // The sidecar is pinned to the newer union. Public per-case catalogs remain
  // untouched and are enforced when a model ID is selected in compileFullCase.
  const answers=new Map<string,any>();let sourceEvidence:any;
  if(teacher){
    const bytes=fs.readFileSync(path.join(evaluation,'private-teachers.jsonl'));
    assert.equal(hash(bytes),em.outputs['private-teachers.jsonl'],'PRIVATE_TEACHER_DRIFT');
    for(const r of bytes.toString().trim().split('\n').map(JSON.parse)){
      assert(!answers.has(r.id),'DUPLICATE_TEACHER');assert.equal(hash(r.answer),r.targetSha256,'TEACHER_TARGET_DRIFT');
      answers.set(r.id,{target:JSON.parse(r.answer),complete:true});
    }
    sourceEvidence={arm:'teacher-control',answersSha256:hash(bytes),modelInferenceCalls:0};
  }else{
    const root=path.resolve(String(options['--inference'])),arm=String(options['--arm']),p=read(path.join(root,'manifest.json')),
      state=read(path.join(root,arm,'state.json'));
    assert.equal(p.publicCasesSha256,em.outputs['public-cases.jsonl'],'INFERENCE_INPUT_MISMATCH');
    assert(state.status==='completed'&&state.workerPid===null,'INFERENCE_NOT_TERMINAL_SUCCESS');
    assert.equal(state.manifestSha256,hash(fs.readFileSync(path.join(root,'manifest.json'))),'INFERENCE_MANIFEST_DRIFT');
    assert.deepEqual(p.caseIds,cases.map((r:any)=>r.id),'INFERENCE_CASE_DRIFT');
    const outputHashes:Record<string,string>={};
    for(const [index,c]of cases.entries()){
      const file=`case-${String(index).padStart(4,'0')}.json`,bytes=fs.readFileSync(path.join(root,arm,file)),r=JSON.parse(bytes.toString());
      assert.equal(r.id,c.id,'INFERENCE_ROW_ID_MISMATCH');assert.equal(r.arm,arm);
      assert.equal(r.messagesSha256,c.messagesSha256);assert.equal(r.rawSha256,hash(r.raw),'RAW_OUTPUT_DRIFT');
      if(r.json?.parsed===true){
        const raw=r.raw.trim(),fenced=raw.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
        assert.deepEqual(JSON.parse(fenced?fenced[1]:raw),r.json.value,'PARSED_VALUE_DRIFT');
      }
      answers.set(c.id,{target:r.json?.value,complete:r.complete===true&&r.json?.parsed===true&&r.outputFormatMatches===true});
      outputHashes[file]=hash(bytes);
    }
    sourceEvidence={arm,inferenceManifestSha256:state.manifestSha256,outputHashes};
  }
  assert.equal(answers.size,cases.length,'INCOMPLETE_ANSWER_SET');
  const loader=engineLoader(repo),rows:any[]=[];
  fs.mkdirSync(out,{recursive:true});
  for(const [index,c]of cases.entries()){
    const row:any={id:c.id,heroId:c.heroId,slot:c.slot,engineRevision:c.engineRevision,
      schemaCompilePassed:false,diskReloadCompileIdentical:false,fullHeroE2EProven:false,humanRepairs:0};
    rows.push(row);
    if(c.slot!=='HERO'){row.status='auxiliary-slot-validation-pending';continue;}
    const answer=answers.get(c.id);
    if(!answer?.complete){row.status='incomplete-or-invalid-generation';continue;}
    try{
      const e=await loader.loadEngine(c.engineRevision);
      const {output,compiled}=compileFullCase(c,answer.target,e,models);
      const folder=path.join(out,`case-${String(index).padStart(4,'0')}`);fs.mkdirSync(folder);
      save(path.join(folder,'authoring.json'),output);
      const reloaded=read(path.join(folder,'authoring.json'));
      assert.deepEqual(reloaded,output,'DISK_RELOAD_CHANGED');
      const recompiled=compileMaterialized(reloaded,e);assert.deepEqual(recompiled,compiled,'RECOMPILE_CHANGED');
      save(path.join(folder,'compiled.json'),compiled);
      Object.assign(row,{status:'structural-pass-not-game-acceptance',schemaCompilePassed:true,diskReloadCompileIdentical:true,
        authoringSha256:hash(fs.readFileSync(path.join(folder,'authoring.json'))),compiledSha256:hash(fs.readFileSync(path.join(folder,'compiled.json')))});
    }catch(error:any){row.status='structural-failure';row.error=String(error);}
  }
  const primary=rows.filter(r=>r.slot==='HERO');assert.equal(primary.length,plan.counts.primaryWholeHeroes);
  const report={schema:'ggd-distillation-generation-compile@1',sourceEvidence,
    scriptSha256:hash(fs.readFileSync(script)),adapterSha256:hash(fs.readFileSync(new URL('./hero-distillation-adapter.mjs',import.meta.url))),
    evaluationManifestSha256:hash(fs.readFileSync(path.join(evaluation,'manifest.json'))),modelBindingsSha256:hash(modelsBytes),
    engines:loader.evidence,counts:{allCases:rows.length,primaryWholeHeroes:primary.length,
      structuralPassed:primary.filter(r=>r.schemaCompilePassed&&r.diskReloadCompileIdentical).length,auxiliarySlotsPending:rows.length-primary.length},
    scope:'Primary whole-hero materialization, schema, pinned compilation and disk reload/recompile. Auxiliary slot validation still pending. No semantic fidelity, asset-byte closure, editor UI, game import/selection or match behavior certification.',
    fullHeroE2EProven:false,modelPromoted:false,rows};
  save(path.join(out,'report.json'),report);return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===script){
  const args=process.argv.slice(2),options:Record<string,string|boolean>={};
  while(args.length){const key=args.shift()!;assert(!Object.hasOwn(options,key),'DUPLICATE_ARGUMENT');
    if(key==='--teacher-control'){options[key]=true;continue;}
    assert(['--evaluation','--models','--source-repo','--out','--inference','--arm','--assets-dir'].includes(key)&&args.length,'UNKNOWN_OR_MISSING_ARGUMENT');
    options[key]=args.shift()!;
  }
  for(const key of ['--evaluation','--models','--source-repo','--out','--assets-dir'])assert(options[key],'MISSING:'+key);
  console.log(JSON.stringify((await run(options)).counts));
}
