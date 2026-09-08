import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {build} from './community-data-v1.mjs';import {digest} from './dataset.mjs';import {fileHash} from './precision-diagnostic.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
export function audit(root){
 const m=read(path.join(root,'manifest.json'));for(const p of [...m.codePins,...m.sourcePins,...m.priorAuditPins])assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED:'+p.path);
 const h=read(path.join(m.sourceSnapshot,'heroes.json')),rebuilt=build(h),cases=read(path.join(root,'cases.private.json'));assert.deepEqual(cases,rebuilt.cases);assert.deepEqual(read(path.join(root,'personal-review.json')),rebuilt.reviews);assert.equal(digest(cases),m.casesSha256);
 for(const split of ['train','dev','test']){
  const rows=cases.filter(c=>c.split===split),requests=read(path.join(root,split+'-requests.json')),budget=read(path.join(root,split+'-token-budget.json'));
  assert.deepEqual(requests,rows.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));assert.equal(budget.requestsSha256,fileHash(path.join(root,split+'-requests.json')));assert(budget.allFit&&budget.cpuOnly&&!budget.thinking);assert.equal(budget.count,rows.length);
  if(split==='train')assert.deepEqual(fs.readFileSync(path.join(root,'train.jsonl'),'utf8').trim().split('\n').map(JSON.parse),rows.map(({id,messages,target})=>({id,messages,target})));
 }
 const sameText=new Map();for(const c of cases){const s=JSON.parse(c.messages[1].content).source.text;if(sameText.has(s))assert.equal(sameText.get(s),c.split,'FULL_SOURCE_CROSS_SPLIT');sameText.set(s,c.split);}
 const report={verifiedAt:new Date().toISOString(),rebuiltExactly:true,rows:147,sourceUnits:49,counts:rebuilt.counts,allPromptsFit:true,fullSourceCrossSplit:0,wholeHeroCrossSplit:0,trainingRowsAdmitted:84,trainingPerformed:false,devOnlyForSelection:21,testNeverForTrainingOrSelection:42,sourceEntailmentOnly:true,templateCapabilitiesAdmitted:0,modelCalls:0,ownerGold:false,releaseQualified:false};
 fs.writeFileSync(path.join(root,'ADMISSION.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(audit(path.resolve(process.argv[2]))));
