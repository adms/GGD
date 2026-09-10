import {readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const root='/private/tmp/ggd-overlay-durable-versions',base='http://127.0.0.1:8091/api/v1';
const before=JSON.parse(readFileSync(root+'/ui-before.json'));
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'model-reviewer',password:'REDACTED_TEST_PASSWORD'})});assert.equal(login.status,200);const account=await login.json();
const get=async(path)=>{const r=await fetch(base+path,{headers:{authorization:'Bearer '+account.tokens.accessToken}});assert.equal(r.status,200,path);return r.json()};
const c=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');await c.call('Network.enable');
const save=async(name)=>{writeFileSync(root+'/'+name+'.txt',await c.evaluate('document.body.innerText'));const png=await c.call('Page.captureScreenshot',{format:'png'});writeFileSync(root+'/'+name+'.png',Buffer.from(png.data,'base64'));};
const click=async(text)=>c.evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Button unavailable');b.scrollIntoView({block:'center'});b.click()})()`);
const edit=async(ad)=>c.evaluate(`(()=>{const input=document.querySelector('textarea');const value=JSON.parse(input.value);if(value.id!=='sela')throw Error('wrong hero');value.baseStats.ad=${ad};Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,JSON.stringify(value,null,2));input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const wait=async(fn,message)=>{for(let i=0;i<80;i++){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw Error(message)};
const checkOthers=(bundle)=>{const docs={...bundle.docs};delete docs['champions/sela'];assert.deepEqual(docs,before.bundle.docs);assert.deepEqual(bundle.deleted,before.bundle.deleted);};
try {
 const resumed=await get('/content-overlay/bundle');assert.equal(resumed.generation,8);assert.equal(resumed.docs['champions/sela'].baseStats.ad,35);checkOthers(resumed);
 await click('重新整理');
 await wait(async()=> (await get('/content-overlay/bundle')).docs['champions/sela']?.baseStats.ad===35,'Save was not applied');
 await wait(async()=> (await c.evaluate('document.body.innerText')).includes('gen 8 · put · champions/sela'),'Version list did not refresh after save');
 const applied=await get('/content-overlay/bundle');checkOthers(applied);writeFileSync(root+'/ui-applied.json',JSON.stringify(applied,null,2));
 await c.evaluate(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='只還原 sela').scrollIntoView({block:'center'})`);await save('ui-saved-version');
 const rawPath='/private/tmp/ggd-model-upload-acceptance/data/content-overlay/overlay.json',objects='/private/tmp/ggd-model-upload-acceptance/data/content-overlay/.git/objects';
 const rawBefore=readFileSync(rawPath);renameSync(objects,objects+'.acceptance-preserved');
 try {
  writeFileSync(objects,'isolated unavailable version store',{flag:'wx'});
  await edit(36);await click('儲存到覆蓋層');
  await wait(async()=> (await c.evaluate('document.body.innerText')).includes('版本無法保存，未套用內容變更'),'Version failure did not reach UI');
  assert.deepEqual(readFileSync(rawPath),rawBefore);await save('ui-storage-failure');
 } finally {unlinkSync(objects);renameSync(objects+'.acceptance-preserved',objects);}
 await click('重新整理');
 await wait(async()=> (await c.evaluate('document.body.innerText')).includes('gen 8 · put · champions/sela'),'Version history did not recover');
 // Preserve the failed edit separately; load the unchanged shipped document
 // into the edit box before choosing the historical baseline.
 writeFileSync(root+'/failed-edit-preserved.json',await c.evaluate('document.querySelector("textarea").value'));
 await click('載入出貨版');await wait(async()=> JSON.parse(await c.evaluate('document.querySelector("textarea").value')).baseStats.ad===34,'Shipped form did not reload');
 await click('只還原 sela');
 await wait(async()=> !(await get('/content-overlay/bundle')).docs['champions/sela'],'Single hero restore did not complete');
 const restored=await get('/content-overlay/bundle'),history=await get('/content-overlay/versions/champions/sela'),published=await get('/hero-works/published');
 assert.equal(restored.generation,9);checkOthers(restored);assert.deepEqual(published,before.published);assert.equal(history.entries[0].generation,9);
 await wait(async()=> (await c.evaluate('document.body.innerText')).includes('gen 9 · restore-doc · champions/sela'),'Restored history not shown');
 await c.evaluate(`Array.from(document.querySelectorAll('td')).find(x=>x.textContent.includes('gen 9 · restore-doc')).scrollIntoView({block:'center'})`);await save('ui-restored-version');
 const proof={schema:'ggd-overlay-version-ui-proof@1',status:'passed',beforeGeneration:7,appliedGeneration:8,restoredGeneration:9,editedHero:'sela',values:[34,35,36,34],failedValue36WasApplied:false,otherOverlayDocumentsUnchanged:true,allPublishedHeroesUnchanged:true,publishedCount:published.length,history,restored,scope:'Actual administrator UI on the isolated Platform; JSON overlay versions only. Full hero dependency/source restoration remains separate.'};
 writeFileSync(root+'/ui-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify({...proof,history:undefined,restored:undefined}));
} finally {
 const events=c.events.filter(e=>e.method==='Network.responseReceived').map(e=>({url:e.params.response.url,status:e.params.response.status})).filter(e=>e.url.includes('/content-overlay/'));
 writeFileSync(root+'/ui-network.json',JSON.stringify(events,null,2));c.close();
}
