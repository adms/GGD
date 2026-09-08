import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const norm=s=>s.normalize('NFC').replace(/\s+/gu,'');
const newFile=path.join(dir,'data/cases.private.json'),newCases=read(newFile);
const oldFiles=['outputs/forge-mechanism-priority-r3-20260906/cases.private.json','outputs/forge-low-lr-r7-v2-20260906/cases.private.json'];
const refs=read(path.join(dir,'data/corrected-reference.json'));
const familyAlias={'negima-uq':'negima'};
const newFamilies=new Set(refs.map(r=>familyAlias[r.franchise]??r.franchise));
const exactRequests=[],exactSourceTexts=[],normalizedSourceTexts=[],sharedHeldoutFamilies=[];
const input=c=>JSON.parse(c.messages[1].content);
const newSourceMap=new Map(newCases.map(c=>[c.sourceId,input(c).source]));
const newRequests=new Map(newCases.map(c=>[JSON.stringify(c.messages),c.id]));
const rawTexts=new Map([...newSourceMap].map(([id,s])=>[s.text,id]));
const normalizedTexts=new Map([...newSourceMap].map(([id,s])=>[norm(s.text),id]));
const sources=[],priorUniqueHeldout=new Map();
for(const rel of oldFiles){
 const file=path.join(root,rel),cs=read(file),held=cs.filter(c=>c.split==='dev'||c.split==='test');
 sources.push({path:rel,sha256:sha(file),totalCases:cs.length,heldoutCases:held.length,heldoutSourceCases:held.filter(c=>input(c).source?.text).length});
 for(const c of held){
  const s=input(c).source;
  if(newRequests.has(JSON.stringify(c.messages)))exactRequests.push({oldFile:rel,oldId:c.id,newId:newRequests.get(JSON.stringify(c.messages))});
  if(!s?.text)continue;
  priorUniqueHeldout.set(s.id+'\0'+s.text,s);
  if(rawTexts.has(s.text))exactSourceTexts.push({oldFile:rel,oldSource:s.id,newSource:rawTexts.get(s.text)});
  if(normalizedTexts.has(norm(s.text)))normalizedSourceTexts.push({oldFile:rel,oldSource:s.id,newSource:normalizedTexts.get(norm(s.text))});
  const f=c.lineage?.replace(/^source-/,'');
  if(newFamilies.has(f))sharedHeldoutFamilies.push({oldFile:rel,oldSource:s.id,split:c.split,lineage:c.lineage});
 }
}
const report={schema:'ggd-community37-prior-overlap-check@1',newDataset:{path:path.relative(root,newFile),sha256:sha(newFile),cases:newCases.length,uniqueSources:newSourceMap.size},prior:sources,priorUniqueHeldoutSources:priorUniqueHeldout.size,exactRequests,exactSourceTexts,whitespaceNormalizedSourceTexts:normalizedSourceTexts,declaredFranchiseOverlap:sharedHeldoutFamilies,
 identityReview:[{oldSource:'godie-udea',oldName:'至尊學長 - 飛鼠先生',oldDeclaredWork:'去死去死團的逆襲原創',newName:'安茲·烏爾·恭',newDeclaredWork:'OVERLORD',decision:'Do not join by nickname alone; supplied identities declare different works.'},{oldFamily:'source-kyo',newFamily:'rance',decision:'New Owner explicitly distinguishes Rance from 鬼眼狂刀 KYO; do not merge by 鬼畜 wording.'}],
 scope:'Only the explicitly listed R3 and R7-v2 frozen corpus files. Exact request/text, whitespace-normalized text, and declared franchise checks; not semantic-paraphrase or full historical corpus proof.',
 releaseDecision:'NO_AUTOMATIC_MERGE. Dataset remains train-only supplement; not unseen evaluation. Broader curriculum overlap/weighting and explicit training authorization still required.',trainingRun:false,gpuInferenceRun:false};
assert.equal(newCases.length,555);
const out=path.join(dir,'PRIOR_OVERLAP_AUDIT.json');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({newCases:newCases.length,priorFiles:oldFiles.length,priorUniqueHeldoutSources:priorUniqueHeldout.size,exactRequests:exactRequests.length,exactSourceTexts:exactSourceTexts.length,whitespaceNormalizedSourceTexts:normalizedSourceTexts.length,declaredFranchiseOverlap:sharedHeldoutFamilies.length,out},null,2));
