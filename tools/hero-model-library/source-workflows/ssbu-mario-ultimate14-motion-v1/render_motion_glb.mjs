import {Engine,Scene,FreeCamera,TransformNode,Vector3,HemisphericLight,DirectionalLight,Color4,LoadAssetContainerAsync,Camera} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const save=async(name,data)=>{const r=await fetch('/save/'+name,{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw Error('save '+name)};
const safe=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
try{
 const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.73,.75,.79,1);
 const camera=new FreeCamera('camera',new Vector3(4,4,3),scene);camera.setTarget(Vector3.Zero());
 camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.001;camera.maxZ=100;
 const hemi=new HemisphericLight('ambient',new Vector3(.25,1,.4),scene);hemi.intensity=.9;hemi.groundColor.set(.45,.45,.5);
 for(const[i,v]of [[-.3,-.7,-.5],[.5,.4,.7],[-.5,.6,.2]].entries()){
  const light=new DirectionalLight('key-'+i,new Vector3(...v),scene);light.intensity=i===0?1.8:.8;
 }
 const container=await LoadAssetContainerAsync('/body.glb',scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});
 container.addAllToScene();await scene.whenReadyAsync();
 const visualRoot=new TransformNode('visual-center',scene);
 for(const node of [...container.meshes,...container.transformNodes])if(!node.parent)node.parent=visualRoot;
 const meshes=container.meshes.filter(m=>m.getTotalVertices());
 const bounds=()=>{
  for(const s of container.skeletons)s.prepare();
  let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
  for(const m of meshes){
   const verts=m.getPositionData(true,true),world=m.computeWorldMatrix(true);
   for(let i=0;i<verts.length;i+=3){
    const p=Vector3.TransformCoordinates(new Vector3(verts[i],verts[i+1],verts[i+2]),world);
    if(!p.asArray().every(Number.isFinite))throw Error('Nonfinite animated world vertex');
    min=Vector3.Minimize(min,p);max=Vector3.Maximize(max,p);
   }
  }
  return {min,max,extent:max.subtract(min)};
 };
 const samples=[];
 for(const group of container.animationGroups){
  for(const other of container.animationGroups)other.stop();
  group.start(false,1,group.from,group.to,false);
  for(const [label,fraction] of [['start',0],['middle',.5],['end',1]]){
   const frame=group.from+(group.to-group.from)*fraction;group.goToFrame(frame);group.pause();
   visualRoot.position.setAll(0);
   scene.render();await new Promise(r=>requestAnimationFrame(r));scene.render();
   const b=bounds(),span=Math.max(...b.extent.asArray()),half=Math.max(span*.62,.25);
   const center=b.min.add(b.max).scale(.5);
   visualRoot.position.setAll(0);
   camera.position.copyFrom(new Vector3(center.x,20,center.z));camera.setTarget(new Vector3(center.x,center.y,center.z));
   camera.getViewMatrix(true);camera.getProjectionMatrix(true);
   camera.orthoLeft=-half;camera.orthoRight=half;camera.orthoTop=half;camera.orthoBottom=-half;
   scene.render();await new Promise(r=>requestAnimationFrame(r));scene.render();
   const file=safe(group.name)+'-'+label+'.png';
   await save(file,{png:canvas.toDataURL('image/png').split(',')[1]});
   samples.push({group:group.name,label,fraction,frame,file,renderCenterTranslation:visualRoot.position.asArray(),worldSkinnedBounds:{min:b.min.asArray(),max:b.max.asArray(),extent:b.extent.asArray()}});
  }
  group.stop();
 }
 await save('proof.json',{schema:'ggd.ssbu-mario-ultimate14-motion-webgl@1',babylonVersion:Engine.Version,
  renderer:'actual Babylon WebGL glTF loader; each animation sampled at start, middle and end with CPU-skinned finite world bounds',
  animationGroups:container.animationGroups.map(g=>({name:g.name,from:g.from,to:g.to,targetedAnimations:g.targetedAnimations.length})),
  skeletons:container.skeletons.map(s=>({name:s.name,bones:s.bones.length})),samples,
  sourceGameShaderParity:false,semanticActionMappingVerified:false,completeGameplayActionSet:false,gameplayAcceptance:false});
 scene.dispose();engine.dispose();await fetch('/done',{method:'POST'});
}catch(error){await save('error.json',{message:String(error),stack:error.stack});await fetch('/done',{method:'POST'});}
