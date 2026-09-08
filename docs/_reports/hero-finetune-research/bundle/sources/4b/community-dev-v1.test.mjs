import test from'node:test';import assert from'node:assert/strict';import{readiness}from'./community-dev-v1.mjs';
test('community dev waits for successful parents to exit, never runs after failure',()=>{
 const done=[{status:'complete-research-only'},...Array.from({length:3},()=>({status:'complete-research-evidence'}))];assert(readiness(done,[false,false,false,false],false));assert(!readiness(done,[false,false,false,true],false));assert(!readiness(done,[false,false,false,false],true));
 const pending=structuredClone(done);pending[0].status='running';assert(!readiness(pending,[true,false,false,false],false));assert.throws(()=>readiness(pending,[false,false,false,false],false),/PARENT_DIED/);
 const failed=structuredClone(done);failed[3].status='failed';assert.throws(()=>readiness(failed,[false,false,false,false],false),/PARENT_NOT_SUCCESSFUL/);
});
