import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const {readPackageZip}=await import(pathToFileURL(process.cwd()+'/packages/shared/src/content/import/readPackageZip.ts'));
const root='/private/tmp/ggd-community37-generator-rebuild';
const data='/private/tmp/ggd-model-upload-acceptance/data/hero-submission-snapshots';
const start=Number(process.argv[2]??1),count=Number(process.argv[3]??1);
const c=await connect('DA5DC77B9DFA353E175A6776CC782860');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(ex,label,ms=90000){const end=Date.now()+ms;while(Date.now()<end){const value=await c.evaluate(ex);if(value)return value;await wait(250);}throw Error('Timed out '+label);}
const click=text=>c.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.innerText===${JSON.stringify(text)}&&!e.disabled);if(!b)throw Error('missing button '+${JSON.stringify(text)});b.click();})()`);
async function download(dir,button){await mkdir(dir,{recursive:true});await c.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});await click(button);for(let i=0;i<100;i++){const files=(await readdir(dir)).filter(f=>!f.endsWith('.crdownload'));if(files.length===1){const path=dir+'/'+files[0];const bytes=await readFile(path);if(path.endsWith('.json')||bytes.length>=22&&bytes.readUInt32LE(bytes.length-22)===0x06054b50)return path;}await wait(200);}throw Error('Download incomplete');}
try{
 const reloadStart=c.events.length;await c.call('Page.reload');
 for(let attempt=0;attempt<200&&!c.events.slice(reloadStart).some(e=>e.method==='Page.loadEventFired');attempt++)await wait(100);
 assert(c.events.slice(reloadStart).some(e=>e.method==='Page.loadEventFired'),'Reload did not complete');
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='我的作品')`,'editor loaded');
 for(let number=start;number<start+count;number++){
  const dir=root+'/'+String(number).padStart(2,'0');
  const author=JSON.parse(await readFile(dir+'/author.json','utf8'));assert.equal(author.status,'built');
  const equivalence=JSON.parse(await readFile(dir+'/equivalence.json','utf8'));assert.equal(equivalence.status,'verified-equivalent');assert.equal(equivalence.packageDigest,author.packageDigest);
  const expected=JSON.parse(await readFile(author.afterDraft,'utf8'));
  const old=JSON.parse(await readFile(root+'/baseline/hero-submission-snapshots/'+author.oldSubmissionId+'.json','utf8'));
  const prior=await readFile(dir+'/submission.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  assert(!prior||prior.status!=='submitted','Already submitted; retain evidence and move to next hero');
  const runDir=dir+'/submission-'+Date.now();await mkdir(runDir,{recursive:true});
  const proof={number,name:author.name,projectId:author.projectId,packageDigest:author.packageDigest,status:'started',runDir};
  const save=()=>writeFile(dir+'/submission.json',JSON.stringify(proof,null,2)+'\n');await save();
  try{
   await click('我的作品');await until(`[...document.querySelectorAll('.draft-cards li')].some(e=>e.querySelector('h2')?.innerText===${JSON.stringify(author.name)})`,'local draft');
   await c.evaluate(`(()=>{const li=[...document.querySelectorAll('.draft-cards li')].find(e=>e.querySelector('h2')?.innerText===${JSON.stringify(author.name)});[...li.querySelectorAll('button')].find(b=>b.innerText==='繼續編輯').click();})()`);
   await until(`document.querySelector('h1')?.innerText===${JSON.stringify(author.name)}`,'hero opened');
   proof.draft=await download(runDir+'/draft','下載草稿備份');
   const selected=JSON.parse(await readFile(proof.draft,'utf8'));
   assert.equal(selected.key,expected.key,'Selected a different local copy');assert.deepEqual(selected.payload.project,expected.payload.project,'Selected project changed since verified build');
   await until(`document.body.innerText.includes('六槽編譯與模擬已通過')`,'validated');
   await click('建立完整英雄 ZIP');
   const built=await until(`(()=>{const t=document.querySelector('.hero-package-panel')?.innerText??'';return /完整英雄檢查通過|無法建立完整英雄/.test(t)?t:null;})()`,'service build');assert(built.includes('完整英雄檢查通過'),built);
   const buttons=await c.evaluate(`[...document.querySelectorAll('button')].filter(e=>/下載.*ZIP/.test(e.innerText)&&!e.disabled).map(e=>e.innerText)`);assert.equal(buttons.length,1);
   proof.archive=await download(runDir+'/package',buttons[0]);
   const pkg=readPackageZip(new Uint8Array(await readFile(proof.archive)));assert.equal(pkg.manifest.packageDigest,author.packageDigest,'Reopened draft produced different package');
   assert.deepEqual(await readFile(proof.archive),await readFile(author.archive),'Deterministic ZIP changed');
   await until(`document.querySelector('.hero-community')?.innerText.includes('雲端帳號：model-author')`,'author signed in');
   await c.evaluate(`(()=>{const input=document.querySelector('.hero-community input[type="checkbox"]');if(!input)throw Error('Remix checkbox missing');if(input.checked!==${JSON.stringify(old.allowAttributionRemix)})input.click();})()`);
   await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='提交這份完整英雄審查'&&!e.disabled)`,'submit enabled');await click('提交這份完整英雄審查');
   const response=await until(`(()=>{const section=document.querySelector('.hero-community');const text=section?.querySelector(':scope > p[role="status"]')?.innerText??'';return /完整英雄已送審|HTTP \d{3}|Error:/.test(text)?section.innerText:null;})()`,'submission response');
   proof.response=response;assert(response.includes('完整英雄已送審'),response);
   const candidates=[];for(const file of await readdir(data)){if(!file.endsWith('.json'))continue;const snapshot=JSON.parse(await readFile(data+'/'+file,'utf8'));if(snapshot.workId===author.projectId&&snapshot.version.packageDigest===author.packageDigest)candidates.push(snapshot);}
   assert.equal(candidates.length,1,'Expected exactly one immutable submitted snapshot');const snapshot=candidates[0];
   assert.notEqual(snapshot.id,author.oldSubmissionId);assert.deepEqual(snapshot.inspection.project,expected.payload.project);assert.equal(snapshot.allowAttributionRemix,old.allowAttributionRemix);
   await writeFile(dir+'/submitted-snapshot.json',JSON.stringify(snapshot,null,2)+'\n');
   proof.submissionId=snapshot.id;proof.snapshotDigest=snapshot.version.snapshotDigest;proof.allowAttributionRemix=snapshot.allowAttributionRemix;proof.status='submitted';await save();console.log(number,author.name,'SUBMITTED',snapshot.id);
  }catch(error){proof.status='needs-attention';proof.error=String(error);await writeFile(runDir+'/failure.txt',await c.evaluate('document.body.innerText'));await save();console.log(number,author.name,String(error).slice(0,1200));process.exitCode=1;break;}
 }
}finally{c.close();}
