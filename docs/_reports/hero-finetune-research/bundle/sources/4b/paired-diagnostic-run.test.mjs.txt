import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest} from './dataset.mjs';
import {validateDiagnostic,requireCompleted} from './paired-diagnostic-run.mjs';

test('diagnostic preflight forbids training, input drift, and exact training requests',()=>{
 const messages=[{role:'user',content:'fixed source'}],c={id:'a',split:'dev',messages,requestDigest:digest(messages)};
 const data=[c],manifest={trainingEligible:false,selectionEligible:false,casesSha256:digest(data)},requests=[{id:c.id,messages,requestDigest:c.requestDigest}];
 const budget={requestsSha256:'hash',allFit:true,thinking:false,count:1,maxSequence:4096,outputReserve:256};
 assert.equal(validateDiagnostic(data,manifest,requests,budget,'hash',[]).count,1);
 assert.throws(()=>validateDiagnostic(data,{...manifest,selectionEligible:true},requests,budget,'hash',[]),/SELECTION_NOT_DIAGNOSTIC/);
 assert.throws(()=>validateDiagnostic(data,manifest,requests,budget,'hash',[c]),/EXACT_TRAIN_REQUEST/);
 assert.throws(()=>validateDiagnostic(data,manifest,[{...requests[0],messages:[]}],budget,'hash',[]),/REQUESTS_CHANGED/);
 const drift=[{...c,messages:[]}];assert.throws(()=>validateDiagnostic(drift,{...manifest,casesSha256:digest(drift)},requests,budget,'hash',[]),/MESSAGE_DIGEST_CHANGED/);
});

test('running core or incomplete post blocks evaluation before a model is read',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forge-paired-diagnostic-test-'));
 fs.writeFileSync(path.join(root,'run-state.json'),JSON.stringify({status:'running'}));
 assert.throws(()=>requireCompleted(root),/CORE_NOT_COMPLETE/);
 fs.writeFileSync(path.join(root,'run-state.json'),JSON.stringify({status:'complete-research-only'}));fs.mkdirSync(path.join(root,'post-diagnostics-v1'));
 fs.writeFileSync(path.join(root,'post-diagnostics-v1/state.json'),JSON.stringify({status:'running'}));assert.throws(()=>requireCompleted(root),/POST_NOT_COMPLETE/);
 // Keep this small fixture as diagnostic evidence; no recursive cleanup target.
});
