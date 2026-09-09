import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {linkDependencies,roundtrip,run} from './hero-distillation-import-roundtrip.mts';
import {assetReader} from './hero-distillation-package-admission.mts';

const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ggd-import-roundtrip-test-'));
const put=(file:string,value:any)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));};

test('dependency aliases stay inside the pinned source, not the supplied workspace',()=>{
  const dir=temp();
  try{
    const root=path.join(dir,'source'),api=path.join(dir,'api'),shared=path.join(dir,'deps');
    for(const p of [root,api,shared])fs.mkdirSync(p);
    put(path.join(root,'packages/shared/package.json'),{name:'@ggd/shared'});
    put(path.join(api,'@ggd/shared/package.json'),{name:'wrong-workspace'});
    put(path.join(api,'zod/package.json'),{version:'3.0'});
    put(path.join(shared,'zod/package.json'),{version:'3.0'});
    const versions=linkDependencies(root,api,shared);
    assert.equal(versions.zod.version,'3.0');
    assert.equal(fs.realpathSync(path.join(root,'node_modules/@ggd/shared')),fs.realpathSync(path.join(root,'packages/shared')));
  }finally{fs.rmSync(dir,{recursive:true});}
});

test('different shared library versions are not silently chosen',()=>{
  const dir=temp();
  try{
    for(const part of ['source','api','deps'])fs.mkdirSync(path.join(dir,part));
    put(path.join(dir,'api/zod/package.json'),{version:'3.0'});
    put(path.join(dir,'deps/zod/package.json'),{version:'4.0'});
    assert.throws(()=>linkDependencies(path.join(dir,'source'),path.join(dir,'api'),path.join(dir,'deps')),/DEPENDENCY_VERSION_CONFLICT/);
  }finally{fs.rmSync(dir,{recursive:true});}
});

function fake(project:any,changed?:string){
  const bytes=new Uint8Array([1,2,3]),calls:string[]=[];
  return {calls,model:{},target:{},source:{buildHeroSourcePackage:()=>({})},
    zip:{packageZipInput:()=>({}),buildRuntimePackageZip:async()=>({bytes})},
    reader:{readPackageZip:()=>({manifest:{packageDigest:'digest'},compiled:[{}],validation:[{}],
      documents:[{path:'authoring/hero-projects/hero.json',document:project}],assets:[]})},
    request:async(route:string)=>{
      calls.push(route);
      if(route==='/hero-package')return {arrayBuffer:async()=>bytes};
      if(route==='/inspect-hero-package')return {json:async()=>({packageDigest:'digest'})};
      if(route==='/prepare-work')return {json:async()=>({status:'stored',version:{versionId:'v1'}})};
      if(route.endsWith('/package'))return {arrayBuffer:async()=>changed==='archive'?new Uint8Array([9]):bytes};
      return {json:async()=>({project:changed==='source'?{...project,other:true}:project})};
    }};
}

test('roundtrip uses real response equality before writing a success artifact',async()=>{
  const dir=temp(),project={projectId:'hero',presentation:{}};
  try{
    const service=fake(project),out=path.join(dir,'case');
    const result=await roundtrip(service,project,assetReader([dir]),out);
    assert.equal(result.downloadIdentical,true);assert.equal(result.sourceUnchanged,true);
    assert.equal(service.calls.length,5);
    assert(fs.existsSync(path.join(out,'hero.zip')));
  }finally{fs.rmSync(dir,{recursive:true});}
});

test('changed source or downloaded bytes cannot receive a success artifact',async()=>{
  const dir=temp(),project={projectId:'hero',presentation:{}};
  try{
    for(const changed of ['source','archive']){
      const out=path.join(dir,changed);
      await assert.rejects(()=>roundtrip(fake(project,changed),project,assetReader([dir]),out),
        changed==='source'?/IMPORTED_SOURCE_CHANGED/:/DOWNLOADED_ARCHIVE_CHANGED/);
      assert(!fs.existsSync(out));
    }
  }finally{fs.rmSync(dir,{recursive:true});}
});

test('native/blocked rows stay in denominator without starting any service',async()=>{
  const dir=temp();
  try{
    const input=path.join(dir,'input'),out=path.join(dir,'output');
    put(path.join(input,'report.json'),{schema:'ggd-distillation-package-admission@1',counts:{wholeHeroes:2},rows:[
      {id:'native',packageAdmissionPassed:false,status:'native-import-bridge-pending'},
      {id:'broken',packageAdmissionPassed:false,status:'blocked-by-structural-generation'}]});
    const result=await run({admitted:input,out});
    assert.equal(result.counts.wholeHeroes,2);assert.equal(result.counts.liveImportPassed,0);
    assert.equal(result.fullHeroE2EProven,false);assert.deepEqual(result.services,{});
    await assert.rejects(()=>run({admitted:input,out}),/REFUSE_OVERWRITE_OR_RETRY/);
  }finally{fs.rmSync(dir,{recursive:true});}
});

test('artifact hash drift is rejected before engine or network access',async()=>{
  const dir=temp();
  try{
    const input=path.join(dir,'input');
    put(path.join(input,'case-0000.json'),{project:{}});
    put(path.join(input,'report.json'),{schema:'ggd-distillation-package-admission@1',counts:{wholeHeroes:1},rows:[
      {id:'x',packageAdmissionPassed:true,artifact:'case-0000.json',artifactSha256:createHash('sha256').update('different').digest('hex')}]});
    const result=await run({admitted:input,out:path.join(dir,'out')});
    assert.equal(result.counts.failed,1);assert.match(result.rows[0].error,/ARTIFACT_DRIFT/);
    assert.deepEqual(result.services,{});
  }finally{fs.rmSync(dir,{recursive:true});}
});
