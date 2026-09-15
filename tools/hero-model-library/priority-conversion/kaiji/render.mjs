import {Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, Color4, LoadAssetContainerAsync, Camera} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const canvas=document.querySelector('canvas'), engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const save=async(name,data)=>{const r=await fetch('/save/'+name,{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('save '+name)};
try {
 const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.15,.18,.23,1);
 const camera=new ArcRotateCamera('camera',Math.PI/2,Math.PI/2,5,new Vector3(0,.9,0),scene);camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.001;camera.maxZ=100;
 const light=new HemisphericLight('key',new Vector3(.25,1,.4),scene);light.intensity=1.3;light.groundColor.set(.4,.4,.4);
 const container=await LoadAssetContainerAsync('/body.glb',scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});container.addAllToScene();await scene.whenReadyAsync();
 const meshes=container.meshes.filter(m=>m.getTotalVertices()),shots=[];
 const targets=container.animationGroups.length?container.animationGroups:[null];
 for (const clip of targets) {
  for(const other of container.animationGroups)other.stop();if(clip){clip.start(false);clip.pause()}
  const samples=clip?[0,.25,.5,.75,1]:[0];
  for(const fraction of samples){
   if(clip)clip.goToFrame(clip.from+(clip.to-clip.from)*fraction);
   for(const n of scene.transformNodes)n.computeWorldMatrix(true);for(const s of container.skeletons)s.prepare(true);scene.render();
   let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity),finite=true;
   for(const m of meshes){const p=m.getPositionData(true,true),world=m.computeWorldMatrix(true);for(let i=0;i<p.length;i+=3){const v=Vector3.TransformCoordinates(new Vector3(p[i],p[i+1],p[i+2]),world);finite&&=v.asArray().every(Number.isFinite);min=Vector3.Minimize(min,v);max=Vector3.Maximize(max,v)}}
   if(!finite)throw Error('non-finite posed vertices');
   const span=Math.max(max.y-min.y,max.x-min.x,max.z-min.z,1.8),size=span*.62;camera.setTarget(min.add(max).scale(.5));camera.orthoLeft=-size;camera.orthoRight=size;camera.orthoTop=size;camera.orthoBottom=-size;
   const side=clip&&((clip.name.endsWith('run')&&[.25,.75].includes(fraction))||(['attack','cast','hurt'].some(s=>clip.name.endsWith(s))&&fraction===.5)||(clip.name.endsWith('death')&&fraction===1));
   const angles=clip?(side?[Math.PI/2,0]:[Math.PI/2]):[Math.PI/2,0,-Math.PI/2,Math.PI];
   for(let view=0;view<angles.length;view++) {camera.alpha=angles[view];scene.render();await new Promise(r=>requestAnimationFrame(r));scene.render();const name=(clip?.name??'static').toLowerCase().replaceAll('_','-')+'-'+Math.round(fraction*100)+'-'+view+'.png';await save(name,{png:canvas.toDataURL('image/png').split(',')[1]});shots.push({name,clip:clip?.name??null,fraction,view,bounds:{min:min.asArray(),max:max.asArray()},finite})}
  }
 }
 await save('proof.json',{schema:'ggd-kaiji-webgl-proof@1',babylonVersion:Engine.Version,method:'Actual Babylon WebGL rendering with skin deformation; all embedded textures; 5 sampled times per clip',meshCount:meshes.length,sourcePrimitiveCount:meshes.reduce((n,m)=>n+(m.subMeshes?.length??0),0),bones:container.skeletons.map(s=>s.bones.length),textures:scene.textures.map(t=>({name:t.name,ready:t.isReady(),size:t.getSize()})),shots,nativeMotion:false,gameplayAcceptance:false});
 scene.dispose();engine.dispose();await fetch('/done',{method:'POST'});
} catch(error){await save('error.json',{message:String(error),stack:error.stack});await fetch('/done',{method:'POST'})}
