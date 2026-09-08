import {readFileSync,writeFileSync,openSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root='/private/tmp/ggd-overlay-durable-versions',file='/private/tmp/ggd-model-upload-acceptance/service-config-private.json';
const config=JSON.parse(readFileSync(file));
assert.equal(config.platform.env.PLATFORM_ADDR,'127.0.0.1:8091');
assert.equal(config.platform.env.DATA_DIR,'/private/tmp/ggd-model-upload-acceptance/data');
const pid=Number(execFileSync('lsof',['-t','-iTCP:8091','-sTCP:LISTEN'],{encoding:'utf8'}).trim());
assert.equal(pid,43109);
assert(execFileSync('lsof',['-a','-p',String(pid),'-d','txt','-Fn'],{encoding:'utf8'}).includes('n/private/tmp/ggd-community37-live-match/platform-replay-budget\n'));
process.kill(pid,'SIGTERM');
let stopped=false;
for(let i=0;i<100;i++){try{process.kill(pid,0)}catch{stopped=true;break}await new Promise(r=>setTimeout(r,100));}
assert(stopped,'Existing isolated platform did not stop');
const log=openSync(root+'/platform.log','a');
const child=spawn(root+'/platform',[],{cwd:process.cwd(),env:{...process.env,...config.platform.env},detached:true,stdio:['ignore',log,log]});child.unref();
config.platform.pid=child.pid;writeFileSync(file,JSON.stringify(config,null,2));
writeFileSync(root+'/platform-service-public.json',JSON.stringify({pid:child.pid,previousPid:pid,binary:root+'/platform',port:8091,dataDir:config.platform.env.DATA_DIR,scope:'Existing disposable platform, unchanged account and content storage.'},null,2));
for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:8091/api/v1/healthz');if(r.status===200){console.log('Isolated platform healthy',child.pid);process.exit(0)}}catch{}await new Promise(r=>setTimeout(r,200));}
throw Error('Isolated platform did not become healthy');
