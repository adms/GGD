/** Verify the complete 81 roster and the one explicitly registered Kaiji addition. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ModelVersions} from '../../../../apps/content-api/src/modelVersions';
const base=resolve('materials/hero-model-library');
const path=base+'/priority-registration.json';
const previous=JSON.parse(readFileSync(path,'utf8'));
const sourceKey='community.body.424d7db8825fd5f62344946a5fae5536bf38e710bed83036';
const sourceId='runtime:kaiji-holya-procedural-six-state-v1';
assert.equal(previous.heroes.length,81);
assert.equal(new Set(previous.heroes.map((h:any)=>h.runtimeHeroId)).size,81);
const service=new ModelVersions(resolve('content'));
const heroes=previous.heroes.map((row:any)=>{
 const after=service.state(row.runtimeHeroId);
 for(const v of after.versions)service.verify(v);
 for(const v of row.after.versions)assert(after.versions.some(x=>JSON.stringify(x)===JSON.stringify(v)),`Prior version changed: ${row.heroId}/${v.modelKey}`);
 if(row.heroId!=='b2-kaiji'){assert.deepEqual(after,row.after,`Non-target changed: ${row.heroId}`);return row;}
 const added=after.versions.find(v=>v.sourceModelKey===sourceKey);assert(added);
 assert.equal(added.binarySha256,'9a52fa1e9a122bc0ac37cd0819bed82d36b468cccfeec88dc4b012241765595a');
 assert.equal(added.source.selectionClass,'community-mod');assert.equal(added.automaticEligible,true);
 assert.equal(after.selectionMode,'automatic');assert.equal(after.activeModelKey,added.modelKey);assert.equal(after.preferredModelKey,added.modelKey);
 assert.equal(after.versions.length,4);
 if(row.after.activeModelKey===added.modelKey)return row;
 assert.equal(row.after.expectedHash,'sha256:43a79a2ba72caf79453822ca55584388b5e82ee874b22e86fc82316b749bed7f');
 return {...row,before:row.after,after,registered:[...new Set([...row.registered,sourceId])],status:'registered-readback-verified'};
});
const refs=heroes.reduce((n:number,h:any)=>n+h.after.versions.length,0);assert.equal(refs,283);
writeFileSync(path,JSON.stringify({...previous,heroes},null,2)+'\n');
const row=heroes.find((h:any)=>h.heroId==='b2-kaiji');
const receipt={schema:'ggd-kaiji-registration-readback@1',heroesVerified:81,versionReferences:refs,other80SelectionsAndVersionsPreserved:true,previousKaijiVersionsPreserved:3,newSourceModelKey:sourceKey,activeModelKey:row.after.activeModelKey,selectionMode:row.after.selectionMode,productionDeployed:false};
writeFileSync(base+'/priority-evidence/kaiji-community/registration-readback.json',JSON.stringify(receipt,null,2)+'\n');
const deliveryPath=base+'/priority-evidence/kaiji-community/receipt.json';
const delivery=JSON.parse(readFileSync(deliveryPath,'utf8'));
assert.equal(delivery.runtimeModelKey,sourceKey);
assert.equal(delivery.sha256,'9a52fa1e9a122bc0ac37cd0819bed82d36b468cccfeec88dc4b012241765595a');
writeFileSync(deliveryPath,JSON.stringify({...delivery,readiness:'registered-runtime-option',backendSelectionVerified:true,
 activeModelKey:row.after.activeModelKey,selectionMode:row.after.selectionMode,
 registrationEvidence:'materials/hero-model-library/priority-evidence/kaiji-community/registration-readback.json'},null,2)+'\n');
console.log(JSON.stringify(receipt));
