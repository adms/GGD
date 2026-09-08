import fs from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));const root='/private/tmp/ggd-community37-editor-publish',a=JSON.parse(fs.readFileSync(root+'/current-package-audit.json')).rows.find(r=>r.number===31),proof=JSON.parse(fs.readFileSync(root+'/31/review.json'));const data='/private/tmp/ggd-model-upload-acceptance/data';const snap=JSON.parse(fs.readFileSync(data+'/hero-submission-snapshots/'+a.submissionId+'.json'));const controlPath=data+'/submission-promotions/hero-work-'+snap.workId+'.json';const control=()=>JSON.parse(fs.readFileSync(controlPath));const before=control();assert.equal(before.published.submissionId,a.submissionId);const c=await connect('5540A0FD8040795FAF172B7B1FA0329C');const result={hero:a.name,submissionId:a.submissionId,packageDigest:a.packageDigest,beforeRevision:before.revision,status:'started'};const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(ex,label){let end=Date.now()+90000;while(Date.now()<end){const v=await c.evaluate(ex);if(v)return v;await wait(250);}throw Error('Timed out '+label);}async function select(id){await c.evaluate(`(()=>{let e=document.querySelector('[aria-label="英雄完整資料版本"]');e.value=${JSON.stringify(id)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await until(`document.querySelector('iframe')?.src.endsWith(${JSON.stringify(id)})`,'version selected');}async function shot(name){const r=await c.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(root+'/'+name+'.png',Buffer.from(r.data,'base64'));}async function reason(text){await c.evaluate(`(()=>{const e=document.querySelector('main article textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
try{
 await until(`document.querySelector('iframe')?.src===${JSON.stringify(proof.url)}`,'current fixed hero');
 result.options=await c.evaluate(`[...document.querySelector('[aria-label="英雄完整資料版本"]').options].map(x=>({id:x.value,label:x.textContent}))`);
 assert(result.options.length>1);
 const old=result.options.find(x=>x.id!==a.submissionId);await select(old.id);
 result.comparison=await until(`[...document.querySelectorAll('summary')].map(e=>e.textContent).find(t=>t.startsWith('與目前上線版本比較'))`,'version difference');
 assert.equal(control().published.submissionId,a.submissionId);
 await c.evaluate(`document.querySelector('main article h2').scrollIntoView({block:'start'})`);await shot('version-dropdown-history');
 await select(a.submissionId);
 await reason('完整版本管理驗收：暫時下架此隔離測試英雄，確認完整資料、素材和審查歷史保留後恢復同一固定版本。');
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='下架此作品'&&!e.disabled)`,'unpublish enabled');
 await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='下架此作品').click()`);
 await until(`document.querySelector('main article')?.innerText.includes('此作品目前沒有已發布版本。')`,'unpublished');
 const down=control();assert.equal(down.published,null);assert(down.history.some(h=>h.submissionId===a.submissionId));result.unpublishedRevision=down.revision;result.historyPreserved=true;
 await c.evaluate(`document.querySelector('main article h2').scrollIntoView({block:'start'})`);await shot('version-dropdown-unpublished');
 await reason('完整版本管理驗收：恢復先前已檢查的目前服務固定版本，原文、六槽、模型、動作及素材均不改動。');
 await c.evaluate(`(()=>{const e=document.querySelector('main article input[type="checkbox"]');if(!e.checked)e.click();})()`);
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='驗證並恢復此歷史版本'&&!e.disabled)`,'restore enabled');
 await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='驗證並恢復此歷史版本').click()`);
 await until(`document.querySelector('main')?.innerText.includes('相容性檢查通過，已恢復此歷史版本。')`,'restored');
 const after=control();assert.equal(after.published.submissionId,a.submissionId);assert.deepEqual(after.published.version,before.published.version);assert(after.revision>down.revision);assert(after.history.length>before.history.length);result.restoredRevision=after.revision;result.completeVersionIdentical=true;result.newOperationId=after.published.operationId;result.status='verified';
 await c.evaluate(`document.querySelector('main article h2').scrollIntoView({block:'start'})`);await shot('version-dropdown-restored');console.log(JSON.stringify(result));
}catch(e){result.status='needs-attention';result.error=String(e);console.log(result.error);process.exitCode=1;}finally{fs.writeFileSync(root+'/version-restore-proof.json',JSON.stringify(result,null,2)+'\n');c.close();}
