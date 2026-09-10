import {readFile,writeFile}from'node:fs/promises';import{pathToFileURL}from'node:url';
const{connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const out='/private/tmp/ggd-community37-editor-publish/32';const proof=JSON.parse(await readFile(out+'/review.json','utf8'));const c=await connect('02B883304E6A5424B24704EA5CAAB195');const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(ex,label){for(let i=0;i<200;i++){const v=await c.evaluate(ex);if(v)return v;await wait(300);}throw Error(label);}
try{
 await c.call('Page.navigate',{url:proof.url});await until(`!!document.querySelector('[aria-label="選擇審查技能"]')`,'fixed candidate ready');
 await c.evaluate(`[...document.querySelectorAll('[aria-label="選擇審查技能"] button')].find(e=>e.innerText==='EX').click()`);await wait(300);
 await c.evaluate(`(()=>{const e=document.querySelector('[aria-label="固定版本前置施法"]');e.value='R';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(400);
 await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='全螢幕預覽')?.click()`);
 const actors=await until(`(()=>{const a=document.body.innerText.split('\\n').filter(x=>/^(施法者|目標)：/.test(x));return a.length===2&&a.every(x=>x.includes('材質正常'))?a:null;})()`,'normal models');
 await c.evaluate(`(()=>{const e=document.querySelector('input[aria-label="Sim 與 3D 播放位置"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'200');e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('canvas').scrollIntoView({block:'center'});})()`);await wait(800);
 const body=await c.evaluate('document.body.innerText');await writeFile(out+'/fixed-R-EX.txt',body);
 const events=await c.evaluate(`[...document.querySelectorAll('.forge-sim-ruler span')].map(e=>e.title)`);
 const shot=await c.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/fixed-R-EX.png',Buffer.from(shot.data,'base64'));
 const result={url:proof.url,actors,timeMs:200,priorSlot:'R',waitSec:1.5,events,enemyBoonVisible:body.includes('反轉增益 ↑ AD/AP +10%'),casterReactionVisible:body.includes('怎麼反而變強了？！'),ordinaryCurseVisible:body.includes('終章萎靡 ↓ AD/AP -20%')};
 await writeFile(out+'/fixed-R-EX.json',JSON.stringify(result,null,2));console.log(result);
 if(!result.enemyBoonVisible||!result.casterReactionVisible||result.ordinaryCurseVisible)throw Error('Expected mutually exclusive reversal display');
}finally{c.close();}
