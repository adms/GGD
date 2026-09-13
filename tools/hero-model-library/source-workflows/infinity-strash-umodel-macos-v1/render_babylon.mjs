import {Engine,Scene,FreeCamera,Vector3,HemisphericLight,DirectionalLight,Color4,LoadAssetContainerAsync,Camera} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const save=async(name,data)=>{const response=await fetch('/save/'+name,{method:'POST',body:JSON.stringify(data)});if(!response.ok)throw Error('save '+name)};
try {
  const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.12,.14,.18,1);
  const camera=new FreeCamera('camera',new Vector3(0,0,-5),scene);camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.001;camera.maxZ=10000;camera.upVector=new Vector3(0,1,0);
  const ambient=new HemisphericLight('ambient',new Vector3(.25,1,.4),scene);ambient.intensity=1.5;ambient.groundColor.set(.5,.5,.55);
  for(const [index,direction] of [[0,[-.3,-.7,-.5]],[1,[.5,.4,.7]]]){const light=new DirectionalLight('key-'+index,new Vector3(...direction),scene);light.intensity=index===0?2.1:1.0}
  const container=await LoadAssetContainerAsync('/body.glb',scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});container.addAllToScene();await scene.whenReadyAsync();
  const meshes=container.meshes.filter(mesh=>mesh.getTotalVertices()),shots=[];
  let reviewRows;
  const modelResponse=await fetch('/model.json');
  if(modelResponse.ok){
    const model=await modelResponse.json(),states=['idle','run','attack','cast','hurt','death'];
    reviewRows=states.map(state=>{const clip=container.animationGroups.find(group=>group.name===model.clipMap?.[state]);if(!clip)throw Error(`missing mapped ${state} clip ${model.clipMap?.[state]}`);return {state,clip}});
  }else{
    if(container.animationGroups.length!==6)throw Error('expected exactly six animation groups without a runtime model document');
    reviewRows=container.animationGroups.map(clip=>({state:null,clip}));
  }
  for(const {state,clip} of reviewRows){
    for(const other of container.animationGroups)other.stop();
    clip.start(false);clip.pause();
    for(const fraction of [0,.5,1]){
      clip.goToFrame(clip.from+(clip.to-clip.from)*fraction);
      for(const node of scene.transformNodes)node.computeWorldMatrix(true);
      for(const skeleton of container.skeletons)skeleton.prepare(true);
      let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity),finite=true,vertexCount=0;
      for(const mesh of meshes){
        const positions=mesh.getPositionData(true,true),world=mesh.computeWorldMatrix(true);vertexCount+=positions.length/3;
        for(let index=0;index<positions.length;index+=3){
          const vertex=Vector3.TransformCoordinates(new Vector3(positions[index],positions[index+1],positions[index+2]),world);
          finite&&=vertex.asArray().every(Number.isFinite);min=Vector3.Minimize(min,vertex);max=Vector3.Maximize(max,vertex);
        }
      }
      if(!finite)throw Error('non-finite posed vertices');
      const span=Math.max(max.y-min.y,max.x-min.x,max.z-min.z,.01),half=span*.62;
      const center=min.add(max).scale(.5);camera.position=center.add(new Vector3(0,0,span*2));camera.setTarget(center);camera.orthoLeft=-half;camera.orthoRight=half;camera.orthoTop=half;camera.orthoBottom=-half;
      scene.render();await new Promise(resolve=>requestAnimationFrame(resolve));scene.render();
      const name=(state?`ggd-state-${state}`:clip.name.toLowerCase().replaceAll('_','-'))+'-'+Math.round(fraction*100)+'.png';
      await save(name,{png:canvas.toDataURL('image/png').split(',')[1]});
      shots.push({name,state,clip:clip.name,fraction,frame:clip.from+(clip.to-clip.from)*fraction,vertexCount,bounds:{min:min.asArray(),max:max.asArray()},finite});
    }
  }
  await save('proof.json',{schema:'ggd.infinity-strash-babylon-webgl-motion@1',babylonVersion:Engine.Version,method:'Actual Babylon WebGL glTF loader; three rendered samples for each source clip or each of six mapped runtime states',meshCount:meshes.length,bones:container.skeletons.map(skeleton=>skeleton.bones.length),textures:scene.textures.map(texture=>({name:texture.name,ready:texture.isReady(),size:texture.getSize()})),shots,nativeMotion:true,humanReview:'pending',runtimeRegistration:false,deploymentVerified:false});
  scene.dispose();engine.dispose();await fetch('/done',{method:'POST'});
} catch(error){await save('error.json',{message:String(error),stack:error.stack});await fetch('/done',{method:'POST'})}
