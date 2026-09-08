import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import {buildCurrentRequest,validateCurrentResult} from './current-template-client.mjs';import {digest} from './dataset.mjs';
test('review-bound request through real Python preflight; quarantine and drift fail closed',()=>{
 const review={revision:'a'.repeat(40),reviewVersion:4,releaseQualified:false,system:'fixture',rows:[{templateId:'tpl-hit',status:'enabled',sourceSha256:'a'.repeat(64),description:'hit'},{templateId:'tpl-broken',status:'quarantined',sourceSha256:'b'.repeat(64),description:'broken',issue:'#1'}],counts:{total:2,enabled:1,quarantined:1,draft:0}};
 const pin=digest(review),req=buildCurrentRequest(review,{id:'one',request:'「回復所有人」只打一個敵人。'},pin);
 assert(!req.messages[1].content.includes('回復'));assert.equal(req.candidates.length,1);
 const raw={requestDigest:req.requestDigest,value:{decision:'accept',templateId:'tpl-hit'},thinking:false,activation:false,error:null,inputIntegrityVerified:true};
 assert(validateCurrentResult(review,req,raw,pin).pass);assert(!validateCurrentResult(review,req,{...raw,value:{decision:'accept',templateId:'tpl-broken'}},pin).pass);
 assert.throws(()=>buildCurrentRequest({...review,reviewVersion:5},req.input,pin),/REVIEW_CHANGED/);
 assert.throws(()=>validateCurrentResult(review,{...req,candidates:[]},raw,pin),/REQUEST_CHANGED/);
 assert(!validateCurrentResult(review,req,{...raw,value:{...raw.value,params:{}}},pin).pass);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ggd-template-request-')),file=path.join(tmp,'request.json');fs.writeFileSync(file,JSON.stringify(req));
 const modulePath=fileURLToPath(new URL('./classification-predict.py',import.meta.url));
 const code=`import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('predict',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nr=json.load(open(sys.argv[2]));m.validate_request(r)\nr['messages'][1]['content']+=' '\ntry:m.validate_request(r)\nexcept ValueError as e:assert str(e)=='REQUEST_CHANGED'\nelse:raise AssertionError('drift accepted')\nprint('PASS: actual JS request and drift rejection')`;
 const run=spawnSync('python3',['-c',code,modulePath,file],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/PASS/);
});
