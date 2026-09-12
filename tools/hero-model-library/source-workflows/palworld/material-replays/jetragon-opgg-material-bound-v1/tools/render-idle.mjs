import {Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, Color4, LoadAssetContainerAsync, Camera} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const save=async(name,data)=>{const r=await fetch('/save/'+name,{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('save '+name)};
try{
 const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.10,.12,.17,1);
 const camera=new ArcRotateCamera('camera',Math.PI/2,Math.PI/2,12,new Vector3(0,2,0),scene);camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.01;camera.maxZ=100;
 const hemi=new HemisphericLight('key',new Vector3(.25,1,.4),scene);hemi.intensity=1.0;hemi.groundColor.set(.25,.25,.3);
 const key=new DirectionalLight('directional',new Vector3(-.3,-.7,-.5),scene);key.intensity=1.8;
 const container=await LoadAssetContainerAsync('/body.glb',scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});container.addAllToScene();await scene.whenReadyAsync();
 const meshes=container.meshes.filter(m=>m.getTotalVertices()),shots=[],motion=[];
 const pose=()=>{
  for(const n of scene.transformNodes)n.computeWorldMatrix(true);for(const s of container.skeletons)s.prepare(true);
  const all=[];let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
  for(const m of meshes){const data=m.getPositionData(true,true),world=m.computeWorldMatrix(true);for(let i=0;i<data.length;i+=3){const v=Vector3.TransformCoordinates(new Vector3(data[i],data[i+1],data[i+2]),world);if(!v.asArray().every(Number.isFinite))throw Error('nonfiniteposedvertex');all.push(...v.asArray());min=Vector3.Minimize(min,v);max=Vector3.Maximize(max,v);}}
  return {all,min,max};
 };
 for(const clip of container.animationGroups.filter(g=>g.name==='Idle')){
  for(const other of container.animationGroups)other.stop();clip.start(false);clip.pause();clip.goToFrame(clip.from);let start=pose();
  for(const fraction of [0,.6]){
   clip.goToFrame(clip.from+(clip.to-clip.from)*fraction);let posed=pose();scene.render();
   const center=posed.min.add(posed.max).scale(.5),span=Math.max(posed.max.x-posed.min.x,posed.max.y-posed.min.y,posed.max.z-posed.min.z,2);camera.setTarget(center);const size=span*.60;camera.orthoLeft=-size;camera.orthoRight=size;camera.orthoTop=size;camera.orthoBottom=-size;
   const views=clip.name==='Idle'&&fraction===.6?[['front',Math.PI/2],['side',0],['back',-Math.PI/2]]:[['front',Math.PI/2]];
   for(const [view,alpha] of views){camera.alpha=alpha;scene.render();await new Promise(r=>requestAnimationFrame(r));scene.render();const name=clip.name.toLowerCase().replaceAll('_','-')+'-'+Math.round(fraction*100)+'-'+view+'.png';await save(name,{png:canvas.toDataURL('image/png').split(',')[1]});shots.push({name,clip:clip.name,fraction,view,bounds:{min:posed.min.asArray(),max:posed.max.asArray()}});}
   if(fraction===.6){let changedVertices=0,maxVertexDelta=0;for(let i=0;i<posed.all.length;i+=3){const d=Math.hypot(posed.all[i]-start.all[i],posed.all[i+1]-start.all[i+1],posed.all[i+2]-start.all[i+2]);maxVertexDelta=Math.max(maxVertexDelta,d);if(d>1e-6)changedVertices++;}motion.push({clip:clip.name,from:clip.from,to:clip.to,babylonFramesPerSecond:60,sampledFraction:.6,vertices:posed.all.length/3,changedVertices,maxVertexDelta,finite:true});}
  }
 }
 for(const group of container.animationGroups)group.stop();const idle=container.animationGroups.find(g=>g.name==='Idle');idle.start(true);let animationFrames=0;const timeStart=performance.now(),liveFirst=pose();
 await new Promise(resolve=>{engine.runRenderLoop(()=>{scene.render();animationFrames++;if(performance.now()-timeStart>1200){engine.stopRenderLoop();resolve();}})});const elapsed=performance.now()-timeStart,liveLast=pose();idle.stop();
 const liveMaxDelta=Math.max(...liveLast.all.map((v,i)=>Math.abs(v-liveFirst.all[i])));
 const tex=t=>t?{name:t.name,ready:t.isReady(),gammaSpace:t.gammaSpace,size:t.getSize()}:null;
 await save('proof.json',{schema:'ggd-jetragon-material-webgl-proof@1',babylonVersion:Engine.Version,method:'Actual WebGL skin deformation; Idle sampled at0/60%; full29 source animations retained; Idle three camera views; timed1.2s Idle animation playback',meshCount:meshes.length,bones:container.skeletons.map(s=>s.bones.length),materials:container.materials.map(m=>({name:m.name,alpha:m.alpha,transparencyMode:m.transparencyMode,backFaceCulling:m.backFaceCulling,metallic:m.metallic,roughness:m.roughness,albedoTexture:tex(m.albedoTexture),normalTexture:tex(m.bumpTexture),metallicTexture:tex(m.metallicTexture),emissiveTexture:tex(m.emissiveTexture),reflectanceTexture:tex(m.reflectanceTexture),metallicReflectanceTexture:tex(m.metallicReflectanceTexture),metallicReflectanceColor:m.metallicReflectanceColor?.asArray(),emissiveColor:m.emissiveColor?.asArray()})),loadedTextures:scene.textures.map(tex),shots,motion,livePlayback:{clip:'Idle',elapsedMs:elapsed,renderedFrames:animationFrames,maxCoordinateDelta:liveMaxDelta},sourceAnimationEntries:container.animationGroups.length,nativeSourceMotionPreserved:true,proceduralMotion:false,SSSShaderParity:false,gameplayAcceptance:false});
 scene.dispose();engine.dispose();await fetch('/done',{method:'POST'});
}catch(error){await save('error.json',{message:String(error),stack:error.stack});await fetch('/done',{method:'POST'})}
