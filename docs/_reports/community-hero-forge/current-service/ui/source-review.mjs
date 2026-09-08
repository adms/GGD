import {pathToFileURL} from 'node:url';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const out='/private/tmp/ggd-community37-current-ui';
const project=JSON.parse(await readFile(out+'/submitted-project.json','utf8'));
const {targetId}=JSON.parse(await readFile(out+'/admin-target.json','utf8'));const c=await connect(targetId);
const proof={scope:'Actual read-only review of source text and per-slot refinement requirements, compared to the downloaded submitted ZIP.',steps:[],status:'running'};
async function until(ex,label){const end=Date.now()+30000;while(Date.now()<end){const x=await c.evaluate(ex);if(x)return x;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out '+label);}
try{
 if(!await c.evaluate(`!!document.querySelector('.hero-source-design')`)){
  await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText.startsWith('阿薩謝爾 · 待審')).click()`);
 }
 await until(`!!document.querySelector('.hero-source-design')`,'source panel');
 await c.evaluate(`document.querySelector('.hero-source-design details').open=true`);
 const full=await c.evaluate(`document.querySelector('.hero-source-design details').innerText`);
 assert(full.includes(project.sourceDesign.ownerText));assert(full.includes(project.sourceDesign.reviewText));
 for(const slot of ['PASSIVE','Q','W','E','R','EX']){
  await c.evaluate(`[...document.querySelectorAll('.hero-source-design nav button')].find(e=>e.innerText===${JSON.stringify(slot)}).click()`);
  await until(`document.querySelector('.hero-source-design h3').innerText.startsWith(${JSON.stringify(slot+' · ')})`,'source slot');
  const text=await c.evaluate(`(()=>{const p=document.querySelector('.hero-source-design');p.querySelectorAll('details').forEach(e=>e.open=true);return p.innerText;})()`);
  for(const value of [project.sourceDesign.slots[slot].ownerDescription,project.sourceDesign.slots[slot].baselineBehavior,project.sourceDesign.slots[slot].requiredRefinement,project.refinementNotes[slot]])assert(text.includes(value),'Missing original text in '+slot);
  assert.equal(await c.evaluate(`document.querySelectorAll('.hero-source-design textarea,.hero-source-design input').length`),0);
  proof.steps.push({slot,sourceAndRefinementMatch:true,readOnly:true});
  await writeFile(out+'/source-review-'+slot+'.txt',text);
 }
 await c.evaluate(`document.querySelectorAll('.hero-source-design details').forEach(e=>e.open=false);document.querySelector('.hero-source-design').scrollIntoView({block:'center'})`);
 const png=await c.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/source-review-EX.png',Buffer.from(png.data,'base64'));
 proof.status='passed';
}catch(e){proof.status='failed';proof.error=String(e);process.exitCode=1;}
finally{await writeFile(out+'/source-review.json',JSON.stringify(proof,null,2)+'\n');c.close();console.log(JSON.stringify(proof));}
