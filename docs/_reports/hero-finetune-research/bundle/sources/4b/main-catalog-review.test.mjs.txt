import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewed,revision,buildMainCatalog} from './main-catalog-review.mjs';
import {buildMainBenchmark} from './main-catalog-benchmark.mjs';
const fixtures=()=>({inventory:{revision,rows:[...reviewed.map(r=>({id:'tpl-'+r[0],status:'enabled',sha256:r[0]})),...Array.from({length:11},(_,i)=>({id:'draft-'+i,status:'draft',sha256:String(i)}))]},probes:{revision,schemas:reviewed.map(r=>({id:'tpl-'+r[0],abilityOk:r[2]!=='quarantine-schema'})),runtime:{ok:true,drain:{after:{enemy:471},before:{enemy:421}}}}});
test('all known families represented; defective cards isolated, nothing training-approved',()=>{
 const {inventory,probes}=fixtures(),review=buildMainCatalog(inventory,probes);
 assert.deepEqual(review.counts,{total:46,enabled:32,quarantined:3,draft:11});
 assert(review.rows.every(r=>r.trainingEligible===false));assert.equal(review.trainingApproved,false);
 assert.equal(review.rows.find(r=>r.templateId==='tpl-drain-leech').status,'quarantined');
});
test('new failures or revision drift cannot silently receive approval',()=>{
 const {inventory,probes}=fixtures();probes.schemas.find(r=>r.id==='tpl-single-strike').abilityOk=false;
 assert.throws(()=>buildMainCatalog(inventory,probes));inventory.revision='different';assert.throws(()=>buildMainCatalog(inventory,probes));
});
test('prospective diagnostics contain no quarantined positive targets or training exports',()=>{
 const {inventory,probes}=fixtures();const r=buildMainCatalog(inventory,probes),b=buildMainBenchmark(r);
 assert.equal(b.cases.length,40);assert.equal(b.manifest.trainingEligible,false);assert.equal(b.manifest.sealedTest,false);
 for(const c of b.cases){assert.equal(c.trainingEligible,false);const input=JSON.parse(c.messages[1].content);assert(!('target' in input));assert(!('acceptedTargets' in input));assert.equal(input.catalog.length,32);}
});
