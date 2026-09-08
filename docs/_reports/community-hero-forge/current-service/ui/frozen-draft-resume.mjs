import {pathToFileURL} from 'node:url';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));const out='/private/tmp/ggd-community37-current-ui';
const a=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4'),r=await connect(JSON.parse(await readFile(out+'/admin-target.json','utf8')).targetId);
const original=JSON.parse(await readFile(out+'/submitted-project.json','utf8')).refinementNotes.Q;
const marker='隔離驗收：投稿後的草稿修改，不應改寫固定審查版。';
try{
 assert.equal(await a.evaluate(`document.querySelector('.hero-source-design textarea').value`),original+'\n'+marker);
 assert(await a.evaluate(`document.querySelector('.hero-community').innerText.includes('已同步至雲端第 2 版')`));
 const fixed=await r.evaluate(`document.querySelector('.hero-source-design').innerText`);assert(fixed.includes(original)&&!fixed.includes(marker));
 const facts=await r.evaluate(`JSON.parse([...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.innerText==='相依資料與驗證結果').querySelector('pre').textContent)`);
 assert.equal(facts.packageDigest,'sha256:92b393e421c2506cc0c67587d20d9784088711dd923ee80c311c4592ec3ffaba');
 await a.evaluate(`(()=>{const e=document.querySelector('.hero-source-design textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(original)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await new Promise(r=>setTimeout(r,100));await a.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='同步雲端草稿').click()`);
 let restored=false;for(let i=0;i<200;i++){if(await a.evaluate(`document.querySelector('.hero-community').innerText.includes('已同步至雲端第 3 版')`)){restored=true;break;}await new Promise(r=>setTimeout(r,250));}assert(restored);
 const proof={status:'passed',scope:'Continues the recorded author-edit UI run after correcting the evidence reader to use textContent for a collapsed details element.',previousAttempt:'frozen-draft.json',authorChangedAndSyncedRevision:2,frozenRevision:await r.evaluate(`document.querySelector('main article h2').innerText`),frozenPackageDigest:facts.packageDigest,frozenOriginalNoteUnchanged:true,restoredAuthorCloudRevision:3};
 await writeFile(out+'/frozen-draft-completed.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{a.close();r.close();}
