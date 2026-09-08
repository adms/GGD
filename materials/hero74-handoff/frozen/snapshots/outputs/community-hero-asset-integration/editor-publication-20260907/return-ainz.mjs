import {writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));const a=await connect('5540A0FD8040795FAF172B7B1FA0329C');
async function until(ex){for(let i=0;i<180;i++){const v=await a.evaluate(ex);if(v)return v;await new Promise(r=>setTimeout(r,300));}throw Error('Review UI timeout');}
const reason='W 死亡騎士的服務端模擬確實產生 summonSpawn（championId=thorne），但固定 ZIP 的 compiled/champions 只有本英雄，缺少召喚來源 thorne；固定預覽因此沒有第三個單位。退回補齊召喚依賴與其模型／資產，再重建當前版本 ZIP 驗證固定預覽。這是固定套件依賴缺漏，不要求製作原作死亡騎士模型，也不將兩個主角模型正常視為召喚畫面已通過。';
try{
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='重新查詢').click()`);
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText.startsWith('安茲·烏爾·恭 · 待審'))`);
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText.startsWith('安茲·烏爾·恭 · 待審')).click()`);
 await until(`document.querySelector('main article')?.innerText.startsWith('安茲·烏爾·恭 · 第 ')`);
 const snapshot=await a.evaluate(`document.querySelector('main article').innerText`);
 await a.evaluate(`(()=>{const e=document.querySelector('main article textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(reason)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='退回修改'&&!e.disabled)`);
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='退回修改').click()`);
 const response=await until(`(()=>{const t=document.querySelector('main article')?.innerText;return t?.startsWith('安茲·烏爾·恭 · 第 ')&&t.split('\\n')[0].includes('退回修改')?t:null;})()`);
 await writeFile('/private/tmp/ggd-community37-editor-publish/17/return-review.json',JSON.stringify({reason,snapshot,response,status:'returned'},null,2));console.log('Ainz candidate returned for missing summon snapshot dependencies');
}finally{a.close();}
