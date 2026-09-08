/** Validate a completed research reference without requiring a later training attempt to succeed. */
import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{fileHash}from'./precision-diagnostic.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
export function selectionProtocol(selection){
 if(selection.testUsed===false){assert(Number.isInteger(selection.selected.step)&&selection.selected.step>=0);return{kind:'step-dev-only',step:selection.selected.step};}
 assert.equal(selection.selectionData,'dev-only; test not evaluated','UNRECOGNIZED_SELECTION_PROTOCOL');assert(Number.isInteger(selection.selected.epoch)&&selection.selected.epoch>=1);return{kind:'r3-epoch-dev-only',epoch:selection.selected.epoch};
}
export function reference(root){
 assert(path.isAbsolute(root));const nativePath=path.join(root,'native-reference.json'),selectionPath=path.join(root,'selection.json'),native=read(nativePath),selection=read(selectionPath),protocol=selectionProtocol(selection);assert.equal(read(path.join(root,'run-state.json')).status,'complete-research-only','REFERENCE_CORE_INCOMPLETE');assert.equal(selection.selected.adapterSha256,native.adapterSha256);assert.equal(fileHash(path.join(native.adapter,'adapters.safetensors')),native.adapterSha256);const evidencePins=[nativePath,selectionPath,path.join(root,'run-state.json')];
 if(protocol.kind==='r3-epoch-dev-only'){
  const trainingPath=path.join(root,'training-run.json'),training=read(trainingPath);assert.equal(training.status,'pass');assert(protocol.epoch<=training.recipe.epochs);assert.equal(training.modelPath,native.base);const paired=path.join(root,'paired-evidence-v1/summary.json'),p=read(paired);assert.equal(p.status,'complete-research-evidence');assert.equal(p.selectedEpoch,protocol.epoch);assert(Array.isArray(p.missing)&&p.missing.length===0);assert.equal(p.checkpointReselected,false);evidencePins.push(trainingPath,paired);
 }else{assert.equal(native.decoding.presencePenalty,0);assert.equal(native.decoding.thinking,false);}
 for(const file of['post-v1/state.json','manual-entry-v1/state.json','finish-v1/state.json'])if(fs.existsSync(path.join(root,file))){assert.equal(read(path.join(root,file)).status,'complete-research-evidence','REFERENCE_PREDECESSOR_INCOMPLETE:'+file);evidencePins.push(path.join(root,file));}
 return{native,protocol,selection,evidencePins:evidencePins.map(p=>({path:p,sha256:fileHash(p)})),historicalDecode:read(path.join(root,'experiment-policy.json')).presencePenalty,newEvaluationDecode:0,newEvaluationRequired:true,releaseQualified:false,scope:'R3 epoch selection or later step selection remains unchanged. A failed/unfinished later attempt does not invalidate previously completed R3 evidence. Historical 1.5-penalty scores are not reused as new zero-penalty results.'};
}
