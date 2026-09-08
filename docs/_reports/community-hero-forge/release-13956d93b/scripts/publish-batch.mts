import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const root=path.dirname(new URL(import.meta.url).pathname);
const submissions=JSON.parse(await fs.readFile(path.join(root,'submission-37/report.json'),'utf8'));
assert.equal(submissions.status,'passed');assert.equal(submissions.pending,37);
const batch=JSON.parse(await fs.readFile(path.join(root,'rebuilt-37-attempt2/report.json'),'utf8'));
const out=path.join(root,'publication-37-attempt2');await fs.mkdir(out);
let token='';
async function api(route:string,body?:unknown){const r=await fetch('http://127.0.0.1:8097/api/v1'+route,{method:body===undefined?'GET':'POST',headers:{...(token?{authorization:`Bearer ${token}`} : {}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(90000)});if(!r.ok)throw new Error(`${route}: HTTP ${r.status} ${await r.text()}`);return r;}
const password=JSON.parse(await fs.readFile(path.join(root,'credentials-private.json'),'utf8')).password;
const actor=await(await api('/auth/login',{username:'model-reviewer',password})).json();assert(actor.account.roles.includes('admin'));token=actor.tokens.accessToken;
const report:any={schema:'ggd-current-service-publication-proof@1',status:'running',startedAt:new Date().toISOString(),heroCount:37,target:batch.target,scope:'Authorized isolated admin review/publication via production API. Original-art fidelity and UI clickthrough are not asserted; earlier character visual evidence remains separately scoped.',rows:[]};
const save=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
for(const row of submissions.rows){
 const result:any={number:row.number,name:row.name,workId:row.workId,submissionId:row.submissionId,packageDigest:row.packageDigest,snapshotDigest:row.snapshotDigest,status:'running',operationId:randomUUID()};report.rows.push(result);await save();
 try{
  const expected=batch.rows.find((x:any)=>x.projectId===row.workId);assert(expected);
  const view=await(await api(`/admin/hero-submissions/${row.submissionId}`)).json();assert.equal(view.status,'pending');assert.equal(view.snapshot.version.snapshotDigest,row.snapshotDigest);assert.equal(view.snapshot.version.packageDigest,row.packageDigest);
  const project=JSON.parse(await fs.readFile(path.join(path.dirname(expected.archive),'after.hero-project.json'),'utf8'));assert.deepEqual(view.snapshot.inspection.project,project);
  assert(!view.snapshot.inspection.diagnostics.some((x:any)=>x.severity==='error'));
  const bytes=new Uint8Array(await(await api(`/admin/hero-submissions/${row.submissionId}/package`)).arrayBuffer());assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),expected.archiveSha256);
  const validation=JSON.parse(await fs.readFile(path.join(path.dirname(expected.archive),'validation.json'),'utf8')).find((x:any)=>x.path==='validation/hero-simulation.json').document;
  assert.equal(validation.kit.status,'accepted');assert.equal(validation.replay.errors.length,0);
  const reason='隔離流程驗收：本次服務版本重新編譯、六槽模擬及原文／微調／模型位元組比對通過。沿用既有角色視覺收據；代理外觀與替代效果仍依原標記保留，不宣稱原作設計或正式站已交付。';
  const control=await(await api(`/admin/hero-submissions/${row.submissionId}/publish`,{operationId:result.operationId,action:'publish',reason,expectedRevision:view.publication.revision})).json();
  assert.equal(control.published.submissionId,row.submissionId);assert.equal(control.published.version.packageDigest,row.packageDigest);
  const final=await(await api(`/admin/hero-submissions/${row.submissionId}`)).json();assert.equal(final.status,'published'); assert.equal(final.decision.status,'approved'); assert.equal(final.decision.decidedBy,actor.account.id);
  const dir=path.join(out,String(row.number).padStart(2,'0'));await fs.mkdir(dir);await fs.writeFile(path.join(dir,'decision.json'),JSON.stringify(final.decision,null,2)+'\n');await fs.writeFile(path.join(dir,'publication.json'),JSON.stringify(control,null,2)+'\n');
  Object.assign(result,{status:'published',publicationRevision:control.revision,decisionId:final.decision.id,reviewedArchiveSha256:expected.archiveSha256});
 }catch(error){result.status='failed';result.error=error instanceof Error?error.message:String(error);report.status='failed';await save();throw error;}
 await save();console.log(JSON.stringify(result));
}
const published=await(await api('/hero-works/published')).json();assert.equal(published.length,37);
for(const row of report.rows){const match=published.find((x:any)=>x.workId===row.workId);assert(match);assert.equal(match.packageDigest,row.packageDigest);}
await fs.writeFile(path.join(out,'ordinary-published-roster.json'),JSON.stringify(published,null,2)+'\n');
report.published=report.rows.filter((x:any)=>x.status==='published').length;report.failed=37-report.published;report.status=report.failed?'failed':'passed';report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,published:report.published,failed:report.failed}));if(report.failed)process.exitCode=1;
