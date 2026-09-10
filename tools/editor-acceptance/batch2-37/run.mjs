// Deterministic offline regeneration. Does not run models, install dependencies,
// modify shipping content, train, push, or invoke the full repository release gate.
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..'),dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
mkdirSync(resolve(dir,'pipeline'),{recursive:true});
const rows=[];
const steps=[['tool-tests',['--test',resolve(here,'diversity.test.mjs'),resolve(here,'sim-harness.test.mjs')]],...['build','verify','verify-special','verify-train','verify-package','report-diversity','partition','review','check'].map(s=>[s,[resolve(here,`${s}.mjs`)]])];
for(const [name,args] of steps){
 console.log(`batch2: ${name}`);
 const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024});
 const log=(r.stdout??'')+(r.stderr??'');writeFileSync(resolve(dir,'pipeline',`${name}.log`),log);
 rows.push({name,command:['node',...args.map(a=>a.startsWith(root)?a.slice(root.length+1):a)].join(' '),exit:r.status,error:r.error?.message,log:`pipeline/${name}.log`,sha256:createHash('sha256').update(log).digest('hex')});
 if(r.status!==0){console.error(log.slice(-6000));writeFileSync(resolve(dir,'pipeline-report.json'),JSON.stringify({status:'failed',steps:rows},null,2)+'\n');process.exit(r.status??1);}
}
const build=JSON.parse(readFileSync(resolve(dir,'report.json'),'utf8'));
writeFileSync(resolve(dir,'pipeline-report.json'),JSON.stringify({schema:'ggd-batch2-pipeline@2',status:'passed',buildHash:createHash('sha256').update(JSON.stringify(build)).digest('hex'),steps:rows,trainEligible:false},null,2)+'\n');
console.log('37 heroes / 222 slots: scoped offline reference passed. Live-game and blind admission remain unverified.');
