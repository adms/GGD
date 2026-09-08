/** Train/dev-only candidate recall. This is not model classification accuracy. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {buildRequest} from './classification-client.mjs';
const root=path.resolve(process.argv[2]??'');if(!process.argv[2])throw Error('RUN_REQUIRED');const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const catalog=read('catalog.json'),cases=read('cases.private.json').filter(c=>c.split!=='test'&&c.task==='vfx-semantic'&&c.target.decision==='accept');
const rows=cases.map(c=>{const request=buildRequest(catalog,{id:c.id,task:'vfx',request:JSON.parse(c.messages[1].content).request});return{id:c.id,split:c.split,pass:c.acceptedTargets.some(t=>t.suggestedTemplateIds.every(id=>request.candidates.some(v=>v.id===id))),candidateIds:request.candidates.map(v=>v.id)};});
const report={status:rows.every(r=>r.pass)?'pass':'misses',scope:'train/dev candidate recall only; not model prediction, no sealed test used',total:rows.length,passed:rows.filter(r=>r.pass).length,clientSha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('./classification-client.mjs',import.meta.url))).digest('hex'),rows};
fs.writeFileSync(path.join(root,'retrieval-train-dev.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,rows:undefined}));
