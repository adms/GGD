import { readFileSync, writeFileSync, copyFileSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { heroImportHeaders } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/node/heroImportAuth.ts';
const repo=process.cwd(), root='/private/tmp/ggd-community37-generator-rebuild', serviceRoot='/private/tmp/ggd-model-upload-acceptance';
const configPath=join(serviceRoot,'service-config-private.json');
const config=JSON.parse(readFileSync(configPath,'utf8'));
const publicConfig=JSON.parse(readFileSync(join(serviceRoot,'service-current-public.json'),'utf8'));
const path='/api/v1/content-import/active/target-profile';
const profile=async()=>{const r=await fetch('http://127.0.0.1:8801'+path,{headers:heroImportHeaders(config.importer.env.GGD_HERO_IMPORT_SECRET,'GET',path)});assert.equal(r.status,200);return r.json();};
const refresh=process.argv.includes('--refresh');
const before=await profile();assert.equal(before.gameVersion,refresh?JSON.parse(readFileSync(join(root,'target-current.json'),'utf8')).gameVersion:'6aeb6aeb39c1d3a4a16c185f035b3c0c65896b92');
const baseline=refresh?join(root,'before-upload-model-fix','baseline'):join(root,'baseline');mkdirSync(baseline,{recursive:true});
writeFileSync(join(baseline,'target.json'),JSON.stringify(before,null,2));
const oldAudit=JSON.parse(readFileSync('/private/tmp/ggd-community37-editor-publish/current-publication-audit.json','utf8'));
assert.equal(oldAudit.rows.length,37);
for(const row of oldAudit.rows){
  for(const [collection,id] of [['submission-promotions',`hero-work-${row.workId}`],['hero-submission-snapshots',row.currentSubmissionId]]){
    const dir=join(baseline,collection);mkdirSync(dir,{recursive:true});copyFileSync(join(serviceRoot,'data',collection,id+'.json'),join(dir,id+'.json'));
  }
}
copyFileSync(configPath,join(serviceRoot,refresh?'service-config-before-upload-model-fix-private.json':'service-config-before-generator-private.json'));
copyFileSync(join(serviceRoot,'service-current-public.json'),join(baseline,'service-public.json'));
const listeners=execFileSync('lsof',['-t','-iTCP:8801','-sTCP:LISTEN'],{encoding:'utf8'}).trim().split('\n').map(Number);
assert.equal(listeners.length,1);const pid=listeners[0]!;
const command=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'});assert(command.includes('apps/content-api/src/heroImportIndex.ts'));
process.kill(pid,'SIGTERM');
for(let i=0;i<60;i++){
  try{process.kill(pid,0);}catch{break;}
  if(i===59)throw Error('old importer did not stop');await new Promise(r=>setTimeout(r,100));
}
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
// This fix changes the importer only. Keep the already selected game build.
const gameVersion=refresh?before.gameVersion:revision;
const logPath=join(root,'importer.log'),log=openSync(logPath,'a');
const env={...process.env,...config.importer.env,GGD_BUILD_STAMP:gameVersion,PATH:'/opt/homebrew/bin:'+config.importer.env.PATH};
const child=spawn(process.execPath,['--import','tsx','apps/content-api/src/heroImportIndex.ts'],{cwd:repo,env,detached:true,stdio:['ignore',log,log]});child.unref();
let after;
for(let i=0;i<80;i++){
  try{after=await profile();break;}catch{}
  if(i===79)throw Error('new importer did not become ready; inspect '+logPath);await new Promise(r=>setTimeout(r,250));
}
assert.equal(after.gameVersion,gameVersion);assert.notEqual(after.authoringProcessor.fingerprint,before.authoringProcessor.fingerprint);
config.importer.pid=child.pid;config.importer.env=Object.fromEntries(Object.keys(config.importer.env).map(k=>[k,env[k]]));
writeFileSync(configPath,JSON.stringify(config,null,2),{mode:0o600});
publicConfig.revision=gameVersion;publicConfig.services.importer={parentPid:child.pid,port:8801,implementationRevision:revision,startupVerified:'signed GET target-profile 200'};
writeFileSync(join(serviceRoot,'service-current-public.json'),JSON.stringify(publicConfig,null,2));
writeFileSync(join(root,'target-current.json'),JSON.stringify(after,null,2));
const proof={oldPid:pid,newPid:child.pid,gameVersion,implementationRevision:revision,oldProcessor:before.authoringProcessor.fingerprint,processor:after.authoringProcessor.fingerprint,contentVersion:after.base.contentVersion,publicationPointersPreserved:true};
for(const row of oldAudit.rows){const name=`hero-work-${row.workId}.json`;assert.deepEqual(readFileSync(join(baseline,'submission-promotions',name)),readFileSync(join(serviceRoot,'data/submission-promotions',name)));}
writeFileSync(join(root,refresh?'service-update-model-fix.json':'service-update.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
