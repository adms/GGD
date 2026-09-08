// Real CLI integration probes, synthetic cache receipts, CPU-only failing worker.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {digest,writeJSON} from './dataset.mjs';
const source=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),here=path.dirname(fileURLToPath(import.meta.url));
if(fs.existsSync(out))throw Error('REFUSE_OVERWRITE');
fs.mkdirSync(out,{recursive:true});
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const originalStateHash=hash(path.join(source,'state.json'));
const core=['cli.mjs','dataset.mjs','scorer.mjs','engine.ts','worker.py','input-integrity.mjs'].map(n=>({path:path.join(here,n),sha256:hash(path.join(here,n))}));
const sourceDigest=digest(core),results=[];
for(const name of ['valid-cache','changed-train','changed-test-request','changed-cases','changed-policy','changed-artifact','changed-source']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forge-cache-probe-')),runtime=path.join(root,'runtime');
 for(const file of ['experiment-policy.json','dataset-manifest.json','cases.private.json','train.jsonl','train-requests.json','dev-requests.json','test-requests.json'])fs.copyFileSync(path.join(source,file),path.join(root,file));
 const policyFile=path.join(root,'experiment-policy.json'),policyDigest=hash(policyFile),cached=path.join(root,'cached-result.json');
 writeJSON(cached,{fixtureOnly:true,status:'pass'});
 const state={schema:'ggd-forge-run@1',status:'pending',startedAt:read(policyFile).startedAt,sourceDigest,policyDigest,stages:{preflight:{status:'succeeded',sourceDigest,policyDigest,output:cached,artifacts:[{path:cached,sha256:hash(cached)}]}}};
 if(name==='changed-train')fs.appendFileSync(path.join(root,'train.jsonl'),'{}\n');
 if(name==='changed-test-request'){const p=path.join(root,'test-requests.json'),rows=read(p);rows[0].messages[1].content+=' altered';writeJSON(p,rows);}
 if(name==='changed-cases'){const p=path.join(root,'cases.private.json'),rows=read(p);rows[0].spec.damage+=1;writeJSON(p,rows);}
 if(name==='changed-policy'){const p=read(policyFile);p.seed+=1;writeJSON(policyFile,p);}
 if(name==='changed-artifact')writeJSON(cached,{fixtureOnly:true,status:'changed'});
 if(name==='changed-source')state.sourceDigest='0'.repeat(64);
 writeJSON(path.join(root,'state.json'),state);
 const started=performance.now();
 const child=spawnSync(process.execPath,[path.join(here,'cli.mjs'),'resume','--root',root,'--python','/usr/bin/false','--model-receipt',path.join(source,'model-download.json'),'--runtime-root',runtime],{encoding:'utf8',timeout:60000});
 const final=read(path.join(root,'state.json')),expected={'valid-cache':'CHILD_EXIT:1','changed-train':'DATA_EXPORT_DRIFT:train','changed-test-request':'DATA_EXPORT_DRIFT:test-requests','changed-cases':'DATASET_DRIFT','changed-policy':'STALE_STAGE:preflight','changed-artifact':'STALE_STAGE:preflight','changed-source':'SOURCE_CHANGED_USE_NEW_RUN'}[name];
 writeJSON(path.join(out,name+'.json'),{root,expected,actual:final.error,exitCode:child.status,signal:child.signal,error:child.error?.message??null,seconds:(performance.now()-started)/1000,stdout:child.stdout,stderr:child.stderr});
 assert.equal(child.status,2,child.error?.message??child.stderr);assert(final.error.includes(expected),final.error);
 assert.equal(Boolean(final.stages.doctor),name==='valid-cache');assert(!fs.existsSync(path.join(runtime,'gpu.lock')));
 if(fs.existsSync(path.join(root,'worker-lease.json')))assert.equal(read(path.join(root,'worker-lease.json')).pid,null);
 results.push({name,pass:true,expected,error:final.error,root,stdout:child.stdout,stderr:child.stderr,exitCode:child.status});
}
assert.equal(hash(path.join(source,'state.json')),originalStateHash);
writeJSON(path.join(out,'results.json'),{status:'pass',fixtureOnly:true,sourceDigest,core,originalStateUnchanged:true,gpuWorker:'/usr/bin/false; no MLX launched',results});
console.log(JSON.stringify({status:'pass',cases:results.length,output:path.join(out,'results.json')}));
