import { readFileSync, writeFileSync } from 'node:fs';
import { connect } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const {targetId} = JSON.parse(readFileSync('/private/tmp/ggd-template-version-ui-target.json'));
const tab = await connect(targetId);
const click = text => tab.evaluate(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(text)}); if(!b||b.disabled)throw Error('button missing or disabled');b.click();return true;})()`);
await click('建立另一位英雄');
await tab.evaluate(`(()=>{for(const [label,value] of [['英雄名稱','模板版本畫面驗收'],['英雄概念','驗證固定模板版本、個別微調與完整六槽方案。']]) { const el=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(el.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}return true;})()`);
await click('產生三個方案');
await click('採用這個方案');
await click('調整六槽技能與演出 →');
for(let i=0;i<60;i++) {
  if(await tab.evaluate('document.body.innerText.includes("六槽編譯與模擬已通過")')) break;
  await new Promise(r=>setTimeout(r,250));
}
const result=await tab.evaluate(`(()=>{const section=document.querySelector('.hero-slot-editor');section.scrollIntoView({block:'start'});return {name:document.querySelector('h1').textContent,slot:section.innerText,compiled:document.body.innerText.includes('六槽編譯與模擬已通過'),alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent)};})()`);
writeFileSync('/private/tmp/ggd-template-version-ui-proof.json',JSON.stringify({targetId,...result},null,2));
const shot=await tab.call('Page.captureScreenshot',{format:'png'});
writeFileSync('/private/tmp/ggd-template-version-ui.png',Buffer.from(shot.data,'base64'));
console.log(JSON.stringify(result));
tab.close();
