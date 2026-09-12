import {Engine,Scene,ArcRotateCamera,Vector3,HemisphericLight,Color4,LoadAssetContainerAsync,Camera,Quaternion} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const canvas=document.querySelector('canvas');const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true});const rows=await(await fetch('/manifest')).json();const proof=[];
async function save(name,data){const r=await fetch('/save/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error('save failure '+name)}
try{
for(const row of rows){
 const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.20,.23,.28,1);scene.imageProcessingConfiguration.toneMappingEnabled=false;
 const camera=new ArcRotateCamera('camera',Math.PI/2,Math.PI/2,4,Vector3.Zero(),scene);camera.minZ=.001;scene.activeCamera=camera;camera.mode=Camera.ORTHOGRAPHIC_CAMERA;
 const light=new HemisphericLight('key',new Vector3(.25,1,.4),scene);light.intensity=1.4;light.groundColor.set(.5,.5,.5);
 const container=await LoadAssetContainerAsync('/asset/'+row.id,scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});container.addAllToScene();await scene.whenReadyAsync();scene.render();
 const meshes=container.meshes.filter(m=>m.getTotalVertices());let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
 for(const m of meshes){m.computeWorldMatrix(true);m.refreshBoundingInfo(true);const b=m.getBoundingInfo().boundingBox;min=Vector3.Minimize(min,b.minimumWorld);max=Vector3.Maximize(max,b.maximumWorld)}
 const center=min.add(max).scale(.5),height=max.y-min.y,width=max.x-min.x,span=Math.max(height,width);const report={id:row.id,bounds:{min:min.asArray(),max:max.asArray()},meshCount:meshes.length,skeletons:container.skeletons.length,boneCount:container.skeletons.reduce((n,s)=>n+s.bones.length,0),animations:container.animationGroups.length,textures:scene.textures.map(t=>({name:t.name,ready:t.isReady()})),meshBounds:meshes.map(m=>({name:m.name,vertices:m.getTotalVertices(),skeleton:m.skeleton?.name||null,bounds:{min:m.getBoundingInfo().boundingBox.minimumWorld.asArray(),max:m.getBoundingInfo().boundingBox.maximumWorld.asArray()}})),images:[]};
 const views=[['front',Math.PI/2,center,span*.64],['side',0,center,span*.64],['back',-Math.PI/2,center,span*.64]];
 for(const side of ['L','R']){const hands=meshes.filter(m=>m.name.startsWith('Hand'+side));if(hands.length===1){const b=hands[0].getBoundingInfo().boundingBox;const c=b.minimumWorld.add(b.maximumWorld).scale(.5),sz=b.maximumWorld.subtract(b.minimumWorld).length();views.push(['hand-'+side.toLowerCase(),Math.PI/2,c,Math.max(sz*.9,span*.06)])}}
 for(const [name,angle,target,size] of views){camera.setTarget(target);camera.alpha=angle;camera.beta=Math.PI/2;camera.radius=span*3;camera.orthoLeft=-size;camera.orthoRight=size;camera.orthoTop=size;camera.orthoBottom=-size;camera.maxZ=span*20;scene.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));scene.render();const file=row.id+'-'+name+'.png';await save(file,{png:canvas.toDataURL('image/png').split(',')[1]});report.images.push({file,view:name,cameraAlpha:angle,target:target.asArray(),orthoHalfExtent:size})}

 if(row.id.endsWith('-hands-a')){
  const skinMeshes=meshes.filter(m=>m.skeleton);const before=skinMeshes.map(m=>Array.from(m.getPositionData(true,false)));const joints=container.transformNodes.filter(n=>/^Elbow[LR](\\.[0-9]+)?$/.test(n.name));
  if(joints.length!==2)throw Error('Expected two elbow transform nodes; got '+joints.length);
  const originals=joints.map(n=>n.rotationQuaternion?.clone()||Quaternion.FromEulerVector(n.rotation));report.diagnosticPoses=[];
  for(const degrees of [25,-25]){
   joints.forEach((n,i)=>{n.rotationQuaternion=originals[i].multiply(Quaternion.RotationAxis(Vector3.Forward(),degrees*Math.PI/180*(n.name.startsWith('ElbowL')?1:-1)))});
   camera.setTarget(center);camera.alpha=Math.PI/2;camera.beta=Math.PI/2;camera.radius=span*3;camera.orthoLeft=-span*.64;camera.orthoRight=span*.64;camera.orthoTop=span*.64;camera.orthoBottom=-span*.64;scene.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));scene.render();
   const deltas=skinMeshes.map((m,i)=>{const after=Array.from(m.getPositionData(true,false));if(!after.every(Number.isFinite))throw Error('Non-finite posed geometry');let changed=0,max=0;for(let k=0;k<after.length;k+=3){const d=Math.hypot(after[k]-before[i][k],after[k+1]-before[i][k+1],after[k+2]-before[i][k+2]);if(d>1e-5)changed++;max=Math.max(max,d)}return {mesh:m.name,changedVertices:changed,maxLocalVertexDisplacement:max,finite:true}});
   const fname=row.id+'-diagnostic-elbows-'+(degrees>0?'plus':'minus')+'25.png';await save(fname,{png:canvas.toDataURL('image/png').split(',')[1]});report.diagnosticPoses.push({file:fname,diagnosticOnly:true,nativeMotion:false,degrees,jointNodes:joints.map(n=>n.name),meshDeltas:deltas,handWorldCenters:meshes.filter(m=>m.name.startsWith('Hand')).map(m=>{m.computeWorldMatrix(true);m.refreshBoundingInfo(true);return {name:m.name,center:m.getBoundingInfo().boundingBox.centerWorld.asArray()}})});
  }
  joints.forEach((n,i)=>n.rotationQuaternion=originals[i]);scene.render();
 }
 proof.push(report);scene.dispose();
}
await save('render-proof.json',{proof,babylonVersion:Engine.Version,method:'Babylon WebGL rendering of actual GLB meshes, original materials and skins; orthographic rest-pose views; no native or generated motion clips'});document.querySelector('#status').textContent='complete '+proof.length;await fetch('/done',{method:'POST'});
}catch(e){document.querySelector('#status').textContent=String(e);await save('render-error.json',{message:String(e),stack:e.stack});await fetch('/done',{method:'POST'});}
