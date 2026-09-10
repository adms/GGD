import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const root='/private/tmp/ggd-community37-generator-rebuild',id='01M1VXHK05YSRHV63PT76833QZ';
const accountFile='/private/tmp/ggd-model-upload-acceptance/data/accounts/'+id+'.json';
const before=JSON.parse(await readFile(accountFile,'utf8'));assert.equal(before.username,'model-author');assert(!(before.roles??[]).includes('admin'));
const c=await connect('5540A0FD8040795FAF172B7B1FA0329C');const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(ex){for(let i=0;i<200;i++){const v=await c.evaluate(ex);if(v)return v;await wait(200);}throw Error('Power User UI timed out');}
try{
 await until(`[...document.querySelectorAll('main tr')].some(e=>e.innerText.includes('model-author'))`);
 const row=await c.evaluate(`[...document.querySelectorAll('main tr')].find(e=>e.innerText.includes('model-author')).innerText`);
 await c.evaluate(`(()=>{const row=[...document.querySelectorAll('main tr')].find(e=>e.innerText.includes('model-author'));const button=[...row.querySelectorAll('button')].find(e=>e.innerText==='認證 Power User');if(!button)throw Error('Exact certification action missing');button.click();})()`);
 await until(`[...document.querySelectorAll('main tr')].find(e=>e.innerText.includes('model-author'))?.innerText.includes('撤銷 Power User')`);
 const after=JSON.parse(await readFile(accountFile,'utf8'));assert.deepEqual(after.roles,[...(before.roles??[]),'power-user']);
 for(const key of Object.keys(before))if(!['roles','updatedAt'].includes(key))assert.deepEqual(after[key],before[key],key+' unexpectedly changed');
 await writeFile(root+'/power-user-certification.json',JSON.stringify({scope:'Isolated model-author test account; certify the configured 200/day tier after the 100/day normal limit was reached. No admin role, new account, counter reset, or global policy change.',accountId:id,beforeRoles:before.roles??[],afterRoles:after.roles,priorRow:row,currentRow:await c.evaluate(`[...document.querySelectorAll('main tr')].find(e=>e.innerText.includes('model-author')).innerText`)},null,2)+'\n');
 const shot=await c.call('Page.captureScreenshot',{format:'png'});await writeFile(root+'/power-user-certified.png',Buffer.from(shot.data,'base64'));console.log('Isolated model-author certified power-user; no admin role.');
}finally{c.close();}
