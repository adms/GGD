import {pathToFileURL} from 'node:url';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));const out='/private/tmp/ggd-community37-current-ui';
const admin=await connect(JSON.parse(await readFile(out+'/admin-target.json','utf8')).targetId),author=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');
const reason='隔離流程驗收：最新版建包、原文保留、六槽代理模型及固定審查版本均已確認。原設計仍有下列缺項，退回逐項補強；本次不授予完整原設計驗收或正式發布資格。';
const problems=[{slot:'E',field:'acceptedPlan.slots.E.products',message:'尚缺方向判定、近身技能分類與影子反擊；目前只反擊近距離普攻。'},
{slot:'W',field:'presentation.slots.W',message:'白色魔力雨的專屬特效、角色動作與音效仍待完成；目前保留通用演出。'},
{slot:'EX',field:'presentation.slots.EX',message:'重複自身 R 詛咒時反轉為敵方增益的機制已補驗；金光、敌方增益 UI 與施法者驚愕專屬演出仍未全部完成。'}];
const proof={scope:'Actual isolated reviewer returns incomplete original design with specific issues; author sees the same decision.',reason,problems,status:'running'};
async function until(c,ex,label){const end=Date.now()+60000;while(Date.now()<end){const x=await c.evaluate(ex);if(x)return x;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out '+label);}
const set=(selector,value)=>admin.evaluate(`(()=>{const e=${selector};Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
try{
 await set(`[...document.querySelectorAll('main article label')].find(e=>e.innerText.startsWith('審查意見')).querySelector('textarea')`,reason);
 for(let i=0;i<problems.length;i++){
  await admin.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='新增欄位問題').click()`);
  await new Promise(r=>setTimeout(r,50));
  await set(`[...document.querySelectorAll('main article label')].filter(e=>e.innerText.startsWith('問題位置'))[${i}].querySelector('select')`,problems[i].slot);
  await set(`[...document.querySelectorAll('main article label')].filter(e=>e.innerText==='欄位')[${i}].querySelector('input')`,problems[i].field);
  await set(`[...document.querySelectorAll('main article label')].filter(e=>e.innerText==='具體問題')[${i}].querySelector('input')`,problems[i].message);
 }
 await until(admin,`[...document.querySelectorAll('button')].some(e=>e.innerText==='退回修改'&&!e.disabled)`,'return enabled');
 await admin.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='退回修改').click()`);
 await until(admin,`document.body.innerText.includes('已退回修改，作者可查看具體問題。')`,'returned');
 await author.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='更新審查結果').click()`);
 const response=await until(author,`(()=>{const t=document.querySelector('.hero-community').innerText;return t.includes('投稿結果：退回修改')?t:null;})()`,'author received decision');
 assert(response.includes(reason));for(const item of problems)assert(response.includes(item.message));
 await writeFile(out+'/returned-author.txt',response);
 await author.evaluate(`document.querySelector('.hero-community').scrollIntoView({block:'center'})`);const p=await author.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/returned-author.png',Buffer.from(p.data,'base64'));
 proof.authorReceivedExactIssues=true;proof.status='passed';
}catch(e){proof.status='failed';proof.error=String(e);process.exitCode=1;}
finally{await writeFile(out+'/return-review.json',JSON.stringify(proof,null,2)+'\n');admin.close();author.close();console.log(JSON.stringify(proof));}
