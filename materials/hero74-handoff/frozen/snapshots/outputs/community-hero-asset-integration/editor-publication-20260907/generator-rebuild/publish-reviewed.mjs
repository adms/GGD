import {readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const number=process.argv[2],out='/private/tmp/ggd-community37-generator-rebuild/'+number;
const proof=JSON.parse(await readFile(out+'/review.json','utf8'));assert.equal(proof.status,'captured');assert.equal(proof.slots.length,6);
assert(proof.slots.every(s=>s.actors.length===2&&s.actors.every(t=>t.includes('材質正常'))),'Resolve model warnings before publishing');
if(proof.freshSmoke)assert(proof.freshSmoke.every(s=>s.actors.length===2&&s.actors.every(t=>t.includes('材質正常'))),'Resolve fresh fixed-candidate smoke warnings');
const assessment=JSON.parse(await readFile(out+'/review-assessment.json','utf8'));assert.equal(assessment.status,'reviewed');assert.equal(assessment.url,proof.url);
const submission=JSON.parse(await readFile(out+'/submission.json','utf8'));assert.equal(submission.status,'submitted');assert.equal(submission.packageDigest,proof.packageDigest);assert.equal(new URL(proof.url).searchParams.get('heroReview'),submission.submissionId);
if(number==='32'){const curse=JSON.parse(await readFile(out+'/fixed-R-EX.json','utf8'));assert.equal(curse.url,proof.url);assert(curse.enemyBoonVisible&&curse.casterReactionVisible&&!curse.ordinaryCurseVisible);assert(!curse.events.some(e=>/ · damage · /.test(e)),'Reversal unexpectedly emits ordinary damage');}
const recipe=JSON.parse(await readFile('../GGD社群英雄上傳內容_37名/recipes/'+number+'.upload-recipe.json','utf8'));
const adaptations=await readFile(out+'/review-adaptation.json','utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return {};throw error;});
const binding=JSON.parse(await readFile('tools/community-hero-forge/library-bodies/community37.bindings.json','utf8')).entries.find(x=>x.name===proof.name);
const reason=['依本輪要求核准此 GGD 改編英雄；保留指定名稱及完整原文，逐槽接受下列現行實作與明示差異。此為本機隔離流程驗收，發布與正式站部署分開記錄。',
 '畫面：'+assessment.scope,
 '模型來源：'+binding.provenance.sourceCharacter+'／'+binding.provenance.sourceWork+'（'+binding.provenance.relationship+'）。',
 ...recipe.slots.map(s=>`${s.slot} ${s.name}：${adaptations[s.slot]?.currentBehavior??s.currentBehavior} 差異：${s.requiredRefinement}`),
 '不將模板或替代演出標成原作完整還原；後續修訂保留歷史並重新送審。'].join('\n\n');
assert(Buffer.byteLength(reason,'utf8')<=4000,'Review reason exceeds service byte limit');
const action=process.env.RETRY_PUBLISH==='1'?'重試原發布操作':'核准並發布完整英雄';
const pendingLabel=proof.name+' · '+(process.env.RETRY_PUBLISH==='1'?'已審、發布失敗':'待審');
const a=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(ex,label,ms=90000){const end=Date.now()+ms;while(Date.now()<end){const v=await a.evaluate(ex);if(v)return v;await wait(300);}throw Error('Timed out '+label);}
const result={name:proof.name,reviewUrl:proof.url,reason,status:'started'};
try{
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('投稿批核（AI／玩家）')).click()`);
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='重新查詢')`,'review list');
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='重新查詢').click()`);
 await until(`[...document.querySelectorAll('button')].some(e=>!e.disabled&&e.innerText.startsWith(${JSON.stringify(pendingLabel)}))`,'candidate');
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>!e.disabled&&e.innerText.startsWith(${JSON.stringify(pendingLabel)})).click()`);
 await until(`document.querySelector('iframe')?.src===${JSON.stringify(proof.url)}`,'same reviewed snapshot');
 await a.evaluate(`(()=>{const e=document.querySelector('main article textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(reason)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await a.evaluate(`(()=>{const e=document.querySelector('main article input[type="checkbox"]');if(!e.checked)e.click();})()`);
 await until(`[...document.querySelectorAll('button')].some(e=>e.innerText===${JSON.stringify(action)}&&!e.disabled)`,'publish enabled');
 await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText===${JSON.stringify(action)}).click()`);
 const response=await until(`(()=>{const t=document.querySelector('main article')?.innerText??'';const alert=document.querySelector('main')?.innerText.match(/ApiError:[^\\n]+/);if(alert)return alert[0];if(t.includes('ApiError:'))return t;return (${process.env.RETRY_PUBLISH==='1'?"/^.*第 [0-9]+ 版 · 已發布/":"/^.*第 [0-9]+ 版 · 已發布|發布失敗|HTTP [0-9]{3}/"}).test(t)?t:null;})()`,'publish result');
 result.response=response;assert(/^.*第 \d+ 版 · 已發布/.test(response),response);
 const controlPath='/private/tmp/ggd-model-upload-acceptance/data/submission-promotions/hero-work-'+submission.projectId+'.json';
 const current=JSON.parse(await readFile(controlPath,'utf8'));
 assert.equal(current.published.submissionId,submission.submissionId);assert.equal(current.published.version.packageDigest,submission.packageDigest);
 const baseline=JSON.parse(await readFile('/private/tmp/ggd-community37-generator-rebuild/baseline/submission-promotions/hero-work-'+submission.projectId+'.json','utf8'));
 assert(baseline.submissions.every(id=>current.submissions.includes(id)),'Old submission history lost');
 await writeFile(out+'/published-control.json',JSON.stringify(current,null,2)+'\n');
 result.submissionId=submission.submissionId;result.packageDigest=submission.packageDigest;result.controlRevision=current.revision;result.publicationEpoch=current.publicationEpoch;result.oldSubmissionsRetained=true;
 result.status='published';console.log(proof.name,'PUBLISHED');
 const shot=await a.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/published.png',Buffer.from(shot.data,'base64'));
}catch(e){result.status='needs-attention';result.error=String(e);console.log(String(e));process.exitCode=1;}
finally{await writeFile(out+'/publication.json',JSON.stringify(result,null,2)+'\n');a.close();}
