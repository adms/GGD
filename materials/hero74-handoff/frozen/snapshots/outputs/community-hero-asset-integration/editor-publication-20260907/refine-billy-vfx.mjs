import {readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));const c=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');const root='/private/tmp/ggd-community37-editor-publish/15';
async function until(ex){for(let i=0;i<180;i++){const v=await c.evaluate(ex);if(v)return v;await new Promise(r=>setTimeout(r,300));}throw Error('UI state timeout');}
const click=t=>c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText===${JSON.stringify(t)}&&!e.disabled).click()`);
const set=(selector,v)=>c.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
try{
 await click('我的作品');await until(`document.querySelectorAll('h2').length>20`);await c.evaluate(`[...document.querySelectorAll('h2')].find(e=>e.textContent==='比利海靈頓').parentElement.querySelector('button').click()`);await until(`document.querySelector('h1')?.innerText==='比利海靈頓'`);await click('進階編輯');
 const before=JSON.parse(await c.evaluate(`document.querySelector('.hero-json').value`));assert.equal(before.acceptedPlan.slots.W.products[0].template.ref,'tpl-buff-self');const next=structuredClone(before);
 const segment=next.presentation.slots.W.script.segments.find(s=>s.kind==='vfx'&&s.on==='castEffect');assert.equal(segment.at,'target');segment.at='self';
 const a=JSON.parse(await readFile(root+'/review-adaptation.json','utf8'));
 for(const s of ['Q','W','E'])next.acceptedPlan.slots[s].purpose='【目前模板可執行】'+a[s].currentBehavior+'\n【目標設計】'+next.sourceDesign.slots[s].ownerDescription+'\n【本次處理】'+a[s].note;
 await set('.hero-json',JSON.stringify(next,null,2));await click('套用到作品');await until(`document.body.innerText.includes('已套用進階修改。')`);await click('視覺編輯');await c.evaluate(`[...document.querySelectorAll('.hero-slots button')].find(e=>e.innerText==='W').click()`);
 await set('.hero-source-design textarea',before.refinementNotes.W+' 本次同步將 W 施放特效由 target 改為 self，護盾與提示都作用於自己。');await until(`document.body.innerText.includes('六槽編譯與模擬已通過')`);
 await click('進階編輯');const actual=JSON.parse(await c.evaluate(`document.querySelector('.hero-json').value`));assert.deepEqual(actual.sourceDesign,before.sourceDesign);assert.deepEqual(actual.presentation.uploadedModel,before.presentation.uploadedModel);assert.equal(actual.presentation.slots.W.script.segments.find(s=>s.kind==='vfx'&&s.on==='castEffect').at,'self');
 await writeFile(root+'/after-vfx-refinement.json',JSON.stringify(actual,null,2));await click('視覺編輯');console.log('W shield VFX now anchored to self; source and uploaded model unchanged, six slots compiled');
}finally{c.close();}
