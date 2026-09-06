import { connect } from './cdp.mjs';
import fs from 'node:fs/promises';
const out='/private/tmp/ggd-community37-assets/status-consumption-ui';
await fs.mkdir(out,{recursive:true});
const c=await connect();
const wait=async expression=>{for(let i=0;i<200;i++){if(await c.evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI wait: '+expression)};
const select=async(path,value)=>{
  await c.evaluate(`(()=>{const e=[...document.querySelectorAll('select[data-field]')].find(e=>e.dataset.field===${JSON.stringify(path)});if(!e)throw Error('missing select');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(`Boolean([...document.querySelectorAll('select[data-field]')].find(e=>e.dataset.field===${JSON.stringify(path)}&&e.value===${JSON.stringify(value)}))`);
};
const capture=async(name,selector)=>{
  await c.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
  await new Promise(r=>setTimeout(r,150));
  const shot=await c.call('Page.captureScreenshot',{format:'png'});
  await fs.writeFile(`${out}/${name}.png`,Buffer.from(shot.data,'base64'));
};
try {
  await c.call('Network.enable');
  await c.call('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
  await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await c.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Abilities');if(!b)throw Error('missing collection');b.click()})()`);
  await wait(`Boolean([...document.querySelectorAll('button.doc-open')].find(e=>e.textContent.startsWith('godie-e001.q ')))`);
  await c.evaluate(`([...document.querySelectorAll('button.doc-open')].find(e=>e.textContent.startsWith('godie-e001.q '))).click()`);
  await wait(`Boolean([...document.querySelectorAll('input')].find(e=>e.value==='godie-e001.q'))`);
  await c.evaluate(`(()=>{const e=[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='consumeStatus'));if(!e)throw Error('missing kind');e.value='consumeStatus';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(`Boolean(document.querySelector('[data-field="effects.0.count.$mode"]'))`);
  await c.evaluate(`(()=>{const e=document.querySelector('.field-union[data-variant="consumeStatus"] .field-ref select');e.value='curse';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await c.evaluate(`([...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='+ add on consumed')).click()`);
  await wait(`Boolean(document.querySelector('.field-union[data-variant="consumeStatus"] .field-union .union-kind select'))`);
  await c.evaluate(`(()=>{const e=document.querySelector('.field-union[data-variant="consumeStatus"] .field-union .union-kind select');e.value='heal';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(`Boolean(document.querySelector('[data-field="effects.0.onConsumed.0.amount.flat"]'))`);
  await c.evaluate(`(()=>{const e=document.querySelector('[data-field="effects.0.onConsumed.0.amount.flat"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'1');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await select('effects.0.count.$mode','literal');
  await select('effects.0.appliedBy','self');
  await select('effects.0.subject','target');
  const literal=await c.evaluate(`(()=>{const f=document.querySelector('.field-number-or-literal');return {text:f.innerText,hasNumber:Boolean(f.querySelector('input[data-field="effects.0.count"]')),rawJson:f.innerText.includes('raw JSON')}})()`);
  if(literal.hasNumber||literal.rawJson||!literal.text.includes('全部'))throw Error('literal mode did not render');
  await capture('count-all','[data-field="effects.0.count.$mode"]');
  await select('effects.0.count.$mode','number');
  await c.evaluate(`(()=>{const e=document.querySelector('[data-field="effects.0.count"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'3');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(`document.querySelector('[data-field="effects.0.count"]').value==='3'`);
  const numeric=await c.evaluate(`(()=>{const e=document.querySelector('[data-field="effects.0.count"]');return {value:e.value,min:e.min,max:e.max,step:e.step}})()`);
  await capture('count-three','[data-field="effects.0.count.$mode"]');
  await c.evaluate(`(()=>{const e=document.querySelector('[data-field="statusCost.count"]').closest('fieldset').querySelector('.field-ref select');e.value='curse';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const cost=await c.evaluate(`(()=>{const e=document.querySelector('[data-field="statusCost.count"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'3');e.dispatchEvent(new Event('input',{bubbles:true}));return {path:e.dataset.field,min:e.min,max:e.max}})()`);
  await wait(`document.querySelector('[data-field="statusCost.count"]').value==='3'`);
  await capture('cast-resource-cost','[data-field="statusCost.count"]');
  const mutations=c.events.filter(e=>e.method==='Network.requestWillBeSent'&&!['GET','OPTIONS'].includes(e.params.request.method))
    .map(e=>({method:e.params.request.method,path:new URL(e.params.request.url).pathname}));
  if(mutations.length)throw Error('Unexpected write request '+JSON.stringify(mutations));
  await fs.writeFile(`${out}/receipt.json`,JSON.stringify({url:'http://127.0.0.1:5201/editor/',document:'godie-e001.q',literal,numeric,cost,mutations,saved:false},null,2)+'\n');
  console.log(JSON.stringify({literal,numeric,cost,mutations,saved:false,out}));
}finally {
  await c.call('Page.reload');
  await new Promise(r=>setTimeout(r,200));
  await c.call('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
  c.close();
}
