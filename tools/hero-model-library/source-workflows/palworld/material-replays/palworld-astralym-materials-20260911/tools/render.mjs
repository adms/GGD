import {Engine,Scene,ArcRotateCamera,Vector3,HemisphericLight,DirectionalLight,Color4,LoadAssetContainerAsync,Camera} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true}),save=async(name,data)=>{const r=await fetch('/save/'+name,{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('save '+name)};
try{
 const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.15,.17,.21,1);scene.imageProcessingConfiguration.toneMappingEnabled=false;
 const camera=new ArcRotateCamera('camera',Math.PI/2,Math.PI/2,4,Vector3.Zero(),scene);camera.minZ=.001;scene.activeCamera=camera;camera.mode=Camera.ORTHOGRAPHIC_CAMERA;
 const key=new HemisphericLight('key',new Vector3(.25,1,.4),scene);key.intensity=1.1;key.groundColor.set(.25,.25,.3);const sun=new DirectionalLight('sun',new Vector3(-1,-2,-1),scene);sun.intensity=1.1;
 const container=await LoadAssetContainerAsync('/asset/body',scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});container.addAllToScene();await scene.whenReadyAsync();scene.render();
 const meshes=container.meshes.filter(m=>m.getTotalVertices()),shots=[],samples=[],selected=new Set(['Idle','Walk','Damage','HaloCutter','PaldiumCannon_Attack','Supernova_Start']);
 const inspectBounds=()=>{let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);for(const n of scene.transformNodes)n.computeWorldMatrix(true);for(const s of container.skeletons)s.prepare(true);for(const m of meshes){m.computeWorldMatrix(true);m.refreshBoundingInfo(true);const b=m.getBoundingInfo().boundingBox;min=Vector3.Minimize(min,b.minimumWorld);max=Vector3.Maximize(max,b.maximumWorld)};if(![...min.asArray(),...max.asArray()].every(Number.isFinite))throw Error('Nonfinite animated bounds');return {min,max};};
 for(const clip of container.animationGroups){
  for(const other of container.animationGroups)other.stop();clip.start(false);clip.pause();
  for(const fraction of [0,.5,1]){
   clip.goToFrame(clip.from+(clip.to-clip.from)*fraction);const {min,max}=inspectBounds(),center=min.add(max).scale(.5),span=Math.max(max.y-min.y,max.x-min.x,max.z-min.z),size=span*.62;
   camera.setTarget(center);camera.radius=span*3;camera.orthoLeft=-size;camera.orthoRight=size;camera.orthoTop=size;camera.orthoBottom=-size;camera.maxZ=Math.max(span*20,100);scene.render();
   const matrices=container.skeletons.map(s=>Array.from(s.getTransformMatrices(meshes[0])));if(matrices.some(a=>!a.every(Number.isFinite)))throw Error('Nonfinite matrices '+clip.name);
   samples.push({clip:clip.name,fraction,fromFrame:clip.from,toFrame:clip.to,bounds:{min:min.asArray(),max:max.asArray()},finiteBoneMatrices:true});
   if(selected.has(clip.name)&&fraction===.5){await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));scene.render();const file=clip.name.toLowerCase().replaceAll('_','-')+'-front.png';await save(file,{png:canvas.toDataURL('image/png').split(',')[1]});shots.push({clip:clip.name,fraction,file});}
  }
 }
 await save('render-proof.json',{method:'Actual Babylon WebGL loading of material-bound GLB; all available source clips sampled at 0/0.5/1; no generated motions',babylonVersion:Engine.Version,shots,samples,meshCount:meshes.length,bones:container.skeletons.map(s=>s.bones.length),animationGroupCount:container.animationGroups.length,materials:scene.materials.map(m=>({name:m.name,className:m.getClassName(),alphaMode:m.transparencyMode,albedoTexture:m.albedoTexture?.name,emissiveTexture:m.emissiveTexture?.name,bumpTexture:m.bumpTexture?.name,metallicTexture:m.metallicTexture?.name,readyWithoutMeshDiagnostic:m.isReady(),readyForMeshes:meshes.filter(x=>x.material===m).map(x=>({name:x.name,ready:m.isReady(x)}))})),textures:scene.textures.map(t=>({name:t.name,ready:t.isReady(),size:t.getSize()})),sourceMotion:true,gameplayAcceptance:'pending'});scene.dispose();engine.dispose();await fetch('/done',{method:'POST'});
}catch(e){await save('render-error.json',{message:String(e),stack:e.stack});await fetch('/done',{method:'POST'});}
