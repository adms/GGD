import {Engine,Scene,ArcRotateCamera,Vector3,HemisphericLight,Color4,LoadAssetContainerAsync,Camera} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true});
const save=async(name,data)=>{const r=await fetch('/save/'+name,{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('save '+name)};
try{
const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.2,.23,.28,1);scene.imageProcessingConfiguration.toneMappingEnabled=false;
const camera=new ArcRotateCamera('camera',Math.PI/2,Math.PI/2,4,Vector3.Zero(),scene);camera.minZ=.001;scene.activeCamera=camera;camera.mode=Camera.ORTHOGRAPHIC_CAMERA;
const light=new HemisphericLight('key',new Vector3(.25,1,.4),scene);light.intensity=1.4;light.groundColor.set(.5,.5,.5);
const container=await LoadAssetContainerAsync('/asset/body',scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});container.addAllToScene();await scene.whenReadyAsync();scene.render();
const meshes=container.meshes.filter(m=>m.getTotalVertices());const shots=[];
for(const clip of container.animationGroups){
 for(const other of container.animationGroups)other.stop();clip.start(false);clip.pause();
 for(const fraction of [0,.6]){
 clip.goToFrame(clip.from+(clip.to-clip.from)*fraction);
 for(const n of scene.transformNodes)n.computeWorldMatrix(true);for(const s of container.skeletons)s.prepare(true);
 let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
 for(const m of meshes){m.computeWorldMatrix(true);m.refreshBoundingInfo(true);const b=m.getBoundingInfo().boundingBox;min=Vector3.Minimize(min,b.minimumWorld);max=Vector3.Maximize(max,b.maximumWorld)}
 const center=min.add(max).scale(.5),span=Math.max(max.y-min.y,max.x-min.x,max.z-min.z),size=span*.65;
 camera.setTarget(center);camera.radius=span*3;camera.orthoLeft=-size;camera.orthoRight=size;camera.orthoTop=size;camera.orthoBottom=-size;camera.maxZ=span*20;scene.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));scene.render();
 const file=clip.name.toLowerCase().replaceAll('_','-')+'-'+(fraction===0?'start':'middle')+'.png';await save(file,{png:canvas.toDataURL('image/png').split(',')[1]});shots.push({clip:clip.name,fraction,fromFrame:clip.from,toFrame:clip.to,file,bounds:{min:min.asArray(),max:max.asArray()}});
 }
}
await save('render-proof.json',{method:'Actual GLB Babylon WebGL rendering with all source embedded materials and skin; two samples per procedural clip; orthographic front view',babylonVersion:Engine.Version,shots,meshCount:meshes.length,bones:container.skeletons.map(s=>s.bones.length),textures:scene.textures.map(t=>({name:t.name,ready:t.isReady()})),nativeMotion:false,gameplayAcceptance:'pending'});scene.dispose();engine.dispose();await fetch('/done',{method:'POST'});
}catch(e){await save('render-error.json',{message:String(e),stack:e.stack});await fetch('/done',{method:'POST'});}
