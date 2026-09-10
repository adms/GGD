import { readFileSync, writeFileSync } from 'node:fs';
import { connect } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const {targetId}=JSON.parse(readFileSync('/private/tmp/ggd-template-version-ui-target.json'));
const tab=await connect(targetId);
const result=await tab.evaluate(`(()=>{const d=document.querySelector('.hero-products details');if(!d)throw Error('missing comparison');if(!d.open)d.querySelector('summary').click();d.closest('li').scrollIntoView({block:'start'});const t=d.querySelector('table');return {text:t.innerText,tableWidth:t.clientWidth,scrollWidth:t.scrollWidth,containerWidth:d.clientWidth};})()`);
await new Promise(r=>setTimeout(r,150));
writeFileSync('/private/tmp/ggd-template-version-ui-compare.png',Buffer.from((await tab.call('Page.captureScreenshot',{format:'png'})).data,'base64'));
writeFileSync('/private/tmp/ggd-template-version-ui-layout.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));tab.close();
