import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {digest} from './dataset.mjs';import {fileHash} from './precision-diagnostic.mjs';
import {buildCompositionRequest,validateCompositionResult,validateCompositionValue} from './composition-client.mjs';import {preflight} from './composition-predict.mjs';

const catalog={schema:'ggd-reviewed-composition-catalog@1',revision:'a'.repeat(40),reviewSha256:'b'.repeat(64),runtimeProbeSha256:'c'.repeat(64),system:'Return the given JSON contract only.',releaseQualified:false,unavailable:[{templateId:'tpl-unavailable',status:'quarantined'}],allowedPlans:[{id:'double',templateIds:['tpl-single-strike','tpl-single-strike'],equivalentOrders:[],description:'Two immediate hits.',requiredChoices:['Two hits are intentional.']},{id:'self',templateIds:['tpl-buff-self','tpl-life-manipulate'],equivalentOrders:[['tpl-life-manipulate','tpl-buff-self']],description:'Self buff and self restore.',requiredChoices:['Use self restore.']}]};
test('public composition contract preserves repeats and rejects injected params or changed source',()=>{
 const request=buildCompositionRequest(catalog,{id:'manual-example',request:'「我打你一百次」 實際需求是同次施法打兩筆傷害。'},digest(catalog));
 assert(!JSON.parse(request.messages[1].content).request.includes('一百次'));
 const value={decision:'accept',templateIds:['tpl-single-strike','tpl-single-strike'],onConflict:'reject'};
 const raw={complete:true,metadata:{thinking:false},results:[{id:request.id,requestDigest:request.requestDigest,error:null,value}]};
 const checked=validateCompositionResult(catalog,request,raw,digest(catalog));assert.equal(checked.pass,true);assert.deepEqual(checked.templateIds,value.templateIds);assert.equal(checked.semanticQualified,false);assert.equal(checked.activation,false);
 assert.equal(validateCompositionValue(catalog,{...value,params:{damage:999}}).pass,false);
 assert.equal(validateCompositionValue(catalog,{...value,templateIds:['tpl-unavailable']}).pass,false);
 assert.equal(validateCompositionValue(catalog,{...value,templateIds:['tpl-single-strike']}).pass,false);
 assert.equal(validateCompositionValue(catalog,{...value,onConflict:'lastWins'}).pass,false);
 assert.throws(()=>buildCompositionRequest({...catalog,system:'changed'},request.input,digest(catalog)),/CATALOG_CHANGED/);
 const drift=structuredClone(request);drift.messages[1].content='{}';assert.throws(()=>validateCompositionResult(catalog,drift,raw,digest(catalog)),/REQUEST_CHANGED/);
 assert.throws(()=>validateCompositionResult(catalog,request,{...raw,complete:false},digest(catalog)),/INCOMPLETE_INFERENCE/);
});
test('busy GPU fails before output creation or a GPU child; fixture weights are not an ML model',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forge-composition-client-test-')),runtime=path.join(root,'runtime'),adapter=path.join(root,'adapter');fs.mkdirSync(runtime);fs.mkdirSync(adapter);
 const save=(name,data)=>{const p=path.join(root,name);fs.writeFileSync(p,JSON.stringify(data));return p;};
 const cat=save('catalog.json',catalog),input=save('input.json',{id:'test',request:'two hits'});fs.writeFileSync(path.join(adapter,'adapters.safetensors'),'CPU fixture only');
 const native=save('native.json',{base:path.join(root,'not-loaded'),adapter,adapterSha256:fileHash(path.join(adapter,'adapters.safetensors'))});fs.writeFileSync(path.join(runtime,'gpu.lock'),'fixture lock');
 const out=path.join(root,'output');assert.throws(()=>preflight(cat,digest(catalog),input,native,runtime,out),/GPU_BUSY/);assert(!fs.existsSync(out));
});
