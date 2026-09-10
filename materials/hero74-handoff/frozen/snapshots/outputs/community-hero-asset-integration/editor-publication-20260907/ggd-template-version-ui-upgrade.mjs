import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { connect } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const {targetId}=JSON.parse(readFileSync('/private/tmp/ggd-template-version-ui-target.json'));
const tab=await connect(targetId);
const {root}=await tab.call('DOM.getDocument');
const {nodeId}=await tab.call('DOM.querySelector',{nodeId:root.nodeId,selector:'.hero-package-panel input[type=file]'});
await tab.call('DOM.setFileInputFiles',{nodeId,files:['/private/tmp/ggd-template-version-ui-old-fixture.json']});
for(let i=0;i<50;i++){if(await tab.evaluate(`document.querySelector('h1')?.textContent==='模板版本升級驗收（模擬舊版）'`))break;await new Promise(r=>setTimeout(r,200));}
await tab.evaluate(`(()=>{const d=[...document.querySelectorAll('.hero-products details')][0];if(!d)throw Error('missing compare');d.querySelector('summary').click();document.querySelector('.hero-products').scrollIntoView({block:'start'});})()`);
await new Promise(r=>setTimeout(r,200));
writeFileSync('/private/tmp/ggd-template-version-ui-compare.png',Buffer.from((await tab.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
await tab.evaluate(`(()=>{const b=[...document.querySelectorAll('.hero-products button')].find(x=>x.textContent==='採用此模板新版');if(!b||b.disabled)throw Error('missing adoption');b.click();})()`);
const dir='/private/tmp/ggd-template-version-ui-upgraded';mkdirSync(dir,{recursive:true});
await tab.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
await tab.evaluate(`(()=>{[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='下載草稿備份').click();})()`);
for(let i=0;i<50;i++){if(readdirSync(dir).some(f=>f.endsWith('-draft.json')))break;await new Promise(r=>setTimeout(r,200));}
const file=readdirSync(dir).find(f=>f.endsWith('-draft.json'));if(!file)throw Error('missing draft');
const old=JSON.parse(readFileSync('/private/tmp/ggd-template-version-ui-old-fixture.json')).payload.project;
const current=JSON.parse(readFileSync(dir+'/'+file)).payload.project;
const before=old.acceptedPlan.slots.Q.products,after=current.acceptedPlan.slots.Q.products;
if(JSON.stringify(after[0].template.params)!==JSON.stringify(before[0].template.params))throw Error('lost tuning');
if(JSON.stringify(after[1])!==JSON.stringify(before[1]))throw Error('second product changed');
if(after[0].template.contentSha256===before[0].template.contentSha256)throw Error('no upgrade');
writeFileSync('/private/tmp/ggd-template-version-ui-upgrade-proof.json',JSON.stringify({fixture:'Simulated old template imported as a local draft; no shared template or publication changed',before:before.map(p=>p.template),after:after.map(p=>p.template),tuningPreserved:true,secondProductUnchanged:true,download:dir+'/'+file},null,2));
console.log(JSON.stringify({tuningPreserved:true,secondProductUnchanged:true,versions:after.map(p=>p.template.contentSha256)}));
tab.close();
