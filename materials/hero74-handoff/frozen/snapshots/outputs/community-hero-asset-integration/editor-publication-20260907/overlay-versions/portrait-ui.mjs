import {writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect} from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const root='/private/tmp/ggd-overlay-durable-versions';
const before=JSON.parse(readFileSync(root+'/ui-before.json')).published;
const expected=before.filter(x=>x.portraitPath);assert.equal(expected.length,37);
const c=await connect('DA5DC77B9DFA353E175A6776CC782860');await c.call('Network.enable');
try {
 await c.evaluate(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='更新雲端與發布清單').click()`);
 let portraits=[];
 for(let i=0;i<100;i++){
  portraits=await c.evaluate(`Array.from(document.querySelectorAll('section[aria-label="雲端與社群作品"] img')).map(x=>({alt:x.alt,width:x.naturalWidth,height:x.naturalHeight,complete:x.complete,src:x.src}))`);
  if(c.events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.url.includes('/portrait?')).length===37&&portraits.length===37&&portraits.every(x=>x.complete&&x.width>0)&&!(await c.evaluate(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='更新雲端與發布清單').disabled`)))break;
  await new Promise(r=>setTimeout(r,100));
 }
 assert.equal(portraits.length,37);assert(portraits.every(x=>x.complete&&x.width===128&&x.height===128));
 const proofs=[];
 for(const hero of expected){
  const entry=portraits.find(x=>x.alt===hero.name+' 肖像');assert(entry,hero.name);
  const hex=await c.evaluate(`(async()=>{const r=await fetch(${JSON.stringify(entry.src)});const b=await r.arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('')})()`);
  const response=await fetch('http://127.0.0.1:8091/api/v1/hero-works/'+encodeURIComponent(hero.workId)+'/portrait?version='+encodeURIComponent(hero.packageDigest));assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(hex,createHash('sha256').update(bytes).digest('hex'));
  proofs.push({name:hero.name,workId:hero.workId,packageDigest:hero.packageDigest,sha256:hex,width:entry.width,height:entry.height});
 }
 const stale=await fetch('http://127.0.0.1:8091/api/v1/hero-works/'+encodeURIComponent(expected[0].workId)+'/portrait?version=stale-test-version');assert.equal(stale.status,409);
 for(const [label,name] of [['first','武藤遊戲'],['middle','安茲·烏爾·恭'],['last','吉伊卡哇']]){
  await c.evaluate(`Array.from(document.querySelectorAll('section[aria-label="雲端與社群作品"] img')).find(x=>x.alt===${JSON.stringify(name+' 肖像')}).closest('li').scrollIntoView({block:'center'})`);
  const screenshot=await c.call('Page.captureScreenshot',{format:'png'});writeFileSync(root+'/published-portraits-'+label+'.png',Buffer.from(screenshot.data,'base64'));
 }
 const text=await c.evaluate(`document.querySelector('section[aria-label="雲端與社群作品"]').innerText`);writeFileSync(root+'/portrait-ui.txt',text);
 const events=c.events.filter(e=>e.method==='Network.responseReceived').map(e=>({url:e.params.response.url,status:e.params.response.status})).filter(e=>e.url.includes('/portrait?'));
 assert.equal(events.length,37);assert(events.every(x=>x.status===200));
 const proof={schema:'ggd-published-portrait-ui@1',status:'passed',anonymous:true,portraits:proofs,allBlobBytesMatchPinnedPublicEndpoint:true,staleVersionStatus:stale.status,network:events};writeFileSync(root+'/portrait-ui-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify({status:'passed',count:proofs.length,staleVersionStatus:stale.status}));
} finally {c.close()}
