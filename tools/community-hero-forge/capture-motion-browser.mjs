#!/usr/bin/env node
/** Capture the E drive / EX grapple UI profile in a fresh localhost browser.
 * Requires a restored handoff with models. Never logs in, submits or publishes.
 * Screenshots are evidence for review, not an automatic original-art verdict.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
const {values}=parseArgs({options:{help:{type:'boolean'},origin:{type:'string',default:'http://127.0.0.1:5197'},'handoff-dir':{type:'string'},'hero-index':{type:'string'},output:{type:'string'},'playwright-module':{type:'string'},channel:{type:'string',default:'chrome'}}});
if(values.help){console.log('node tools/community-hero-forge/capture-motion-browser.mjs --handoff-dir <restored folder> --hero-index <index> --output <new external directory> [--origin http://127.0.0.1:5197] [--playwright-module /absolute/path/playwright/index.mjs] [--channel chrome]');process.exit(0);}
if(!values['handoff-dir']||!values['hero-index']||!values.output)throw new Error('--handoff-dir, --hero-index and --output are required');
const origin=new URL(values.origin);if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||origin.username||origin.password)throw new Error('Only unauthenticated HTTP loopback origins are allowed');
const repo=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));const input=fs.realpathSync(values['handoff-dir']);const output=path.join(fs.realpathSync(path.dirname(path.resolve(values.output))),path.basename(values.output));
if(output===input||output.startsWith(input+path.sep)||output===repo||output.startsWith(repo+path.sep)||fs.existsSync(output))throw new Error('Output must be a new directory outside the repo and handoff');
const index=JSON.parse(fs.readFileSync(path.join(input,'index.json'),'utf8'));const hero=index.heroes.find(h=>h.index===values['hero-index']);if(!hero)throw new Error('Hero index not found in handoff');
const {chromium}=await import(values['playwright-module']?pathToFileURL(path.resolve(values['playwright-module'])).href:'playwright');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
// Stage just the selected hero: motion capture must not revalidate unrelated models.
const selected=fs.mkdtempSync(path.join(tmpdir(),'ggd-motion-input-'));
const copySource=relative=>{
 if(typeof relative!=='string'||path.isAbsolute(relative))throw new Error('Invalid handoff path');
 const source=fs.realpathSync(path.resolve(input,relative));
 if(!source.startsWith(input+path.sep))throw new Error('Handoff file escapes source folder');
 const dest=path.resolve(selected,relative);
 if(!dest.startsWith(selected+path.sep))throw new Error('Handoff output path escapes staging folder');
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);
};
copySource(hero.project);copySource(hero.recipe);
const model=JSON.parse(fs.readFileSync(path.join(selected,hero.project),'utf8')).presentation.uploadedModel;
if(model){if(!/^[a-f0-9]{64}$/.test(model.sha256))throw new Error('Invalid model SHA');copySource(`models/${model.sha256}.glb`);}
fs.writeFileSync(path.join(selected,'index.json'),JSON.stringify({...index,heroCount:1,slotCount:6,heroes:[hero]}));
(async()=>{
 const out=output;fs.mkdirSync(out);let adopted=false;let draftReceipt;
 let page;
 const browser=await chromium.launch({channel:values.channel,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const ctx=await browser.newContext({viewport:{width:1440,height:1100}});
 try { page=ctx.pages()[0]||await ctx.newPage();page.setDefaultTimeout(30_000); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 console.log('Opening editor');
 await page.goto(new URL('/editor/hero-forge',origin).href,{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('.hero-header h1').waitFor({timeout:60000});
 const panel=page.getByRole('region',{name:'批次匯入英雄交接'});
 await panel.locator('input[type=file]').setInputFiles(selected);console.log('Validating selected hero model');
 await page.waitForFunction(()=>/已匯入 [0-9]+ 名英雄|匯入未完成/.test(document.querySelector('[aria-label=批次匯入英雄交接]')?.textContent??''),null,{timeout:60000});
 console.log(await panel.innerText());
 if(!(await panel.innerText()).includes('已匯入 1 名英雄'))throw new Error('import failed');
 console.log('Imported focus hero');
 await panel.getByRole('button',{name:hero.name,exact:true}).click();
 await page.locator('.hero-header h1').filter({hasText:hero.name}).waitFor({timeout:60000});
 console.log('Selected hero');

 const adopt=page.getByRole('button',{name:'採用目前生成器並重新檢查',exact:true});if(await adopt.count()){await adopt.click();adopted=true;}
 console.log('Generator selected; downloading local draft receipt');
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'下載草稿備份',exact:true}).click();
 const downloaded=await downloadEvent;const exported=JSON.parse(fs.readFileSync(await downloaded.path(),'utf8')).payload.project;draftReceipt={revision:exported.revision,generatorVersion:exported.acceptedPlan.generatorVersion,sourceSha256:exported.sourceDesign.sourceSha256};
 console.log('Draft receipt downloaded');
 await page.getByRole('navigation',{name:'技能槽',exact:true}).getByRole('button',{name:'E',exact:true}).click();
 const region=page.getByRole('region',{name:'可調整的試玩情境'});
 console.log('Waiting for six-slot background validation');
 await region.waitFor({timeout:180000});
 await region.locator('summary').filter({hasText:'調整試玩情境'}).click();
 await page.getByLabel('試玩移動路線',{exact:true}).selectOption('turn-stop');
 await region.getByText('正在試算此情境…',{exact:true}).waitFor({state:'hidden',timeout:180000});
 await region.getByRole('status').filter({hasText:'完成施放'}).waitFor({timeout:180000});
 const stage=region.locator('.vfx-stage');await stage.locator('canvas').waitFor();
 console.log('Preview ready');
 let expectedSlot="E";const captures=[];
 const capture=async(label,ms)=>{
  if(await page.getByRole("navigation",{name:"技能槽",exact:true}).getByRole("button",{name:expectedSlot,exact:true}).getAttribute("aria-pressed")!=="true")throw new Error("Preview slot changed unexpectedly before "+label);
  await page.waitForFunction(()=>{const text=document.querySelector('.vfx-actor-status')?.textContent??'';return (text.match(/材質正常/g)??[]).length===2&&!text.includes('載入');},null,{timeout:60000});
  const slider=region.getByLabel('Sim 與 3D 播放位置');
  await slider.evaluate((input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},ms);
  await region.locator('.forge-sim-timeline strong').filter({hasText:String(ms)+'ms'}).waitFor({timeout:10000});
  await stage.getByRole('button',{name:'全螢幕預覽',exact:true}).click();await page.waitForTimeout(400);
  if(await page.getByRole('navigation',{name:'技能槽',exact:true}).getByRole('button',{name:expectedSlot,exact:true}).getAttribute('aria-pressed')!=='true')throw new Error('Preview changed during capture');
  const expected={ 'e-accelerating':'accelerating','e-turning':'turning','e-braking':'braking','e-stopped':'stopped','e-collision':'collision','ex-terrain-tether':'pulling','ex-enemy-tether':'pulling' }[label];
  if(expected)await stage.locator(`[data-motion-state="${expected}"]`).waitFor({timeout:10000});
  else await stage.locator('[data-motion-state]').waitFor({state:'detached',timeout:10000});
  const motion=await stage.locator('[data-motion-state]').evaluateAll(nodes=>nodes.map(node=>({state:node.getAttribute('data-motion-state'),x:Number(node.getAttribute('data-motion-x')),z:Number(node.getAttribute('data-motion-z'))})));
  if(expected ? motion.length!==1||motion[0].state!==expected : motion.length!==0)throw new Error('Unexpected live motion state for '+label+': '+JSON.stringify(motion));
  await stage.screenshot({path:out+'/'+label+'.png'});captures.push({label,slot:expectedSlot,ms,motion,sha256:sha(out+'/'+label+'.png'),bytes:fs.statSync(out+'/'+label+'.png').size,status:await stage.locator('.vfx-actor-status').innerText()});console.log(label);await stage.getByRole('button',{name:'返回編輯',exact:true}).click();
 };
 await capture('e-accelerating',300);await capture('e-turning',1300);await capture('e-braking',2233);await capture('e-stopped',2600);
 await page.getByLabel('試玩移動路線',{exact:true}).selectOption('forward');
 await region.getByLabel('加入實體牆面',{exact:false}).check();
 await region.getByText('正在試算此情境…',{exact:true}).waitFor({state:'hidden',timeout:60000});await capture('e-collision',1600);
 expectedSlot='EX';
 await page.getByRole('navigation',{name:'技能槽',exact:true}).getByRole('button',{name:'EX',exact:true}).click();
 await region.getByText('正在試算此情境…',{exact:true}).waitFor({state:'hidden',timeout:60000});
 await page.getByLabel('試玩移動路線',{exact:true}).selectOption('none');
 await region.getByText('正在試算此情境…',{exact:true}).waitFor({state:'hidden',timeout:60000});await capture('ex-terrain-tether',167);await capture('ex-terrain-clear',1300);
 await region.getByLabel('加入實體牆面',{exact:false}).uncheck();
 await region.getByText('正在試算此情境…',{exact:true}).waitFor({state:'hidden',timeout:60000});await capture('ex-enemy-tether',167);await capture('ex-enemy-clear',1300);
 fs.writeFileSync(out+'/captures.json',JSON.stringify({schema:'ggd-motion-browser-capture@1',head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),checkoutDirty:!!execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim(),scriptSha256:sha(fileURLToPath(import.meta.url)),serviceRevision:'not-attested-by-browser',origin:origin.origin,heroId:hero.projectId,indexSha256:sha(path.join(input,'index.json')),selectedIndexSha256:sha(path.join(selected,'index.json')),sourceHeroes:index.heroes.length,importedHeroes:1,adopted,draftReceipt,captures,errors,scope:'Selected hero E drive and EX grapple procedural motion only; other heroes, original-art verdict and publication are not checked'},null,2));fs.writeFileSync(out+'/visual.txt',await page.locator('body').innerText());if(errors.length)throw new Error('Browser page errors; see captures.json');

 }catch(e){console.error(e);if(page){try{fs.writeFileSync(out+'/failure.txt',await page.locator('body').innerText({timeout:5000}));await page.screenshot({path:out+'/failure.png',timeout:5000});}catch(diagnostic){console.error('Diagnostic failed:',diagnostic.message);}}throw e;}finally{await browser.close();fs.rmSync(selected,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
