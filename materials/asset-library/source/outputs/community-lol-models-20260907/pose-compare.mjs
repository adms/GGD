import fs from 'node:fs/promises';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const repo=process.cwd(),base=process.argv[2]??'/private/tmp/ggd-lol-models';
const req=createRequire(repo+'/apps/editor/package.json');
const {NullEngine,Scene,SceneLoader,FreeCamera,Vector3}=await import(pathToFileURL(req.resolve('@babylonjs/core')));
await import(pathToFileURL(req.resolve('@babylonjs/loaders/glTF/index.js')));
const manifest=JSON.parse(await fs.readFile(base+'/ggd-runtime-candidate-manifest.json','utf8'));
const report={schema:'ggd-lol-pose-comparison@1',method:'Babylon 7.54.3 NullEngine actual skinned vertex positions; 17 evenly spaced samples per retained clip and all 30 ordered distinct-clip transitions per character; no GPU/image or A17 device claim',normalizedMaxThreshold:0.001,models:[]};
async function load(file){const bytes=await fs.readFile(base+'/'+file),engine=new NullEngine({renderWidth:32,renderHeight:32}),scene=new Scene(engine);new FreeCamera('camera',new Vector3(0,1,-5),scene);const c=await SceneLoader.LoadAssetContainerAsync('','data:base64,'+bytes.toString('base64'),scene,undefined,'.glb');c.animationGroups.forEach(g=>g.stop());c.addAllToScene();const meshes=c.meshes.filter(m=>m.getTotalVertices()>0);if(new Set(meshes.map(m=>m.name)).size!==meshes.length)throw Error('duplicate mesh names');return{engine,scene,c,meshes,sha256:createHash('sha256').update(bytes).digest('hex')};}
function start(model,name){model.c.animationGroups.forEach(g=>g.stop());const g=model.c.animationGroups.find(g=>g.name===name);if(!g)throw Error('missing clip '+name);g.start(false,1,g.from,g.to);g.pause();return g;}
function positions(model,g,f){g.goToFrame(g.from+(g.to-g.from)*f);for(const s of model.c.skeletons)s.prepare(true);const out=new Map();for(const m of model.meshes){const matrix=m.computeWorldMatrix(true),v=m.getPositionData(true,true);const values=new Float64Array(v.length);for(let i=0;i<v.length;i+=3){const p=Vector3.TransformCoordinates(new Vector3(v[i],v[i+1],v[i+2]),matrix);values[i]=p.x;values[i+1]=p.y;values[i+2]=p.z;}out.set(m.name,values);}return out;}
function compare(a,b){let max=0,sum=0,n=0;for(const[name,x]of a){const y=b.get(name);if(!y||y.length!==x.length)throw Error('mesh inventory mismatch '+name);for(let i=0;i<x.length;i+=3){const d=(x[i]-y[i])**2+(x[i+1]-y[i+1])**2+(x[i+2]-y[i+2])**2;if(!Number.isFinite(d))throw Error('non-finite pose');sum+=d;max=Math.max(max,Math.sqrt(d));n++;}}return{max,rms:Math.sqrt(sum/n),vertices:n};}
for(const item of manifest.models){
 const source=await load(item.source),target=await load(item.file),names=item.before.map(a=>a.name);
 const idle=names.find(n=>/idle/i.test(n))??names[0],baseline=positions(source,start(source,idle),0);let minY=Infinity,maxY=-Infinity;for(const v of baseline.values())for(let i=1;i<v.length;i+=3){minY=Math.min(minY,v[i]);maxY=Math.max(maxY,v[i]);}const height=maxY-minY;if(!(height>0))throw Error('empty height');
 const clips=[];let movementMax=0;
 for(const name of names){const a=start(source,name),b=start(target,name);const opening=positions(source,a,0);let max=0,rms=0;
  for(let i=0;i<=16;i++){const ap=positions(source,a,i/16),bp=positions(target,b,i/16),diff=compare(ap,bp);max=Math.max(max,diff.max);rms=Math.max(rms,diff.rms);movementMax=Math.max(movementMax,compare(ap,opening).max);}
  clips.push({name,samples:17,max,rms,normalizedMax:max/height});
 }
 const transitions=[];
 for(const from of names)for(const to of names)if(from!==to){positions(source,start(source,from),.73);positions(target,start(target,from),.73);const d=compare(positions(source,start(source,to),.37),positions(target,start(target,to),.37));transitions.push({from,to,...d,normalizedMax:d.max/height});}
 const maxNormalized=Math.max(...clips.map(c=>c.normalizedMax),...transitions.map(t=>t.normalizedMax));
 const row={character:item.character,source:item.source,sourceSha256:source.sha256,target:item.file,targetSha256:target.sha256,height,movementMax,clips,transitions,maxNormalized,pass:maxNormalized<=report.normalizedMaxThreshold&&movementMax>height*.01};report.models.push(row);console.log(JSON.stringify({character:row.character,maxNormalized,movementMax,pass:row.pass}));
 for(const m of[source,target]){m.c.dispose();m.scene.dispose();m.engine.dispose();}await fs.writeFile(base+'/pose-compare.json',JSON.stringify(report,null,2)+'\n');
}
if(report.models.some(m=>!m.pass))process.exitCode=1;
