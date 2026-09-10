// Read an imported ZIP into an isolated pinned game-server MatchController.
// Selection/spawn/combat-entry evidence only: never six-slot semantic approval.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {linkDependencies} from './hero-distillation-import-roundtrip.mts';

const script=fileURLToPath(import.meta.url);
const hash=(bytes:any)=>createHash('sha256').update(bytes).digest('hex');
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file:string,value:any)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});

export function runtimeOverlay(documents:any[]){
  const docs:Record<string,any>={};
  for(const item of documents){
    const match=/^compiled\/([a-z-]+)\/([A-Za-z0-9_.-]+)\.json$/.exec(item.path);
    assert(match,'INVALID_COMPILED_PATH');
    const key=match[1]+'/'+match[2];assert(!Object.hasOwn(docs,key),'DUPLICATE_RUNTIME_DOCUMENT');
    assert.equal(item.document.id,match[2],'RUNTIME_ID_MISMATCH');docs[key]=item.document;
  }
  assert(Object.keys(docs).length,'EMPTY_IMPORTED_RUNTIME');
  return {generation:1,docs,deleted:{}};
}

export function authoringOverlay(pkg:any,generator:any,heroId:string){
  const projects=pkg.documents.filter((item:any)=>item.path.startsWith('authoring/hero-projects/'));
  assert.equal(projects.length,1,'ONE_SOURCE_PROJECT_REQUIRED');const project=projects[0].document;
  assert.equal(project.projectId,heroId,'SOURCE_PROJECT_ID_DRIFT');
  const docs:Record<string,any>={};
  const add=(collection:string,document:any)=>{
    assert(/^[A-Za-z0-9_.-]+$/.test(document.id),'INVALID_SOURCE_DOCUMENT_ID');
    const key=collection+'/'+document.id;
    if(Object.hasOwn(docs,key))assert.deepEqual(docs[key],document,'SOURCE_DOCUMENT_CONFLICT');
    docs[key]=JSON.parse(JSON.stringify(document));
  };
  for(const item of pkg.documents){
    const match=/^authoring\/([a-z-]+)\/[^/]+\.json$/.exec(item.path);assert(match,'INVALID_AUTHORING_PATH');
    if(match[1]!=='hero-projects')add(match[1],item.document);
  }
  const generated=generator.generateHeroDraft(project.acceptedPlan,{heroId:project.projectId,
    heroName:project.brief.name,presentation:project.presentation});
  add('champions',generated.champion);
  for(const value of generated.relatedChampions??[])add('champions',value);
  for(const value of Object.values(generated.abilityDrafts))add('abilities',value);
  for(const value of generated.standaloneAbilities??[])add('abilities',value);
  for(const value of generated.vfxScripts??[])add('vfx-scripts',value);
  for(const value of generated.templateInstances??[])add('ability-templates',value);
  return {generation:1,docs,deleted:{}};
}

export async function run(options:Record<string,string>){
  const out=path.resolve(options.out);assert(!fs.existsSync(out),'REFUSE_OVERWRITE_OR_RETRY');
  const reportBytes=fs.readFileSync(options['import-report']),report=JSON.parse(reportBytes.toString());
  assert.equal(report.schema,'ggd-distillation-import-roundtrip@1','IMPORT_REPORT_SCHEMA');
  const matches=report.rows.filter((row:any)=>row.heroId===options['hero-id']);
  assert.equal(matches.length,1,'UNIQUE_IMPORTED_HERO_REQUIRED');const imported=matches[0];
  assert(imported.liveImportPassed,'SUCCESSFUL_IMPORT_REQUIRED');
  const zip=fs.readFileSync(options.zip);assert.equal(hash(zip),imported.archiveSha256,'IMPORTED_ARCHIVE_DRIFT');
  const revision=imported.engineRevision;assert(/^[a-f0-9]{40}$/.test(revision),'EXACT_ENGINE_REVISION_REQUIRED');
  fs.mkdirSync(out,{recursive:true});const root=path.join(out,'source');fs.mkdirSync(root);
  const receipt:any={schema:'ggd-match-entry@1',heroId:imported.heroId,engineRevision:revision,
    importReportSha256:hash(reportBytes),archiveSha256:hash(zip),scriptSha256:hash(fs.readFileSync(script)),
    startedAt:new Date().toISOString(),status:'running',stage:'source-snapshot',humanRepairs:0,
    selectionPassed:false,spawnPassed:false,combatEntryPassed:false,unknownSelectionRejected:false,
    sixSlotSemanticsMeasured:false,networkClientMeasured:false,fullHeroE2EProven:false,modelPromoted:false,
    scope:'Pinned headless game-server controller in disposable memory. No production overlay, UI, publication, visual inspection or skill-mechanic equivalence claim.'};
  try{
    const archive=execFileSync('git',['archive','--format=tar',revision,'package.json','tsconfig.base.json',
      'packages/shared','apps/game-server','content'],{cwd:path.resolve(options['source-repo']),maxBuffer:512*1024*1024,timeout:60000});
    execFileSync('tar',['-xf','-','-C',root],{input:archive,timeout:60000});
    receipt.sourceArchiveSha256=hash(archive);
    receipt.dependencies=linkDependencies(root,path.resolve(options['game-dependencies']),path.resolve(options['shared-dependencies']));
    const load=(file:string)=>import(pathToFileURL(path.join(root,file)).href);
    receipt.stage='load-content';
    const [content,source,reader,registry,controller,phase,generator]=await Promise.all([
      'packages/shared/src/content/index.ts','packages/shared/src/content/node/index.ts',
      'packages/shared/src/content/import/readPackageZip.ts','packages/shared/src/sim/content/registry.ts',
      'apps/game-server/src/match/MatchController.ts','apps/game-server/src/match/phaseConfig.ts',
      'packages/shared/src/content/heroForge/generator.ts'].map(load));
    const restored=reader.readPackageZip(new Uint8Array(zip));
    assert.equal(restored.manifest.packageDigest,imported.packageDigest,'IMPORTED_PACKAGE_DIGEST_DRIFT');
    runtimeOverlay(restored.compiled); // Verify path/identity shape, but do not parse resolved runtime as authoring.
    const overlay=authoringOverlay(restored,generator,imported.heroId);
    receipt.loaderInput='ZIP authoring dependencies plus pinned generateHeroDraft(source project); no resolved compiled-as-authoring';
    assert(Object.hasOwn(overlay.docs,'champions/'+imported.heroId),'IMPORTED_CHAMPION_MISSING');
    // Fail-closed even for unrelated pinned catalog errors. A platform problem
    // must be recorded, not repaired or confused with a generated-hero failure.
    const loaded=await new content.ContentLoader(new content.OverlayContentSource(
      new source.FsContentSource(path.join(root,'content')),overlay)).load({policy:'fail-closed'});
    receipt.contentVersion=loaded.manifest.contentVersion;receipt.quarantined=loaded.quarantined;
    content.registerAll(loaded.store,{onTemplateFailure:'throw'});
    receipt.stage='verify-six-slot-references';
    const hero=registry.Champions.get(imported.heroId);
    const refs={PASSIVE:hero.passiveAbility,Q:hero.abilities.Q.id,W:hero.abilities.W.id,
      E:hero.abilities.E.id,R:hero.abilities.R.id,EX:hero.exAbility};
    for(const [slot,id] of Object.entries(refs))assert(id&&registry.Abilities.tryGet(id),'MISSING_SLOT_REFERENCE:'+slot);
    receipt.slotReferences=refs;
    receipt.stage='select-and-enter-combat';
    const seats=Array.from({length:12},(_,i)=>({seatId:i,teamId:Math.floor(i/3),isBot:i!==0}));
    const phaseConfig=phase.resolvePhaseConfig(false);receipt.phaseConfig=phaseConfig;
    const match=new controller.MatchController('forge-entry-'+hash(zip).slice(0,12),20260910,seats,phaseConfig);
    const unknown='forge-unknown-'+hash(zip).slice(0,12);assert(!registry.Champions.tryGet(unknown));
    const rejected=match.selectChampion(0,unknown);assert.equal(rejected.ok,false,'UNKNOWN_CHAMPION_ACCEPTED');
    assert.equal(match.seats.get(0).championId,'','REJECTED_SELECTION_MUTATED_SEAT');receipt.unknownSelectionRejected=true;
    const selected=match.lockSeatChampion(0,imported.heroId);assert(selected.ok,'IMPORTED_CHAMPION_NOT_SELECTABLE:'+JSON.stringify(selected));
    receipt.selectionPassed=true;receipt.transitions=[{tick:match.world.tick,phase:match.phase.phase}];
    const maximumTicks=20000;let ticks=0;
    while(match.phase.phase!=='combat'&&ticks<maximumTicks){
      const before=match.phase.phase;match.tick();ticks++;
      if(before!==match.phase.phase)receipt.transitions.push({tick:match.world.tick,phase:match.phase.phase});
    }
    assert.equal(match.phase.phase,'combat','COMBAT_ENTRY_TICK_LIMIT');
    const seat=match.seats.get(0);assert(seat.entityId!==null,'IMPORTED_CHAMPION_NOT_SPAWNED');
    assert.equal(match.world.champion.get(seat.entityId)?.championId,imported.heroId,'SPAWNED_DIFFERENT_CHAMPION');
    receipt.spawnPassed=true;receipt.combatEntryPassed=true;receipt.entityId=seat.entityId;receipt.ticks=ticks;
    receipt.status='entry-passed-not-mechanism-acceptance';
  }catch(error){receipt.status='failed';receipt.error=String(error);}
  receipt.finishedAt=new Date().toISOString();save(path.join(out,'report.json'),receipt);return receipt;
}

if(process.argv[1]&&path.resolve(process.argv[1])===script){
  const names=['import-report','zip','hero-id','source-repo','game-dependencies','shared-dependencies','out'];
  const {values}=parseArgs({options:Object.fromEntries(names.map(name=>[name,{type:'string'}]))});
  for(const name of names)assert(values[name],'MISSING:'+name);
  const result=await run(values as Record<string,string>);
  console.log(JSON.stringify({status:result.status,stage:result.stage,selectionPassed:result.selectionPassed,combatEntryPassed:result.combatEntryPassed,error:result.error}));
  if(result.status==='failed')process.exitCode=1;
}
