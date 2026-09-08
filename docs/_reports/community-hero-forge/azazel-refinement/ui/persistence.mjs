import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(path.join(process.cwd(),'docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs')));
const c=await connect();
const out='docs/_reports/community-hero-forge/azazel-refinement/ui';
const field='acceptedPlan.slots.EX.products.0.template.params.effects.0.onConsumed.0.modifiers.0.value';
const read=()=>c.evaluate(`document.querySelector('[data-field="${field}"]')?.value`);
const wait=async expression=>{for(let n=0;n<100;n++){if(await c.evaluate(expression))return;await new Promise(r=>setTimeout(r,200))}throw Error('UI wait expired '+expression)};
const edit=async value=>{
  await c.evaluate(`(()=>{const f=document.querySelector('[data-field="${field}"]');if(f.matches(':disabled'))throw Error('Locked');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(f,${JSON.stringify(value)});f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('blur',{bubbles:true}));})()`);
  await wait(`document.body.innerText.includes('六槽編譯與模擬已通過') && document.querySelector('[data-field="${field}"]').value===${JSON.stringify(value)}`);
  await new Promise(r=>setTimeout(r,1500));
};
const reopen=async()=>{
  await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='我的作品').click()`);
  await wait(`[...document.querySelectorAll('h2')].some(e=>e.textContent==='阿薩謝爾')`);
  await c.evaluate(`[...document.querySelectorAll('h2')].find(e=>e.textContent==='阿薩謝爾').parentElement.querySelector('button').click()`);
  await wait(`document.querySelector('.hero-page h1')?.textContent==='阿薩謝爾'`);
  await c.evaluate(`[...document.querySelectorAll('.hero-slots button')].filter(e=>e.innerText==='EX').at(-1).click()`);
  await wait(`!!document.querySelector('[data-field="${field}"]')`);
};
try {
  await c.call('Network.enable');
  assert.equal(await read(),'0.1');
  await edit('0.12');
  await reopen();
  const reopened=await read();
  assert.equal(reopened,'0.12');
  const ap=await c.evaluate(`document.querySelector('[data-field="${field.replace('modifiers.0','modifiers.1')}"]').value`);
  assert.equal(ap,'0.1');
  await c.evaluate(`document.querySelector('[data-field="${field}"]').scrollIntoView({block:'center'})`);
  const screenshot=await c.call('Page.captureScreenshot',{format:'png'});
  await writeFile(out+'/reopened-ad-12.png',Buffer.from(screenshot.data,'base64'));
  await edit('0.1');
  await reopen();
  const restored=await read();
  assert.equal(restored,'0.1');
  const report={field,initial:'0.1',edited:'0.12',reopened,unchangedAp:ap,restored,writes:c.events.filter(e=>e.method==='Network.requestWillBeSent'&&!['GET','OPTIONS'].includes(e.params.request.method)).map(e=>({method:e.params.request.method,url:e.params.request.url}))};
  await writeFile(out+'/persistence.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{c.close()}
