import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const root='/private/tmp/ggd-community37-editor-publish';
const bindings=JSON.parse(await readFile('tools/community-hero-forge/library-bodies/community37.bindings.json','utf8')).entries;
const start=Number(process.argv[2]??0), count=Number(process.argv[3]??3);
const c=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(ex,label,ms=90000){const end=Date.now()+ms;while(Date.now()<end){const v=await c.evaluate(ex);if(v)return v;await wait(300);}throw Error('Timed out '+label);}
const click=text=>c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText===${JSON.stringify(text)}&&!e.disabled).click()`);
const results=[];
try{
 for(const [offset,entry] of bindings.slice(start,start+count).entries()){
  const number=start+offset+1, out=root+'/'+String(number).padStart(2,'0');await mkdir(out,{recursive:true});
  const proof={name:entry.name,projectId:entry.projectId,modelSource:entry.provenance,slots:[],status:'started'};
  const save=()=>writeFile(out+'/author.json',JSON.stringify(proof,null,2)+'\n');
  try{
   if(process.env.CURRENT_DRAFT!=='1'){
   await click('我的作品');await until(`document.querySelectorAll('h2').length>20`,'works list');
   await c.evaluate(`[...document.querySelectorAll('h2')].find(e=>e.textContent===${JSON.stringify(entry.name)}).parentElement.querySelector('button').click()`);
   }else{await until(`document.querySelector('h1')?.innerText===${JSON.stringify(entry.name)}`,'current hero');}
   await until(`document.querySelector('.hero-slots')!==null`,'slot editor');
   await until(`document.body.innerText.includes('六槽編譯與模擬已通過')`,'compiled kit');
   for(const slot of (process.env.SUBMIT_ONLY==='1'?[]:['PASSIVE','Q','W','E','R','EX'])){
    await c.evaluate(`[...document.querySelectorAll('.hero-slots button')].find(e=>e.innerText===${JSON.stringify(slot)}).click()`);
    await wait(450);
    await until(`document.body.innerText.includes('目前預覽 ${slot}')`,'selected '+slot);
    await until(`(()=>{const t=document.body.innerText;return t.includes('施法者：')&&t.includes('目標：')&&!t.includes('載入模型中');})()`,'actors');
    await wait(650);
    await c.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center'})`);
    const body=await c.evaluate('document.querySelector("main").innerText');
    const shot=await c.call('Page.captureScreenshot',{format:'png'});
    await writeFile(out+'/'+slot+'.png',Buffer.from(shot.data,'base64'));await writeFile(out+'/'+slot+'.txt',body);
    proof.slots.push({slot,compiled:body.includes('六槽編譯與模擬已通過'),actors:body.split('\n').filter(t=>/^(施法者|目標)：/.test(t)),result:body.split('\n').find(t=>t.startsWith('完成施放')||t.startsWith('施放未完成'))});
    await save();console.log(number,entry.name,slot,'previewed');
   }
   await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='建立完整英雄 ZIP'&&!e.disabled)`,'build enabled');
   await click('建立完整英雄 ZIP');
   const built=await until(`(()=>{const t=document.querySelector('.hero-package-panel')?.innerText??'';return /完整英雄檢查通過|無法建立完整英雄/.test(t)?t:null;})()`,'service build');
   proof.packageSummary=built;
   if(!built.includes('完整英雄檢查通過'))throw Error(built);
   const downloadDir=out+'/downloads/'+Date.now();await mkdir(downloadDir,{recursive:true});
   await c.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
   const downloads=await c.evaluate(`[...document.querySelectorAll('button')].filter(e=>/下載.*ZIP/.test(e.innerText)&&!e.disabled).map(e=>e.innerText)`);
   if(downloads.length!==1)throw Error('Expected one complete hero ZIP download button; found '+downloads.length);
   await click(downloads[0]);
   const revision=built.match(/第 (\d+) 版/);if(!revision)throw Error('Missing package revision');
   proof.downloadFile=entry.projectId+'-r'+revision[1]+'.zip';
   let downloaded=false;for(let i=0;i<100;i++){const bytes=await readFile(downloadDir+'/'+proof.downloadFile).catch(()=>null);if(bytes&&bytes.length>=22&&bytes.readUInt32LE(bytes.length-22)===0x06054b50){downloaded=true;break;}await wait(200);}
   if(!downloaded)throw Error('Complete hero ZIP download did not finish');
   proof.downloadPath=downloadDir+'/'+proof.downloadFile;
   await writeFile(out+'/'+proof.downloadFile,await readFile(proof.downloadPath));
   if(process.env.BUILD_ONLY==='1'){proof.status='built';await save();results.push(proof);await writeFile(root+'/batch-'+start+'.json',JSON.stringify(results,null,2)+'\n');console.log(number,entry.name,'BUILT ONLY');continue;}
   await until(`[...document.querySelectorAll('button')].some(e=>e.innerText==='提交這份完整英雄審查'&&!e.disabled)`,'submission enabled');
   await click('提交這份完整英雄審查');
   const response=await until(`(()=>{const section=document.querySelector('.hero-community');const t=section?.querySelector(':scope > p[role="status"]')?.innerText??'';return /完整英雄已送審|HTTP \d{3}|Error:/.test(t)?section.innerText:null;})()`,'submission response');
   proof.submission=response;if(!response.includes('完整英雄已送審'))throw Error(response);
   proof.status='submitted';console.log(number,entry.name,'SUBMITTED');
  }catch(e){proof.status='needs-attention';proof.error=String(e);await writeFile(out+'/failure.txt',await c.evaluate('document.body.innerText'));console.log(number,entry.name,'NEEDS ATTENTION',String(e).slice(0,350));}
  await save();results.push(proof);await writeFile(root+'/batch-'+start+'.json',JSON.stringify(results,null,2)+'\n');
  if(proof.status==='needs-attention'){process.exitCode=1;break;}
 }
}finally{c.close();}
