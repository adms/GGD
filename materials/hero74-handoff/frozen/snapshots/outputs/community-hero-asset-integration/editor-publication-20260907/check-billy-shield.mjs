import {writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));const c=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 assert(await c.evaluate(`document.querySelector('h1')?.innerText==='比利海靈頓'`));await c.call('Emulation.setDeviceMetricsOverride',{width:1920,height:1200,deviceScaleFactor:1,mobile:false});await c.call('Page.bringToFront');
 await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='全螢幕預覽')?.click()`);
 for(let i=0;i<180;i++){if(await c.evaluate(`(()=>{const a=document.body.innerText.split('\\n').filter(x=>/^(施法者|目標)：/.test(x));return a.length===2&&a.every(x=>x.includes('材質正常'));})()`))break;await wait(300);if(i===179)throw Error('model readiness');}
 await c.evaluate(`(()=>{const e=document.querySelector('input[aria-label="Sim 與 3D 播放位置"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'350');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(500);
 const body=await c.evaluate('document.body.innerText');assert(body.includes('目前預覽 W'));
 const shot=await c.call('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/ggd-community37-editor-publish/15/shield-self-r16.png',Buffer.from(shot.data,'base64'));await writeFile('/private/tmp/ggd-community37-editor-publish/15/shield-self-r16.txt',body);console.log('Billy r16 W frame at 350ms captured');
}finally{c.close();}
