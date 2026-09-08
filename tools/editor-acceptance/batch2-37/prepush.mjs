import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWriteStream,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const sourceDir=dirname(fileURLToPath(import.meta.url)),root=resolve(sourceDir,'../../..');
const output=resolve(process.argv[2]??'/private/tmp/batch2-prepush-initial');
if(existsSync(resolve(output,'summary.json')))throw new Error('A prepush receipt already exists; supply a new output directory to retain the earlier evidence.');
mkdirSync(output,{recursive:true});
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function sourceHashes(){const out={};const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory()&&entry.name!=='__pycache__')walk(path);else if(entry.isFile())out[relative(root,path)]=sha(readFileSync(path));}};walk(sourceDir);return out;}
const startSources=sourceHashes();
const receipt={schema:'ggd-batch2-prepush-receipt@1',scope:'Repository gates at the recorded source snapshot; not a replacement for final frozen-dataset verification.',startedAt:new Date().toISOString(),head:git(['rev-parse','HEAD']),branch:git(['branch','--show-current']),worktreeStatus:git(['status','--short']),sourceHashes:startSources,commands:[]};
writeFileSync(resolve(output,'start.json'),JSON.stringify(receipt,null,2)+'\n');
const commands=['skills:check','editor:accept:release','coord:check'];
// AGENTS.md requires all three to run together before any repair attempts.
await Promise.all(commands.map(command=>new Promise(done=>{
  const name=command.replaceAll(':','-'),stdoutPath=resolve(output,name+'.stdout.log'),stderrPath=resolve(output,name+'.stderr.log');
  const stdout=createWriteStream(stdoutPath),stderr=createWriteStream(stderrPath),started=Date.now();
  const row={command:'pnpm '+command,startedAt:new Date(started).toISOString(),stdout:stdoutPath,stderr:stderrPath,timedOut:false};receipt.commands.push(row);
  const child=spawn('pnpm',[command],{cwd:root,stdio:['ignore','pipe','pipe'],detached:true});
  child.stdout.pipe(stdout);child.stderr.pipe(stderr);
  let hardStop;
  const timeout=setTimeout(()=>{row.timedOut=true;try{process.kill(-child.pid,'SIGTERM');}catch{}hardStop=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},5000);},15*60*1000);
  child.on('error',error=>{row.spawnError=String(error);});
  child.on('close',(code,signal)=>{clearTimeout(timeout);clearTimeout(hardStop);row.exitCode=code;row.signal=signal;row.durationMs=Date.now()-started;row.finishedAt=new Date().toISOString();row.status=code===0&&!row.timedOut?'passed':'failed';console.log(`${row.command}: ${row.status}, exit=${code}, ${row.durationMs} ms`);done();});
})));
receipt.finishedAt=new Date().toISOString();receipt.sourceSnapshotUnchanged=JSON.stringify(startSources)===JSON.stringify(sourceHashes());
receipt.allPassed=receipt.commands.every(c=>c.status==='passed');
writeFileSync(resolve(output,'summary.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({output,allPassed:receipt.allPassed,sourceSnapshotUnchanged:receipt.sourceSnapshotUnchanged}));
if(!receipt.allPassed)process.exitCode=1;
