import {Engine,Scene,ArcRotateCamera,Vector3,HemisphericLight,DirectionalLight,Color4,LoadAssetContainerAsync,Camera} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const save=async(name,data)=>{const r=await fetch('/save/'+name,{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('save '+name)};
const slug=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
try{
 const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.73,.75,.79,1);
 const camera=new ArcRotateCamera('camera',Math.PI/2,Math.PI/2,8,Vector3.Zero(),scene);
 camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.001;camera.maxZ=100;
 const hemi=new HemisphericLight('ambient',new Vector3(.25,1,.4),scene);hemi.intensity=.9;hemi.groundColor.set(.45,.45,.5);
 for(const[i,v]of [[-.3,-.7,-.5],[.5,.4,.7],[-.5,.6,.2]].entries()){
  const light=new DirectionalLight('key-'+i,new Vector3(...v),scene);light.intensity=i===0?1.8:.8;
 }
 const container=await LoadAssetContainerAsync('/body.glb',scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});
 container.addAllToScene();await scene.whenReadyAsync();
 for(const skeleton of container.skeletons)skeleton.prepare();
 const meshes=container.meshes.filter(mesh=>mesh.getTotalVertices());
 const poseBounds=()=>{
  let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
  for(const mesh of meshes){
   const vertices=mesh.getPositionData(true,true),world=mesh.computeWorldMatrix(true);
   for(let i=0;i<vertices.length;i+=3){
    const point=Vector3.TransformCoordinates(new Vector3(vertices[i],vertices[i+1],vertices[i+2]),world);
    if(!point.asArray().every(Number.isFinite))throw Error('Nonfinite skinned world vertex');
    min=Vector3.Minimize(min,point);max=Vector3.Maximize(max,point);
   }
  }
  const extent=max.subtract(min),center=min.add(max).scale(.5),span=Math.max(...extent.asArray());
  return {min,max,extent,center,span};
 };
 const framePose=async(group,phase,view)=>{
  for(const item of container.animationGroups)item.stop();
  group.start(false,1,group.from,group.to,false);group.pause();
  const frame=group.from+(group.to-group.from)*phase;group.goToFrame(frame);
  scene.render();await new Promise(resolve=>requestAnimationFrame(resolve));scene.render();
  const bounds=poseBounds(),half=Math.max(bounds.span*.62,.5);
  camera.setTarget(bounds.center);camera.orthoLeft=-half;camera.orthoRight=half;camera.orthoTop=half;camera.orthoBottom=-half;
  if(view==='front'){camera.alpha=Math.PI/2;camera.beta=Math.PI/2;}
  else {camera.alpha=0;camera.beta=Math.PI/2;}
  scene.render();await new Promise(resolve=>requestAnimationFrame(resolve));scene.render();
  const name=slug(group.name)+'-'+String(Math.round(phase*100)).padStart(3,'0')+'-'+view+'.png';
  await save(name,{png:canvas.toDataURL('image/png').split(',')[1]});
  return {name,phase,frame,view,worldSkinnedBounds:{min:bounds.min.asArray(),max:bounds.max.asArray(),extent:bounds.extent.asArray()}};
 };
 const groups=[];
 for(const group of container.animationGroups){
  const shots=[];
  for(const phase of [0,.5,1])shots.push(await framePose(group,phase,'front'));
  shots.push(await framePose(group,.5,'side'));
  groups.push({name:group.name,from:group.from,to:group.to,targetedAnimationCount:group.targetedAnimations.length,
   frameRates:[...new Set(group.targetedAnimations.map(item=>item.animation.framePerSecond))],shots});
 }
 await save('proof.json',{schema:'ggd.fateubw-native-motion-webgl@1',babylonVersion:Engine.Version,
  renderer:'actual Babylon WebGL glTF loader in right-handed scene; each native group posed at start/middle/end plus middle side view; CPU-skinned bounds frame every shot',
  model:{meshes:meshes.map(mesh=>({name:mesh.name,vertices:mesh.getTotalVertices(),indices:mesh.getTotalIndices(),
   skeleton:mesh.skeleton?.name,bones:mesh.skeleton?.bones.length,numBoneInfluencers:mesh.numBoneInfluencers,gpuSkinning:mesh.computeBonesUsingShaders})),
   skeletons:container.skeletons.length,animationGroups:container.animationGroups.length},
  groups,sourceEngineCurveParity:false,gameplayAcceptance:false,rightsCleared:false,backendSelectionVerified:false});
 scene.dispose();engine.dispose();await fetch('/done',{method:'POST'});
}catch(error){await save('error.json',{message:String(error),stack:error.stack});await fetch('/done',{method:'POST'})}
