import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));
const sha=x=>createHash('sha256').update(x).digest('hex'),read=f=>JSON.parse(fs.readFileSync(path.join(here,f),'utf8'));
const m=read('ir5-data-stage-v1/manifest.json'),data=read('ir5-data-stage-v1/dataset.private.json'),cases=read('ir5-data-stage-v1/cases.private.json'),neg=read('ir5-data-stage-v1/negative.private.json');
assert.equal(sha(JSON.stringify(data)),m.datasetSha256);assert.equal(sha(JSON.stringify(cases)),m.casesSha256);assert.equal(sha(JSON.stringify(neg)),m.negativeSha256);
for(const [f,h] of Object.entries(m.checkerPins)){assert.equal(sha(fs.readFileSync(path.join(here,f))),h);
  assert.equal(sha(fs.readFileSync(path.join(here,'isolated-engine-v1/outputs/hero-forge-12b-restart-20260908',f))),h);}
assert.equal(m.behavior.passed,252);assert.equal(m.behavior.total,252);assert.equal(m.policy.passed,28);assert.equal(m.policy.total,28);
assert.equal(m.negative.caught,10);assert(neg.every(n=>n.rejected&&n.IRAndCompilePassed));
const tm=read('ir5-mask-tokens-v1/manifest.json'),tokens=read('ir5-mask-tokens-v1/tokens.private.json');
assert.equal(sha(JSON.stringify(tokens)),tm.tokenizedDataSha256);assert.equal(tm.datasetSha256,m.datasetSha256);
assert.equal(tm.scriptSha256,sha(fs.readFileSync(path.join(here,'prepare-semantic-mask-v2.py'))));
const pySource=f=>fs.readFileSync(path.join(here,f),'utf8');
assert.equal(pySource('prepare-semantic-mask.py').split('def prepare(')[0],pySource('prepare-semantic-mask-v2.py').split('def prepare(')[0],'ALIGNMENT_FUNCTION_DRIFT');
const semantic=[];
for(let i=0;i<data.length;i++){
  const d=data[i],t=tokens[i];assert.equal(d.id,t.id);assert.equal(t.labelMask.length,t.ids.length);
  assert.equal(t.labelMask.reduce((n,v)=>n+v,0),t.directLossTokens);assert(t.labelMask.slice(0,t.promptTokens).every(v=>v===0));
  assert.equal(d.requestDigest,sha(JSON.stringify(d.messages)));const answer=JSON.parse(d.target.text);
  assert.deepEqual(answer,cases.find(c=>c.id===d.heroId).ir);
  const start=t.tokenByteOffsets[t.promptTokens][0];
  for(const s of ['PASSIVE','Q','W','E','R','EX'])for(const field of ['requirement','seconds']){
    const pointer=`/slots/${s}/castTiming/${field}`,span=d.target.spans[pointer];assert(span);
    const indices=t.tokenByteOffsets.flatMap(([lo,hi],j)=>lo<start+span.endByte&&hi>start+span.startByte?[j]:[]);
    assert(indices.length>0&&indices.every(j=>t.labelMask[j]===1),`MECHANISM_LABEL_MASKED:${d.heroId}:${pointer}`);
    semantic.push({id:d.heroId,pointer,value:answer.slots[s].castTiming[field],tokens:indices.length,allDirectlySupervised:true});
  }
}
const repo=path.join(here,'isolated-engine-v1/GGD-community-hero-forge'),iso=path.join(here,'isolated-engine-v1/outputs/hero-forge-12b-restart-20260908'),py='/private/tmp/ggd-qwen38-eval-20260907-venv/bin/python';
const cmds=[{name:'ir5-schema-and-runtime',bin:process.execPath,args:['--import','tsx','--test',path.join(iso,'ir-v5.test.mts')],cwd:repo,count:26},
  {name:'contrast-six-slot-and-faults',bin:process.execPath,args:['--import','tsx','--test',path.join(iso,'contrast-heroes-v1.test.mts')],cwd:repo,count:23},
  {name:'span-mask',bin:process.execPath,args:['--test',path.join(here,'semantic-loss-mask.test.mjs')],cwd:here,count:9},
  {name:'token-alignment',bin:py,args:[path.join(here,'test_semantic_mask.py')],cwd:here,count:5},
  {name:'loss-alignment',bin:py,args:[path.join(here,'test_semantic_training_loss.py')],cwd:here,count:3}];
fs.mkdirSync(out);const tests=[];
for(const c of cmds){const start=Date.now(),r=spawnSync(c.bin,c.args,{cwd:c.cwd,encoding:'utf8',timeout:90000,maxBuffer:2*1024*1024});
  const log=(r.stdout??'')+'\n'+(r.stderr??'');fs.writeFileSync(path.join(out,c.name+'.txt'),log,{flag:'wx'});assert.equal(r.status,0,log);
  assert(c.bin===py?log.includes(`Ran ${c.count} test`):log.includes(`pass ${c.count}`));tests.push({name:c.name,count:c.count,seconds:(Date.now()-start)/1000,logSha256:sha(log)});
  console.log(JSON.stringify(tests.at(-1)));
}
const result={schema:'ggd-ir5-engineering-verification@1',createdAt:new Date().toISOString(),tests,passedTests:tests.reduce((n,t)=>n+t.count,0),
  dataManifestSha256:sha(fs.readFileSync(path.join(here,'ir5-data-stage-v1/manifest.json'))),datasetSha256:m.datasetSha256,
  tokenDataSha256:tm.tokenizedDataSha256,supervisedCastFields:semantic.length,sourceBehavior:m.behavior,policy:m.policy,negative:m.negative,
  checkerPins:m.checkerPins,sharedGpuLockAbsent:!fs.existsSync('/private/tmp/ggd-forge-training-runtime/gpu.lock'),
  modelTrainingStarted:false,fullHeroQualified:0,trainingAdmitted:0,goalComplete:false,
  caveat:'This establishes an engineering candidate corpus and preserved semantic labels, not model quality or independent holdout readiness.'};
fs.writeFileSync(path.join(out,'cast-labels.json'),JSON.stringify(semantic,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
