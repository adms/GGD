import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {digest,writeJSON,mechanicsText} from './dataset.mjs';
import {score} from './scorer.mjs';
const root=path.resolve(process.argv[2]);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const state=read(path.join(root,'state.json')),cases=read(path.join(root,'cases.private.json'));
assert.equal(state.status,'pipeline-complete-unqualified');
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const snapshot=read(path.join(root,'engine-snapshot.json'));
for(const f of snapshot.files)assert.equal(hash(path.join(repo,f.path)),f.sha256,f.path);
const exported=fs.readFileSync(path.join(root,'train.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
for(const c of cases){assert.equal(digest(c.request),c.source.ownerTextSha256);assert.equal(c.mechanicsText,mechanicsText(c.request));assert.equal(JSON.parse(c.messages[1].content).request,c.mechanicsText);assert(!/[「」]/.test(JSON.stringify(c.messages)));}
assert.deepEqual(exported,cases.filter(c=>c.split==='train').map(c=>({id:c.id,messages:c.messages,target:c.target})));
for(const split of ['train','dev','test'])assert.deepEqual(read(path.join(root,split+'-requests.json')),cases.filter(c=>c.split===split).map(({id,requestDigest,messages})=>({id,requestDigest,messages})));
let stageFiles=0,externalFiles=0;
for(const stage of Object.values(state.stages)){
 assert.equal(stage.status,'succeeded');
 for(const f of stage.artifacts){assert.equal(hash(f.path),f.sha256,f.path);stageFiles++;}
 const result=read(stage.output);
 for(const f of result.externalArtifacts??[]){assert.equal(hash(f.path),f.sha256,f.path);externalFiles++;}
}
const frozen=read(state.stages.freeze.output);
assert.equal(hash(path.join(root,'test-requests.json')),frozen.requestHash);
assert.equal(hash(path.join(root,'cases.private.json')),frozen.casesHash);
for(const f of frozen.adapterArtifacts)assert.equal(hash(f.path),f.sha256);
const a=read(state.stages['test-A'].output),b=read(state.stages['test-B'].output);
const requests=read(path.join(root,'test-requests.json'));
assert(a.complete&&b.complete);assert.equal(a.results.length,48);assert.equal(b.results.length,48);
assert.equal(a.metadata.adapter,null);assert.equal(b.metadata.adapter,frozen.candidate.adapter);
assert.deepEqual(a.metadata.versions,b.metadata.versions);
assert.equal(a.metadata.modelPath,b.metadata.modelPath);
assert.equal(a.metadata.thinking,false);assert.equal(b.metadata.thinking,false);
const comparison=read(path.join(root,'comparison.json'));
let replayed=0;
for(let i=0;i<48;i++){
 const ar=a.results[i],br=b.results[i],request=requests[i],c=cases.find(c=>c.id===request.id);
 assert.equal(ar.id,request.id);assert.equal(br.id,request.id);assert.equal(ar.seed,br.seed);
 assert.equal(request.requestDigest,digest(request.messages));
 assert.equal(ar.requestDigest,request.requestDigest);assert.equal(br.requestDigest,request.requestDigest);
 const {score:ascore,...recordedA}=comparison.rows[i].A,{score:bscore,...recordedB}=comparison.rows[i].B;
 assert.deepEqual(recordedA,ar);assert.deepEqual(recordedB,br);
 assert.deepEqual(score(c,ar.value),comparison.rows[i].A.score);
 assert.deepEqual(score(c,br.value),comparison.rows[i].B.score);replayed+=2;
 assert(c.retrievalIds.every(id=>cases.find(x=>x.id===id).split==='train'));
}
const sanity=read(state.stages['learning-sanity'].output),formal=read(state.stages.train.output);
assert(sanity.adapterChanged&&formal.adapterChanged);
assert(sanity.gradientsFinite&&formal.gradientsFinite);
assert(sanity.afterProbeLoss<sanity.beforeProbeLoss);
assert.notEqual(sanity.adapterPath,formal.adapterPath);
assert.equal(formal.adapter,null);
assert.equal(read(path.join(root,'worker-lease.json')).pid,null);
assert(!fs.existsSync(path.join(state.runtimeRoot,'gpu.lock')));
const result={status:'pass',stageFiles,externalFiles,engineFiles:snapshot.files.length,datasetExportsMatch:true,pairedRequests:48,scoreReplays:replayed,selectedAdapterHashVerified:true,cleanFormalStart:true,trainOnlyRetrieval:true,noManagedWorkerLease:true,qualification:'synthetic-diagnostic-only',releaseQualified:false};
writeJSON(path.join(root,'integrity-audit.json'),result);console.log(JSON.stringify(result,null,2));
