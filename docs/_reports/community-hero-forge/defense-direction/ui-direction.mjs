import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const c=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');
const out='/private/tmp/ggd-community-facing-proof';
const prefix='acceptedPlan.slots.E.products.0.template.params.effects.0.hooks.0.condition';
const proof={status:'running',scope:'Local author draft only. No cloud submission or original-design approval.',steps:[]};
async function until(expr,label){const end=Date.now()+30000;while(Date.now()<end){const x=await c.evaluate(expr);if(x)return x;await new Promise(r=>setTimeout(r,200));}throw Error('Timeout '+label);}
const enter=async(field,value)=>c.evaluate(`(()=>{const e=document.querySelector('[data-field="'+${JSON.stringify(field)}+'"]'); if(!e||e.disabled||e.closest('fieldset[disabled]'))throw Error('Unavailable control');const ctor=e.tagName==='SELECT'?HTMLSelectElement:HTMLInputElement;Object.getOwnPropertyDescriptor(ctor.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
const capture=async(name)=>{await writeFile(out+'/'+name+'.txt',await c.evaluate('document.body.innerText'));const p=await c.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(p.data,'base64'));};
try{
 await c.call('Runtime.enable'); await c.call('Page.enable');
 await until(`document.readyState==='complete' && document.querySelector('.hero-source-design pre')!==null`, 'initial page');
 const sourceBefore=await c.evaluate(`document.querySelector('.hero-source-design pre')?.textContent`);
 assert(sourceBefore.includes('THE END OF SON'));
 await c.evaluate(`[...document.querySelectorAll('.hero-slots button')].find(e=>e.textContent==='E').click()`);
 await until(`document.querySelector('[data-field="${prefix}.g0.c0.value"]')!==null`,'distance');
 if (!await c.evaluate(`document.querySelector('[data-field="${prefix}.g0.c1.kind"]')!==null`)) await c.evaluate(`document.querySelector('[data-field="${prefix}.g0.add"]').click()`);
 await until(`document.querySelector('[data-field="${prefix}.g0.c1.kind"]')!==null`,'second clause');
 await enter(prefix+'.g0.c1.kind','facing');
 await until(`document.querySelector('[data-field="${prefix}.g0.c1.arcDegrees"]')?.value==='120'`,'facing default');
 await enter(prefix+'.g0.c1.arcDegrees','90');
 proof.editedSentence=await until(`(()=>{const x=document.querySelector('[data-field="${prefix}.sentence"]')?.innerText;return x?.includes('90°')?x:null})()`,'edited sentence');
 await c.evaluate(`document.querySelector('[data-field="${prefix}.g0.c1.arcDegrees"]').closest('.cond-editor').scrollIntoView({block:'center'})`);
 await capture('editable-facing-90');
 await enter(prefix+'.g0.c1.arcDegrees','120');
 await until(`document.body.innerText.includes('已保存到本機')||document.body.innerText.includes('已儲存')||document.querySelector('.local-draft-idle')!==null`,'local save');
 await new Promise(r=>setTimeout(r,1200));
 const loads=c.events.filter(e=>e.method==='Page.loadEventFired').length;
 await c.call('Page.reload',{});
 const end=Date.now()+30000;while(c.events.filter(e=>e.method==='Page.loadEventFired').length<=loads){if(Date.now()>end)throw Error('Timeout load event');await new Promise(r=>setTimeout(r,150));}
 await until(`[...document.querySelectorAll('.hero-slots button')].some(e=>e.textContent==='E')`,'reload');
 await c.evaluate(`[...document.querySelectorAll('.hero-slots button')].find(e=>e.textContent==='E').click()`);
 await until(`document.querySelector('[data-field="${prefix}.g0.c1.arcDegrees"]')?.value==='120'`,'persisted direction');
 proof.persistedSentence=await until(`document.querySelector('[data-field="${prefix}.sentence"]')?.innerText`,'persisted sentence');
 assert(proof.persistedSentence.includes('2.5')&&proof.persistedSentence.includes('120°'));
 assert.equal(await c.evaluate(`document.querySelector('.hero-source-design pre')?.textContent`),sourceBefore);
 proof.sourceTextUnchanged=true;
 await c.evaluate(`document.querySelector('[data-field="${prefix}.g0.c1.arcDegrees"]').closest('.cond-editor').scrollIntoView({block:'center'})`);
 await capture('reopened-facing-120');
 proof.exceptions=c.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.equal(proof.exceptions.length,0);
 proof.status='passed';
}catch(e){proof.status='failed';proof.error=String(e);process.exitCode=1;await capture('ui-failure');}
finally{await writeFile(out+'/ui-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));c.close();}
