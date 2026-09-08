import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { ImportStore } from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/apps/content-api/src/importStore';
const out='/private/tmp/ggd-catalog-overlay-proof',repo='/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge';
const proof=JSON.parse(readFileSync(out+'/ui-proof.json','utf8')),retained=JSON.parse(readFileSync(out+'/retained-proof.json','utf8'));
const store=new ImportStore({dir:process.argv[2]??'/private/tmp/ggd-model-upload-acceptance/catalog-overlay-proof/imports'});
const before=store.readWorkFiles('ggd-existing-hero-catalog',proof.originalVersion);
assert.ok(before,'original catalog missing');let checked=0;
for(const [name,bytes] of before){let path;
 if(name.startsWith('catalog/')&&name!=='catalog/overlay.json')path=resolve(repo,'content',name.slice(8));
 else if(name.startsWith('assets/'))path=resolve(repo,'content',name);
 if(path){assert.deepEqual(readFileSync(path),Buffer.from(bytes),name);checked++;}
}
const latest=store.readWorkFiles('ggd-existing-hero-catalog',retained.savedVersion);assert.ok(latest);assert.equal(store.active(),null);
writeFileSync(out+'/shipped-tree-proof.json',JSON.stringify({status:'passed',originalFilesComparedByteExact:checked,savedFilesReadable:latest.size,active:null,originalVersion:proof.originalVersion,restoredVersion:retained.savedVersion},null,2));
console.log(JSON.stringify({status:'passed',checked,latest:latest.size}));
