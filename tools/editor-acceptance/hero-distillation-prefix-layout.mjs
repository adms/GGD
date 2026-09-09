// Lossless JSON member-order derivation; never edits source teachers or splits.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export function reorder(row){
  const value=structuredClone(row),before=row.messages[1].content,user=JSON.parse(before);
  assert.equal(hash(before),row.inputSha256,'INPUT_HASH_DRIFT');
  const shared={allowedCatalog:user.allowedCatalog,assets:user.assets};
  assert(shared.allowedCatalog&&shared.assets,'PUBLIC_CATALOG_REQUIRED');
  const reordered={...shared,...Object.fromEntries(Object.entries(user).filter(([key])=>!(key in shared)))};
  const after=JSON.stringify(reordered);assert.deepEqual(JSON.parse(after),user,'INFORMATION_CHANGED');
  value.messages[1].content=after;value.layoutSourceInputSha256=row.inputSha256;value.inputSha256=hash(after);
  value.sharedPrefixGroup=hash(JSON.stringify([row.messages[0],shared]));
  assert.equal(value.messages[2].content,row.messages[2].content);
  assert.equal(value.targetSha256,row.targetSha256);
  return value;
}

export function derive(source,out){
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  const raw=fs.readFileSync(path.join(source,'manifest.json')),parent=JSON.parse(raw),files={};
  for(const [name,expected]of Object.entries(parent.outputs)){
    assert(/^[a-z-]+\.(json|jsonl)$/.test(name),'UNSAFE_SOURCE_PATH');
    files[name]=fs.readFileSync(path.join(source,name));assert.equal(hash(files[name]),expected,'SOURCE_DRIFT:'+name);
  }
  const old=JSON.parse(files['examples.json']),rows=old.map(reorder);
  fs.mkdirSync(out,{recursive:true});const outputs={};
  const save=(name,bytes)=>{fs.writeFileSync(path.join(out,name),bytes,{flag:'wx'});outputs[name]=hash(bytes);};
  for(const [name,bytes]of Object.entries(files))if(!['examples.json','train.jsonl','dev.jsonl'].includes(name))save(name,bytes);
  save('examples.json',JSON.stringify(rows,null,2)+'\n');
  for(const split of ['train','dev'])save(split+'.jsonl',rows.filter(r=>r.split===split).map(r=>JSON.stringify(r)).join('\n')+'\n');
  const groups=Object.fromEntries([...new Set(rows.map(r=>r.sharedPrefixGroup))].map(key=>[key,{
    trainTasks:rows.filter(r=>r.sharedPrefixGroup===key&&r.split==='train').length,
    devTasks:rows.filter(r=>r.sharedPrefixGroup===key&&r.split==='dev').length}]));
  save('layout-proof.json',JSON.stringify({parentManifestSha256:hash(raw),rows:rows.length,groups,
    allSemanticInputsUnchanged:true,allTeacherAnswersByteIdentical:true,allSplitsUnchanged:true,
    trainingStarted:false,cacheAdmitted:false},null,2)+'\n');
  save('manifest.json',JSON.stringify({...parent,outputs,scriptSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
    layout:'public-catalog-first@1',parentManifestSha256:hash(raw),parentExamplesSha256:parent.outputs['examples.json'],
    derivation:'Only user-message JSON member order changed. Source input hash recorded per row. Complete targets and splits unchanged; cache requires separate admission.',
    frozenWeightsStarted:false,releaseQualified:false},null,2)+'\n');
  return {counts:parent.counts,groups,rows:rows.length};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,4,'USAGE: SOURCE_FROZEN_DIR NEW_OUTPUT');
  console.log(JSON.stringify(derive(...process.argv.slice(2).map(p=>path.resolve(p)))));
}
