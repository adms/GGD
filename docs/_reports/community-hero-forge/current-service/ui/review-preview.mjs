import {pathToFileURL} from 'node:url';import {readFile,writeFile} from 'node:fs/promises';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const out='/private/tmp/ggd-community37-current-ui',selected=JSON.parse(await readFile(out+'/admin-review-selected.json','utf8'));
const parent=await connect(JSON.parse(await readFile(out+'/admin-target.json','utf8')).targetId);
const {targetId}=await parent.call('Target.createTarget',{url:selected.iframe});parent.close();
await writeFile(out+'/preview-target.json',JSON.stringify({targetId}));
const c=await connect(targetId),proof={scope:'Actual frozen review of six uploaded-model slots. Captures do not approve original bespoke animation or skill fidelity.',url:selected.iframe,steps:[],status:'running'};
const save=()=>writeFile(out+'/review-preview.json',JSON.stringify(proof,null,2)+'\n');
async function until(expression,label){const end=Date.now()+90000;while(Date.now()<end){const v=await c.evaluate(expression);if(v)return v;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out '+label);}
try{
 await until(`document.querySelector('[aria-label="選擇審查技能"]')!==null`,'frozen package ready');
 for(const slot of ['PASSIVE','Q','W','E','R','EX']){
  await c.evaluate(`[...document.querySelectorAll('[aria-label="選擇審查技能"] button')].find(e=>e.innerText===${JSON.stringify(slot)}).click()`);
  await new Promise(r=>setTimeout(r,400));
  const actors=await until(`(()=>{const lines=document.body.innerText.split('\\n').filter(x=>/^(施法者|目標)：/.test(x));return lines.length===2&&lines.every(x=>x.includes('材質正常'))?lines:null;})()`,'both '+slot+' actors');
  await c.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center'})`);
  await new Promise(r=>setTimeout(r,200));
  const body=await c.evaluate('document.body.innerText');await writeFile(out+'/review-'+slot+'.txt',body);
  const png=await c.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/review-'+slot+'.png',Buffer.from(png.data,'base64'));
  proof.steps.push({slot,actors,selection:await c.evaluate(`document.querySelector('[aria-label="選擇審查技能"] button[aria-pressed="true"]').innerText`)});await save();console.log(slot+' captured');
 }
 proof.status='passed';proof.runtimeErrors=c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text);
}catch(e){proof.status='failed';proof.error=String(e);process.exitCode=1;await writeFile(out+'/review-failure.txt',await c.evaluate('document.body.innerText'));}
finally{await save();c.close();console.log(JSON.stringify(proof));}
