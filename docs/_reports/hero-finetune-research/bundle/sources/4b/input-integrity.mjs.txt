import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {digest} from './dataset.mjs';
// Dataset exports live outside stage directories; cached stages must not bypass them.
export function verifyDatasetExports(root){
 const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
 const manifest=read('dataset-manifest.json'),cases=read('cases.private.json');
 if(manifest.casesDigest!==digest(cases)||manifest.sourceDigest!==digest(fs.readFileSync(new URL('./dataset.mjs',import.meta.url),'utf8')))throw Error('DATASET_DRIFT');
 const lines=fs.readFileSync(path.join(root,'train.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 if(!isDeepStrictEqual(lines,cases.filter(c=>c.split==='train').map(c=>({id:c.id,messages:c.messages,target:c.target}))))throw Error('DATA_EXPORT_DRIFT:train');
 for(const split of ['train','dev','test']){
  const expected=cases.filter(c=>c.split===split).map(({id,requestDigest,messages})=>({id,requestDigest,messages}));
  if(!isDeepStrictEqual(read(split+'-requests.json'),expected)||expected.some(r=>r.requestDigest!==digest(r.messages)))throw Error('DATA_EXPORT_DRIFT:'+split+'-requests');
 }
 return{status:'pass',cases:cases.length,casesDigest:manifest.casesDigest};
}
export function pinDatasetExports(root){
 verifyDatasetExports(root);
 const files=['dataset-manifest.json','cases.private.json','train.jsonl','train-requests.json','dev-requests.json','test-requests.json'].map(name=>({name,hash:digest(fs.readFileSync(path.join(root,name),'utf8'))}));
 return()=>{for(const f of files)if(digest(fs.readFileSync(path.join(root,f.name),'utf8'))!==f.hash)throw Error('DATA_CHANGED_DURING_RUN:'+f.name);};
}
