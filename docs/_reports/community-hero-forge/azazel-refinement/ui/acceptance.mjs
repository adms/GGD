import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const { connect } = await import(pathToFileURL(path.join(process.cwd(), 'docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs')));
const out = path.join(process.cwd(), 'docs/_reports/community-hero-forge/azazel-refinement/ui');
await mkdir(out, { recursive: true });
const c = await connect();
const report = { url: '', checks: [], screenshots: [] };
const waitFor = async expression => {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    if (await c.evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error('UI wait expired: ' + expression);
};
const ready = () => waitFor(`(()=>{const s=document.querySelector('[aria-label="可調整的試玩情境"]');return s && !s.innerText.includes('正在試算') && !s.innerText.includes('正在背景') && !s.innerText.includes('目前畫面保留')})()`);
const snapshot = async name => {
  const data = await c.evaluate(`(()=>{const s=document.querySelector('[aria-label="可調整的試玩情境"]');return {hero:document.querySelector('.hero-page h1')?.textContent, status:[...s.querySelectorAll(':scope > p')].map(e=>e.innerText), selectedPrior:s.querySelector('[aria-label="前置施法"]')?.value, resource:s.querySelector('input[type="checkbox"]')?.checked, timeline:s.querySelector('.forge-sim-timeline')?.innerText}})()`);
  report.checks.push({ name, ...data });
  console.log(JSON.stringify({name,...data}));
  return data;
};
const capture = async name => {
  await c.evaluate(`document.querySelector('[aria-label="可調整的試玩情境"]').scrollIntoView({block:'start'})`);
  const { data } = await c.call('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(out, name + '.png'), Buffer.from(data, 'base64'));
  report.screenshots.push(name + '.png');
};
try {
  await c.call('Network.enable');
  await c.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  report.url = await c.evaluate('location.href');
  assert.equal(report.url, 'http://127.0.0.1:5201/editor/hero-forge');
  await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='我的作品').click()`);
  await waitFor(`[...document.querySelectorAll('h2')].some(e=>e.textContent==='阿薩謝爾')`);
  await c.evaluate(`[...document.querySelectorAll('h2')].find(e=>e.textContent==='阿薩謝爾').parentElement.querySelector('button').click()`);
  await waitFor(`document.querySelector('.hero-page h1')?.textContent==='阿薩謝爾'`);
  await c.evaluate(`[...document.querySelectorAll('.hero-slots button')].filter(e=>e.innerText==='EX').at(-1).click()`);
  await ready();
  assert.equal(await c.evaluate(`document.querySelector('[data-field="acceptedPlan.slots.EX.products.0.template.params.effects.0.onConsumed.0.modifiers.0.value"]').value`),'0.1');
  const normal = await snapshot('ordinary-ex');
  assert(normal.status.some(s=>s.includes('完成施放')));
  assert(normal.timeline.includes('damage'));
  await c.evaluate(`(()=>{const s=document.querySelector('[aria-label="可調整的試玩情境"]');s.querySelector('details').open=true;s.querySelector('input[type="checkbox"]').click()})()`);
  await waitFor(`document.querySelector('[aria-label="可調整的試玩情境"]').innerText.includes('no-resource')`);
  const empty = await snapshot('empty-resource');
  assert(empty.status.some(s=>s.includes('no-resource')));
  await c.evaluate(`document.querySelector('[aria-label="可調整的試玩情境"] details').open=false`);
  await capture('empty-resource');
  await c.evaluate(`(()=>{const s=document.querySelector('[aria-label="可調整的試玩情境"]');s.querySelector('input[type="checkbox"]').click();const e=s.querySelector('[aria-label="前置施法"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'R');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await ready();
  const reversed = await snapshot('r-before-ex');
  assert(reversed.status.some(s=>s.includes('前置 R：已施放')));
  assert(reversed.timeline.includes('floatingText'));
  assert(!reversed.timeline.split('\n').includes('damage'));
  await c.evaluate(`document.querySelector('[aria-label="可調整的試玩情境"] details').open=false`);
  await waitFor(`(document.querySelector('[aria-label="可調整的試玩情境"]').innerText.match(/材質正常/g)||[]).length>=2`);
  await c.evaluate(`(()=>{const t=document.querySelector('[aria-label="Sim 與 3D 播放位置"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(t,'400');t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(`document.querySelectorAll('.vfx-world-floating-texts [data-role="floating-text"]').length===2`);
  report.floatingTexts = await c.evaluate(`[...document.querySelectorAll('.vfx-world-floating-texts [data-role="floating-text"]')].map(e=>({text:e.innerText,color:getComputedStyle(e).color,opacity:getComputedStyle(e).opacity,rect:e.getBoundingClientRect().toJSON()}))`);
  assert(report.floatingTexts.some(e=>e.text==='反轉增益 ↑ AD/AP +10%' && e.color==='rgb(255, 204, 38)'));
  assert(report.floatingTexts.some(e=>e.text==='怎麼反而變強了？！'));
  await capture('r-before-ex');
  report.writes = c.events.filter(e=>e.method==='Network.requestWillBeSent' && !['GET','OPTIONS'].includes(e.params.request.method)).map(e=>({method:e.params.request.method,url:e.params.request.url}));
  await writeFile(path.join(out, 'acceptance.json'), JSON.stringify(report,null,2)+'\n');
} finally { c.close(); }
