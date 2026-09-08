import {readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const root='/private/tmp/ggd-community37-editor-publish/15',c=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(ex){for(let i=0;i<180;i++){const v=await c.evaluate(ex);if(v)return v;await wait(300);}throw Error('UI state timeout');}
const click=text=>c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText===${JSON.stringify(text)}&&!e.disabled).click()`);
const set=(selector,value)=>c.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
try{
 assert(await c.evaluate(`document.querySelector('h1')?.innerText==='比利海靈頓'`));
 await click('視覺編輯');
 for(const slot of ['Q','W','E']){
  await c.evaluate(`[...document.querySelectorAll('.hero-slots button')].find(e=>e.innerText===${JSON.stringify(slot)}).click()`);await wait(100);
  await c.evaluate(`(()=>{const b=[...document.querySelectorAll('.hero-slot-editor label')].find(e=>e.textContent.startsWith('完整說明與台詞')).nextElementSibling;if(b.innerText==='解鎖')b.click();})()`);
 }
 await click('進階編輯');await until(`document.querySelector('.hero-json')!==null`);
 const before=JSON.parse(await c.evaluate(`document.querySelector('.hero-json').value`));assert.equal(before.projectId,'community-review-15-20260907');await writeFile(root+'/before-refinement.json',JSON.stringify(before,null,2));
 const after=structuredClone(before),s=after.acceptedPlan.slots;
 const donor=JSON.parse(await readFile('../GGD社群英雄上傳內容_37名/projects/12.hero-project.json','utf8')).acceptedPlan.slots.E;
 s.Q.products=structuredClone(before.acceptedPlan.slots.W.products);s.Q.products[0].instanceId=before.projectId+'-q-grab';
 s.W.products=structuredClone(before.acceptedPlan.slots.E.products);s.W.products[0].instanceId=before.projectId+'-w-guard';s.W.abilityOverrides.effects=structuredClone(before.acceptedPlan.slots.E.abilityOverrides.effects);s.W.abilityOverrides.effects[0].stackKey=before.projectId+'.w.guard';
 s.E.products=structuredClone(donor.products);s.E.products[0].instanceId=before.projectId+'-e-charge';s.E.products[0].template.params.dashDistance=350;s.E.capabilityIds=structuredClone(donor.capabilityIds);delete s.E.abilityOverrides.effects;
 const changes={Q:{currentBehavior:'抓取拖拉指定敵人後向前投擲 200 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級物理傷害。',note:'已將原單體斬擊改為既有抓取投擲模板。採短抓取後釋放的 GGD 改編；雙人專屬配對動作仍待製。'},W:{currentBehavior:'自身獲得 120 點全傷害護盾，維持 3 秒；同來源取較大護盾，不再對敵人抓投。',note:'已修正 W 配錯摔技，改用原 E 的三秒自身護盾。氣勢資源與消耗增強仍保留為未完成差異。'},E:{currentBehavior:'向指定方向突進 350 wc3u，造成極小級物理碰撞傷害與推移；不再附帶原錯配的自身護盾。',note:'已改用既有直線衝鋒推撞模板。命中第一名敵人即停止的專屬條件尚未實作，不宣稱已完成；原交接的友軍保護待補文字不改寫，另以本說明指出和 Owner 衝撞原文的差異。'}};
 for(const slot of ['Q','W','E'])s[slot].purpose='【目前模板可執行】'+changes[slot].currentBehavior+'\n【目標設計】'+after.sourceDesign.slots[slot].ownerDescription+'\n【本次處理】'+changes[slot].note;
 await set('.hero-json',JSON.stringify(after,null,2));await click('套用到作品');await until(`document.body.innerText.includes('已套用進階修改。')`);await click('視覺編輯');
 for(const slot of ['Q','W','E']){await c.evaluate(`[...document.querySelectorAll('.hero-slots button')].find(e=>e.innerText===${JSON.stringify(slot)}).click()`);await wait(100);await set('.hero-source-design textarea',changes[slot].note);}
 await until(`document.body.innerText.includes('六槽編譯與模擬已通過')`);
 await click('進階編輯');const actual=JSON.parse(await c.evaluate(`document.querySelector('.hero-json').value`));
 assert.deepEqual(actual.sourceDesign,before.sourceDesign);assert.deepEqual(actual.presentation,before.presentation);assert.deepEqual(actual.brief,before.brief);assert.deepEqual(actual.sourceLock,before.sourceLock);
 for(const slot of ['Q','W','E']){assert.deepEqual(actual.acceptedPlan.slots[slot].products,s[slot].products);assert.equal(actual.refinementNotes[slot],changes[slot].note);assert.equal(actual.acceptedPlan.slots[slot].purpose,s[slot].purpose);}
 await writeFile(root+'/after-refinement.json',JSON.stringify(actual,null,2));await writeFile(root+'/review-adaptation.json',JSON.stringify(changes,null,2));await click('視覺編輯');console.log('Billy Q/W/E corrected through editor, source/model unchanged, six slots compiled');
}finally{c.close();}
