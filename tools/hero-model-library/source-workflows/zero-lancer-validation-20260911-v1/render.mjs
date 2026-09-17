import {Engine,Scene,ArcRotateCamera,Vector3,HemisphericLight,DirectionalLight,Color4,LoadAssetContainerAsync,Camera} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const save=async(name,data)=>{const r=await fetch('/save/'+name,{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('save '+name)};
try{
 const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.10,.12,.17,1);
 const camera=new ArcRotateCamera('camera',Math.PI/2,Math.PI/2,8,Vector3.Zero(),scene);
 camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.001;camera.maxZ=100;
 const hemi=new HemisphericLight('ambient',new Vector3(.25,1,.4),scene);hemi.intensity=.9;hemi.groundColor.set(.45,.45,.5);
 for(const[i,v]of [[-.3,-.7,-.5],[.5,.4,.7],[-.5,.6,.2]].entries()){
  const light=new DirectionalLight('key-'+i,new Vector3(...v),scene);light.intensity=i===0?1.8:.8;
 }
 const container=await LoadAssetContainerAsync('/body.glb',scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});
 container.addAllToScene();await scene.whenReadyAsync();scene.render();
 for(const s of container.skeletons)s.prepare();
 const meshes=container.meshes.filter(m=>m.getTotalVertices());
 let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
 const geometry=[];
 for(const m of meshes){
  const verts=m.getPositionData(true,true),world=m.computeWorldMatrix(true);let a=new Vector3(Infinity,Infinity,Infinity),b=new Vector3(-Infinity,-Infinity,-Infinity);
  for(let i=0;i<verts.length;i+=3){
   const p=Vector3.TransformCoordinates(new Vector3(verts[i],verts[i+1],verts[i+2]),world);
   if(!p.asArray().every(Number.isFinite))throw Error('Nonfinite skinned world vertex');a=Vector3.Minimize(a,p);b=Vector3.Maximize(b,p);
  }
  min=Vector3.Minimize(min,a);max=Vector3.Maximize(max,b);
  geometry.push({name:m.name,vertices:m.getTotalVertices(),indices:m.getTotalIndices(),worldBounds:{min:a.asArray(),max:b.asArray()},
   skeleton:m.skeleton?.name,bones:m.skeleton?.bones.length,numBoneInfluencers:m.numBoneInfluencers,gpuSkinning:m.computeBonesUsingShaders});
 }
 const center=min.add(max).scale(.5),extent=max.subtract(min),span=Math.max(...extent.asArray()),half=span*.59;
 camera.setTarget(center);camera.orthoLeft=-half;camera.orthoRight=half;camera.orthoTop=half;camera.orthoBottom=-half;
 const views=[['front',Math.PI/2,Math.PI/2],['back',-Math.PI/2,Math.PI/2],['isometric',Math.PI/4,Math.PI/2.7]],shots=[];
 for(const[name,alpha,beta]of views){
  camera.alpha=alpha;camera.beta=beta;scene.render();await new Promise(r=>requestAnimationFrame(r));scene.render();
  await save(name+'.png',{png:canvas.toDataURL('image/png').split(',')[1]});shots.push({name,alpha,beta});
 }
 const tex=t=>t?{name:t.name,ready:t.isReady(),gammaSpace:t.gammaSpace,size:t.getSize()}:null;
 await save('proof.json',{schema:'ggd.zero-lancer-webgl@1',babylonVersion:Engine.Version,
  renderer:'actual Babylon WebGL glTF loader in right-handed scene; CPU-skinned world bounds used for camera framing',
  worldSkinnedBounds:{min:min.asArray(),max:max.asArray(),extent:extent.asArray()},geometry,
  animationGroups:container.animationGroups.length,skeletons:container.skeletons.length,
  materials:container.materials.map(m=>({name:m.name,alpha:m.alpha,transparencyMode:m.transparencyMode,backFaceCulling:m.backFaceCulling,
   metallic:m.metallic,roughness:m.roughness,albedoTexture:tex(m.albedoTexture),normalTexture:tex(m.bumpTexture)})),
  textures:scene.textures.map(tex),shots,sourceGameShaderParity:false,gameplayAcceptance:false});
 scene.dispose();engine.dispose();await fetch('/done',{method:'POST'});
}catch(error){await save('error.json',{message:String(error),stack:error.stack});await fetch('/done',{method:'POST'})}
