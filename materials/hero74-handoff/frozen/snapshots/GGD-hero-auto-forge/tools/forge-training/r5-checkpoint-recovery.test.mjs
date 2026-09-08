import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';import {inspectRecovery} from './r5-checkpoint-recovery.mjs';
test('terminal cutoff and complete metric prefix required; no weights loaded in this fixture',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ggd-recovery-proof-')),original=path.join(tmp,'run'),runtime=path.join(tmp,'runtime'),initial=path.join(tmp,'initial'),adapter=path.join(runtime,'run-adapter'),cp=path.join(adapter,'step-80');
 for(const p of [original,initial,cp])fs.mkdirSync(p,{recursive:true});
 const put=(p,x)=>fs.writeFileSync(p,JSON.stringify(x)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const dead=spawnSync(process.execPath,['-e',''],{encoding:'utf8'});assert.equal(dead.status,0);
 put(path.join(original,'run-state.json'),{status:'failed',stage:'train',error:'TRAINING_STOP_RESERVE',pid:dead.pid});
 fs.writeFileSync(path.join(adapter,'initial.safetensors'),'fixture-initial');fs.writeFileSync(path.join(cp,'adapters.safetensors'),'fixture-checkpoint-not-a-real-model');
 put(path.join(original,'experiment-policy.json'),{trainingStopAt:'2000-01-01T00:00:00Z',initialAdapterSha256:hash(path.join(adapter,'initial.safetensors'))});
 put(path.join(original,'run-pins.json'),{pins:[],initialAdapter:initial});for(const p of [initial,cp])put(path.join(p,'adapter_config.json'),{fixture:true});
 put(path.join(adapter,'checkpoints.json'),[{step:80,examplesSeen:320,adapter:cp,sha256:hash(path.join(cp,'adapters.safetensors'))}]);
 const metrics=Array.from({length:320},(_,i)=>JSON.stringify({example:i+1,step:Math.floor((i+1)/4),loss:1,seconds:1}));fs.writeFileSync(path.join(adapter,'metrics.jsonl'),metrics.join('\n')+'\n');
 assert.equal(inspectRecovery(original,runtime).validatedMetricPrefix,320);
 fs.writeFileSync(path.join(adapter,'metrics.jsonl'),metrics.slice(0,-1).join('\n')+'\n');assert.throws(()=>inspectRecovery(original,runtime));
 put(path.join(original,'run-state.json'),{status:'running',pid:process.pid});assert.throws(()=>inspectRecovery(original,runtime),/CORE_NOT_TERMINAL_FAILURE/);
});
