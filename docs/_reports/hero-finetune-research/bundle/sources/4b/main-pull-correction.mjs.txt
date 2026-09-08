/** Quarantine a real cast-path defect without rewriting earlier audit evidence. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {digest} from './dataset.mjs';
export function correctPullThrow(review,cases,manifest,probe){
 assert.equal(review.reviewVersion,2);assert.equal(review.revision,probe.revision);assert.equal(manifest.casesSha256,digest(cases));
 assert.equal(probe.short.castResult,'ok');assert.equal(probe.long.castResult,'ok');assert.equal(probe.entity.castResult,'bad-target');
 assert.equal(probe.short.foes.length,2);assert(probe.short.foes.every(f=>f.override?.kind==='leap'));
 assert.deepEqual(probe.short.foes.map(f=>f.override.to),probe.long.foes.map(f=>f.override.to));
 assert.notDeepEqual(probe.controlShort.foes[0].override.to,probe.controlLong.foes[0].override.to);
 const rows=review.rows.map(r=>r.templateId!=='tpl-pull-throw'?structuredClone(r):{...r,status:'quarantined',classificationDiagnosticEligible:false,reviewStatus:'quarantine-cast-path-contract',issue:'#1050',description:'目前是地面小圈群體選取、拉回後拋到施法點，throwDistance在真施法入口不生效；不能當作指定單體、依投擲距離向前拋飛的已完成模板。修正前隔離。',caution:'Real castAbility probe supersedes prior pending selection check.',proof:{...r.proof,castSelectionAndEndpointVerified:true,fullRuntimeValidated:false}});
 const corrected={...review,reviewVersion:3,supersedesReviewSha256:digest(review),correctionEvidenceSha256:digest(probe),rows,counts:{total:rows.length,enabled:rows.filter(r=>r.status==='enabled').length,quarantined:rows.filter(r=>r.status==='quarantined').length,draft:rows.filter(r=>r.status==='draft').length}};
 assert.equal(corrected.counts.enabled,30);assert.equal(corrected.counts.quarantined,5);
 const catalog=rows.filter(r=>r.status==='enabled').map(({templateId,status,description})=>({templateId,status,description}));
 const unavailable=rows.filter(r=>r.status!=='enabled').map(({templateId,status,issue})=>({templateId,status,issue}));
 const nextCases=cases.map(c=>{
  assert(!c.acceptedTargets.some(t=>t.templateId==='tpl-pull-throw'),'POSITIVE_ORACLE_NEEDS_REVIEW');
  const id=c.id.replace('main-diagnostic-v2-','main-diagnostic-v3-'),user=JSON.parse(c.messages[1].content);
  user.catalog=catalog.slice().sort((a,b)=>digest(id+a.templateId).localeCompare(digest(id+b.templateId)));user.unavailable=unavailable;
  const messages=[c.messages[0],{role:'user',content:JSON.stringify(user)}];return {...c,id,messages,requestDigest:digest(messages),priorDiagnosticId:c.id};
 });
 return {review:corrected,cases:nextCases,manifest:{...manifest,version:3,catalogReviewSha256:digest(corrected),casesSha256:digest(nextCases),supersedesCasesSha256:manifest.casesSha256,scopeCorrection:{templateId:'tpl-pull-throw',issue:'#1050',change:'quarantined after real cast-entry probe; no existing positive oracle used it'},purpose:'Corrected prospective catalog after receiver and cast-path audits; still research-only, not full runtime Gold.'}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root]=process.argv.slice(2);assert(root);const out=path.join(root,'main-diagnostic-v3');assert(!fs.existsSync(out));
 const read=p=>JSON.parse(fs.readFileSync(path.join(root,p))),r=correctPullThrow(read('main-catalog-review-v2.json'),read('main-diagnostic-v2/cases.private.json'),read('main-diagnostic-v2/manifest.json'),read('main-pull-throw-probe.json'));
 assert(!read('cases.private.json').some(c=>JSON.stringify(c.acceptedTargets??c.target).includes('tpl-pull-throw')),'R3_POSITIVE_REQUIRES_INVALIDATION');
 fs.mkdirSync(out);for(const [n,v] of [['cases.private.json',r.cases],['manifest.json',r.manifest],['requests.json',r.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest}))]])fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(root,'main-catalog-review-v3.json'),JSON.stringify(r.review,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,counts:r.review.counts,manifest:r.manifest},null,2));
}
