import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { connect } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const {targetId} = JSON.parse(readFileSync('/private/tmp/ggd-template-version-ui-target.json'));
const tab=await connect(targetId);
const dir='/private/tmp/ggd-template-version-ui-download';mkdirSync(dir,{recursive:true});
await tab.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
await tab.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='下載草稿備份');if(!b||b.disabled)throw Error('missing download');b.click();})()`);
for(let i=0;i<50;i++) {if(readdirSync(dir).some(f=>f.endsWith('-draft.json')))break;await new Promise(r=>setTimeout(r,200));}
const file=readdirSync(dir).find(f=>f.endsWith('-draft.json'));if(!file)throw Error('no downloaded draft');
await tab.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await tab.evaluate(`document.querySelector('.hero-products').scrollIntoView({block:'start'})`);
await new Promise(r=>setTimeout(r,150));
const shot=await tab.call('Page.captureScreenshot',{format:'png'});writeFileSync('/private/tmp/ggd-template-version-ui.png',Buffer.from(shot.data,'base64'));
const draft=JSON.parse(readFileSync(dir+'/'+file));const plan=draft.payload.project.acceptedPlan;
console.log(JSON.stringify({file:dir+'/'+file,projectId:draft.payload.project.projectId,versions:Object.keys(plan.templateVersions).length,cards:Object.fromEntries(Object.entries(plan.slots).map(([slot,data])=>[slot,data.products.map(p=>({instanceId:p.instanceId,ref:p.template.ref,digest:p.template.contentSha256}))]))}));
tab.close();
