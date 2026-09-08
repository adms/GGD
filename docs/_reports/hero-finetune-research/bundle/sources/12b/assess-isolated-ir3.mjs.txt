import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha} from './intake.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));assert.equal(process.argv.length,5);
const [run,isolation,out]=process.argv.slice(2).map(x=>path.resolve(x));
for(const p of [run,isolation,out])assert.equal(path.dirname(p),here);assert(!fs.existsSync(out));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const state=read(path.join(run,'state.json'));assert.equal(state.status,'completed-inference-only');assert.equal(state.workerPid,null);
const p=read(path.join(run,'manifest.json')),receipt=read(path.join(isolation,'COPY_RECEIPT.json'));
assert.equal(receipt.root,isolation);const destination=receipt.researchDirectory;
for(const [f,h] of Object.entries(p.checkerPins)){
  assert.equal(sha(fs.readFileSync(path.join(here,f))),h);
  const target=path.join(destination,f);
  if(fs.existsSync(target))assert.equal(sha(fs.readFileSync(target)),h);else fs.copyFileSync(path.join(here,f),target,fs.constants.COPYFILE_EXCL);
}
const copyRun=path.join(destination,path.basename(run));assert(!fs.existsSync(copyRun));
fs.cpSync(run,copyRun,{recursive:true,errorOnExist:true,force:false});
const copyOut=path.join(destination,path.basename(out));assert(!fs.existsSync(copyOut));
const result=execFileSync(process.execPath,['--import','tsx',path.join(destination,'evaluate-ir3.mts'),copyRun,copyOut],
  {cwd:path.join(isolation,'GGD-community-hero-forge'),timeout:120000,maxBuffer:10*1024**2});
fs.cpSync(copyOut,out,{recursive:true,errorOnExist:true,force:false});
fs.writeFileSync(path.join(out,'ENGINE_ISOLATION.json'),JSON.stringify({...receipt,
  canonicalRunManifestSha256:sha(fs.readFileSync(path.join(run,'manifest.json'))),sameFrozenEngine:true,currentLiveEngineQualified:false},null,2)+'\n',{flag:'wx'});
process.stdout.write(result);
