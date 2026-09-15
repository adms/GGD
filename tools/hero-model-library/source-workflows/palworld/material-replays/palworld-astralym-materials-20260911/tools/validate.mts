import{readFileSync,writeFileSync}from'node:fs';import{resolve,join}from'node:path';import{createRequire}from'node:module';
const [r,o]=process.argv.slice(2),repo=resolve(r),out=resolve(o),file=join(out,'astralym-material-bound.glb'),bytes=new Uint8Array(readFileSync(file));
const validator=createRequire(join(repo,'packages/shared/package.json'))('gltf-validator');
const full=await validator.validateBytes(bytes,{uri:file,maxIssues:0,writeTimestamp:false,externalResourceFunction:async()=>{throw Error('External resources forbidden')}});
writeFileSync(join(out,'validation/khronos-full.json'),JSON.stringify(full,null,2)+'\n',{flag:'wx'});
let shared:any;try{const {inspectModelUpload}=await import(join(repo,'packages/shared/src/content/modelUpload/inspect.ts'));const p=await inspectModelUpload(bytes);shared={status:'completed',inspection:p};}catch(e){shared={status:'failed',error:String(e),stack:e instanceof Error?e.stack:undefined};}
writeFileSync(join(out,'validation/ggd-inspect.json'),JSON.stringify(shared,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({khronos:full.issues,sharedStatus:shared.status,sharedError:shared.error,metrics:shared.inspection?{triangles:shared.inspection.triangles,meshes:shared.inspection.meshes,textures:shared.inspection.textures,clips:shared.inspection.clips?.length}:null},null,2));
