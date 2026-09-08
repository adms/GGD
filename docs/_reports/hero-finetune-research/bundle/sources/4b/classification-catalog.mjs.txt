import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const [root,out]=process.argv.slice(2);if(!root||!out)throw Error('usage: classification-catalog.mjs RUN NEW_CATALOG');
const rows=JSON.parse(fs.readFileSync(path.join(root,'cases.private.json'),'utf8'));const manifest=JSON.parse(fs.readFileSync(path.join(root,'dataset-manifest.json'),'utf8'));
if(crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')!==manifest.casesSha256)throw Error('DATASET_CHANGED');
const vfx=new Map(),mechanism=new Map();
for(const r of rows){const context=JSON.parse(r.messages[1].content);for(const c of context.catalog??[]){if(r.task.startsWith('vfx-'))vfx.set(c.id,c);if(r.task==='mechanism-template')mechanism.set(c.templateId,c);}}
const catalog={schema:'ggd-forge-classification-catalog@1',system:rows[0].messages[0].content,vfx:[...vfx.values()].sort((a,b)=>a.id.localeCompare(b.id)),mechanism:[...mechanism.values()].sort((a,b)=>a.templateId.localeCompare(b.templateId)),sourceCasesSha256:manifest.casesSha256,parameterGeneration:false};
if(catalog.vfx.length!==manifest.vfx||catalog.mechanism.length!==manifest.templates)throw Error('INCOMPLETE_CATALOG');
fs.writeFileSync(out,JSON.stringify(catalog,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({vfx:catalog.vfx.length,mechanism:catalog.mechanism.length,out}));
