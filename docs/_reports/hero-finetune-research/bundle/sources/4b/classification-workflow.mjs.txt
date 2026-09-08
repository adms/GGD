/** One command for reviewed training -> paired report -> fixed Mac export -> preservation. */
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
export function stages(mode,c){
 if(!['run','finish'].includes(mode)||Object.keys(c).sort().join()!==['baseReceipt','model','python','root','runtime'].sort().join()||Object.values(c).some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw Error('EXACT_ABSOLUTE_CONFIG_REQUIRED');
 return[...(mode==='run'?[{name:'core',command:process.execPath,args:[path.join(dir,'classification-run.mjs'),c.root,c.python,c.model,c.runtime]}]:[]),{name:'paired-report',command:process.execPath,args:[path.join(dir,'classification-report.mjs'),c.root]},{name:'mac-export-and-quality',command:process.execPath,args:[path.join(dir,'classification-post.mjs'),c.root,c.python,c.baseReceipt,c.runtime]},{name:'preserve',command:process.execPath,args:[path.join(dir,'archive-model.mjs'),path.join(c.root,'mac-deployment.json'),path.join(c.runtime,path.basename(c.root)+'-export','mlx-4bit'),path.join(c.root,'research-model-mlx-4bit')]}];
}
async function main(){
 const [mode,file]=process.argv.slice(2);if(!file)throw Error('usage: classification-workflow.mjs run|finish CONFIG.json');const c=JSON.parse(fs.readFileSync(file,'utf8'));const plan=stages(mode,c);
 if(JSON.parse(fs.readFileSync(c.baseReceipt,'utf8')).base.path!==c.model)throw Error('BASE_RECEIPT_PATH_MISMATCH');
 const receipt=path.join(c.root,'classification-workflow.json');if(fs.existsSync(receipt))throw Error('REFUSE_OVERWRITE');const state={status:'running',mode,startedAt:new Date().toISOString(),stages:[],pid:process.pid};
 const put=()=>fs.writeFileSync(receipt,JSON.stringify(state,null,2)+'\n');put();
 let child;const forward=signal=>{if(child?.pid)try{child.kill(signal);}catch{}};process.on('SIGTERM',()=>forward('SIGTERM'));process.on('SIGINT',()=>forward('SIGINT'));
 try{for(const s of plan){const startedAt=new Date().toISOString();child=spawn(s.command,s.args,{stdio:'inherit',shell:false});const code=await new Promise((ok,bad)=>{child.once('error',bad);child.once('exit',ok);});state.stages.push({name:s.name,startedAt,endedAt:new Date().toISOString(),code});put();if(code!==0)throw Error('STAGE_FAILED:'+s.name);}
  const quality=JSON.parse(fs.readFileSync(path.join(c.root,'mac-quality-summary.json'),'utf8'));state.status='complete-research-only';state.boundedResearchQualityGate=quality.boundedResearchQualityGate;state.releaseQualified=false;state.endedAt=new Date().toISOString();put();console.log(JSON.stringify(state));
 }catch(e){state.status='failed';state.error=String(e);put();throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
