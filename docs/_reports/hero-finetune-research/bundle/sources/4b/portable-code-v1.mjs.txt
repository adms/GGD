/** Copy existing contracts verbatim; export only used constants/functions from training modules.
 * The destination has no train cases, review-answer arrays, repo-relative imports, or model files yet.
 */
import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{fileURLToPath}from'node:url';
import{digest,mechanicsText}from'./dataset.mjs';import{fileHash}from'./precision-diagnostic.mjs';import{system}from'./r3-data.mjs';import{elements,shapes,namedVfx}from'./reviewed-curriculum.mjs';
const self=fileURLToPath(import.meta.url),dir=path.dirname(self);
export function prepareCode(out){
 assert(path.isAbsolute(out));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');fs.mkdirSync(out,{recursive:true});const code=path.join(out,'code');fs.mkdirSync(code);const copied=[];
 for(const name of['research-inference-v2.mjs','composition-client.mjs','current-template-client.mjs','classification-client.mjs','r3-fidelity-client.mjs','worker.py','requirements.lock.txt']){const src=path.join(dir,name),dest=path.join(code,name);fs.copyFileSync(src,dest,fs.constants.COPYFILE_EXCL);copied.push({source:src,path:'code/'+name,sha256:fileHash(src),mode:'byte-identical'});assert.equal(fileHash(dest),fileHash(src));}
 const entry=path.join(dir,'portable-inference-v1.mjs');fs.copyFileSync(entry,path.join(code,'run.mjs'),fs.constants.COPYFILE_EXCL);copied.push({source:entry,path:'code/run.mjs',sha256:fileHash(entry),mode:'byte-identical-renamed'});
 const exportConst=(name,v)=>'export const '+name+' = '+JSON.stringify(v)+';\n';
 const facades=[
  ['dataset.mjs','import crypto from "node:crypto";\n'+exportConst('digest',null).replace('null',digest.toString())+'export '+mechanicsText.toString()+'\n',['digest','mechanicsText']],
  ['precision-diagnostic.mjs','import fs from "node:fs";import crypto from "node:crypto";\nexport '+fileHash.toString()+'\n',['fileHash']],
  ['r3-data.mjs',exportConst('system',system),['system']],
  ['reviewed-curriculum.mjs',exportConst('elements',elements)+exportConst('shapes',shapes)+exportConst('namedVfx',namedVfx),['elements','shapes','namedVfx']],
 ];
 for(const[name,text,exports]of facades){fs.writeFileSync(path.join(code,name),'// Generated public-export facade; no training data or answer tables.\n'+text,{flag:'wx'});copied.push({source:path.join(dir,name),sourceSha256:fileHash(path.join(dir,name)),path:'code/'+name,sha256:fileHash(path.join(code,name)),mode:'exact-runtime-export-facade',exports});}
 // All runtime relative imports must resolve to the explicit copied allowlist.
 const allowed=new Set(copied.map(c=>c.path.slice(5)));for(const name of allowed){if(!name.endsWith('.mjs'))continue;const source=fs.readFileSync(path.join(code,name),'utf8');for(const m of source.matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/g)){assert(m[1].startsWith('./')&&!m[1].slice(2).includes('/'),'UNEXPECTED_NESTED_IMPORT');assert(allowed.has(m[1].slice(2)),'MISSING_IMPORT:'+m[1]);}}
 const result={createdAt:new Date().toISOString(),schema:'ggd-portable-public-contract-kit@1',files:copied,sourceBuilder:{path:self,sha256:fileHash(self)},privateTrainingDataIncluded:false,weightsIncluded:false,modelLoaded:false,activation:false,releaseQualified:false};fs.writeFileSync(path.join(out,'CODE_RECEIPT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===self)console.log(JSON.stringify(prepareCode(path.resolve(process.argv[2]))));
