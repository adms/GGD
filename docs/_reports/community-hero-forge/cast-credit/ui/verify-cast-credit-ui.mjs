import {connect} from './cdp.mjs';
import fs from 'node:fs/promises';
const out=process.env.GGD_UI_OUT??'/private/tmp/ggd-community37-assets/cast-credit-ui';
await fs.mkdir(out,{recursive:true});
const c=await connect();
const wait=async x=>{for(let i=0;i<200;i++){if(await c.evaluate(x))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI wait: '+x)};
const choose=async(path,value)=>c.evaluate(`(()=>{const e=document.querySelector('[data-field="${path}"]');if(!e)throw Error('missing ${path}');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const onceLabel=`[...document.querySelectorAll('label')].find(e=>e.querySelector('.field-label')?.textContent==='Once Per Cast')`;
try {
 await c.call('Network.enable');
 await c.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 if(await c.evaluate('location.href')!=='http://127.0.0.1:5201/editor/')throw Error('Wrong isolated page');
 await wait(`Boolean([...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Abilities'))`);
 await c.evaluate(`([...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Abilities')).click()`);
 await wait(`Boolean([...document.querySelectorAll('button.doc-open')].find(e=>e.textContent.startsWith('godie-e001.q ')))`);
 await c.evaluate(`([...document.querySelectorAll('button.doc-open')].find(e=>e.textContent.startsWith('godie-e001.q '))).click()`);
 await wait(`Boolean([...document.querySelectorAll('input')].find(e=>e.value==='godie-e001.q'))`);
 await c.evaluate(`([...document.querySelectorAll('.editor-actions button')].find(e=>e.textContent.trim()==='revert')).click()`);
 await new Promise(r=>setTimeout(r,400));
 await c.evaluate(`(()=>{const e=[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='applyBuff'));e.value='applyBuff';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait(`Boolean(document.querySelector('.field-union[data-variant="applyBuff"]'))`);
 await c.evaluate(`(()=>{const e=document.querySelector('[data-field="effects.0.duration"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'5');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await c.evaluate(`([...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='+ add hook')).click()`);
 await wait(`Boolean(document.querySelector('[data-field="effects.0.hooks.0.on"]'))`);
 await choose('effects.0.hooks.0.on','onDamageDealt');
 console.log(await c.evaluate(`JSON.stringify([...document.querySelectorAll('label')].filter(e=>e.textContent.includes('Once')).map(e=>({text:e.innerText,html:e.outerHTML})))`));
 await wait(`Boolean(${onceLabel})`);
 await c.evaluate(`(${onceLabel}).querySelector('input').click()`);
 await wait(`(${onceLabel}).querySelector('input').checked`);
 await c.evaluate(`(${onceLabel}).scrollIntoView({block:'center'})`);
 await new Promise(r=>setTimeout(r,200));
 const enabled=await c.call('Page.captureScreenshot',{format:'png'});await fs.writeFile(`${out}/once-per-cast-enabled.png`,Buffer.from(enabled.data,'base64'));
 await choose('effects.0.hooks.0.on','onAbilityHit');
 await wait(`document.body.innerText.includes('每次施法一次只支援 onDamageDealt')`);
 await c.evaluate(`(${onceLabel}).scrollIntoView({block:'center'})`);
 const invalid=await c.call('Page.captureScreenshot',{format:'png'});await fs.writeFile(`${out}/once-per-cast-invalid-event.png`,Buffer.from(invalid.data,'base64'));
 await choose('effects.0.hooks.0.on','onDamageDealt');
 await wait(`!document.body.innerText.includes('每次施法一次只支援 onDamageDealt')`);
 await c.evaluate(`(${onceLabel}).querySelector('input').click()`);
 await wait(`!(${onceLabel}).querySelector('input').checked`);
 await c.evaluate(`(${onceLabel}).querySelector('input').click()`);
 await wait(`(${onceLabel}).querySelector('input').checked`);
 const mutations=c.events.filter(e=>e.method==='Network.requestWillBeSent'&&!['GET','OPTIONS'].includes(e.params.request.method)).map(e=>({method:e.params.request.method,path:new URL(e.params.request.url).pathname}));
 if(mutations.length)throw Error('Unexpected write '+JSON.stringify(mutations));
 const label=await c.evaluate(`(${onceLabel}).innerText`);
 await fs.writeFile(`${out}/receipt.json`,JSON.stringify({url:'http://127.0.0.1:5201/editor/',document:'godie-e001.q',label,
  enabled:true,toggleOffAndOn:true,invalidEventRejected:true,mutations,saved:false,
  scope:'Isolated authoring controls only; not original hero 3D/VFX acceptance'},null,2)+'\n');
 console.log(JSON.stringify({out,mutations,saved:false,passed:true}));
}finally{
 await c.evaluate(`(()=>{if(document.querySelector('.editor-head h2')?.textContent.startsWith('abilities/godie-e001.q'))[...document.querySelectorAll('.editor-actions button')].find(e=>e.textContent.trim()==='revert')?.click()})()`);
 await new Promise(r=>setTimeout(r,400));await c.call('Page.reload');await new Promise(r=>setTimeout(r,200));
 await c.call('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});c.close();
}
