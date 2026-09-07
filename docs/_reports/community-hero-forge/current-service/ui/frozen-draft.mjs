import {pathToFileURL} from 'node:url';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const out='/private/tmp/ggd-community37-current-ui';
const author=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');const admin=await connect(JSON.parse(await readFile(out+'/admin-target.json','utf8')).targetId);
const project=JSON.parse(await readFile(out+'/submitted-project.json','utf8'));const marker='隔離驗收：投稿後的草稿修改，不應改寫固定審查版。';
const proof={scope:'Actual author edits and cloud sync while the reviewer reloads the frozen submission.',status:'running',steps:[]};
async function until(c,ex,label){const end=Date.now()+60000;while(Date.now()<end){const x=await c.evaluate(ex);if(x)return x;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out '+label);}
async function note(value){await author.evaluate(`(()=>{const e=document.querySelector('.hero-source-design textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,100));}
async function sync(revision){await until(author,`[...document.querySelectorAll('button')].some(e=>e.innerText==='同步雲端草稿'&&!e.disabled)`,'sync enabled');await author.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='同步雲端草稿').click()`);await until(author,`document.querySelector('.hero-community').innerText.includes('已同步至雲端第 ${revision} 版')`,'cloud revision '+revision);}
try{
 await author.evaluate(`[...document.querySelectorAll('.hero-source-design nav button')].find(e=>e.innerText==='Q').click()`);
 await until(author,`document.querySelector('.hero-source-design h3').innerText.startsWith('Q · ')`,'author Q');
 const original=await author.evaluate(`document.querySelector('.hero-source-design textarea').value`);assert.equal(original,project.refinementNotes.Q);
 await note(original+'\n'+marker);await sync(2);proof.steps.push({authorCloudRevision:2,postSubmissionEdit:true});
 await admin.call('Page.reload');await until(admin,`document.body.innerText.includes('model-reviewer')`,'admin restored login');
 await admin.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText.includes('投稿批核（AI／玩家）')).click()`);
 await until(admin,`[...document.querySelectorAll('button')].some(e=>e.innerText.startsWith('阿薩謝爾 · 待審'))`,'pending snapshot');
 await admin.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText.startsWith('阿薩謝爾 · 待審')).click()`);
 await until(admin,`!!document.querySelector('.hero-source-design')`,'reloaded source');
 const fixed=await admin.evaluate(`document.querySelector('.hero-source-design').innerText`);assert(!fixed.includes(marker));assert(fixed.includes(original));
 const facts=await admin.evaluate(`JSON.parse([...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.innerText==='相依資料與驗證結果').querySelector('pre').innerText)`);
 assert.equal(facts.packageDigest,'sha256:92b393e421c2506cc0c67587d20d9784088711dd923ee80c311c4592ec3ffaba');
 proof.frozen={packageDigest:facts.packageDigest,sourceNoteUnchanged:true,revision:await admin.evaluate(`document.querySelector('main article h2').innerText`)};
 await note(original);await sync(3);proof.steps.push({authorCloudRevision:3,originalNoteRestored:true});proof.status='passed';
}catch(e){proof.status='failed';proof.error=String(e);process.exitCode=1;}
finally{await writeFile(out+'/frozen-draft.json',JSON.stringify(proof,null,2)+'\n');author.close();admin.close();console.log(JSON.stringify(proof));}
