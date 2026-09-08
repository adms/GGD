import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {connect} from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const out='/private/tmp/ggd-catalog-source-archive',root='/private/tmp/ggd-existing-catalog-save-acceptance/content';
function hashes(){const result={};function walk(path){for(const e of readdirSync(path,{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory())walk(p);else if(e.isFile())result[p.slice(root.length+1)]=createHash('sha256').update(readFileSync(p)).digest('hex');}}walk(root);return result;}
const before=JSON.parse(readFileSync(out+'/content-before.json'));assert.deepEqual(hashes(),before);
const c=await connect('5540A0FD8040795FAF172B7B1FA0329C');await c.call('Network.enable');
const wait=async(f,label)=>{for(let i=0;i<150;i++){if(await f())return;await new Promise(r=>setTimeout(r,150));}throw Error(label)};
try {
 await c.evaluate(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes('英雄管理')).click()`);
 await wait(async()=>await c.evaluate(`Array.from(document.querySelectorAll('button')).some(x=>x.textContent.endsWith('godie-e00s'))`),'No hero list');
 await c.evaluate(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent.endsWith('godie-e00s')).click()`);
 await wait(async()=> await c.evaluate(`!!Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='保存目前完整版本'&&!x.disabled)`),'No capture button');
 const versions=await fetch('http://127.0.0.1:8810/content-api/hero-catalog/versions').then(r=>r.json());const saved=versions.items[0].versionId;
 await wait(async()=>await c.evaluate(`!!document.querySelector('select[aria-label=\"完整英雄資料版本\"] option[value=\"${saved}\"]')`),'Saved version unavailable');
 await c.evaluate(`(()=>{const input=document.querySelector('select[aria-label=\"完整英雄資料版本\"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,${JSON.stringify(saved)});input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait(async()=> (await c.evaluate('document.body.innerText')).includes('已保存的產生器來源'),'No source section');
 const version=await c.evaluate(`document.querySelector('select[aria-label="完整英雄資料版本"]').value`);
 const response=await fetch('http://127.0.0.1:8810/content-api/hero-catalog/versions/'+encodeURIComponent(version));assert.equal(response.status,200);const manifest=await response.json();writeFileSync(out+'/catalog-manifest.json',JSON.stringify(manifest,null,2));
 const previews=c.events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.url.endsWith('/hero-catalog/preview'));assert(previews.length);
 const responseBody=await c.call('Network.getResponseBody',{requestId:previews.at(-1).params.requestId});const preview=JSON.parse(responseBody.body);writeFileSync(out+'/source-preview.json',JSON.stringify(preview,null,2));
 assert(preview.generatorSources.length>=7);
 const expected=readFileSync(process.cwd()+'/tools/skill-remake/heroes/godie-e00s.py','utf8');const ownSources=preview.generatorSources.filter(x=>x.sourcePath==='generator-source/tools/skill-remake/heroes/godie-e00s.py');assert.equal(ownSources.length,7);assert(ownSources.every(x=>x.source===expected));assert(preview.generatorSources.filter(x=>!x.generatorVersion).every(x=>x.source===null));
 await c.evaluate(`(()=>{const summary=Array.from(document.querySelectorAll('summary')).find(x=>x.textContent==='已保存的產生器來源');summary.parentElement.open=true;const detail=summary.parentElement.querySelector('details');detail.open=true;detail.scrollIntoView({block:'start'});})()`);
 writeFileSync(out+'/source-ui.txt',await c.evaluate('document.body.innerText'));
 const shot=await c.call('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/source-ui.png',Buffer.from(shot.data,'base64'));
 assert.deepEqual(hashes(),before);
 const proof={schema:'ggd-catalog-source-ui@1',status:'passed',versionId:version,hero:'godie-e00s',heroBindings:ownSources.length,unavailableDependencySources:preview.generatorSources.filter(x=>!x.generatorVersion).map(x=>x.productPath),knownCatalogBindings:manifest.generatorSources.bindings.filter(x=>x.generatorVersion).length,allBindings:manifest.generatorSources.bindings.length,generatorVersions:manifest.generatorSources.generators.map(x=>({versionId:x.versionId,step:x.step,files:x.files.length})),allContentFilesUnchanged:Object.keys(before).length,oldSourceRawTextMatches:true,scope:'Saved current registered Python source inputs, shown via real Admin UI. Historical source application and complete Go hero dependency restore remain pending.'};
 writeFileSync(out+'/source-ui-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{writeFileSync(out+'/source-ui-network.json',JSON.stringify(c.events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.url.includes('/hero-catalog/')).map(e=>({url:e.params.response.url,status:e.params.response.status})),null,2));c.close();}
