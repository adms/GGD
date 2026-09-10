/** Run the current GGD importer/budget on hash-pinned existing skinned candidates. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const [repoArg, outputArg] = process.argv.slice(2);
if (!outputArg) throw Error('validate.mts <GGD repo with dependencies> <preserved delivery>');
const repo=resolve(repoArg), root=resolve(outputArg), here=dirname(fileURLToPath(import.meta.url));
const cfg=JSON.parse(readFileSync(join(here,'source-config.json'),'utf8'));
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const put=(p:string,x:unknown)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const imp=(p:string)=>import(pathToFileURL(join(repo,p)).href);
const [{inspectModelUpload},{heroModelBudgetIssues},{HERO_MODEL_BUDGET},{MODEL_UPLOAD_LIMITS}]=await Promise.all([
  imp('packages/shared/src/content/modelUpload/inspect.ts'),imp('packages/shared/src/content/modelUpload/heroModel.ts'),
  imp('packages/shared/src/content/modelUpload/budget.ts'),imp('packages/shared/src/content/modelUpload/glb.ts')]);
const pins=['inspect.ts','heroModel.ts','budget.ts','glb.ts'].map(name=>{
  const path='packages/shared/src/content/modelUpload/'+name;return {path,sha256:sha(readFileSync(join(repo,path)))};
});
const reports=[];
mkdirSync(join(root,'outputs'),{recursive:false});
for(const variant of cfg.variants){
  const source=join(root,'raw/source',variant.path), bytes=readFileSync(source);assert.equal(sha(bytes),variant.sha256);
  const model=await inspectModelUpload(new Uint8Array(bytes)), budget=heroModelBudgetIssues(model);
  assert.deepEqual(budget.errors,[]);assert.equal(model.triangles,4984);assert.equal(model.meshes,1);
  assert.equal(model.clips.length,0);assert.equal(model.json.skins?.length,1);assert.equal(model.json.skins[0].joints.length,59);
  assert.equal(model.textures.length,1);assert.equal(model.textures[0].width,256);assert.equal(model.textures[0].height,256);
  const folder=join(root,'outputs',variant.variant.toLowerCase());mkdirSync(folder);
  const output=join(folder,'component.glb');writeFileSync(output,bytes,{flag:'wx'});
  const receipt={schema:'ggd.zero-lancer-current-validation@1',sourceId:cfg.sourceId,variant:variant.variant,
    sourcePlatform:cfg.sourcePlatform,role:'independent-skinned-model-component',inputPath:source,inputSha256:sha(bytes),
    outputPath:output,outputSha256:sha(bytes),outputBytes:bytes.length,outputByteIdenticalToAcquiredCandidate:true,
    triangles:model.triangles,drawPrimitives:model.meshes,nodeCount:model.json.nodes?.length,
    skinCount:1,joints:59,clips:[],textures:model.textures,uploadReport:model.report,budget,
    limits:{upload:MODEL_UPLOAD_LIMITS,hero:HERO_MODEL_BUDGET},contractPins:pins,
    contractRepository:repo,contractCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),
    nodeVersion:process.version,heroModelPreparationPerformed:false,backendRegistrationPerformed:false,
    gameplayAcceptance:false,missingNativeAnimations:true,sourceIrayOrToonParityEstablished:false};
  put(join(folder,'validation.json'),receipt);reports.push(receipt);
  console.log(JSON.stringify({variant:variant.variant,sha256:sha(bytes),bytes:bytes.length,
    errors:model.report.issues.numErrors,warnings:model.report.issues.numWarnings,budget}));
}
put(join(root,'evidence/current-contract-validation.json'),{schema:'ggd.zero-lancer-current-validation-batch@1',reports,
  registeredHeroes:0,defaultChanges:0,sourceFilesChanged:0});
