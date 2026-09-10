import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [repoArg,rootArg]=process.argv.slice(2);if(!repoArg||!rootArg)throw Error('usage: check_ggd.mts <GGD repo> <conversion root>');
const repo=resolve(repoArg),root=resolve(rootArg);
const {inspectModelUpload}=await import(pathToFileURL(join(repo,'packages/shared/src/content/modelUpload/inspect.ts')).href);
const {heroModelBudgetIssues}=await import(pathToFileURL(join(repo,'packages/shared/src/content/modelUpload/heroModel.ts')).href);
const {HERO_MODEL_BUDGET}=await import(pathToFileURL(join(repo,'packages/shared/src/content/modelUpload/budget.ts')).href);
const rows=[];
for(const name of ['native-res','256']) {
 const path=join(root,'models',`jetragon-materials-${name}.glb`),bytes=new Uint8Array(readFileSync(path));
 try {const inspected=await inspectModelUpload(bytes),budget=heroModelBudgetIssues(inspected);rows.push({variant:name,path,sha256:inspected.sha256,inspectPassed:true,budget,triangles:inspected.triangles,drawPrimitives:inspected.meshes,textures:inspected.textures,clips:inspected.clips});}
 catch(error){rows.push({variant:name,path,sha256:createHash('sha256').update(bytes).digest('hex'),inspectPassed:false,error:String(error)});}
}
const contractPath=join(repo,'packages/shared/src/content/modelUpload/heroModel.ts');
const receipt={schema:'ggd.jetragon.material-binding.ggdruntime-check@1',repo,limits:HERO_MODEL_BUDGET,rows,fullHeroImport:{status:'not-ready',prepareCalled:false,reason:'Native source has no identified Death clip and task requires keeping all29 stored names. prepareUploadedHeroModel retains only six selected runtime states; verifyUploadedHeroModel rejects extra unreferenced clips. No fake death or runtime descriptor created.',contractPath,contractSha256:createHash('sha256').update(readFileSync(contractPath)).digest('hex'),possibleMappingsForReview:{idle:'Idle',run:'Run',hurt:'Damage',attack:'FarSkill_Action',cast:'JumpBeam_Start',death:null},mappingIsNotAnAuthoredHeroGameplayContract:true},standardizationScope:'GLB material-bound source candidate, not finalized shipped hero; sourceSSS shader/polygon offset pending.',visualAcceptance:'separate actual-WebGL receipt'};
writeFileSync(join(root,'evidence/ggd-inspect.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({rows:rows.map(x=>({variant:x.variant,inspectPassed:x.inspectPassed,budget:x.budget,error:x.error,clipCount:x.clips?.length})),fullHeroImport:receipt.fullHeroImport.status}));
