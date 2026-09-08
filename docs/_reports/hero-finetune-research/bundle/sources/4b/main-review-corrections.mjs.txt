/** Append-only semantic corrections; never mutate an in-flight pinned benchmark. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';import {buildMainBenchmark} from './main-catalog-benchmark.mjs';

export function correctGrowthReceiver(review,probe){
 assert.equal(review.revision,probe.revision);assert.equal(probe.quarantineTemplate,'tpl-growth-charge');
 assert.equal(probe.one.after.killer.agi,probe.one.before.killer.agi);
 assert.equal(probe.one.after.victims[0].agi,probe.one.before.victims[0].agi+1);
 assert.equal(probe.eight.after.killer.agi,probe.eight.before.killer.agi);
 assert.equal(probe.control.after.killer.agi,probe.control.before.killer.agi+1);
 assert.equal(probe.eight.fired.length,8);assert(probe.eight.fired.every(n=>n===1));
 assert.deepEqual(probe.control.after.victims,probe.control.before.victims);
 const rows=review.rows.map(r=>r.templateId!=='tpl-growth-charge'?structuredClone(r):{
  ...r,status:'quarantined',reviewStatus:'quarantine-wrong-recipient',issue:'#1048',classificationDiagnosticEligible:false,
  description:'目前 onKill hook 未指向 self，實際將屬性計數與增量送給受害者而非擊殺者。未修正前隔離；不能承諾自身擊殺成長。',
  proof:{...r.proof,fullRuntimeValidated:false,realHookReceiverVerified:true},caution:'Effect-only tests that inject targets=[caster] hide this defect.'
 });
 const corrected={...review,reviewVersion:2,supersedesReviewSha256:digest(review),correctionEvidenceSha256:digest(probe),rows,counts:{total:rows.length,enabled:rows.filter(r=>r.status==='enabled').length,quarantined:rows.filter(r=>r.status==='quarantined').length,draft:rows.filter(r=>r.status==='draft').length},releaseQualified:false,trainingApproved:false};
 assert.equal(corrected.counts.enabled,31);assert.equal(corrected.counts.quarantined,4);
 const old=buildMainBenchmark(review),enabled=rows.filter(r=>r.status==='enabled').map(({templateId,status,description})=>({templateId,status,description})),unavailable=rows.filter(r=>r.status!=='enabled').map(({templateId,status,issue})=>({templateId,status,issue}));
 const cases=old.cases.map(c=>{
  const id=c.id.replace('main-diagnostic-','main-diagnostic-v2-'),user=JSON.parse(c.messages[1].content);
  user.catalog=enabled.slice().sort((a,b)=>digest(id+a.templateId).localeCompare(digest(id+b.templateId)));user.unavailable=unavailable;
  const messages=[c.messages[0],{role:'user',content:JSON.stringify(user)}];
  const acceptedTargets=c.id==='main-diagnostic-single-stat-growth'?[{decision:'refuse',templateId:null}]:c.acceptedTargets;
  for(const t of acceptedTargets)assert(t.templateId===null||enabled.some(x=>x.templateId===t.templateId),'QUARANTINED_TARGET');
  return {...c,id,messages,requestDigest:digest(messages),target:acceptedTargets[0],acceptedTargets,priorDiagnosticId:c.id,trainingEligible:false};
 });
 const manifest={...old.manifest,version:2,catalogReviewSha256:digest(corrected),casesSha256:digest(cases),supersedesCasesSha256:old.manifest.casesSha256,oracleCorrections:[{id:'main-diagnostic-single-stat-growth',old:'accept tpl-growth-charge',corrected:'refuse',issue:'#1048'}],purpose:'Corrected prospective pinned-main diagnostic; v1 growth-positive oracle is invalid. v1 results must not be used as current capability claims.'};
 const correction={revision:review.revision,issue:'https://github.com/adms/GGD/issues/1048',templateId:'tpl-growth-charge',action:'quarantine',invalidatedDiagnostics:['main-diagnostic-v1/main-diagnostic-single-stat-growth'],invalidatedClaims:['main-stack-audit-v1 tripleGrowth is only effect-body evidence, not a supported kill-growth recipe'],r3OriginalCurriculumChanged:false,pinnedPostDiagnosticsChanged:false,releaseQualified:false};
 return {review:corrected,cases,manifest,correction};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root]=process.argv.slice(2);assert(root);const out=path.join(root,'main-diagnostic-v2');assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8')),r=correctGrowthReceiver(read('main-catalog-review.json'),read('main-growth-receiver-probe.json'));
 // Historical R3 must not contain this erroneous positive. Never silently fix it in-place.
 assert(!read('cases.private.json').some(c=>JSON.stringify(c.acceptedTargets??c.target).includes('tpl-growth-charge')),'R3_POSITIVE_REQUIRES_INVALIDATION');
 fs.mkdirSync(out);for(const [n,v] of [['cases.private.json',r.cases],['requests.json',r.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest}))],['manifest.json',r.manifest]])fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 for(const [n,v] of [['main-catalog-review-v2.json',r.review],['main-data-corrections-v2.json',r.correction]])fs.writeFileSync(path.join(root,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({out,counts:r.review.counts,manifest:r.manifest,correction:r.correction},null,2));
}
