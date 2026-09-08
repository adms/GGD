import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const out='/private/tmp/ggd-catalog-source-archive';
const before=JSON.parse(fs.readFileSync(out+'/source-ui-proof.json','utf8'));
const c=await connect('5540A0FD8040795FAF172B7B1FA0329C'); await c.call('Network.enable');
try {
  const initial=await c.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='保存目前完整版本');return {exists:!!b,disabled:b?.disabled,version:document.querySelector('select[aria-label="完整英雄資料版本"]')?.value}})()`);
  assert(initial.exists&&!initial.disabled); assert.equal(initial.version,before.versionId);
  const started=Date.now(); await c.evaluate(`[...document.querySelectorAll('button')].find(x=>x.textContent==='保存目前完整版本').click()`);
  let state;
  for(let i=0;i<240;i++) {
    state=await c.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='保存目前完整版本');return {enabled:!!b&&!b.disabled,notice:document.body.innerText.includes('目前完整資料已保存。'),version:document.querySelector('select[aria-label="完整英雄資料版本"]')?.value,alerts:[...document.querySelectorAll('[role="alert"]')].map(x=>x.textContent)}})()`);
    if(state.notice&&state.enabled) break;
    await new Promise(r=>setTimeout(r,250));
  }
  fs.writeFileSync(out+'/capture-completion-state.json',JSON.stringify(state,null,2));
  assert(state.notice&&state.enabled,'Capture did not finish in UI'); assert.equal(state.version,before.versionId);
  const responses=c.events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.url.includes('/hero-catalog/')).map(e=>({url:e.params.response.url,status:e.params.response.status}));
  assert.equal(responses.filter(x=>x.url.endsWith('/versions/capture')).length,1);
  assert(responses.every(x=>x.status===200));
  await c.evaluate(`document.querySelector('select[aria-label="完整版本的英雄"]').scrollIntoView({block:'start'})`);
  const shot=await c.call('Page.captureScreenshot',{format:'png'}); fs.writeFileSync(out+'/capture-completion.png',Buffer.from(shot.data,'base64'));
  const proof={status:'passed',elapsedMs:Date.now()-started,versionId:state.version,uiNotice:state.notice,captureButtonEnabled:state.enabled,requests:responses,scope:'One actual capture-button click, same content deduplicates to the prior version, completion notice and enabled button observed without reload.'};
  fs.writeFileSync(out+'/capture-completion-proof.json',JSON.stringify(proof,null,2)); console.log(proof);
}finally{
  fs.writeFileSync(out+'/capture-completion-network.json',JSON.stringify(c.events.filter(e=>e.method==='Network.responseReceived').map(e=>({url:e.params.response.url,status:e.params.response.status})),null,2));
  c.close();
}
