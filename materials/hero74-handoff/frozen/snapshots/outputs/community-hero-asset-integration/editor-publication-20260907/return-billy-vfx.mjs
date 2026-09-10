import {writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));const a=await connect('5540A0FD8040795FAF172B7B1FA0329C');
async function until(ex){for(let i=0;i<180;i++){const v=await a.evaluate(ex);if(v)return v;await new Promise(r=>setTimeout(r,300));}throw Error('Review UI timeout');}
const reason='Q／W／E 的模板修正已核對，但第 11 版 W 自身護盾的 castEffect 特效仍掛在 target。退回將掛點改為 self，對齊護盾與提示的對象，再依當前服務重建新修訂。原文、角色模型與既有版本歷史保留。';
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
 await writeFile('/private/tmp/ggd-community37-editor-publish/15/return-vfx-review.json',JSON.stringify({reason,snapshot,response,status:'returned'},null,2));console.log('Billy r11 returned for self-shield VFX anchor correction');
}finally{a.close();}
