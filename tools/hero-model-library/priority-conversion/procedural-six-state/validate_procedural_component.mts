/** Validate a six-state procedural GLB and its two-view WebGL sampling receipt. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';

const [glbArg, preparationArg, renderProofArg, outputArg] = process.argv.slice(2);
if (!glbArg || !preparationArg || !renderProofArg || !outputArg) {
  throw new Error('Usage: validate_procedural_component.mts <body.glb> <preparation.receipt.json> <proof.json> <validation.json>');
}
const repo=resolve('.'),glbPath=resolve(glbArg),preparationPath=resolve(preparationArg),renderProofPath=resolve(renderProofArg),outputPath=resolve(outputArg);
const bytes=readFileSync(glbPath),preparation=JSON.parse(readFileSync(preparationPath,'utf8')),proof=JSON.parse(readFileSync(renderProofPath,'utf8'));
const digest=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
assert.equal(digest(bytes),preparation.output.sha256,'GLB differs from preparation receipt');
assert.equal(bytes.length,preparation.output.bytes,'GLB size differs from preparation receipt');
assert.equal(preparation.animationProvenance.native,false);
assert.equal(preparation.animationProvenance.retargeted,false);
assert.equal(preparation.animationProvenance.coordinateSpace,'world-rest');

const require=createRequire(join(repo,'packages/shared/package.json'));
const validator=require('gltf-validator');
const {inspectModelUpload}=await import(join(repo,'packages/shared/src/content/modelUpload/inspect.ts'));
const {heroModelBudgetIssues}=await import(join(repo,'packages/shared/src/content/modelUpload/heroModel.ts'));
const {readFloatAccessor}=await import(join(repo,'packages/shared/src/content/modelUpload/glb.ts'));
const khronos=await validator.validateBytes(new Uint8Array(bytes),{
  uri:glbPath,maxIssues:0,writeTimestamp:false,
  externalResourceFunction:async()=>{throw new Error('External resources prohibited')},
});
assert.equal(khronos.issues.numErrors,0,'Khronos validation errors');
assert.equal(khronos.issues.truncated,false,'Khronos validation report truncated');
const inspection=await inspectModelUpload(new Uint8Array(bytes)),budget=heroModelBudgetIssues(inspection);
assert.deepEqual(budget.errors,[],'Current GGD model budget errors');
assert(inspection.skins>0,'No skin in procedural component');
assert.equal(inspection.skinnedPrimitives,inspection.meshes,'Every rendered primitive must be skinned');
const states=['idle','run','attack','cast','hurt','death'];
const expected=states.map(state=>`GGD_procedural_${state}`);
assert.deepEqual(inspection.clips.map((row:{name:string})=>row.name),expected,'Six-state clip contract mismatch');

const document=inspection.json as typeof inspection.json&{animations?:{name?:string;channels:{sampler:number;target:{node?:number;path:string}}[];samplers:{input:number;output:number;interpolation?:string}[]}[];skins?:{joints:number[]}[]};
const skinJoints=new Set((document.skins??[]).flatMap(skin=>skin.joints));
const animationChecks=[];
for(const animation of document.animations??[]){
  const targets=new Set<string>(),timeAccessors=new Set<number>();
  for(const channel of animation.channels){
    assert.notEqual(channel.target.node,undefined,`${animation.name} channel has no node`);
    assert(skinJoints.has(channel.target.node!),`${animation.name} targets a node outside all skins`);
    assert(['rotation','translation'].includes(channel.target.path),`${animation.name} has unexpected target path`);
    const key=`${channel.target.node}:${channel.target.path}`;assert(!targets.has(key),`${animation.name} repeats ${key}`);targets.add(key);
    timeAccessors.add(animation.samplers[channel.sampler]!.input);
  }
  for(const index of timeAccessors){
    const values=readFloatAccessor(inspection.json,inspection.bin,index);
    assert(values.length>1,`${animation.name} has no time extent`);
    for(let i=0;i<values.length;i++){assert(Number.isFinite(values[i]),`${animation.name} has nonfinite time`);if(i)assert(values[i]!>values[i-1]!,`${animation.name} time is not increasing`)}
  }
  animationChecks.push({name:animation.name,channelCount:animation.channels.length,targetedNodePaths:targets.size,timeAccessorCount:timeAccessors.size});
}
let floatAccessorCount=0,floatValueCount=0;
for(let i=0;i<inspection.json.accessors.length;i++){
  if(inspection.json.accessors[i]!.componentType!==5126)continue;
  const values=readFloatAccessor(inspection.json,inspection.bin,i);for(const value of values)assert(Number.isFinite(value),`Accessor ${i} has a nonfinite float`);
  floatAccessorCount++;floatValueCount+=values.length;
}

assert.equal(proof.schema,'ggd.procedural-motion-front-webgl@1');
assert.deepEqual(proof.cameraEvidence,{views:[{view:'front',positionAxis:'+Z'},{view:'side',positionAxis:'+X'}],upAxis:'+Y'});
assert.equal(proof.samples.length,60,'Expected 6 clips x 5 times x 2 views');
const proofKeys=new Set<string>();
for(const sample of proof.samples){
  proofKeys.add(`${sample.group}:${sample.label}:${sample.view}`);
  for(const values of Object.values(sample.worldSkinnedBounds) as number[][])for(const value of values)assert(Number.isFinite(value),'Render bounds contain a nonfinite value');
}
for(const group of expected)for(const label of ['start','quarter','middle','threequarter','end'])for(const view of ['front','side'])assert(proofKeys.has(`${group}:${label}:${view}`),'Missing required render sample');

const result={
  schema:'ggd-procedural-six-state-validation@1',candidateId:preparation.asset,
  source:{...preparation.source,preservedAndRehashed:digest(readFileSync(preparation.source.path))===preparation.source.sha256},
  glb:{path:glbPath,bytes:bytes.length,sha256:digest(bytes)},
  preparationReceipt:{path:preparationPath,sha256:digest(readFileSync(preparationPath))},
  renderProof:{path:renderProofPath,sha256:digest(readFileSync(renderProofPath)),sampleCount:proof.samples.length,cameraEvidence:proof.cameraEvidence},
  validator:'gltf-validator@2.0.0-dev.3.10',khronosIssues:khronos.issues,
  ggdInspection:{triangles:inspection.triangles,drawPrimitives:inspection.meshes,skinnedPrimitives:inspection.skinnedPrimitives,skinCount:inspection.skins,jointCount:skinJoints.size,textureCount:inspection.textures.length,textures:inspection.textures,clips:inspection.clips,budget},
  animationChecks,finiteFloatAccessors:{passed:true,accessorCount:floatAccessorCount,valueCount:floatValueCount},
  structuralValidationPassed:true,webglSamplingPassed:true,visualAcceptanceSeparate:true,
  nativeAnimationCount:0,proceduralAnimationCount:6,runtimeSelectable:false,deployed:false,
  limitations:['All six clips are generated fallback motion, not original SSBU or Street Fighter animation.','Machine validation does not establish artistic motion quality, gameplay timing, collision, foot contact, backend selection or deployment.'],
};
assert.equal(result.source.preservedAndRehashed,true,'Source GLB no longer matches the preparation receipt');
mkdirSync(dirname(outputPath),{recursive:true});writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output:outputPath,sha256:result.glb.sha256,khronosErrors:khronos.issues.numErrors,khronosWarnings:khronos.issues.numWarnings,budgetErrors:budget.errors.length,budgetWarnings:budget.warnings,clips:inspection.clips,renderSamples:proof.samples.length,floatValuesChecked:floatValueCount}));
