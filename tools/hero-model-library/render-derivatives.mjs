import {Engine,Scene,ArcRotateCamera,Vector3,HemisphericLight,Color4,LoadAssetContainerAsync,TransformNode} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const rows=await (await fetch('./render-models.json')).json();
window.proof=[];
for(const row of rows){
 const wrap=document.createElement('article');wrap.innerHTML=`<h3>${row.name}</h3><canvas width="420" height="420"></canvas>`;document.body.append(wrap);
 const canvas=wrap.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true}),scene=new Scene(engine);scene.clearColor=new Color4(.15,.18,.22,1);
 new HemisphericLight('light',new Vector3(.3,1,-.4),scene).intensity=1.1;
 const model=await(await fetch(row.doc)).json();
 const container=await LoadAssetContainerAsync(row.glb,scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});container.addAllToScene();
 const root=new TransformNode('display',scene);for(const n of container.rootNodes)n.parent=root;root.scaling.setAll(model.scale);root.rotation.y=(model.yawOffsetDeg||0)*Math.PI/180;
 const clip=container.animationGroups.find(g=>g.name===model.clipMap.idle);clip?.start(true);clip?.pause();clip?.goToFrame(clip.from+(clip.to-clip.from)*.2);
 const temporaryCamera=new ArcRotateCamera('temporary',0,1,4,Vector3.Zero(),scene);scene.activeCamera=temporaryCamera;scene.render(false);let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
 for(const m of container.meshes){if(!m.getTotalVertices())continue;m.computeWorldMatrix(true);m.refreshBoundingInfo(true);const b=m.getBoundingInfo().boundingBox;min=Vector3.Minimize(min,b.minimumWorld);max=Vector3.Maximize(max,b.maximumWorld);}
 const center=min.add(max).scale(.5),height=Math.max(.5,max.y-min.y);const camera=new ArcRotateCamera('camera',Math.PI/2,Math.PI/2.3,height*1.85,center,scene);camera.minZ=.01;camera.attachControl(canvas,true);scene.activeCamera=camera;
 await scene.whenReadyAsync();scene.render();engine.runRenderLoop(()=>scene.render());
 window.proof.push({id:row.id,loaded:true,bounds:{min:min.asArray(),max:max.asArray()},meshes:container.meshes.filter(m=>m.getTotalVertices()).length});
}
window.ready=true;
