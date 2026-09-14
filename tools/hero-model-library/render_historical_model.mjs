import {Engine,Scene,ArcRotateCamera,Vector3,HemisphericLight,DirectionalLight,Color4,LoadAssetContainerAsync,Camera} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const save=async(name,data)=>{const response=await fetch('/save/'+name,{method:'POST',body:JSON.stringify(data)});if(!response.ok)throw Error('save '+name)};
try{
 const meta=await(await fetch('/meta.json')).json();
 const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.10,.12,.17,1);
 scene.imageProcessingConfiguration.toneMappingEnabled=false;
 const camera=new ArcRotateCamera('camera',Math.PI/2,Math.PI/2,8,Vector3.Zero(),scene);
 camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.001;camera.maxZ=1000;scene.activeCamera=camera;
 const hemi=new HemisphericLight('ambient',new Vector3(.25,1,.4),scene);hemi.intensity=1.05;hemi.groundColor.set(.45,.45,.5);
 for(const[i,v]of [[-.3,-.7,-.5],[.5,.4,.7],[-.5,.6,.2]].entries()){
  const light=new DirectionalLight('key-'+i,new Vector3(...v),scene);light.intensity=i===0?1.6:.65;
 }
 const container=await LoadAssetContainerAsync('/body.glb',scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});
 container.addAllToScene();await scene.whenReadyAsync();
 const clip=container.animationGroups.find(group=>group.name===meta.idleClip)??container.animationGroups[0];
 if(clip){clip.start(true);clip.pause();clip.goToFrame(clip.from+(clip.to-clip.from)*.2)}
 for(const skeleton of container.skeletons)skeleton.prepare();scene.render();
 const meshes=container.meshes.filter(mesh=>mesh.getTotalVertices());
 let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);const geometry=[];
 for(const mesh of meshes){
  const positions=mesh.getPositionData(true,true),world=mesh.computeWorldMatrix(true);let localMin=new Vector3(Infinity,Infinity,Infinity),localMax=new Vector3(-Infinity,-Infinity,-Infinity);
  for(let i=0;i<positions.length;i+=3){
   const point=Vector3.TransformCoordinates(new Vector3(positions[i],positions[i+1],positions[i+2]),world);
   if(!point.asArray().every(Number.isFinite))throw Error('Nonfinite skinned world vertex');
   localMin=Vector3.Minimize(localMin,point);localMax=Vector3.Maximize(localMax,point);
  }
  min=Vector3.Minimize(min,localMin);max=Vector3.Maximize(max,localMax);
  geometry.push({name:mesh.name,vertices:mesh.getTotalVertices(),indices:mesh.getTotalIndices(),worldBounds:{min:localMin.asArray(),max:localMax.asArray()},skeleton:mesh.skeleton?.name,bones:mesh.skeleton?.bones.length});
 }
 const center=min.add(max).scale(.5),extent=max.subtract(min),span=Math.max(...extent.asArray()),half=Math.max(.25,span*.62);
 camera.setTarget(center);camera.orthoLeft=-half;camera.orthoRight=half;camera.orthoTop=half;camera.orthoBottom=-half;
 const views=[['front',Math.PI/2,Math.PI/2.15],['back',-Math.PI/2,Math.PI/2.15],['isometric',Math.PI/4,Math.PI/2.45]],shots=[];
 for(const[name,alpha,beta]of views){
  camera.alpha=alpha;camera.beta=beta;scene.render();await new Promise(resolve=>requestAnimationFrame(resolve));scene.render();
  await save(name+'.png',{png:canvas.toDataURL('image/png').split(',')[1]});shots.push({name,alpha,beta});
 }
 const texture=entry=>entry?{name:entry.name,ready:entry.isReady(),gammaSpace:entry.gammaSpace,size:entry.getSize()}:null;
 await save('proof.json',{schema:'ggd-historical-model-webgl-proof@1',candidateId:meta.candidateId,modelSha256:meta.sha256,
  renderer:'Babylon WebGL glTF loader in a right-handed scene; idle or first native clip at 20 percent; CPU-skinned bounds frame three views',
  idleClipRequested:meta.idleClip,clipRendered:clip?.name??null,animationGroups:container.animationGroups.map(group=>group.name),
  worldSkinnedBounds:{min:min.asArray(),max:max.asArray(),extent:extent.asArray()},geometry,skeletons:container.skeletons.map(s=>({name:s.name,bones:s.bones.length})),
  materials:container.materials.map(material=>({name:material.name,alpha:material.alpha,transparencyMode:material.transparencyMode,backFaceCulling:material.backFaceCulling,albedoTexture:texture(material.albedoTexture),normalTexture:texture(material.bumpTexture)})),
  textures:scene.textures.map(texture),shots,sourceGameShaderParity:false,visualIdentityAcceptance:'pending-human-review',runtimeRegistration:false,deploymentVerified:false});
 scene.dispose();engine.dispose();await fetch('/done',{method:'POST'});
}catch(error){await save('error.json',{message:String(error),stack:error.stack});await fetch('/done',{method:'POST'})}
