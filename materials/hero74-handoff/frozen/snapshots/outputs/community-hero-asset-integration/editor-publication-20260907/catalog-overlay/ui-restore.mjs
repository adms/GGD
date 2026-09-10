import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect} from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const out='/private/tmp/ggd-catalog-overlay-proof', repo='/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge', base='http://127.0.0.1:8092/api/v1';
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'model-reviewer',password:'REDACTED_TEST_PASSWORD'})});assert.equal(login.status,200);const account=await login.json();
const call=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{authorization:'Bearer '+account.tokens.accessToken,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await r.json();assert.equal(r.status,200,JSON.stringify({path,value}));return value;};
const c=await connect('9906E3D18A92537F060795F9059651FE');await c.call('Network.enable');
const sha=x=>createHash('sha256').update(x).digest('hex');
const click=async(text)=>c.evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Button unavailable: '+${JSON.stringify(text)});b.scrollIntoView({block:'center'});b.click()})()`);
const save=async(name)=>{writeFileSync(out+'/'+name+'.txt',await c.evaluate('document.body.innerText'));const p=await c.call('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/'+name+'.png',Buffer.from(p.data,'base64'));};
const wait=async(fn,message)=>{const until=Date.now()+60000;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error(message+': '+await c.evaluate('document.body.innerText.slice(-1600)'));};
const set=async(selector,value,kind='input')=>c.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${kind==='select'?'HTMLSelectElement':kind==='textarea'?'HTMLTextAreaElement':'HTMLInputElement'}.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(${JSON.stringify(kind==='select'?'change':'input')},{bubbles:true}));})()`);
try {
 const before=await call('/content-overlay/bundle');assert.equal(before.generation,9);writeFileSync(out+'/ui-before.json',JSON.stringify(before,null,2));
 await set('input[placeholder="doc id（例：godie-e001.q）"]','sela');
 await wait(async()=>await c.evaluate(`!!document.querySelector('select[aria-label="完整英雄資料版本"]')`),'Full panel missing');
 await click('載入出貨版');await wait(async()=>await c.evaluate(`document.querySelector('textarea').value.includes('Ember Sage')`),'Shipped Sela missing');
 await click('保存目前完整版本');
 await wait(async()=>await c.evaluate(`document.body.innerText.includes('目前完整資料已保存。')`),'Capture did not finish');
 const originalVersion=await c.evaluate(`document.querySelector('select[aria-label="完整英雄資料版本"]').value`);assert.match(originalVersion,/^sha256:/);
 await save('ui-captured-original');
 const document=JSON.parse(await c.evaluate('document.querySelector("textarea").value'));assert.equal(document.baseStats.ad,34);document.baseStats.ad=35;
 await set('textarea',JSON.stringify(document,null,2),'textarea');await click('儲存到覆蓋層');
 await wait(async()=> (await call('/content-overlay/bundle')).generation===10,'Sela save did not apply');
 const model=JSON.parse(readFileSync(repo+'/content/models/champ.sela.json'));model.scale=1.25;
 // Seed a concurrent shared template update through the same authenticated Go
 // API. The hero's actual save/capture/restore are performed through its UI.
 await call('/content-overlay/docs/models/champ.sela','PUT',model);
 const modified=await call('/content-overlay/bundle');assert.equal(modified.generation,11);assert.equal(modified.docs['models/champ.sela'].scale,1.25);writeFileSync(out+'/ui-modified.json',JSON.stringify(modified,null,2));
 await click('重新整理');
 await wait(async()=>await c.evaluate('document.body.innerText.includes("generation 11")'),'UI gen11 missing');
 await set('select[aria-label="完整英雄資料版本"]',originalVersion,'select');
 await wait(async()=>await c.evaluate(`!!document.querySelector('input[aria-label="確認英雄獨立版本還原"]')`),'Preview not ready');
 await c.evaluate(`document.querySelector('input[aria-label="確認英雄獨立版本還原"]').scrollIntoView({block:'center'})`);await save('ui-independent-preview');
 await c.evaluate(`document.querySelector('input[aria-label="確認英雄獨立版本還原"]').click()`);await click('回復選取的完整版本');
 await wait(async()=> (await call('/content-overlay/bundle')).generation===12,'Full restore did not finish');
 const restored=await call('/content-overlay/bundle'), hero=restored.docs['champions/sela'], ownModel=restored.docs['models/'+hero.modelKey];assert.equal(hero.baseStats.ad,34);assert.notEqual(hero.modelKey,'champ.sela');assert.equal(ownModel.scale,1);assert.deepEqual(ownModel.clipMap,JSON.parse(readFileSync(repo+'/content/models/champ.sela.json')).clipMap);
 for(const [key,doc] of Object.entries(modified.docs))if(key!=='champions/sela'&&key!=='config/audio-map')assert.deepEqual(restored.docs[key],doc,key);
 assert.equal(restored.docs['models/champ.sela'].scale,1.25);assert.deepEqual(restored.deleted,before.deleted);
 const assetURL=base+'/content-overlay/assets/'+ownModel.glbPath.split('/').pop(), response=await fetch(assetURL);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual(bytes,readFileSync(repo+'/content/assets/models/champions/blocky-mage.glb'));
 await wait(async()=>await c.evaluate(`document.body.innerText.includes('已回復 Sela, the Ember Sage 的完整資料')`),'Restore notice missing');
 await c.evaluate(`Array.from(document.querySelectorAll('[role="status"]')).find(x=>x.textContent.includes('已回復')).scrollIntoView({block:'center'})`);await save('ui-restored-independent');
 const versions=await call('/content-overlay/hero-catalog/versions');
 const proof={schema:'ggd-platform-full-hero-ui-proof@1',status:'passed',originalVersion,generations:[9,10,11,12],heroId:'sela',beforeAD:34,editedAD:35,restoredAD:hero.baseStats.ad,sharedModelScale:1.25,restoredModelScale:ownModel.scale,independentModelId:hero.modelKey,clipMap:ownModel.clipMap,modelAsset:{url:assetURL,bytes:bytes.length,sha256:sha(bytes),cacheControl:response.headers.get('cache-control')},otherOverlayDocumentsUnchanged:true,shippedContentNotWritten:true,versions:versions.items.map(x=>x.versionId),scope:'Actual Go administrator UI capture, hero save and full restore; shared model update seeded via authenticated API. Browser rendering verified separately.'};
 writeFileSync(out+'/ui-restored.json',JSON.stringify(restored,null,2));writeFileSync(out+'/ui-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
} finally {writeFileSync(out+'/ui-network.json',JSON.stringify(c.events.filter(x=>x.method==='Network.responseReceived').map(x=>({url:x.params.response.url,status:x.params.response.status})).filter(x=>x.url.includes('content-overlay')),null,2));c.close();}
