import test from 'node:test';import assert from 'node:assert/strict';import {phaseReadiness} from './follow-on-evaluation.mjs';
test('waits for live original parents and never treats a state file as sufficient completion',()=>{
 const core={pid:1,status:'running'},post={pid:2,status:'waiting-for-r5'};
 assert.equal(phaseReadiness(core,post,()=>true,true).status,'waiting');
 assert.equal(phaseReadiness({...core,status:'complete-research-only'},{...post,status:'complete-research-evidence'},()=>true,false).status,'waiting');
 assert.equal(phaseReadiness({...core,status:'complete-research-only'},{...post,status:'complete-research-evidence'},()=>false,true).status,'waiting');
 assert.equal(phaseReadiness({...core,status:'complete-research-only'},{...post,status:'complete-research-evidence'},()=>false,false).status,'ready');
});
test('terminal failure or missing live parent prevents any follow-on GPU work',()=>{
 assert.equal(phaseReadiness({pid:1,status:'failed'},{pid:2,status:'waiting-for-r5'},()=>true,false).reason,'ORIGINAL_PARENT_FAILED');
 assert.equal(phaseReadiness({pid:1,status:'running'},{pid:2,status:'waiting-for-r5'},()=>false,false).reason,'PARENT_STOPPED_WITHOUT_COMPLETE');
});
