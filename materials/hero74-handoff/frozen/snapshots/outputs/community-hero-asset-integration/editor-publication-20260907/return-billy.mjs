import {writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));const a=await connect('5540A0FD8040795FAF172B7B1FA0329C');
async function until(ex){for(let i=0;i<180;i++){const v=await a.evaluate(ex);if(v)return v;await new Promise(r=>setTimeout(r,300));}throw Error('Review UI timeout');}
const reason='退回編輯器修正：Q 正面擒抱目前只是單擊，改用現有抓取投擲模板；W 肌肉防線錯配成抓投，改成限時自身護盾；E 肩膀衝撞錯配成護盾，改用現有直線衝鋒推撞。原名稱與完整 Owner 原文保持，將仍未完成的氣勢、配對動作及首敵停止差異寫入各槽處理說明，再建新修訂送審。';
try{
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='重新查詢').click()`);
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText.startsWith('比利海靈頓 · 待審'))`);
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText.startsWith('比利海靈頓 · 待審')).click()`);
 await until(`document.querySelector('main article')?.innerText.startsWith('比利海靈頓 · 第 ')`);
 const snapshot=await a.evaluate(`document.querySelector('main article').innerText`);
 await a.evaluate(`(()=>{const e=document.querySelector('main article textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(reason)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='退回修改'&&!e.disabled)`);
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='退回修改').click()`);
 const response=await until(`(()=>{const t=document.querySelector('main article')?.innerText;return t?.startsWith('比利海靈頓 · 第 ')&&t.split('\\n')[0].includes('退回修改')?t:null;})()`);
 await writeFile('/private/tmp/ggd-community37-editor-publish/15/return-review.json',JSON.stringify({reason,snapshot,response,status:'returned'},null,2));console.log('Billy original candidate returned for concrete template corrections');
}finally{a.close();}
