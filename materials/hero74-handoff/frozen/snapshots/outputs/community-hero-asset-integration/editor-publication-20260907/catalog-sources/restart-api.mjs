import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,openSync} from 'node:fs';
import assert from 'node:assert/strict';
const old=12582,script='/private/tmp/ggd-existing-catalog-ui-acceptance/server.mjs';
assert.equal(execFileSync('ps',['-p',String(old),'-o','command='],{encoding:'utf8'}).trim(),'node --import tsx '+script);
assert(readFileSync(script,'utf8').includes("contentDir:'/private/tmp/ggd-existing-catalog-save-acceptance/content'"));
process.kill(old,'SIGTERM');
for(let i=0;i<50;i++){try{process.kill(old,0);}catch{break;}await new Promise(r=>setTimeout(r,100));if(i===49)throw Error('old service still alive');}
const fd=openSync('/private/tmp/ggd-catalog-source-archive/content-api.log','a');
const child=spawn('node',['--import','tsx',script],{cwd:process.cwd(),detached:true,stdio:['ignore',fd,fd]});child.unref();
writeFileSync('/private/tmp/ggd-catalog-source-archive/service.json',JSON.stringify({pid:child.pid,previousPid:old,script,port:8810}));
for(let i=0;i<80;i++){try{const r=await fetch('http://127.0.0.1:8810/content-api/hero-catalog/versions');if(r.ok){console.log('Updated isolated API ready: '+child.pid);process.exit(0);}}catch{}await new Promise(r=>setTimeout(r,150));}throw Error('API not ready');
