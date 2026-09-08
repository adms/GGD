import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const root=path.dirname(new URL(import.meta.url).pathname);
const built=JSON.parse(await fs.readFile(path.join(root,'rebuilt-37-attempt2/report.json'),'utf8'));
assert.equal(built.status,'passed');assert.equal(built.passed,37);
const out=path.join(root,'submission-37');await fs.mkdir(out);
const password=JSON.parse(await fs.readFile(path.join(root,'credentials-private.json'),'utf8')).password;
let token='';
async function api(route:string,body?:unknown,options:{method?:string;headers?:Record<string,string>}={}){
 const bytes=body instanceof Uint8Array;
 const r=await fetch('http://127.0.0.1:8097/api/v1'+route,{method:options.method??(body===undefined?'GET':'POST'),headers:{...(token?{authorization:`Bearer ${token}`} : {}),...(body===undefined?{}:{'content-type':bytes?'application/zip':'application/json'}),...options.headers},body:body===undefined?undefined:bytes?body as Uint8Array:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 if(!r.ok)throw new Error(`${route}: HTTP ${r.status} ${await r.text()}`);return r;
}
const login=await(await api('/auth/login',{username:'model-author',password})).json();token=login.tokens.accessToken;
const report:any={schema:'ggd-current-service-submission-proof@1',startedAt:new Date().toISOString(),status:'running',scope:'Real author API model synchronization, versioned cloud draft and submission on authorized isolated service. No browser-action claim.',target:built.target,rows:[]};
const save=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
for(const row of built.rows){
 const item:any={number:row.number,name:row.name,workId:row.projectId,status:'running',operationId:randomUUID()};report.rows.push(item);await save();
 const dir=path.join(out,String(row.number).padStart(2,'0'));await fs.mkdir(dir);
 try{
  const oldDir=path.join('/private/tmp/ggd-community37-generator-rebuild',String(row.number).padStart(2,'0'),'after');
  const files=(await fs.readdir(oldDir)).filter(x=>x.endsWith('-draft.json'));assert.equal(files.length,1);
  const envelope=JSON.parse(await fs.readFile(path.join(oldDir,files[0]!), 'utf8'));
  const {cloud,submission,modelFiles,...payload}=envelope.payload;
  payload.project=JSON.parse(await fs.readFile(path.join(path.dirname(row.archive),'after.hero-project.json'),'utf8'));
  assert.equal(payload.project.projectId,row.projectId);
  let modelFilesVerified=0;
  for(const file of modelFiles??[]){
   const bytes=Buffer.from(file.base64,'base64');assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
   const receipt=await(await api(`/hero-model-assets/${file.sha256}`,bytes,{method:'PUT',headers:{'content-type':'model/gltf-binary'}})).json();
   assert.equal(receipt.sha256,file.sha256);assert.equal(receipt.bytes,bytes.length);
   const restored=Buffer.from(await(await api(`/hero-model-assets/${file.sha256}`)).arrayBuffer());assert.deepEqual(restored,bytes);modelFilesVerified++;
  }
  const draft=await(await api('/hero-works/draft',{workId:row.projectId,expectedRevision:0,payload})).json();
  assert.equal(draft.ownerId,login.account.id);assert.deepEqual(draft.draft,payload);assert.equal(draft.draftRevision,1);
  await fs.writeFile(path.join(dir,'draft-receipt.json'),JSON.stringify({workId:draft.id,ownerId:draft.ownerId,draftRevision:draft.draftRevision,draftVersion:draft.draftVersion,draftDigest:draft.draftDigest,modelFilesVerified},null,2)+'\n');
  const bytes=new Uint8Array(await fs.readFile(row.archive));assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),row.archiveSha256);
  const snapshot=await(await api('/hero-submissions',bytes,{headers:{'x-ggd-work-id':row.projectId,'x-ggd-operation-id':item.operationId,'x-ggd-allow-attribution-remix':'true'}})).json();
  assert.equal(snapshot.version.packageDigest,row.packageDigest);assert.equal(snapshot.workId,row.projectId);assert.deepEqual(snapshot.inspection.project,payload.project);
  assert(!snapshot.inspection.diagnostics.some((x:any)=>x.severity==='error'));
  const view=await(await api(`/hero-submissions/${snapshot.id}`)).json();assert.equal(view.status,'pending');assert.equal(view.publication.published,null);
  await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify(snapshot,null,2)+'\n');
  await fs.writeFile(path.join(dir,'pending.json'),JSON.stringify(view.publication,null,2)+'\n');
  Object.assign(item,{status:'pending',submissionId:snapshot.id,packageDigest:row.packageDigest,snapshotDigest:snapshot.version.snapshotDigest,archive:row.archive,draftVersion:draft.draftVersion,sourcePreserved:true,modelFilesVerified});
 }catch(error){item.status='failed';item.error=error instanceof Error?error.message:String(error);}
 await save();console.log(JSON.stringify(item));
}
report.pending=report.rows.filter((x:any)=>x.status==='pending').length;report.failed=37-report.pending;report.status=report.failed?'failed':'passed';report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,pending:report.pending,failed:report.failed}));if(report.failed)process.exitCode=1;
