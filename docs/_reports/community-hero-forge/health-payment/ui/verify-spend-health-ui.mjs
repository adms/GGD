import {connect} from './cdp.mjs';
import fs from 'node:fs/promises';
const out='/private/tmp/ggd-community37-assets/spend-health-ui';
await fs.mkdir(out,{recursive:true});
const c=await connect();
const wait=async expression=>{for(let i=0;i<200;i++){if(await c.evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI wait: '+expression)};
const fill=async(path,value)=>{
 await c.evaluate(`(()=>{const e=document.querySelector('[data-field="${path}"]');if(!e)throw Error('missing ${path}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await wait(`document.querySelector('[data-field="${path}"]')?.value===${JSON.stringify(String(value))}`);
};
try {
 const url=await c.evaluate('location.href');if(url!=='http://127.0.0.1:5201/editor/')throw Error('Wrong isolated page '+url);
 await c.call('Network.enable');
 await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await c.evaluate(`([...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Abilities')).click()`);
 await wait(`Boolean([...document.querySelectorAll('button.doc-open')].find(e=>e.textContent.startsWith('godie-e001.q ')))`);
 await c.evaluate(`([...document.querySelectorAll('button.doc-open')].find(e=>e.textContent.startsWith('godie-e001.q '))).click()`);
 await wait(`Boolean([...document.querySelectorAll('input')].find(e=>e.value==='godie-e001.q'))`);
 await c.evaluate(`(()=>{const e=[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='spendHealth'));if(!e)throw Error('missing kind');e.value='spendHealth';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait(`Boolean(document.querySelector('.field-union[data-variant="spendHealth"]'))`);
 console.log(await c.evaluate(`JSON.stringify({fields:[...document.querySelectorAll('.field-union[data-variant="spendHealth"] [data-field]')].map(e=>({tag:e.tagName,path:e.dataset.field,value:e.value,text:e.textContent.slice(0,70)})),text:document.querySelector('.field-union[data-variant="spendHealth"]').innerText})`));
 await fill('effects.0.amount.flat',0);
 await fill('effects.0.minimumHp',1);
 await c.evaluate(`(()=>{const e=document.querySelector('[data-field="effects.0.pctMaxHealth.$mode"]');e.value='number';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait(`Boolean(document.querySelector('[data-field="effects.0.pctMaxHealth"]'))`);
 await fill('effects.0.pctMaxHealth',0.03);
 await wait(`document.body.innerText.includes('最大生命 3%')&&document.body.innerText.includes('保留至少 1 HP')`);
 await c.evaluate(`document.querySelector('.field-union[data-variant="spendHealth"]').scrollIntoView({block:'center'})`);
 await new Promise(r=>setTimeout(r,200));
 const shot=await c.call('Page.captureScreenshot',{format:'png'});await fs.writeFile(`${out}/health-payment-fields.png`,Buffer.from(shot.data,'base64'));
 await c.evaluate(`(()=>{const e=document.querySelector('[data-field="effects.0.pctMaxHealth.$mode"]');e.value='array';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait(`document.querySelector('[data-field="effects.0.pctMaxHealth.0"]')?.value==='0.03'`);
 await c.evaluate(`([...document.querySelector('[data-field="effects.0.pctMaxHealth.$mode"]').closest('fieldset').querySelectorAll('button')].find(e=>e.textContent==='新增一階')).click()`);
 await wait(`Boolean(document.querySelector('[data-field="effects.0.pctMaxHealth.1"]'))`);
 await fill('effects.0.pctMaxHealth.1',0.05);
 await wait(`document.body.innerText.includes('最大生命 3/5')`);
 await c.evaluate(`document.querySelector('[data-field="effects.0.pctMaxHealth.$mode"]').closest('fieldset').scrollIntoView({block:'center'})`);
 const ranksShot=await c.call('Page.captureScreenshot',{format:'png'});await fs.writeFile(`${out}/health-payment-ranks.png`,Buffer.from(ranksShot.data,'base64'));
 await c.evaluate(`(()=>{const e=document.querySelector('[data-field="effects.0.pctMaxHealth.$mode"]');e.value='number';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait(`document.querySelector('[data-field="effects.0.pctMaxHealth"]')?.value==='0.03'`);
 // An unfinished numeric token must not survive switching representations.
 await c.evaluate(`(()=>{const e=document.querySelector('[data-field="effects.0.pctMaxHealth.$mode"]');e.value='array';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait(`Boolean(document.querySelector('[data-field="effects.0.pctMaxHealth.0"]'))`);
 await fill('effects.0.pctMaxHealth.0','2e');
 await wait(`([...document.querySelectorAll('.editor-actions button')].find(e=>e.textContent.trim()==='save')).disabled`);
 await c.evaluate(`(()=>{const e=document.querySelector('[data-field="effects.0.pctMaxHealth.$mode"]');e.value='number';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait(`document.querySelector('[data-field="effects.0.pctMaxHealth"]')?.value==='0.03'`);
 await wait(`!([...document.querySelectorAll('.editor-actions button')].find(e=>e.textContent.trim()==='save')).disabled`);
 const fields=await c.evaluate(`JSON.stringify([...document.querySelectorAll('.field-union[data-variant="spendHealth"] [data-field]')].map(e=>({tag:e.tagName,path:e.dataset.field,value:e.value,min:e.min,max:e.max})))`);
 const text=await c.evaluate(`document.body.innerText.slice(-16000)`);
 const mutations=c.events.filter(e=>e.method==='Network.requestWillBeSent'&&!['GET','OPTIONS'].includes(e.params.request.method)).map(e=>({method:e.params.request.method,path:new URL(e.params.request.url).pathname}));
 if(mutations.length)throw Error('Unexpected write '+JSON.stringify(mutations));
 await fs.writeFile(`${out}/receipt.json`,JSON.stringify({url,document:'godie-e001.q',fields:JSON.parse(fields),text,mutations,saved:false,scope:'Isolated editor form and preview, not original hero visual acceptance'},null,2)+'\n');
 console.log(JSON.stringify({out,mutations,saved:false}));
 }finally {
 await c.evaluate(`(()=>{if(document.querySelector('.editor-head h2')?.textContent.startsWith('abilities/godie-e001.q'))[...document.querySelectorAll('.editor-actions button')].find(e=>e.textContent.trim()==='revert')?.click()})()`);
 await new Promise(r=>setTimeout(r,500));
 await c.call('Page.reload');await new Promise(r=>setTimeout(r,200));await c.call('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});c.close();
}
