/** Preserve the exact BF16+LoRA research reference without fusion or quantization. */
import fs from 'node:fs';import path from 'node:path';import {fileHash} from './precision-diagnostic.mjs';
const [root]=process.argv.slice(2);if(!root||!path.isAbsolute(root))throw Error('ABSOLUTE_RUN_REQUIRED');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8')),manifest=read('export-manifest.json'),selection=read('selection.json'),config=read('workflow-config.json');
if(read('run-state.json').status!=='complete-research-only')throw Error('CORE_INCOMPLETE');
const destination=path.join(root,'native-reference');if(fs.existsSync(destination))throw Error('REFUSE_OVERWRITE');
const entries=manifest.base.files.map(f=>{if(path.basename(f.name)!==f.name)throw Error('UNSAFE_FILE_NAME');return{source:path.join(manifest.base.path,f.name),relative:path.join('base',f.name),sha256:f.sha256};});
for(const f of manifest.adapterArtifacts)entries.push({source:f.path,relative:path.join('adapter',path.basename(f.path)),sha256:f.sha256});
if(fileHash(path.join(manifest.adapter,'adapters.safetensors'))!==selection.adapterSha256)throw Error('SELECTED_ADAPTER_CHANGED');
const runtimeAdapter=path.join(config.runtime,path.basename(root)+'-adapter');
for(const name of ['training-run.json','metrics.jsonl']){const source=path.join(runtimeAdapter,name);entries.push({source,relative:path.join('evidence',name),sha256:fileHash(source)});}
if(new Set(entries.map(e=>e.relative)).size!==entries.length)throw Error('DUPLICATE_TARGET');
for(const e of entries)if(!fs.lstatSync(e.source).isFile()||fileHash(e.source)!==e.sha256)throw Error('SOURCE_CHANGED:'+e.source);
fs.mkdirSync(destination);const files=[];
for(const e of entries){const target=path.join(destination,e.relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(e.source,target,fs.constants.COPYFILE_EXCL|fs.constants.COPYFILE_FICLONE);if(fileHash(target)!==e.sha256)throw Error('COPY_CHANGED');files.push({name:e.relative,bytes:fs.statSync(target).size,sha256:e.sha256});}
const receipt={status:'byte-verified-native-research-reference',createdAt:new Date().toISOString(),baseRevision:manifest.base.revision,selectedEpoch:selection.epoch,files,totalBytes:files.reduce((n,f)=>n+f.bytes,0),model:path.join(destination,'base'),adapter:path.join(destination,'adapter'),releaseQualified:false,wholeGoalQualified:false,warning:'Not a qualified model. No fusion or quantization. Hero-setting fidelity is not validated; read PRIORITY_RESULTS.md and EXPERIMENT_REPORT.md. 16GB Mac not tested.'};
fs.writeFileSync(path.join(destination,'NATIVE_REFERENCE.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:receipt.status,files:files.length,totalBytes:receipt.totalBytes,model:receipt.model,adapter:receipt.adapter}));
