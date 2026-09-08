import test from 'node:test';import assert from 'node:assert/strict';
import {scoreClassification,summarizeClassification} from './classification-score.mjs';
test('classification score is independent of auxiliary parameters and still fails unsafe output',()=>{
 const c={id:'vfx',task:'vfx-semantic',requestDigest:'pin',target:{decision:'accept',suggestedTemplateIds:['fx.prim.ki.beam'],reasonCode:'matching-template'}};
 assert(scoreClassification(c,c.target).pass);
 const extra={...c.target,alpha:0.5};assert(scoreClassification(c,extra).pass);assert(!scoreClassification(c,extra).schemaPass);
 const invalidDecision={...c.target,decision:'fx.prim.ki.beam'};assert(scoreClassification(c,invalidDecision).pass);assert(!scoreClassification(c,invalidDecision).schemaPass);assert(!scoreClassification(c,invalidDecision).decisionPass);
 assert(!scoreClassification(c,{...c.target,reasonCode:'no-supported-template'}).schemaPass);
 assert(!scoreClassification(c,{...c.target,suggestedTemplateIds:['fx.prim.fire.beam']}).pass);
 const alternative={...c.target,suggestedTemplateIds:['fx.equivalent']};
 assert(scoreClassification({...c,acceptedTargets:[c.target,alternative]},alternative).pass);
 assert(!scoreClassification({...c,acceptedTargets:[c.target,alternative]},{...c.target,suggestedTemplateIds:['fx.equivalent','fx.prim.ki.beam']}).pass);
 assert(scoreClassification({...c,target:{...c.target,decision:'refuse'}},c.target).unsafe);
 const result={complete:true,results:[{id:'vfx',requestDigest:'pin',value:c.target}]};assert.equal(summarizeClassification([c],result).macroPct,100);
 assert.throws(()=>summarizeClassification([c],{...result,results:[{...result.results[0],requestDigest:'changed'}]}));
});
