import {readFile,writeFile,mkdir} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const root='/private/tmp/ggd-community37-generator-rebuild',oldRoot='/private/tmp/ggd-community37-editor-publish';
const start=Number(process.argv[2]??1),count=Number(process.argv[3]??1);
const a=await connect('5540A0FD8040795FAF172B7B1FA0329C'),c=await connect('02B883304E6A5424B24704EA5CAAB195');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(client,ex,label,ms=90000){const end=Date.now()+ms;while(Date.now()<end){const value=await client.evaluate(ex);if(value)return value;await wait(250);}throw Error('Timed out '+label);}
try{
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('投稿批核（AI／玩家）'))?.click()`);
 await until(a,`[...document.querySelectorAll('button')].some(e=>e.innerText==='重新查詢')`,'review list');
 await c.call('Emulation.setDeviceMetricsOverride',{width:1920,height:1200,deviceScaleFactor:1,mobile:false});
 for(let number=start;number<start+count;number++){
  const num=String(number).padStart(2,'0'),dir=root+'/'+num;
  let submission;
  for(let attempt=0;attempt<240;attempt++){
   submission=await readFile(dir+'/submission.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
   if(submission?.status==='submitted')break;
   if(submission?.status==='needs-attention')throw Error(number+': submission needs attention');
   await wait(250);
  }
  assert.equal(submission?.status,'submitted','Submission not ready within one minute');
  const equivalent=JSON.parse(await readFile(dir+'/equivalence.json','utf8'));assert.equal(equivalent.status,'verified-equivalent');assert.equal(equivalent.packageDigest,submission.packageDigest);
  const oldReview=JSON.parse(await readFile(oldRoot+'/'+num+'/review.json','utf8')),oldAssessment=JSON.parse(await readFile(oldRoot+'/'+num+'/review-assessment.json','utf8'));assert.equal(oldReview.status,'captured');assert.equal(oldAssessment.status,'reviewed');assert.equal(oldReview.slots.length,6);assert(oldReview.url.includes(equivalent.oldSubmissionId));
  const proof={name:submission.name,number,submissionId:submission.submissionId,packageDigest:submission.packageDigest,slots:oldReview.slots,freshSmoke:[],status:'running',evidenceReuse:{source:oldRoot+'/'+num+'/review.json',assessment:oldRoot+'/'+num+'/review-assessment.json',equivalence:dir+'/equivalence.json',scope:'Prior six-slot visual review retained only after full source/template/asset/gameplay/simulation equivalence. Current fixed candidate receives fresh model and playback inspection below. No claim that reused images were freshly captured.'}};
  const save=()=>writeFile(dir+'/review.json',JSON.stringify(proof,null,2)+'\n');
  try{
   await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='重新查詢').click()`);
   await until(a,`[...document.querySelectorAll('button')].some(e=>!e.disabled&&e.innerText.startsWith(${JSON.stringify(submission.name+' · 待審')}))`,'pending hero');
   await a.evaluate(`[...document.querySelectorAll('button')].find(e=>!e.disabled&&e.innerText.startsWith(${JSON.stringify(submission.name+' · 待審')})).click()`);
   const src=await until(a,`(()=>{const src=document.querySelector('iframe[title="完整英雄固定版本預覽"]')?.src;return src?.includes(${JSON.stringify(submission.submissionId)})?src:null;})()`,'exact submitted version');assert.equal(new URL(src).searchParams.get('heroReview'),submission.submissionId);proof.url=src;
   await c.call('Page.bringToFront');await c.call('Page.navigate',{url:src});await until(c,`!!document.querySelector('[aria-label="選擇審查技能"]')`,'fixed preview ready');
   const slots=number===32?['PASSIVE','Q','W','E','R','EX']:[1,17].includes(number)?['Q','W']:['Q'];
   for(const slot of slots){
    await c.evaluate(`[...document.querySelectorAll('[aria-label="選擇審查技能"] button')].find(e=>e.innerText===${JSON.stringify(slot)}).click()`);await wait(400);
    await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='全螢幕預覽')?.click()`);await wait(400);
    const actors=await until(c,`(()=>{const xs=document.body.innerText.split('\\n').filter(x=>/^(施法者|目標)：/.test(x));return xs.length===2&&xs.every(x=>x.includes('材質正常')||x.includes('⚠'))?xs:null;})()`,'models '+slot);assert(actors.every(x=>x.includes('材質正常')),'Model warning');
    await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='❚❚'||e.innerText==='⏸')?.click()`);
    const events=await c.evaluate(`[...document.querySelectorAll('.forge-sim-ruler span')].map(e=>e.title)`);
    const preferred=events.find(x=>/projectileSpawn|beamSpawn|statusApplied|summon/.test(x))??events.find(x=>/damage|abilityCast|basicAttack/.test(x));
    const startTime=Number(preferred?.match(/^(\d+)ms/)?.[1]??200);const timeMs=Math.min(startTime+100,1600);
    await c.evaluate(`(()=>{const e=document.querySelector('input[aria-label="Sim 與 3D 播放位置"]');if(!e)throw Error('Missing timeline');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(timeMs))});e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('canvas').scrollIntoView({block:'center'});})()`);await wait(650);
    const body=await c.evaluate('document.body.innerText');await writeFile(dir+'/review-'+slot+'.txt',body);
    const shot=await c.call('Page.captureScreenshot',{format:'png'});await writeFile(dir+'/review-'+slot+'.png',Buffer.from(shot.data,'base64'));
    proof.freshSmoke.push({slot,actors,timeMs,events,result:body.split('\n').find(x=>x.startsWith('完成施放')||x.startsWith('施放未完成'))});await save();console.log(number,submission.name,slot,'CAPTURED');
   }
   if(number===32){proof.slots=proof.freshSmoke;delete proof.evidenceReuse;}
   proof.status='captured';await save();
  }catch(error){proof.status='needs-attention';proof.error=String(error);await save();await writeFile(dir+'/review-failure.txt',await c.evaluate('document.body.innerText'));console.log(number,submission.name,String(error));process.exitCode=1;break;}
 }
}finally{a.close();c.close();}
