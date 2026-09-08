import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {connect}=await import(pathToFileURL(process.cwd()+'/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs'));
const {readPackageZip}=await import(pathToFileURL(process.cwd()+'/packages/shared/src/content/import/readPackageZip.ts'));
const root='/private/tmp/ggd-community37-generator-rebuild';
const audit=JSON.parse(await readFile('/private/tmp/ggd-community37-editor-publish/current-package-audit.json','utf8'));
const start=Number(process.argv[2]??0),count=Number(process.argv[3]??1);
const c=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(ex,label,ms=60000){const end=Date.now()+ms;while(Date.now()<end){const value=await c.evaluate(ex);if(value)return value;await wait(200);}throw Error('Timed out '+label);}
const click=text=>c.evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(e=>e.innerText===${JSON.stringify(text)}&&!e.disabled);if(!button)throw Error('missing button '+${JSON.stringify(text)});button.click();})()`);
async function download(out,label,button){
 const dir=out+'/'+label;await mkdir(dir,{recursive:true});await c.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});await click(button);
 for(let i=0;i<100;i++){const files=(await readdir(dir)).filter(f=>!f.endsWith('.crdownload'));if(files.length===1){const path=dir+'/'+files[0];const bytes=await readFile(path);if(path.endsWith('.json')||bytes.length>=22&&bytes.readUInt32LE(bytes.length-22)===0x06054b50)return path;}await wait(200);}throw Error('download did not complete');
}
try{
 for(const row of audit.rows.slice(start,start+count)){
  const out=root+'/'+String(row.number).padStart(2,'0');await mkdir(out,{recursive:true});
  const proof={number:row.number,name:row.name,oldSubmissionId:row.submissionId,oldArchive:row.archive,status:'started',slots:[]};
  const save=()=>writeFile(out+'/author.json',JSON.stringify(proof,null,2)+'\n');await save();
  try{
   await click('我的作品');
   await until(`(()=>{const list=[...document.querySelectorAll('li')];return list.some(li=>li.querySelector('h4')?.innerText===${JSON.stringify(row.name)}&&[...li.querySelectorAll('button')].some(b=>b.innerText==='開啟我的已發布版'&&!b.disabled));})()`,'published source '+row.name);
   await c.evaluate(`(()=>{const li=[...document.querySelectorAll('li')].find(li=>li.querySelector('h4')?.innerText===${JSON.stringify(row.name)}&&[...li.querySelectorAll('button')].some(b=>b.innerText==='開啟我的已發布版'));[...li.querySelectorAll('button')].find(b=>b.innerText==='開啟我的已發布版').click();})()`);
   await until(`document.querySelector('h1')?.innerText===${JSON.stringify(row.name)}`,'opened reviewed hero');
   proof.beforeDraft=await download(out,'before','下載草稿備份');
   const before=JSON.parse(await readFile(proof.beforeDraft,'utf8')).payload.project;
   const snapshot=JSON.parse(await readFile(root+'/baseline/hero-submission-snapshots/'+row.submissionId+'.json','utf8'));
   assert.deepEqual(before,snapshot.inspection.project,'Published authoring differs before editing');
   await click('採用目前生成器並重新檢查');await click('視覺編輯');
   for(const slot of ['PASSIVE','Q','W','E','R','EX']){
    await c.evaluate(`[...document.querySelectorAll('.hero-slots button')].find(e=>e.innerText===${JSON.stringify(slot)}).click()`);
    await until(`document.querySelector('.hero-slots button[aria-pressed="true"]')?.innerText===${JSON.stringify(slot)}`,'selected '+slot);
    for(let attempt=0;attempt<32;attempt++){
     const buttons=await c.evaluate(`[...document.querySelectorAll('.hero-products button')].filter(b=>b.innerText==='固定目前模板版本').map(b=>({disabled:b.disabled}))`);
     if(!buttons.length)break;assert(!buttons[0].disabled,'Template is locked; preserve it for explicit handling');await click('固定目前模板版本');
     await until(`[...document.querySelectorAll('.hero-products button')].filter(b=>b.innerText==='固定目前模板版本').length<${buttons.length}`,'fixed template '+slot);
    }
    proof.slots.push({slot,templateLabels:await c.evaluate(`[...document.querySelectorAll('.hero-products p')].map(e=>e.innerText).filter(t=>t.includes('已固定模板版本'))`)});
   }
   await until(`document.body.innerText.includes('六槽編譯與模擬已通過')`,'six-slot validation');
   proof.afterDraft=await download(out,'after','下載草稿備份');
   const after=JSON.parse(await readFile(proof.afterDraft,'utf8')).payload.project;
   assert.match(after.acceptedPlan.generatorVersion,/^sha256:[a-f0-9]{64}$/);
   const restored=structuredClone(after.acceptedPlan);delete restored.generatorVersion;delete restored.templateVersions;
   for(const slot of Object.values(restored.slots))for(const p of slot.products)delete p.template.contentSha256;
   assert.deepEqual(restored,before.acceptedPlan,'Template pinning changed original plan or tuning');
   for(const key of ['brief','sourceLock','sourceDesign','refinementNotes','presentation'])assert.deepEqual(after[key],before[key],key+' changed');
   for(const slot of Object.values(after.acceptedPlan.slots))for(const p of slot.products)assert(after.acceptedPlan.templateVersions[p.template.contentSha256]);
   proof.projectId=after.projectId;proof.revision=after.revision;proof.generatorVersion=after.acceptedPlan.generatorVersion;proof.allOriginalAuthoringPreserved=true;
   await click('建立完整英雄 ZIP');
   const built=await until(`(()=>{const t=document.querySelector('.hero-package-panel')?.innerText??'';return /完整英雄檢查通過|無法建立完整英雄/.test(t)?t:null;})()`,'current service build',90000);
   proof.packageSummary=built;assert(built.includes('完整英雄檢查通過'),built);
   const buttons=await c.evaluate(`[...document.querySelectorAll('button')].filter(b=>/下載.*ZIP/.test(b.innerText)&&!b.disabled).map(b=>b.innerText)`);assert.equal(buttons.length,1);
   proof.archive=await download(out,'package',buttons[0]);
   const pkg=readPackageZip(new Uint8Array(await readFile(proof.archive)));
   const target=JSON.parse(await readFile(root+'/target-current.json','utf8'));
   const provenance=pkg.validation.find(entry=>entry.path==='validation/hero-build-provenance.json')?.document;
   assert(provenance,'ZIP is missing build provenance');
   assert.equal(provenance.generatorVersion,after.acceptedPlan.generatorVersion);
   assert.equal(provenance.planGeneratorVersion,after.acceptedPlan.generatorVersion);
   assert.equal(provenance.processorFingerprint,target.authoringProcessor.fingerprint);
   assert.equal(pkg.manifest.base.gameRevision,target.gameVersion);
   assert.equal(pkg.manifest.base.contentVersion,target.base.contentVersion);
   proof.provenance=provenance;proof.packageDigest=pkg.manifest.packageDigest;
   proof.status='built';await save();console.log(row.number,row.name,'BUILT',after.revision);
  }catch(error){proof.status='needs-attention';proof.error=String(error);await writeFile(out+'/failure.txt',await c.evaluate('document.body.innerText'));await save();console.log(row.number,row.name,String(error).slice(0,900));process.exitCode=1;break;}
 }
}finally{c.close();}
