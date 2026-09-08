import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const root='/private/tmp/ggd-community37-editor-publish',data='/private/tmp/ggd-model-upload-acceptance/data';
const row=JSON.parse(fs.readFileSync(root+'/current-package-audit.json')).rows.find(r=>r.number===31);
const snapshot=JSON.parse(fs.readFileSync(data+'/hero-submission-snapshots/'+row.submissionId+'.json'));
const workPath=data+'/hero-works/'+snapshot.workId+'.json',controlPath=data+'/submission-promotions/hero-work-'+snapshot.workId+'.json';
const work=()=>JSON.parse(fs.readFileSync(workPath)),control=()=>JSON.parse(fs.readFileSync(controlPath));
const c=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4'),proof={hero:row.name,status:'started',before:work().draftRevision},controlBefore=control();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(ex,label){for(let n=0;n<180;n++){const v=await c.evaluate(ex);if(v)return v;await wait(250);}throw Error('timeout '+label);}
const click=text=>c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText===${JSON.stringify(text)}&&!e.disabled).click()`);
async function input(label,value){await c.evaluate(`(()=>{let e=[...document.querySelectorAll('label')].find(e=>e.innerText===${JSON.stringify(label)})?.querySelector('input');if(!e)throw Error('missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function sync(){let old=work().draftRevision;await click('同步雲端草稿');await until(`document.querySelector('.hero-community')?.innerText.includes('已同步至雲端第 ${old+1} 版')`,'sync');assert.equal(work().draftRevision,old+1);await until(`!!document.querySelector('[aria-label="完整草稿版本"]')&&!document.querySelector('[aria-label="完整草稿版本"]').disabled`,'history loaded');return work();}
async function shot(name){await c.evaluate(`document.querySelector('[aria-label="完整草稿版本管理"]').scrollIntoView({block:'start'})`);await wait(100);const r=await c.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(root+'/'+name+'.png',Buffer.from(r.data,'base64'));}
try{
 assert.equal(await c.evaluate(`document.querySelector('h1')?.innerText`),row.name);
 if(await c.evaluate(`!!document.querySelector('.hero-community input[type="password"]')`)){await input('遊戲帳號','model-author');await input('密碼','REDACTED_TEST_PASSWORD');await click('登入以同步與投稿');}
 await until(`document.querySelector('.hero-community')?.innerText.includes('雲端帳號：model-author')`,'author login');
 let baseline,changed; if(process.env.RESUME_HISTORY==='1'){const old=JSON.parse(fs.readFileSync(root+'/draft-version-proof.json'));fs.copyFileSync(root+'/draft-version-proof.json',root+'/draft-version-initial-failure.json');const meta=JSON.parse(fs.readFileSync(data+'/hero-draft-versions/'+old.baselineVersion.slice(7)+'.json'));baseline={draftRevision:meta.revision,draftVersion:meta.versionId,draftDigest:meta.draftDigest,draft:JSON.parse(fs.readFileSync(data+'/hero-draft-payloads/'+meta.draftDigest.slice(7)+'.json'))};changed=work();proof.before=old.before;}else{baseline=await sync();}
 proof.baselineRevision=baseline.draftRevision;proof.baselineVersion=baseline.draftVersion;
 if(!changed){
 await c.evaluate(`[...document.querySelectorAll('.hero-slots button')].find(e=>e.innerText==='Q').click()`);
 const original=await c.evaluate(`[...document.querySelectorAll('label')].find(e=>e.innerText==='Cooldown Sec')?.querySelector('input[type="text"]')?.value`);
 assert.equal(original,'10');await input('Cooldown Sec','11');
 await until(`document.querySelector('.hero-community')?.innerText.includes('本機有尚未同步的修改')`,'changed locally');
 changed=await sync();}
 assert.notEqual(changed.draftDigest,baseline.draftDigest);proof.changedRevision=changed.draftRevision;
 await c.evaluate(`(()=>{const e=document.querySelector('[aria-label="完整草稿版本"]');e.value=${JSON.stringify(baseline.draftVersion)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='回復此草稿並另存新版本'&&!e.disabled)`,'comparison ready');
 proof.comparison=await c.evaluate(`document.querySelector('[aria-label="完整草稿版本管理"]').innerText`);assert(proof.comparison.includes('cooldownSec'));assert.deepEqual(control(),controlBefore);
 await shot('draft-version-comparison');
 await input('Cooldown Sec','1e');await wait(150);
 await click('回復此草稿並另存新版本');
 await until(`document.querySelector('.hero-community')?.innerText.includes('已同步至雲端第 ${changed.draftRevision+1} 版')`,'restored');
 const restored=work();assert.equal(restored.draftRevision,changed.draftRevision+1);assert.equal(restored.draftDigest,baseline.draftDigest);assert.deepEqual(restored.draft,baseline.draft);assert.deepEqual(control(),controlBefore);
 proof.restoredRevision=restored.draftRevision;proof.restoredVersion=restored.draftVersion;proof.publishedUnchanged=true;proof.fullDraftIdentical=true;
 const backups=await c.evaluate(`(async()=>{const {indexedDraftRepository}=await import('/editor/src/drafts/repository.ts');return(await indexedDraftRepository.list()).filter(d=>d.kind==='hero'&&d.payload?.project?.projectId===${JSON.stringify(snapshot.workId)}).map(d=>({key:d.key,rawInputs:d.payload.rawInputs}));})()`);
 assert(backups.some(b=>Object.values(b.rawInputs??{}).some(v=>v.text==='1e')));proof.unsyncedInputBackedUp=true;
 const restoredMeta=JSON.parse(fs.readFileSync(data+'/hero-draft-versions/'+restored.draftVersion.slice(7)+'.json'));assert.equal(restoredMeta.restoredFrom,baseline.draftVersion);assert.equal(restoredMeta.previousVersion,changed.draftVersion);
 await shot('draft-version-restored');proof.status='verified';console.log(JSON.stringify(proof));
}catch(error){proof.status='needs-attention';proof.error=String(error);fs.writeFileSync(root+'/draft-version-failure.txt',await c.evaluate('document.body.innerText'));console.error(error);process.exitCode=1;}
finally{fs.writeFileSync(root+'/draft-version-proof.json',JSON.stringify(proof,null,2)+'\n');c.close();}
