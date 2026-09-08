import test from 'node:test';
import assert from 'node:assert/strict';
import {ready} from './r6-finish.mjs';
const done=()=>[{pid:1001,status:'complete-research-only'},{pid:1002,status:'complete-research-evidence'},{pid:1003,status:'complete-research-evidence'}];
test('collection waits for real exit and idle GPU, not only success files',()=>{
 assert.equal(ready(done(),[false,false,false],false),true);
 assert.equal(ready(done(),[false,false,true],false),false);
 assert.equal(ready(done(),[false,false,false],true),false);
 const s=done();s[0].status='running';s[1].status='waiting-for-core';s[2].status='waiting-for-core-and-post';
 assert.equal(ready(s,[true,true,true],false),false);
});
test('failed, dead, changed status and unsafe PIDs never become final success',()=>{
 const s=done();s[1].status='failed';assert.throws(()=>ready(s,[false,false,false],false),/PREDECESSOR_NOT_SUCCESSFUL/);
 s[1].status='running';assert.throws(()=>ready(s,[false,false,false],false),/PREDECESSOR_DIED_WITHOUT_COMPLETION/);
 s[1].status='complete';assert.throws(()=>ready(s,[false,false,false],false),/PREDECESSOR_NOT_SUCCESSFUL/);
 s[1].status='complete-research-evidence';s[1].pid=-1;assert.throws(()=>ready(s,[false,false,false],false),/INVALID_PARENT_PID/);
});
