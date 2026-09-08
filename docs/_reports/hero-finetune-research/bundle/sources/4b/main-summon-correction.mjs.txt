/** Preserve v3; issue-backed default-contract quarantine for future inputs. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {digest} from './dataset.mjs';
export function correctSummon(review,cases,manifest,probe){
 assert.equal(review.reviewVersion,3);assert.equal(review.revision,probe.revision);assert.equal(manifest.casesSha256,digest(cases));
 for(const key of ['defaults','twoDefaultCap','positiveCap','omittedCap'])assert.equal(probe[key].castResult,'ok');
 assert.equal(probe.defaults.countImmediately,0);assert.equal(probe.twoDefaultCap.countImmediately,0);assert.equal(probe.positiveCap.countImmediately,2);assert.equal(probe.omittedCap.countImmediately,2);
 assert(probe.positiveCap.bodies.every(b=>b.hp>0&&b.maxHp>0));
 const rows=review.rows.map(r=>r.templateId!=='tpl-summon-agent'?structuredClone(r):{...r,status:'quarantined',classificationDiagnosticEligible:false,trainingEligible:false,reviewStatus:'quarantine-default-zero-capacity',issue:'#1076',description:'召喚管線可在正上限控制組生出有生命的單位，但模板預設 maxAlive=0 被執行為零容量，與不設上限說明相反；預設真施法不生任何單位。修正前隔離，不能無條件推薦。',caution:'Positive-cap control proves support exists, not that the broken default is safe or all lifecycle behavior is validated.',proof:{...r.proof,defaultCastCreatesZeroBodies:true,positiveCapCreatesBodies:true,fullRuntimeValidated:false}});
 const corrected={...review,reviewVersion:4,supersedesReviewSha256:digest(review),correctionEvidenceSha256:digest(probe),rows,counts:{total:rows.length,enabled:rows.filter(r=>r.status==='enabled').length,quarantined:rows.filter(r=>r.status==='quarantined').length,draft:rows.filter(r=>r.status==='draft').length}};
 assert.deepEqual(corrected.counts,{total:46,enabled:29,quarantined:6,draft:11});
 const catalog=rows.filter(r=>r.status==='enabled').map(({templateId,status,description})=>({templateId,status,description})),unavailable=rows.filter(r=>r.status!=='enabled').map(({templateId,status,issue})=>({templateId,status,issue}));
 let changedLabels=0;
 const nextCases=cases.map(c=>{
  const id=c.id.replace('main-diagnostic-v3-','main-diagnostic-v4-'),input=JSON.parse(c.messages[1].content);assert.notEqual(id,c.id);
  input.catalog=catalog.slice().sort((a,b)=>digest(id+a.templateId).localeCompare(digest(id+b.templateId)));input.unavailable=unavailable;
  const messages=[c.messages[0],{role:'user',content:JSON.stringify(input)}];
  const blocked=c.acceptedTargets.some(t=>t.templateId==='tpl-summon-agent');if(blocked){assert(c.acceptedTargets.every(t=>t.templateId==='tpl-summon-agent'));changedLabels++;}
  const acceptedTargets=blocked?[{decision:'refuse',templateId:null}]:c.acceptedTargets;
  return {...c,id,messages,requestDigest:digest(messages),priorDiagnosticId:c.id,target:acceptedTargets[0],acceptedTargets,...(blocked?{priorAcceptedTargets:c.acceptedTargets,oracleCorrection:'Availability correction after #1076 real cast proof; no other enabled card summons live bodies.'}:{})};
 });
 assert.equal(changedLabels,2);
 return {review:corrected,cases:nextCases,manifest:{...manifest,version:4,catalogReviewSha256:digest(corrected),casesSha256:digest(nextCases),supersedesCasesSha256:manifest.casesSha256,changedLabels,scopeCorrection:{templateId:'tpl-summon-agent',issue:'#1076',change:'Default-contract quarantine; two prior positive requests must now refuse because the only suitable card is unavailable.'},purpose:'New inputs require new predictions. Do not rescore frozen v3 raw outputs against these changed v4 labels.'}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root]=process.argv.slice(2);assert(root);const out=path.join(root,'main-diagnostic-v4');assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
 const r=correctSummon(read('main-catalog-review-v3.json'),read('main-diagnostic-v3/cases.private.json'),read('main-diagnostic-v3/manifest.json'),read('main-summon-cap-probe-v1.json'));
 fs.mkdirSync(out);for(const [n,v] of [['cases.private.json',r.cases],['manifest.json',r.manifest],['requests.json',r.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest}))]])fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(root,'main-catalog-review-v4.json'),JSON.stringify(r.review,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,counts:r.review.counts,changedLabels:r.manifest.changedLabels}));
}
