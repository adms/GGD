// Real Editor folder import and slot previews. No login, submission or publication.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
const {values:v}=parseArgs({options:{input:{type:'string'},output:{type:'string'},origin:{type:'string',default:'http://127.0.0.1:5197'},'playwright-module':{type:'string'},focus:{type:'string'}}});
if(!v.input||!v.output||!v['playwright-module'])throw Error('--input <restored handoff> --output <new directory> --playwright-module <module> required');
const input=fs.realpathSync(v.input),output=path.resolve(v.output),origin=new URL(v.origin);
if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||origin.username||origin.password)throw Error('Loopback only');
if(fs.existsSync(output)||output===input||output.startsWith(input+path.sep))throw Error('Fresh output directory required');
const index=JSON.parse(fs.readFileSync(path.join(input,'index.json'),'utf8'));
const heroes=v.focus?index.heroes.filter(h=>v.focus.split(',').includes(h.index)):index.heroes;
if(!heroes.length)throw Error('No selected heroes');
let selectedInput=input;
if(v.focus){
 selectedInput=fs.mkdtempSync(path.join(tmpdir(),'ggd-parody-selected-'));
 const copy=relative=>{const src=fs.realpathSync(path.join(input,relative));if(!src.startsWith(input+path.sep))throw Error('Invalid source member');const dst=path.join(selectedInput,relative);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);};
 for(const hero of heroes){copy(hero.project);copy(hero.recipe);const model=JSON.parse(fs.readFileSync(path.join(input,hero.project),'utf8')).presentation.uploadedModel;copy(`models/${model.sha256}.glb`);}
 fs.writeFileSync(path.join(selectedInput,'index.json'),JSON.stringify({...index,heroCount:heroes.length,slotCount:heroes.length*6,heroes}));
}
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const {chromium}=await import(pathToFileURL(path.resolve(v['playwright-module'])).href);
fs.mkdirSync(output,{recursive:true});
const report={schema:'ggd-first37-browser-capture@1',origin:origin.origin,serviceRevision:'not-attested',indexSha256:sha(path.join(input,'index.json')),scriptSha256:sha(new URL(import.meta.url)),heroes:[],errors:[],publicationVerified:false};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(30000);
page.on('pageerror',e=>report.errors.push(e.message));
const flush=()=>fs.writeFileSync(path.join(output,'captures.json'),JSON.stringify(report,null,2)+'\n');
try{
 console.log('Opening Editor');
 await page.goto(new URL('/editor/hero-forge',origin).href,{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('.hero-header h1').waitFor({timeout:60000});
 console.log('Editor ready; importing folder');
 const panel=page.getByRole('region',{name:'批次匯入英雄交接'});
 await panel.locator('input[type=file]').setInputFiles(selectedInput);
 const deadline=Date.now()+heroes.length*25000+60000;let progress='';
 while(Date.now()<deadline){
  const text=await panel.innerText();
  if(/已匯入 [0-9]+ 名英雄|匯入未完成/.test(text))break;
  if(text!==progress){progress=text;console.log(text.split('\n').at(-1));}
  await page.waitForTimeout(1000);
 }
 report.importText=await panel.innerText();
 if(!report.importText.includes(`已匯入 ${heroes.length} 名英雄`))throw Error('Batch import failed');
 console.log(`Imported ${heroes.length} heroes`);
 for(const hero of heroes){
  const row={index:hero.index,name:hero.name,projectSha256:sha(path.join(input,hero.project)),captures:[],errors:[]};report.heroes.push(row);
  const dir=path.join(output,hero.index);fs.mkdirSync(dir);
  try{
   await panel.getByRole('button',{name:hero.name,exact:true}).click();
   await page.locator('.hero-header h1').filter({hasText:hero.name}).waitFor({timeout:60000});
   const adopt=page.getByRole('button',{name:'採用目前生成器並重新檢查',exact:true});if(await adopt.count()){await adopt.click();row.adopted=true;}
   const source=JSON.parse(fs.readFileSync(path.join(input,hero.project),'utf8'));
   row.inputDraft={revision:source.revision,generatorVersion:source.acceptedPlan.generatorVersion,sourceSha256:source.sourceDesign.sourceSha256,modelSha256:source.presentation.uploadedModel?.sha256};
   console.log(`${hero.index}: selected; waiting for previews`);
   for(const slot of ['Q','W','E','R','EX']){
    console.log(`${hero.index}/${slot}: opening preview`);
    const nav=page.getByRole('navigation',{name:'技能槽',exact:true});await nav.getByRole('button',{name:slot,exact:true}).click();
    const region=page.getByRole('region',{name:'可調整的試玩情境'});await region.waitFor({timeout:180000});
    await region.getByText('正在試算此情境…',{exact:true}).waitFor({state:'hidden',timeout:180000});
    const status=region.getByRole('status');await status.waitFor({timeout:180000});
    const stage=region.locator('.vfx-stage');await stage.locator('canvas').waitFor({timeout:60000});
    await page.waitForFunction(()=>{const s=document.querySelector('.vfx-actor-status')?.textContent??'';return (s.match(/材質正常/g)??[]).length===2&&!s.includes('載入');},null,{timeout:60000});
    const slider=region.getByLabel('Sim 與 3D 播放位置');
    const times=hero.index==='32'&&slot==='EX'?[300,2500,5500]:[slot==='R'?1000:500];
    for(const wanted of times){
     const ms=Math.min(wanted,Number(await slider.getAttribute('max')));
     await slider.evaluate((input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},ms);
     await region.locator('.forge-sim-timeline strong').filter({hasText:String(ms)+'ms'}).waitFor({timeout:10000});
     if(await nav.getByRole('button',{name:slot,exact:true}).getAttribute('aria-pressed')!=='true')throw Error('Stale selected slot');
     await stage.getByRole('button',{name:'全螢幕預覽',exact:true}).click();await page.waitForTimeout(180);
     const file=path.join(dir,`${slot}-${ms}.png`);await stage.screenshot({path:file});
     row.captures.push({slot,ms,file:path.relative(output,file),sha256:sha(file),bytes:fs.statSync(file).size,actors:await stage.locator('.vfx-actor-status').innerText(),status:await status.innerText()});
     await stage.getByRole('button',{name:'返回編輯',exact:true}).click();
    }
   }
   row.completed=true;console.log(`${hero.index} ${hero.name}: ${row.captures.length} captures`);
  }catch(e){row.errors.push(String(e));console.error(`${hero.index}: ${e}`);await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(dir,'failure.txt'),await page.locator('body').innerText().catch(()=>''));}
  flush();
 }
}catch(e){report.errors.push(String(e));console.error(e);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(output,'failure.txt'),await page.locator('body').innerText().catch(()=>''));}
finally{flush();await browser.close();if(selectedInput!==input)fs.rmSync(selectedInput,{recursive:true,force:true});}
console.log(JSON.stringify({heroes:report.heroes.length,completed:report.heroes.filter(h=>h.completed).length,errors:report.errors}));
if(report.errors.length||report.heroes.length!==heroes.length||report.heroes.some(h=>!h.completed))process.exitCode=1;
