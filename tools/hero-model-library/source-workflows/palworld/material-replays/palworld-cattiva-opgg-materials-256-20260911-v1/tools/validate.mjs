/** Run the existing GGD upload gate and its installed Babylon CPU skinning. */
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [repoArg, resultArg] = process.argv.slice(2);
if (!repoArg || !resultArg) throw Error('Usage: node --import tsx validate.mjs <GGD-repo> <conversion-result>');
const repo=resolve(repoArg), root=resolve(resultArg), evidence=join(root,'validation');
mkdirSync(evidence,{recursive:true});
const save=(name,value)=>writeFileSync(join(evidence,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=readFileSync(join(root,'body.glb'));
const conversion=JSON.parse(readFileSync(join(root,'conversion.json')));
assert.equal(hash(bytes),conversion.outputSha256);
const shared=createRequire(join(repo,'packages/shared/package.json'));
const validator=shared('gltf-validator');
const khronos=await validator.validateBytes(new Uint8Array(bytes),{format:'glb',maxIssues:10000,writeTimestamp:false,externalResourceFunction:async()=>{throw Error('external resource rejected')}});
save('khronos.json',khronos);
assert.equal(khronos.issues.numErrors,0,JSON.stringify(khronos.issues));
assert.equal(khronos.issues.truncated,false);
const {inspectModelUpload}=await import(pathToFileURL(join(repo,'packages/shared/src/content/modelUpload/inspect.ts')).href);
const inspected=await inspectModelUpload(new Uint8Array(bytes),'model');
save('ggd-upload.json',{modelSha256:inspected.sha256,clips:inspected.clips,meshes:inspected.meshes,triangles:inspected.triangles,textures:inspected.textures,report:inspected.report,gate:'packages/shared/src/content/modelUpload/inspect.ts inspectModelUpload',backendRegistration:'not-performed',gameplayAcceptance:'pending'});
assert.equal(inspected.clips.length,33);
assert.equal(inspected.textures.length,5);
const client=createRequire(join(repo,'apps/client/package.json'));
const moduleOf=name=>import(pathToFileURL(client.resolve(name)).href);
const [{NullEngine},{Engine},{Scene},{LoadAssetContainerAsync}] = await Promise.all([
 moduleOf('@babylonjs/core/Engines/nullEngine.js'),moduleOf('@babylonjs/core/Engines/engine.js'),moduleOf('@babylonjs/core/scene.js'),moduleOf('@babylonjs/core/Loading/sceneLoader.js')]);
await moduleOf('@babylonjs/loaders/glTF/index.js');
const engine=new NullEngine(),scene=new Scene(engine);
scene.useRightHandedSystem=true;
try{
 const container=await LoadAssetContainerAsync(new Uint8Array(bytes),scene,{pluginExtension:'.glb',pluginOptions:{gltf:{skipMaterials:true,animationStartMode:0}}});
 container.addAllToScene();
 const meshes=container.meshes.filter(m=>m.getTotalVertices()>0);
 const base=scene.transformNodes.map(n=>({n,p:n.position.clone(),s:n.scaling.clone(),q:n.rotationQuaternion?.clone(),r:n.rotation.clone()}));
 const reset=()=>{for(const x of base){x.n.position.copyFrom(x.p);x.n.scaling.copyFrom(x.s);if(x.q)x.n.rotationQuaternion.copyFrom(x.q);else x.n.rotation.copyFrom(x.r)}};
 const pose=()=>{for(const n of scene.transformNodes)n.computeWorldMatrix(true);for(const s of container.skeletons)s.prepare(true);return meshes.flatMap(m=>Array.from(m.getPositionData(true,false)))};
 const rows=[];
 for(const clip of container.animationGroups){
  for(const other of container.animationGroups)other.stop();reset();clip.start(false);clip.pause();clip.goToFrame(clip.from);const start=pose();
  assert.ok(start.every(Number.isFinite));
  const samples=[];
  for(const fraction of [.2,.6,.85]){
   clip.goToFrame(clip.from+(clip.to-clip.from)*fraction);const values=pose();assert.equal(values.length,start.length);assert.ok(values.every(Number.isFinite));
   let maxDelta=0,changedVertices=0;
   for(let i=0;i<values.length;i+=3){const d=Math.hypot(values[i]-start[i],values[i+1]-start[i+1],values[i+2]-start[i+2]);if(d>1e-5)changedVertices++;maxDelta=Math.max(maxDelta,d)}
   samples.push({fraction,changedVertices,maxDelta});
  }
  rows.push({clip:clip.name,from:clip.from,to:clip.to,seconds:(clip.to-clip.from)/60,vertices:start.length/3,samples});
 }
 const stationaryClips=rows.filter(r=>r.samples.every(s=>!s.changedVertices)).map(r=>r.clip);
 const proof={schema:'ggd.cattiva.babylon-source-motion@1',modelSha256:hash(bytes),babylonVersion:Engine.Version,method:'GGD installed Babylon NullEngine, CPU skinned vertices at source clip start plus 20%, 60%, 85%; reset base transforms for each clip; same getPositionData method as inspect-library-motion.mjs. Materials skipped for CPU proof.',referenceTool:'tools/community-hero-forge/inspect-library-motion.mjs',bones:container.skeletons.map(s=>s.bones.length),rows,stationaryClips,sourceProvidedClips:rows.length,proceduralClips:0,ggdBackendRegistration:'not-performed',ggdGameplayAcceptance:'pending'};
 save('babylon-motion.json',proof);
 assert.equal(rows.length,33);assert.equal(stationaryClips.length,0);
 console.log(JSON.stringify({modelSha256:hash(bytes),khronos:khronos.issues,ggdUpload:'pass',clips:rows.length,textures:inspected.textures.length,stationaryClips},null,2));
}finally{scene.dispose();engine.dispose()}
