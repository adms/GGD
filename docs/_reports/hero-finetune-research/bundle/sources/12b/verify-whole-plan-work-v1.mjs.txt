import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));
const sha=x=>createHash('sha256').update(x).digest('hex'),read=f=>JSON.parse(fs.readFileSync(path.join(here,f),'utf8'));
const isolated=path.join(here,'isolated-engine-v1/outputs/hero-forge-12b-restart-20260908');
let checkedPins=0,matchedCopies=0;
const runs=['whole-plan-candidates-v1','whole-plan-candidates-v2','whole-plan-candidates-v3','whole-plan-mutation-audit-v1','whole-plan-mutation-audit-v2'];
const summaries=[];
for(const run of runs){
  const manifest=read(run+'/manifest.json');
  for(const [f,h] of Object.entries(manifest.checkerPins)){
    assert.equal(sha(fs.readFileSync(path.join(here,f))),h);assert.equal(sha(fs.readFileSync(path.join(isolated,f))),h);checkedPins++;
  }
  for(const f of fs.readdirSync(path.join(here,run))){
    assert.equal(sha(fs.readFileSync(path.join(here,run,f))),sha(fs.readFileSync(path.join(isolated,run,f))));matchedCopies++;
  }
  if(run.startsWith('whole-plan-candidates')){
    const rows=read(run+'/whole-heroes.private.json');assert.equal(rows.length,2);
    for(const r of rows){assert.equal(sha(r.source.hero.originalText),r.source.hero.sourceSha256);
      assert.equal(r.built.project.sourceDesign.ownerText,r.source.hero.originalText);
      assert.equal(r.probes.rows.filter(x=>x.passed).length,r.probes.passed);
      assert.equal(r.probes.rows.length,r.probes.total);assert.equal(r.trainingAdmitted,false);}
    summaries.push({run,compiled:rows.length,passed:rows.reduce((s,r)=>s+r.probes.passed,0),total:rows.reduce((s,r)=>s+r.probes.total,0)});
  }else{
    const rows=read(run+'/cases.json');assert.equal(rows.length,manifest.mutants);
    assert.equal(rows.filter(r=>r.result.rows.every(p=>!p.passed)).length,manifest.caughtBothSeeds);
    if(run.endsWith('v2'))assert(!rows.some(r=>r.result.rows.some(p=>String(p.error).includes('RUNTIME_MIRROR_MISMATCH'))));
    summaries.push({run,mutants:rows.length,caughtBothSeeds:manifest.caughtBothSeeds,survived:manifest.survived});
  }
}
const latest=read('whole-plan-candidates-v3/whole-heroes.private.json');
for(const run of ['whole-plan-candidates-v1','whole-plan-candidates-v2']){
  const rows=read(run+'/whole-heroes.private.json');for(let i=0;i<2;i++){
    assert.deepEqual(rows[i].ir,latest[i].ir);assert.deepEqual(rows[i].built.compiled,latest[i].built.compiled);
  }
}
const cooldown=read('WHOLE_PLAN_COOLDOWN_AUDIT_V1.json');assert.equal(cooldown.passed,4);
for(const [f,h] of Object.entries(cooldown.checkerPins))assert.equal(sha(fs.readFileSync(path.join(here,f))),h);
const repo=path.join(here,'isolated-engine-v1/GGD-community-hero-forge');
const files=['ir-v4.test.mts','native-mechanism-actions.test.mts'];
const started=Date.now(),r=spawnSync(process.execPath,['--import','tsx','--test',...files.map(f=>path.join(isolated,f))],
  {cwd:repo,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'cpu-tests.txt'),r.stdout+'\n'+r.stderr,{flag:'wx'});
assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert(/pass 52/.test(r.stdout),'TEST_COUNT_MISMATCH');
const result={schema:'ggd-whole-plan-work-verification@1',createdAt:new Date().toISOString(),summaries,
  checkedPinReferences:checkedPins,byteIdenticalResultCopies:matchedCopies,sourceHashesVerified:true,
  plansAndCompiledOutputsUnchangedAcrossCheckerVersions:true,cooldownAuditPassed:cooldown.passed,
  cpuTests:{passed:52,failed:0,seconds:(Date.now()-started)/1000,logSha256:sha(r.stdout+'\n'+r.stderr),
    files:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(here,f)))]))},
  sharedGpuLockAbsent:!fs.existsSync('/private/tmp/ggd-forge-training-runtime/gpu.lock'),
  newGpuWorkStarted:false,trainingAdmitted:0,fullHeroQualified:0,goalComplete:false};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result,null,2));
