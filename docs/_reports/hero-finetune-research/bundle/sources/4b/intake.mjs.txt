import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest,mechanicsText,SYSTEM,writeJSON} from './dataset.mjs';
import {score} from './scorer.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const structure=x=>typeof x==='number'?'#':Array.isArray(x)?x.map(structure):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,structure(x[k])])):x;
const normalized=text=>text.normalize('NFKC').toLowerCase().replace(/\d+(?:\.\d+)?/g,'#').replace(/[\p{P}\p{Z}\s]/gu,'');
const grams=text=>new Set(Array.from({length:Math.max(0,text.length-2)},(_,i)=>text.slice(i,i+3)));
const similarity=(a,b)=>{const u=new Set([...a,...b]);return u.size?[...a].filter(x=>b.has(x)).length/u.size:0;};
export function readArtifact(base,relative,maxBytes=2*1024**2){
 if(!nonempty(relative)||path.isAbsolute(relative)||relative.split(/[\\/]/).some(x=>x==='..'||x==='.'))throw Error('ARTIFACT_PATH');
 const root=fs.realpathSync(base),resolved=fs.realpathSync(path.resolve(base,relative));
 if(!resolved.startsWith(root+path.sep)||!fs.statSync(resolved).isFile()||fs.statSync(resolved).size>maxBytes)throw Error('ARTIFACT_SCOPE_OR_SIZE');
 return{path:relative,sha256:hash(resolved),value:JSON.parse(fs.readFileSync(resolved,'utf8'))};
}
export function reviewIntake(records,policy){
 if(policy.schema!=='ggd-forge-intake-policy@1'||policy.contract!=='ground-nova-research@1'||!Array.isArray(records)||records.length>2000||!Array.isArray(policy.approvedReviews)||!Array.isArray(policy.allowedLicenseRefs)||!Array.isArray(policy.splitAssignments)||!Array.isArray(policy.blockedLineageRoots)||!Array.isArray(policy.blockedOwnerHashes))throw Error('INTAKE_POLICY');
 const threshold=policy.nearDuplicateThreshold??0.9;if(threshold<0.8||threshold>1)throw Error('NEAR_DUPLICATE_THRESHOLD');
 if(!Array.isArray(policy.vfxKeys)||!Array.isArray(policy.vfxFields)||new Set(policy.splitAssignments.map(x=>x.lineageRootId)).size!==policy.splitAssignments.length)throw Error('AMBIGUOUS_INTAKE_POLICY');
 const prepared=records.map(record=>{
  const reasons=[],pending=[];let text='',fingerprint=null,contentDigest=null,messages=null;
  try{
   if(record.schema!=='ggd-forge-training-example@1'||!['fill-slot'].includes(record.task)||!['train','dev','test'].includes(record.split)||!['id','familyId','lineageRootId'].every(k=>nonempty(record[k])))throw Error('ENVELOPE');
   const {source,pins,request,target,expectation}=record;
   if(!nonempty(source?.ownerText)||source.ownerText.length>20000||!nonempty(source.revision)||!nonempty(source.licenseRef))throw Error('SOURCE');
   if(source.ownerTextSha256!==digest(source.ownerText))throw Error('OWNER_HASH');
   if(!policy.allowedLicenseRefs.includes(source.licenseRef))pending.push('LICENSE_NOT_APPROVED');
   if(source.releaseCorpus!==false||policy.blockedLineageRoots.includes(record.lineageRootId)||policy.blockedOwnerHashes.includes(source.ownerTextSha256))throw Error('RELEASE_OR_BLOCKED_SOURCE');
   if(digest(canonical(pins))!==digest(canonical(policy.pins)))throw Error('PIN_DRIFT');
   if(!policy.splitAssignments.some(x=>x.lineageRootId===record.lineageRootId&&x.split===record.split))throw Error('SPLIT_NOT_ASSIGNED');
   if(!request||Object.keys(request).some(k=>!['ownerText','context'].includes(k))||request.ownerText!==source.ownerText)throw Error('REQUEST_SOURCE_OR_LEAKAGE');
   const context=request.context;
   if(!context||Object.keys(context).some(k=>!['templateId','vfxKeys','allowedVfxFields','legalFallbackIds'].includes(k))||context.templateId!=='tpl-ground-nova'||!Array.isArray(context.vfxKeys)||context.vfxKeys.some(k=>!policy.vfxKeys.includes(k))||!Array.isArray(context.allowedVfxFields)||context.allowedVfxFields.some(k=>!policy.vfxFields.includes(k))||!Array.isArray(context.legalFallbackIds)||context.legalFallbackIds.some(k=>k!=='cast-nova'))throw Error('PUBLIC_CONTEXT');
   text=mechanicsText(source.ownerText);
   if(!text.trim()||!expectation||!['proposed','degraded','refused','advice'].includes(expectation.outcome)||!score({spec:expectation},target).pass)throw Error('EXPECTATION_OR_TARGET');
   fingerprint=digest(structure(expectation));
   contentDigest=digest(canonical({id:record.id,familyId:record.familyId,lineageRootId:record.lineageRootId,heroId:record.heroId??null,archetypeId:record.archetypeId??null,task:record.task,split:record.split,source,pins,request,target,expectation,evidence:record.evidence??[]}));
   const approval=policy.approvedReviews.find(x=>x.contentDigest===contentDigest&&x.status==='human-confirmed'&&nonempty(x.reviewerRef)&&nonempty(x.evidenceRef)&&Number.isFinite(Date.parse(x.reviewedAt)));
   if(!approval)pending.push('EXTERNAL_HUMAN_REVIEW_REQUIRED');
   messages=[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify({request:text,context})}];
  }catch(e){reasons.push(String(e));}
  return{record,mechanicsText:text,contentDigest,fingerprint,messages,reasons,pending,qualityTier:'pending'};
 });
 const textGrams=prepared.map(r=>grams(normalized(r.mechanicsText))),comparisonDeadline=Date.now()+60000;
 for(let i=0;i<prepared.length;i++)for(let j=i+1;j<prepared.length;j++){
  if(Date.now()>comparisonDeadline)throw Error('DEDUPE_TIME_BUDGET');
  const a=prepared[i],b=prepared[j],x=a.record,y=b.record;
  if(x.id===y.id){a.reasons.push('DUPLICATE_ID');b.reasons.push('DUPLICATE_ID');}
  if(x.split===y.split)continue;
  const group=['familyId','lineageRootId','heroId','archetypeId'].some(k=>nonempty(x[k])&&x[k]===y[k]);
  const exact=a.mechanicsText&&a.mechanicsText===b.mechanicsText;
  const structural=a.fingerprint&&a.fingerprint===b.fingerprint;
  const near=!group&&!exact&&!structural&&a.mechanicsText&&b.mechanicsText&&similarity(textGrams[i],textGrams[j])>=threshold;
  if(group||exact||structural||near){const why=group?'CROSS_SPLIT_LINEAGE':exact?'CROSS_SPLIT_EXACT':structural?'CROSS_SPLIT_STRUCTURE':'CROSS_SPLIT_NEAR_TEXT';a.reasons.push(why);b.reasons.push(why);}
 }
 for(const r of prepared){r.reasons=[...new Set(r.reasons)];r.qualityTier=r.reasons.length?'rejected':'pending';r.eligibleForEngine=!r.reasons.length&&!r.pending.length;}
 return prepared;
}
export function exportApproved(rows,engineResults){
 return rows.filter(r=>r.eligibleForEngine&&engineResults.some(e=>e.id===r.record.id&&e.pass)).map(r=>({...r,qualityTier:'gold',reviewTrust:'external approval registry supplied by operator; not identity-authenticated by this tool'}));
}
function main(){
 const [bundleArg,policyArg,outArg]=process.argv.slice(2);if(!bundleArg||!policyArg||!outArg)throw Error('usage: intake.mjs BUNDLE POLICY NEW_OUTPUT_DIRECTORY');
 const bundlePath=path.resolve(bundleArg),policyPath=path.resolve(policyArg),out=path.resolve(outArg);
 if(fs.existsSync(out))throw Error('REFUSE_OVERWRITE');
 const bundle=JSON.parse(fs.readFileSync(bundlePath,'utf8')),policy=JSON.parse(fs.readFileSync(policyPath,'utf8'));
 if(bundle.schema!=='ggd-forge-source-bundle@1'||!Array.isArray(bundle.records)||bundle.records.length>2000)throw Error('BUNDLE');
 const snapshot=readArtifact(path.dirname(policyPath),policy.engineSnapshot).value;
 for(const f of snapshot.files)if(hash(path.join(repo,f.path))!==f.sha256)throw Error('LIVE_ENGINE_DRIFT');
 const actualPins={engineCommit:snapshot.head,capabilityDigest:digest(snapshot.capabilities),catalogDigest:digest({template:snapshot.template,vfxKeys:snapshot.vfxKeys}),contractDigest:digest(SYSTEM)};
 if(digest(canonical(actualPins))!==digest(canonical(policy.pins))||digest(policy.vfxKeys)!==digest(snapshot.vfxKeys)||digest(policy.vfxFields)!==digest(snapshot.vfxFields))throw Error('POLICY_ENGINE_DRIFT');
 const errors=[];const records=[];
 for(const record of bundle.records){try{
  const request=readArtifact(path.dirname(bundlePath),record.requestArtifact),target=readArtifact(path.dirname(bundlePath),record.targetArtifact),expectation=readArtifact(path.dirname(bundlePath),record.expectationArtifact);
  if(!Array.isArray(record.evidenceRefs??[])||(record.evidenceRefs??[]).length>20)throw Error('EVIDENCE_COUNT');
  const evidence=(record.evidenceRefs??[]).map(p=>readArtifact(path.dirname(bundlePath),p));
  records.push({...record,request:request.value,target:target.value,expectation:expectation.value,evidence,artifactHashes:[request,target,expectation,...evidence].map(({path,sha256})=>({path,sha256}))});
 }catch(e){errors.push({id:record.id,qualityTier:'rejected',reason:String(e)});}}
 const rows=reviewIntake(records,policy);if(errors.length)for(const r of rows){r.pending.push('BUNDLE_ARTIFACT_ERRORS_REQUIRE_REVIEW');r.eligibleForEngine=false;}fs.mkdirSync(out,{recursive:true});
 writeJSON(path.join(out,'source-ledger.private.json'),{bundleHash:hash(bundlePath),policyHash:hash(policyPath),records:rows,artifactErrors:errors});
 writeJSON(path.join(out,'engine-input.json'),rows.filter(r=>r.eligibleForEngine).map(r=>({id:r.record.id,value:r.record.target})));
 execFileSync(process.execPath,['--import',path.join(repo,'node_modules/tsx/dist/loader.mjs'),path.join(here,'engine.ts'),'validate',path.join(out,'engine-input.json'),path.join(out,'engine-results.json')],{cwd:repo,timeout:60000,stdio:'pipe'});
 const engine=JSON.parse(fs.readFileSync(path.join(out,'engine-results.json'))).results;
 const approved=exportApproved(rows,engine);
 writeJSON(path.join(out,'tool-pins.json'),{files:['intake.mjs','dataset.mjs','scorer.mjs','engine.ts'].map(name=>({name,sha256:hash(path.join(here,name))})),bundleHash:hash(bundlePath),policyHash:hash(policyPath),engineSnapshotDigest:snapshot.digest});
 for(const r of rows.filter(r=>r.eligibleForEngine&&!approved.some(a=>a.record.id===r.record.id))){r.qualityTier='rejected';r.reasons.push('ENGINE_VALIDATION_FAILED');}
 const ledger=rows.map(r=>approved.find(a=>a.record.id===r.record.id)??r);
 writeJSON(path.join(out,'source-ledger.private.json'),{bundleHash:hash(bundlePath),policyHash:hash(policyPath),records:ledger,artifactErrors:errors});
 writeJSON(path.join(out,'review-queue.json'),ledger.filter(r=>r.qualityTier!=='gold').map(r=>({id:r.record.id,contentDigest:r.contentDigest,qualityTier:r.qualityTier,reasons:r.reasons,pending:r.pending,source:r.record.source,target:r.record.target,expectation:r.record.expectation})).concat(errors));
 for(const split of ['train','dev','test']){
  const selected=approved.filter(r=>r.record.split===split);
  writeJSON(path.join(out,split+'-requests.json'),selected.map(r=>({id:r.record.id,messages:r.messages,requestDigest:digest(r.messages)})));
  if(split==='train')fs.writeFileSync(path.join(out,'train.jsonl'),selected.map(r=>JSON.stringify({id:r.record.id,messages:r.messages,target:r.record.target})).join('\n')+(selected.length?'\n':''));
  else writeJSON(path.join(out,split+'-targets.private.json'),selected.map(r=>({id:r.record.id,target:r.record.target,expectation:r.record.expectation})));
 }
 writeJSON(path.join(out,'intake-report.json'),{status:approved.some(r=>r.record.split==='train')?'reviewed-data-exported':'no-approved-training-data',input:bundle.records.length,gold:approved.length,pending:ledger.filter(r=>r.qualityTier==='pending').length,rejected:ledger.filter(r=>r.qualityTier==='rejected').length+errors.length,counts:Object.fromEntries(['train','dev','test'].map(s=>[s,approved.filter(r=>r.record.split===s).length])),silverAutomaticPromotion:false,releaseQualified:false,trainingStarted:false,limitations:['Human reviewer identity and license ownership require an independently trusted operator registry.','Only current ground-nova research contract has an executable validator.','Near-duplicate rules are conservative heuristics, not proof of absence of paraphrase leakage.','This export does not mutate or resume the frozen 20260906 experiment.']});
 console.log(fs.readFileSync(path.join(out,'intake-report.json'),'utf8'));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
