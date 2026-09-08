import fs from'node:fs';import os from'node:os';import path from'node:path';import assert from'node:assert/strict';import test from'node:test';import{fileURLToPath,pathToFileURL}from'node:url';
import{prepare,validate}from'./research-inference-v2.mjs';import{digest,mechanicsText}from'./dataset.mjs';import{fileHash}from'./precision-diagnostic.mjs';
const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),outputs=path.join(workspace,'outputs'),kit=path.join(outputs,'forge-final-three-hours-20260906/portable-contract-kit-v2'),code=path.join(kit,'code'),portable=await import(pathToFileURL(path.join(code,'research-inference-v2.mjs'))),tiny=await import(pathToFileURL(path.join(code,'dataset.mjs'))),read=p=>JSON.parse(fs.readFileSync(p));
test('portable public-only facades preserve exact prompts and validation for all five entry kinds',()=>{
 const root=path.join(outputs,'forge-low-lr-r7-v2-20260906/manual-entry-v1'),ids=read(path.join(root,'preparation.json')).ids,kinds=new Set();
 for(const id of ids){const spec=read(path.join(root,id+'.json')),a=prepare(spec),b=portable.prepare(spec);assert.deepEqual(b,a);kinds.add(spec.kind);
  const value=spec.kind==='stack'?{decision:'refuse',templateIds:[],onConflict:'reject'}:spec.kind==='vfx'?{decision:'refuse',suggestedTemplateIds:[],reasonCode:'no-supported-template'}:spec.kind==='single'?{decision:'refuse',templateId:null}:{verdict:'not-stated'};
  const raw={complete:true,metadata:{thinking:false},results:a.requests.map(r=>({id:r.id,requestDigest:r.requestDigest,error:null,value,seconds:0}))};assert.deepEqual(portable.validate(spec,b,raw),validate(spec,a,raw));
 }
 assert.equal(kinds.size,5);assert.equal(tiny.digest({中文:'測試'}),digest({中文:'測試'}));assert.equal(tiny.mechanicsText('「一「二」三」主文'),mechanicsText('「一「二」三」主文'));
 assert.throws(()=>tiny.mechanicsText('「未閉合'));assert(!fs.existsSync(path.join(code,'r3-owner-review.mjs')));
});
test('portable bundle rejects tampered model bytes and refuses a busy GPU before loading',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ggd-portable-contract-fixture-'));fs.cpSync(code,path.join(root,'code'),{recursive:true});fs.mkdirSync(path.join(root,'models'));fs.mkdirSync(path.join(root,'models/fake'));fs.writeFileSync(path.join(root,'models/fake/config.json'),'{}');fs.writeFileSync(path.join(root,'models/fake/model.safetensors'),'CPU FIXTURE ONLY - NOT WEIGHTS');
 const files=fs.readdirSync(root,{recursive:true}).filter(p=>fs.statSync(path.join(root,p)).isFile()).map(p=>({path:p.split(path.sep).join('/'),bytes:fs.statSync(path.join(root,p)).size,sha256:fileHash(path.join(root,p))}));
 fs.writeFileSync(path.join(root,'MODEL_BUNDLE.json'),JSON.stringify({schema:'ggd-mac-model-bundle@1',releaseQualified:false,thinking:false,decoding:{presencePenalty:0},files,variants:{fixture:{model:'models/fake',adapter:null}}}));const entry=await import(pathToFileURL(path.join(root,'code/run.mjs')));
 assert(entry.verifyBundle(root,'fixture'));assert.throws(()=>entry.contained(root,'../outside'),/BUNDLE_PATH_ESCAPE/);fs.writeFileSync(path.join(root,'models/fake/model.safetensors'),'TAMPERED');assert.throws(()=>entry.verifyBundle(root,'fixture'));
 const runtime=path.join(root,'runtime');fs.mkdirSync(runtime);fs.writeFileSync(path.join(runtime,'gpu.lock'),'CPU fixture');await assert.rejects(entry.infer(root,path.join(root,'unused-spec.json'),'/not-executed-python',runtime,path.join(root,'no-output'),'fixture'),/GPU_BUSY/);assert(!fs.existsSync(path.join(root,'no-output')));
});
