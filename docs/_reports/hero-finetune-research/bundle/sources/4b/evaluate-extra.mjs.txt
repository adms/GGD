// Bounded supplementary evaluation; never selects a new checkpoint.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validatePolicy} from './cli.mjs';
import {writeJSON} from './dataset.mjs';
const args=process.argv.slice(2),opts={};
for(let i=0;i<args.length;i+=2){if(!['--root','--python','--model','--adapter','--data','--output','--policy','--runtime-root'].includes(args[i])||!args[i+1])throw Error('ARGUMENT');opts[args[i].slice(2)]=path.resolve(args[i+1]);}
for(const key of ['root','python','model','data','output','policy','runtime-root'])if(!opts[key])throw Error('MISSING:'+key);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const policy=validatePolicy(read(opts.policy)),canonical=read(path.join(opts.root,'experiment-policy.json'));
if(policy.deadline!==canonical.deadline||policy.startedAt!==canonical.startedAt)throw Error('BUDGET_DRIFT');
if(read(path.join(opts.root,'state.json')).status!=='pipeline-complete-unqualified')throw Error('MAIN_PIPELINE_INCOMPLETE');
if(fs.existsSync(opts.output))throw Error('REFUSE_OVERWRITE');
const deadline=Math.min(Date.parse(policy.deadline)-policy.reportReserveSeconds*1000,Date.now()+3600000);
const lock=path.join(opts['runtime-root'],'gpu.lock'),lease=path.join(opts.root,'worker-lease.json');
if(Date.now()>=deadline||fs.existsSync(path.join(opts.root,'CANCEL')))throw Error('CANCELLED_OR_DEADLINE');
const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,root:opts.root,kind:'supplementary-evaluation'}));fs.closeSync(fd);
let child,timer,killTimer,reason=null;
const stop=why=>{if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}};
const onSignal=()=>stop('SIGNAL');process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
try{
 const worker=path.join(path.dirname(fileURLToPath(import.meta.url)),'worker.py');
 const command=[worker,'eval','--model',opts.model,'--policy',opts.policy,'--data',opts.data,'--output',opts.output];
 if(opts.adapter)command.push('--adapter',opts.adapter);
 child=spawn(opts.python,command,{stdio:'inherit',detached:true});
 writeJSON(lease,{pid:child.pid,parent:process.pid,output:opts.output,startedAt:new Date().toISOString()});
 timer=setInterval(()=>{if(Date.now()>=deadline)stop('DEADLINE');if(fs.existsSync(path.join(opts.root,'CANCEL')))stop('CANCELLED');},250);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 if(reason||code!==0)throw Error(reason??'WORKER_EXIT:'+code);
 console.log(JSON.stringify({status:'complete',output:opts.output}));
}finally{
 clearInterval(timer);clearTimeout(killTimer);
 writeJSON(lease,{pid:null,endedAt:new Date().toISOString(),reason});
 if(fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);
 process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);
}
