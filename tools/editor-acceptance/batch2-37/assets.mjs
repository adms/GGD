import { register } from 'tsx/esm/api';
register();
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const states=['idle','run','attack','cast','hurt','death'];
const imported=Promise.all(['glb.ts','heroModel.ts'].map(file=>import(resolve(root,'packages/shared/src/content/modelUpload',file))));

// Original GGD geometry authored here, with no external meshes or textures.
// Vertex colours keep the full vehicle within the existing five-mesh budget.
function trainGeometry(encodeUploadGlb) {
  const json={asset:{version:'2.0',generator:'GGD batch2 original Kisaragi tram v2'},scene:0,scenes:[{nodes:[0]}],
    buffers:[{byteLength:0}],bufferViews:[],accessors:[],meshes:[],nodes:[{name:'TramRoot',children:[1,2,3,4,5]}],
    materials:[{name:'Original vertex colours',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:0.8}}],animations:[]};
  const chunks=[];let total=0;
  const accessor=(values,type,target,minmax=false)=>{
    const bytes=Buffer.from(new Float32Array(values).buffer),width={SCALAR:1,VEC3:3,VEC4:4}[type],view=json.bufferViews.length;
    json.bufferViews.push({buffer:0,byteOffset:total,byteLength:bytes.length,...(target?{target}:{})});chunks.push(bytes);total+=bytes.length;
    const a={bufferView:view,componentType:5126,count:values.length/width,type};
    if(minmax){a.min=Array.from({length:width},(_,i)=>Math.min(...values.filter((_,k)=>k%width===i)));a.max=Array.from({length:width},(_,i)=>Math.max(...values.filter((_,k)=>k%width===i)));}
    json.accessors.push(a);return json.accessors.length-1;
  };
  const white=[0.79,0.86,0.81],green=[0.08,0.39,0.28],glass=[0.025,0.105,0.13],metal=[0.12,0.15,0.17],lamp=[1,0.84,0.32],red=[0.68,0.08,0.05];
  const mesh=(name,translation,build)=>{
    const p=[],n=[],c=[];
    const triangle=(a,b,d,color)=>{const u=b.map((x,i)=>x-a[i]),v=d.map((x,i)=>x-a[i]);const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);for(const point of [a,b,d]){p.push(...point);n.push(...normal.map(x=>x/length));c.push(...color);}};
    const box=(center,size,color)=>{
      const q=Array.from({length:8},(_,i)=>center.map((x,k)=>x+size[k]*((i>>k)&1?0.5:-0.5)));
      for(const [a,b,d,e] of [[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]]){triangle(q[a],q[b],q[d],color);triangle(q[a],q[d],q[e],color);}
    };
    const wheel=(x,z)=>{const sides=12,r=0.23,width=0.12;for(let i=0;i<sides;i++){const a=i/sides*2*Math.PI,b=(i+1)/sides*2*Math.PI;const pt=(xx,t)=>[xx,Math.cos(t)*r,Math.sin(t)*r+z];const q=[pt(x-width/2,a),pt(x+width/2,a),pt(x+width/2,b),pt(x-width/2,b)];triangle(q[0],q[1],q[2],metal);triangle(q[0],q[2],q[3],metal);triangle([x-width/2,0,z],q[0],q[3],metal);triangle([x+width/2,0,z],q[2],q[1],metal);}box([x,0,z],[width+0.01,0.07,0.24],white);};
    build(box,wheel);json.meshes.push({name,primitives:[{attributes:{POSITION:accessor(p,'VEC3',34962,true),NORMAL:accessor(n,'VEC3',34962),COLOR_0:accessor(c,'VEC3',34962)},material:0,mode:4}]});
    json.nodes.push({name,mesh:json.meshes.length-1,translation});
  };
  mesh('TramCarriage',[0,0,0],box=>{
    box([0,0.52,0],[1.31,0.22,3.22],metal);box([0,1.02,0],[1.35,0.85,3.25],white);box([0,1.16,0],[1.37,0.18,3.27],green);
    box([0,1.52,0],[1.40,0.18,3.31],green);box([0,1.64,0],[0.75,0.08,1.55],metal);
    for(const x of [-0.35,0.35])box([x,1.31,1.636],[0.58,0.42,0.03],glass);
    box([0,1.03,1.645],[0.83,0.18,0.025],green);box([0,0.48,1.70],[1.10,0.12,0.15],metal);
    for(const x of [-0.47,0.47]){box([x,0.88,1.642],[0.18,0.14,0.025],lamp);box([x,0.88,-1.642],[0.16,0.10,0.025],red);}
    for(const side of [-1,1])for(const z of [-1.22,-0.75,0.75,1.22])box([side*0.687,1.29,z],[0.028,0.31,0.35],glass);
    for(const side of [-1,1])box([side*0.689,1.02,0],[0.010,0.85,0.61],glass);
    box([0,1.31,-1.637],[1.08,0.31,0.025],glass);
    box([0,1.77,0],[0.95,0.07,0.07],metal);for(const x of [-0.34,0.34])box([x,1.69,0],[0.05,0.16,0.08],metal);
  });
  for(const side of [-1,1])mesh(side<0?'LeftPassengerDoor':'RightPassengerDoor',[side*0.701,0,0],box=>{box([0,1.02,0],[0.025,0.85,0.61],green);box([side*0.017,1.24,0],[0.018,0.31,0.42],glass);box([side*0.02,0.99,0],[0.020,0.8,0.025],metal);});
  for(const z of [-1.10,1.10])mesh(z<0?'RearWheelPair':'FrontWheelPair',[0,0.25,z],(box,wheel)=>{box([0,0,0],[1.13,0.11,0.11],metal);for(const x of [-0.59,0.59])wheel(x,0);});
  const addClip=(name,seconds,channels)=>{
    const input=accessor([0,seconds/4,seconds/2,seconds*3/4,seconds],'SCALAR',undefined,true),samplers=[],targets=[];
    for(const [node,path,values] of channels){const output=accessor(values.flat(),path==='rotation'?'VEC4':'VEC3');targets.push({sampler:samplers.length,target:{node,path}});samplers.push({input,output,interpolation:'LINEAR'});}
    json.animations.push({name,channels:targets,samplers});
  };
  const ry=a=>[0,Math.sin(a/2),0,Math.cos(a/2)],rx=a=>[Math.sin(a/2),0,0,Math.cos(a/2)],rz=a=>[0,0,Math.sin(a/2),Math.cos(a/2)];
  addClip('idle',2,[[0,'translation',[[0,0,0],[0,0.015,0],[0,0,0],[0,-0.008,0],[0,0,0]]]]);
  addClip('run',0.8,[[0,'rotation',[0,0.025,0,-0.025,0].map(rz)],[4,'rotation',[0,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*2].map(rx)],[5,'rotation',[0,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*2].map(rx)]]);
  addClip('attack',0.5,[[0,'translation',[[0,0,0],[0,0,-0.12],[0,0,0.35],[0,0,0.13],[0,0,0]]]]);
  addClip('cast',1.2,[[2,'translation',[[-0.701,0,0],[-0.701,0,-0.55],[-0.701,0,-0.55],[-0.701,0,-0.30],[-0.701,0,0]]],[3,'translation',[[0.701,0,0],[0.701,0,0.55],[0.701,0,0.55],[0.701,0,0.30],[0.701,0,0]]]]);
  addClip('hurt',0.45,[[0,'rotation',[0,0.12,-0.09,0.04,0].map(ry)]]);
  addClip('death',1.8,[[0,'rotation',[0,-0.15,-0.55,-1.0,-1.2].map(rz)],[0,'translation',[[0,0,0],[0,0,0],[0.1,-0.08,0],[0.3,-0.10,0],[0.4,-0.12,0]]]]);
  return encodeUploadGlb(json,new Uint8Array(Buffer.concat(chunks)));
}

let trainPromise;
export function kisaragiAsset(){return trainPromise??=(async()=>{
  const [glb,modelApi]=await imported,source=trainGeometry(glb.encodeUploadGlb);
  const prepared=await modelApi.prepareUploadedHeroModel(source,Object.fromEntries(states.map((s,i)=>[s,i])));
  // Reverify the RECEIVED normalized bytes; descriptor metadata is never approval.
  const verified=await modelApi.verifyUploadedHeroModel(prepared.model,prepared.bytes);
  assert.equal(verified.inspected.report.issues.numErrors,0);
  const motion=verified.inspected.json.animations.map(clip=>({name:clip.name,channels:clip.channels.map(channel=>{
    const values=[...glb.readFloatAccessor(verified.inspected.json,verified.inspected.bin,clip.samplers[channel.sampler].output)],width=channel.target.path==='rotation'?4:3;
    const moving=values.slice(width).some((x,i)=>Math.abs(x-values[i%width])>1e-5);assert(moving,`EMPTY_ANIMATION:${clip.name}`);return {node:verified.inspected.json.nodes[channel.target.node].name,path:channel.target.path,moving};
  })}));
  const dir=resolve(here,'assets');mkdirSync(dir,{recursive:true});
  const sourcePath=resolve(dir,'kisaragi-tram.source.glb'),normalizedPath=resolve(dir,prepared.model.sha256+'.glb');
  writeFileSync(sourcePath,source);writeFileSync(normalizedPath,prepared.bytes);
  const metadata={schema:'ggd-batch2-original-asset@1',id:'b2-kisaragi-tram',source:{path:'tools/editor-acceptance/batch2-37/assets/kisaragi-tram.source.glb',sha256:sha(source),bytes:source.length,authoringSource:'tools/editor-acceptance/batch2-37/assets.mjs',origin:'Original procedural commuter-tram geometry authored for this GGD evaluation; no imported mesh or textures.'},
    normalized:{path:'tools/editor-acceptance/batch2-37/assets/'+prepared.model.sha256+'.glb',sha256:prepared.model.sha256,bytes:prepared.bytes.length},document:prepared.document,model:prepared.model,
    verification:{method:'prepareUploadedHeroModel -> verifyUploadedHeroModel from real bytes; Khronos gltf-validator',validator:verified.inspected.report,triangles:verified.inspected.triangles,meshes:verified.inspected.meshes,textures:verified.inspected.textures,clips:verified.inspected.clips,motion,warnings:verified.warnings},
    limits:['Offline model and byte validation only; deployed importer, game rendering and arena play have not been tested.','Long tram mesh retains the existing uploaded-body collision radius of 0.6 and shared height normalization; visual-to-hitbox fit needs game review.','This is an original GGD tram, not a model extracted from the Kisaragi Station story.']};
  writeFileSync(resolve(dir,'kisaragi-tram.json'),JSON.stringify(metadata,null,2)+'\n');
  return {source,bytes:prepared.bytes,sourcePath,normalizedPath,verified,metadata};
})();}

export async function applyHeroAssets(presentation,heroId) {
  if(heroId!=='b2-kisaragi')return {key:presentation.modelKey,kind:'explicit-proxy',characterAppearanceVerified:false,liveGameVerified:false,icons:'generic-ui-fallback-no-original-character-icons'};
  const a=await kisaragiAsset();presentation.modelKey=a.verified.document.id;presentation.uploadedModel=a.verified.model;
  presentation.modelProvenance={schema:'ggd-hero-model-provenance@1',modelSha256:a.verified.model.sha256,sourceAssetId:'ggd.batch2.original-kisaragi-tram',sourceCharacter:'如月電車',sourceWork:'GGD 原創改編',relationship:'exact',notes:'Original procedural tram geometry, animated wheels, sliding doors and six runtime states. Offline byte validation is recorded separately; no production import or game-play receipt.'};
  presentation.assetLocks=[{kind:'model',registry:'normalized-upload',path:a.verified.document.glbPath,byteSize:a.bytes.length,mediaType:'model/gltf-binary',sha256:a.verified.model.sha256,consumers:['champion:model']}];
  return {key:presentation.modelKey,kind:'original-tram-body',characterAppearanceVerified:true,appearanceVerification:'structural-tram-geometry-and-offline-render; no live-game receipt',liveGameVerified:false,metadata:'tools/editor-acceptance/batch2-37/assets/kisaragi-tram.json',sha256:a.verified.model.sha256,icons:'generic-ui-fallback-no-original-character-icons'};
}

export async function verifyProjectUploadedBody(project,documents) {
  if(!project.presentation.uploadedModel)return null;
  const a=await kisaragiAsset(),[,modelApi]=await imported;
  assert.equal(project.projectId,'b2-kisaragi','UNEXPECTED_UPLOADED_BODY');
  const bytes=new Uint8Array(readFileSync(a.normalizedPath));
  const verified=await modelApi.verifyUploadedHeroModel(project.presentation.uploadedModel,bytes);
  assert.equal(project.presentation.modelKey,verified.document.id,'MODEL_KEY_MISMATCH');
  documents.set(`models/${verified.document.id}`,verified.document);
  return {projectId:project.projectId,model:verified.model,document:verified.document,bytes,path:a.normalizedPath,metadata:a.metadata};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const a=await kisaragiAsset();console.log(JSON.stringify(a.metadata,null,2));
}
