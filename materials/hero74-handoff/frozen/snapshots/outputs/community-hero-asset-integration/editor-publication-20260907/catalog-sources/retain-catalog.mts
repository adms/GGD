import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const out='/private/tmp/ggd-catalog-source-archive', repo=process.cwd();
const {ImportStore}=await import(pathToFileURL(repo+'/apps/content-api/src/importStore.ts').href);
const proof=JSON.parse(fs.readFileSync(out+'/source-ui-proof.json','utf8'));
const original=new ImportStore({dir:'/private/tmp/ggd-existing-catalog-save-acceptance/backups/hero-catalog-versions'});
const work='ggd-existing-hero-catalog', record=original.getWorkVersion(work,proof.versionId);
assert(record); const files=original.readWorkFiles(work,proof.versionId); assert(files);
const retained=new ImportStore({dir:out+'/catalog-store',now:()=>new Date(record.createdAt)});
const result=retained.putWorkVersion({workId:work,projectId:record.projectId,packageDigest:record.packageDigest},files);
assert.equal(result.record.snapshotDigest,record.snapshotDigest);
assert.equal(result.record.storageRefs,undefined);
const reopened=new ImportStore({dir:out+'/catalog-store'}), restored=reopened.readWorkFiles(work,proof.versionId);
assert(restored); assert.equal(restored.size,files.size);
for(const [path,bytes] of files) assert.deepEqual(restored.get(path),bytes,path);
const manifest=JSON.parse(restored.get('catalog-version.json').toString());
let sourceFiles=0;
for(const [path,bytes] of restored) if(path.startsWith('generator-source/')) {
  assert.deepEqual(bytes,fs.readFileSync(repo+'/'+path.slice('generator-source/'.length)),path); sourceFiles++;
}
assert.equal(reopened.active(),null); assert.equal(original.active(),null);
fs.writeFileSync(out+'/catalog-retention-proof.json',JSON.stringify({status:'passed',versionId:proof.versionId,snapshotDigest:record.snapshotDigest,files:files.size,bytes:record.files.reduce((sum,x)=>sum+x.bytes,0),sourceFiles,generatorFiles:manifest.generatorSources.generators[0].files.length,originalStorageReferences:Object.keys(record.storageRefs??{}).length,retainedStorageReferences:0,allRestoredBytesExact:true,active:null,scope:'Standalone immutable catalog copy includes all referenced bytes. Source text and generator inputs match the actual capture; historical generator execution is not asserted.'},null,2));
console.log('Verified standalone catalog',files.size,'files and',sourceFiles,'source inputs');
