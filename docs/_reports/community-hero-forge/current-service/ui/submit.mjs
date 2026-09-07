if (!process.env.GGD_LOCAL_PROOF_PASSWORD) throw Error('GGD_LOCAL_PROOF_PASSWORD required');
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const c=await connect(),out='/private/tmp/ggd-community37-current-ui';
const proof={scope:'Actual isolated Editor login, current-service build and submission. No original-design or production approval.',steps:[],status:'running'};
const save=()=>writeFile(out+'/submission.json',JSON.stringify(proof,null,2)+'\n');
async function until(expression,label,ms=90000){const end=Date.now()+ms;while(Date.now()<end){const v=await c.evaluate(expression);if(v)return v;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out '+label);}
async function capture(name){const body=await c.evaluate('document.body.innerText');await writeFile(out+'/'+name+'.txt',body);const p=await c.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(p.data,'base64'));proof.steps.push({name,at:new Date().toISOString()});await save();}
try{
 await c.evaluate(`[...document.querySelectorAll('h2')].find(e=>e.textContent==='阿薩謝爾').parentElement.querySelector('button').click()`);
 await until(`document.querySelector('.hero-community input[autocomplete="username"]')!==null`,'login form');
 await c.evaluate(`(()=>{for(const [selector,value] of [['input[autocomplete="username"]','model-author'],['input[type="password"]',${JSON.stringify(process.env.GGD_LOCAL_PROOF_PASSWORD)}]]){const e=document.querySelector('.hero-community '+selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='登入以同步與投稿'&&!e.disabled)`,'login enabled');
 await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='登入以同步與投稿').click()`);
 await until(`document.body.innerText.includes('雲端帳號：model-author')`,'author login');
 const actors=await until(`(()=>{const lines=document.body.innerText.split('\\n').filter(x=>/^(施法者|目標)：/.test(x));return lines.length===2&&lines.every(x=>x.includes('材質正常'))?lines:null;})()`,'two rendered GLB actors');
 proof.actors=actors;
 await capture('author-current-model');
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='建立完整英雄 ZIP'&&!e.disabled)`,'build enabled');
 await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='建立完整英雄 ZIP').click()`);
 const built=await until(`(()=>{const t=document.querySelector('.hero-package-panel')?.innerText??'';return /完整英雄檢查通過|無法建立完整英雄/.test(t)?t:null;})()`,'service build');
 assert(built.includes('完整英雄檢查通過'),built);
 await c.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});
 proof.packageSummary=built.slice(0,1300);
 await capture('current-built-zip');
 const download=await c.evaluate(`[...document.querySelectorAll('button')].filter(e=>/下載.*ZIP/.test(e.innerText)).map(e=>e.innerText)`);proof.downloadButtons=download;
 if(download.length===1)await c.evaluate(`[...document.querySelectorAll('button')].find(e=>/下載.*ZIP/.test(e.innerText)).click()`);
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='提交這份完整英雄審查'&&!e.disabled)`,'submission enabled');
 await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='提交這份完整英雄審查').click()`);
 const submitted=await until(`(()=>{const t=document.querySelector('.hero-community')?.innerText??'';return /完整英雄已送審|HTTP \d{3}|Error:/.test(t)?t:null;})()`,'submission response');
 assert(submitted.includes('完整英雄已送審'),submitted);
 proof.submissionSummary=submitted;
 await capture('submitted-current-azazel');proof.status='passed';
}catch(e){proof.status='failed';proof.error=String(e);await capture('submission-failure');process.exitCode=1;}
finally{await save();c.close();console.log(JSON.stringify(proof));}
