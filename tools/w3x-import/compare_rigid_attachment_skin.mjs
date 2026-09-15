#!/usr/bin/env node
/** Prove that converting rigid hand children to skin weights preserves motion. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [beforePath,afterPath,outPath,...names]=process.argv.slice(2);
if(!beforePath||!afterPath||!outPath||!names.length)throw Error('Usage: compare_rigid_attachment_skin.mjs before.glb after.glb receipt.json mesh-name...');
const requireFromClient=createRequire(new URL('../../apps/client/package.json',import.meta.url));
const moduleOf=name=>import(pathToFileURL(requireFromClient.resolve(name)).href);
const [{NullEngine},{Scene},{LoadAssetContainerAsync},{TransformNode},{Vector3}]=await Promise.all([
 moduleOf('@babylonjs/core/Engines/nullEngine.js'),moduleOf('@babylonjs/core/scene.js'),
 moduleOf('@babylonjs/core/Loading/sceneLoader.js'),moduleOf('@babylonjs/core/Meshes/transformNode.js'),
 moduleOf('@babylonjs/core/Maths/math.vector.js'),
]);
await moduleOf('@babylonjs/loaders/glTF/index.js');
const hash=b=>createHash('sha256').update(b).digest('hex');
const engine=new NullEngine();
async function load(file,prefix){
 const scene=new Scene(engine),bytes=readFileSync(resolve(file));
 const container=await LoadAssetContainerAsync(new Uint8Array(bytes),scene,{pluginExtension:'.glb',pluginOptions:{gltf:{skipMaterials:true,animationStartMode:0}}});
 const instance=container.instantiateModelsToScene(name=>`${prefix}${name}`,false,{doNotInstantiate:true});
 const root=new TransformNode(`${prefix}root`,scene);for(const node of instance.rootNodes)node.parent=root;
 return {scene,bytes,container,instance,root};
}
function positions(model,name,clipName,fraction){
 for(const group of model.instance.animationGroups)group.stop();
 const index=model.container.animationGroups.findIndex(group=>group.name===clipName);assert.ok(index>=0,`Missing clip ${clipName}`);
 const group=model.instance.animationGroups[index];group.start(false);group.pause();group.goToFrame(group.from+(group.to-group.from)*fraction);
 for(const node of model.root.getDescendants())if(node.computeWorldMatrix)node.computeWorldMatrix(true);
 for(const skeleton of model.instance.skeletons)skeleton.prepare(true);
 const mesh=model.root.getChildMeshes().find(entry=>entry.name.endsWith(name));assert.ok(mesh,`Missing mesh ${name}`);
 const local=mesh.getPositionData(true,false),world=mesh.computeWorldMatrix(true),result=[];
 for(let i=0;i<local.length;i+=3){const p=Vector3.TransformCoordinates(new Vector3(local[i],local[i+1],local[i+2]),world);result.push(p.x,p.y,p.z);}
 return result;
}
const before=await load(beforePath,'before-'),after=await load(afterPath,'after-'),rows=[];
try{
 const clips=[...new Set(before.container.animationGroups.map(group=>group.name))];assert.deepEqual(after.container.animationGroups.map(group=>group.name),clips);
 for(const name of names)for(const clip of clips)for(const fraction of [0,.2,.6,1]){
  const a=positions(before,name,clip,fraction),b=positions(after,name,clip,fraction);assert.equal(a.length,b.length);let maxDelta=0;
  for(let i=0;i<a.length;i+=3)maxDelta=Math.max(maxDelta,Math.hypot(a[i]-b[i],a[i+1]-b[i+1],a[i+2]-b[i+2]));
  rows.push({mesh:name,clip,fraction,vertices:a.length/3,maxDeltaMetres:maxDelta});
 }
 const maximum=Math.max(...rows.map(row=>row.maxDeltaMetres));assert.ok(maximum<.0002,`World-space drift ${maximum}m exceeds tolerance`);
 const result={schema:'ggd-rigid-attachment-skin-motion-equivalence@1',before:{path:resolve(beforePath),bytes:before.bytes.length,sha256:hash(before.bytes)},after:{path:resolve(afterPath),bytes:after.bytes.length,sha256:hash(after.bytes)},method:'Babylon NullEngine glTF loader; CPU skinning plus node world matrix; every retained animation at 0%, 20%, 60%, and 100%',meshes:names,animationCount:clips.length,samples:rows.length,maxWorldPositionDeltaMetres:maximum,toleranceMetres:.0002,passed:true,rows};
 writeFileSync(resolve(outPath),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({animationCount:clips.length,samples:rows.length,maxWorldPositionDeltaMetres:maximum,passed:true}));
}finally{before.scene.dispose();after.scene.dispose();engine.dispose();}
