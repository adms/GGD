import {writeFile,readFile,mkdir} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const root='/private/tmp/ggd-community37-editor-publish';const bindings=JSON.parse(await readFile('tools/community-hero-forge/library-bodies/community37.bindings.json','utf8')).entries;
const c=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(ex,label,ms=60000){const end=Date.now()+ms;while(Date.now()<end){const v=await c.evaluate(ex);if(v)return v;await wait(250);}throw Error('Timed out '+label);}
const click=t=>c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText===${JSON.stringify(t)}&&!e.disabled).click()`);
try{
await c.call('Emulation.setDeviceMetricsOverride',{width:1920,height:1200,deviceScaleFactor:1,mobile:false});await c.call('Page.bringToFront');
for(const arg of process.argv.slice(2)){
 const n=Number(arg),b=bindings[n-1],out=root+'/'+String(n).padStart(2,'0')+'/author-preview';await mkdir(out,{recursive:true});const proof={name:b.name,projectId:b.projectId,scope:'Current local Editor draft, not a fixed submitted candidate',slots:[],status:'running'};
 try{
 await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='離開全螢幕')?.click()`);
 await click('我的作品');await until(`document.querySelectorAll('h2').length>20`,'works');
 await c.evaluate(`[...document.querySelectorAll('h2')].find(e=>e.textContent===${JSON.stringify(b.name)}).parentElement.querySelector('button').click()`);
 await until(`document.querySelector('.hero-slots')!==null`,'hero');await until(`document.body.innerText.includes('六槽編譯與模擬已通過')`,'compiled');
 await click('進階編輯');await until(`document.querySelector('.hero-json')!==null`,'project JSON');const project=JSON.parse(await c.evaluate(`document.querySelector('.hero-json').value`));if(project.projectId!==b.projectId)throw Error('Wrong project');proof.revision=project.revision;await writeFile(out+'/project.json',JSON.stringify(project,null,2)+'\n');await click('視覺編輯');
 for(const slot of ['PASSIVE','Q','W','E','R','EX']){
 await c.evaluate(`[...document.querySelectorAll('.hero-slots button')].find(e=>e.innerText===${JSON.stringify(slot)}).click()`);await wait(350);
 await until(`document.body.innerText.includes('目前預覽 ${slot}')`,'selected '+slot);
 await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='全螢幕預覽')?.click()`);await wait(350);
 const actors=await until(`(()=>{const xs=document.querySelector('.vfx-actor-status')?.innerText.split('\\n')??[];return xs.length===2&&xs.every(x=>x.includes('材質正常')||x.includes('⚠'))?xs:null;})()`,'models');
 const events=await c.evaluate(`[...document.querySelectorAll('.forge-sim-ruler span')].map(e=>e.title)`);
 if(events.some(e=>e.includes('summonSpawn')))await wait(6000);
 const significant=events.find(e=>/summonSpawn|shieldApplied|buffApplied|abilityHit|projectileSpawn|castEnd/.test(e))??events[0];const ms=significant?Number(significant.match(/^(\d+)ms/)?.[1]??0):0;const time=Math.min(5500,ms+100);
 await c.evaluate(`(()=>{const e=document.querySelector('input[aria-label="Sim 與 3D 播放位置"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(time))});e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
 await until(`document.querySelector('.forge-sim-timeline header strong')?.innerText.startsWith('${Math.round(time)}ms')`,'scrub '+time);await wait(500);
 await c.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center'})`);const shot=await c.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+slot+'.png',Buffer.from(shot.data,'base64'));const body=await c.evaluate('document.body.innerText');await writeFile(out+'/'+slot+'.txt',body);
 proof.slots.push({slot,actors,timeMs:time,events,result:body.split('\n').find(x=>x.startsWith('完成施放')||x.startsWith('未施放：')||x.startsWith('被動情境')),stage:await c.evaluate(`document.querySelector('.vfx-stage-status')?.innerText`)});await writeFile(out+'/capture.json',JSON.stringify(proof,null,2)+'\n');console.log(n,b.name,slot,'captured at',time,'ms');
 }
 proof.status='captured';
 }catch(error){proof.status='needs-attention';proof.error=String(error);console.log(n,b.name,proof.error);await writeFile(out+'/failure.txt',await c.evaluate('document.body.innerText'));}
 await writeFile(out+'/capture.json',JSON.stringify(proof,null,2)+'\n');
}
}finally{c.close();}
