import {writeFile,mkdir} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const number=process.argv[2],name=process.argv[3],out='/private/tmp/ggd-community37-editor-publish/'+number;
await mkdir(out,{recursive:true});
const a=await connect('5540A0FD8040795FAF172B7B1FA0329C');const c=await connect('02B883304E6A5424B24704EA5CAAB195');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(client,ex,label,ms=60000){const end=Date.now()+ms;while(Date.now()<end){const v=await client.evaluate(ex);if(v)return v;await wait(300);}throw Error('Timed out '+label);}
const proof={name,slots:[],status:'running'};
try{
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='重新查詢').click()`);
 await until(a,`[...document.querySelectorAll('button')].some(e=>e.innerText.startsWith(${JSON.stringify(name+' · 待審')}))`,'candidate');
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText.startsWith(${JSON.stringify(name+' · 待審')})).click()`);
 const src=await until(a,`document.querySelector('iframe[title="完整英雄固定版本預覽"]')?.src`,'fixed preview');proof.url=src;
 await c.call('Emulation.setDeviceMetricsOverride',{width:1920,height:1200,deviceScaleFactor:1,mobile:false});
 await c.call('Page.navigate',{url:src});
 await until(c,`document.querySelector('[aria-label="選擇審查技能"]')!==null`,'review ready');
 for(const slot of ['PASSIVE','Q','W','E','R','EX']){
  await c.evaluate(`[...document.querySelectorAll('[aria-label="選擇審查技能"] button')].find(e=>e.innerText===${JSON.stringify(slot)}).click()`);
  await wait(350);
  const actors=await until(c,`(()=>{const xs=document.body.innerText.split('\\n').filter(x=>/^(施法者|目標)：/.test(x));return xs.length===2&&xs.every(x=>x.includes('材質正常')||x.includes('⚠'))?xs:null;})()`,'models '+slot);
  await c.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center'})`);
  const play=await c.evaluate(`[...document.querySelectorAll('button')].filter(e=>e.innerText==='▶').length`);
  if(play) {await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='▶').click()`);await wait(1600);await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='❚❚'||e.innerText==='⏸')?.click()`);}
  const shot=await c.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/review-'+slot+'.png',Buffer.from(shot.data,'base64'));
  const body=await c.evaluate('document.body.innerText');await writeFile(out+'/review-'+slot+'.txt',body);
  proof.slots.push({slot,actors,result:body.split('\n').find(x=>x.startsWith('完成施放')||x.startsWith('施放未完成'))});
  await writeFile(out+'/review.json',JSON.stringify(proof,null,2)+'\n');console.log(number,name,slot,actors.every(x=>x.includes('材質正常'))?'models ready':'visual warning');
 }
 proof.status='captured';
}catch(e){proof.status='needs-attention';proof.error=String(e);console.log(proof.error);await writeFile(out+'/review-failure.txt',await c.evaluate('document.body.innerText'));process.exitCode=1;}
finally{await writeFile(out+'/review.json',JSON.stringify(proof,null,2)+'\n');a.close();c.close();}
