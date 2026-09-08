import test from 'node:test';import assert from 'node:assert/strict';import {preservesMechanisms,fileHash} from './precision-diagnostic.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
const row={id:'a',task:'mechanism-template',pass:true,decisionPass:true,schemaPass:true,unsafe:false};
test('precision cannot trade mechanism errors for VFX gains or new unsafe accepts',()=>{
 const a={rows:[row]},b={rows:[{...row}]};assert(preservesMechanisms(a,b));
 for(const mutation of [{pass:false},{decisionPass:false},{schemaPass:false},{unsafe:true}])assert(!preservesMechanisms(a,{rows:[{...row,...mutation}]}));
 assert.throws(()=>preservesMechanisms(a,{rows:[]}));
 const withVfx={rows:[{...row,pass:false},{id:'v',task:'vfx-semantic',pass:true}]};assert(!preservesMechanisms(a,withVfx));
});
test('file digests stream across chunks instead of loading model-sized buffers',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'forge-digest-')),file=path.join(temp,'sample'),data=Buffer.alloc(2*1024*1024+17,37);
 try{fs.writeFileSync(file,data);assert.equal(fileHash(file),crypto.createHash('sha256').update(data).digest('hex'));}finally{fs.unlinkSync(file);fs.rmdirSync(temp);}
});
