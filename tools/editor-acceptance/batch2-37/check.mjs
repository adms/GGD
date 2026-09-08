// Read-only scope-aware admission gate. A receipt check never claims a new run.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {roster} from './roster.mjs';
import {inspectDiversity} from './diversity.mjs';
import {reviewReceipts} from './author-review.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data'),src=resolve(root,'tools/editor-acceptance/batch2-37');
const sha=x=>createHash('sha256').update(Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const receiptOnly=process.argv.includes('--receipt-only'),build=read('report.json'),decisions=JSON.parse(readFileSync(resolve(src,'decisions.json'),'utf8'));
assert.equal(build.signaturePolicyVersion,2,'V1_REJECTED');
assert.equal(decisions.signaturePolicy.unreviewedDuplicateSignaturesAllowed,0);
assert.equal(decisions.signaturePolicy.reviewedExceptionsAllowed,true);
assert.equal(execFileSync('git',['log','-1','--format=%H','--','packages/shared/src'],{cwd:root,encoding:'utf8'}).trim(),build.engineCommit,'ENGINE_CHANGED');
const current=[];
assert(Array.isArray(build.catalogCollections),'CATALOG_SCOPE_MISSING');
for(const c of build.catalogCollections)for(const f of readdirSync(resolve(root,'content',c)))if(f.endsWith('.json')&&!f.startsWith('_')){const d=JSON.parse(readFileSync(resolve(root,'content',c,f),'utf8'));if(d.id)current.push([`${c}/${d.id}`,d]);}
assert.equal(sha(current.sort(([a],[b])=>a.localeCompare(b,'en'))),build.catalogDigest,'CONTENT_CHANGED');
assert.equal(sha(read('public/catalog.json')),build.publicCatalogSha256,'PUBLIC_CATALOG_CHANGED');
assert.deepEqual(Object.keys(build.sourceHashes).sort(),readdirSync(src).filter(f=>/\.(mjs|json|py)$/.test(f)).sort(),'UNBOUND_SOURCE_FILE');
for(const [f,h] of Object.entries(build.sourceHashes))assert.equal(sha(readFileSync(resolve(src,f))),h,`SOURCE_CHANGED:${f}`);
assert.equal(roster.length,37);assert.equal(build.slotCount,222);assert.equal(build.trainEligible,false);
const reports=Object.fromEntries(['behavior-report.json','train-report.json','package-report.json','special-report.json','diversity-report.json','partition-report.json','author-review.json','ACTIVE.json'].map(f=>{const r=read(f);assert.equal(r.buildHash,sha(build),`STALE_REPORT:${f}`);return [f,r];}));
const behavior=reports['behavior-report.json'],pack=reports['package-report.json'],special=reports['special-report.json'],review=reports['author-review.json'],part=reports['partition-report.json'],div=reports['diversity-report.json'];
const seenStatus=new Set(),seenTemplates=new Set(),seenVfx=new Set();
const walk=x=>{if(x&&typeof x==='object'){if(x.statusId)seenStatus.add(x.statusId);Object.values(x).forEach(walk);}};
const checkFile=(file,digest)=>assert.equal(sha(readFileSync(resolve(dir,file))),digest,`EVIDENCE_CHANGED:${file}`);
for(const h of roster){
 const row=build.heroes.find(x=>x.id===h.id),p=read(`private/teachers/${h.id}.project.json`),d=read(`private/compiled/${h.id}.json`),prompt=read(`public/prompts/${h.id}.json`),r=reviewReceipts.find(x=>x.id===h.id);
 assert(row.schema&&row.compile&&row.basicKit,`LEGALITY_FAILED:${h.id}`);
 assert.equal(sha(p),row.projectSha256);assert.equal(sha(d),row.compiledSha256);assert.equal(sha(prompt),row.promptSha256);
 assert.equal(sha(p),r.projectSha256,`MANUAL_PROJECT_REVIEW_STALE:${h.id}`);assert.equal(sha(d),r.compiledSha256,`MANUAL_COMPILED_REVIEW_STALE:${h.id}`);
 assert.equal(Object.keys(r.slots).length,6);assert.deepEqual(review.heroes.find(x=>x.id===h.id).review,r,'REVIEW_RECEIPT_CHANGED');
 assert(!prompt.acceptedPlan&&!prompt.abilityDrafts,'TEACHER_LEAKED_IN_PROMPT');
 for(const m of h.moves){const a=d.abilityDrafts[m.slot],s=p.acceptedPlan.slots[m.slot];assert(s.products.length);for(const product of s.products)seenTemplates.add(product.template.ref);walk(a.effects);walk(a.passive);if(a.vfxKey)seenVfx.add(a.vfxKey);for(const l of a.vfxLayers??[])seenVfx.add(l.vfxKey);assert.equal(s.tuning.cooldownSec,a.cooldown[0]);assert.equal(s.tuning.manaCost,a.manaCost[0]);assert.equal(s.tuning.range,a.range);}
 const b=behavior.heroes.find(x=>x.id===h.id);assert.equal(b.status,'passed');assert.equal(b.pairs.length,2);
 for(const pair of b.pairs){assert.equal(pair.status,'passed');checkFile(pair.evidence,pair.evidenceSha256);}
 checkFile(b.boundaryEvidence,b.boundaryEvidenceSha256);
 const pck=pack.heroes.find(x=>x.id===h.id);assert.equal(pck.status,'passed');if(!receiptOnly)checkFile(pck.zipPath,pck.zipSha256);
 const group=part.groups.find(x=>x.groupId===h.id);assert.equal(group.partition,'external-evaluation-only');assert.equal(group.trainEligible,false);assert(group.aliases.includes(h.name));
}
const catalog=new Map(current);
for(const id of seenTemplates)assert.equal(catalog.get(`ability-templates/${id}`)?.status,'enabled',`TEMPLATE_NOT_ENABLED:${id}`);
for(const id of seenStatus)assert(catalog.has(`status-effects/${id}`),`UNKNOWN_STATUS:${id}`);
for(const id of seenVfx)assert(catalog.has(`vfx/${id}`),`UNKNOWN_VFX:${id}`);
const diagnostic=inspectDiversity(roster.map(h=>({...h,draft:read(`private/compiled/${h.id}.json`)})));
assert.deepEqual(div.exactDuplicateKitPairs,diagnostic.exactDuplicateKitPairs);assert.deepEqual(div.nearDuplicateKitPairs,diagnostic.nearDuplicateKitPairs);
const pairKey=ids=>[...ids].sort().join('|');
for(const pair of [...diagnostic.exactDuplicateKitPairs,...diagnostic.nearDuplicateKitPairs])assert(div.semanticReview.pairs.some(x=>pairKey(x.heroes)===pairKey(pair.heroes)),'UNREVIEWED_SIMILARITY');
for(const pair of div.semanticReview.pairs){for(const k of ['classification','shared','fitAndJoke','difference','residual'])assert(pair[k]?.length>10,`UNEXPLAINED_SIMILARITY:${k}`);assert.equal(pair.heroes.length,2);}
assert.deepEqual(div.semanticReview,JSON.parse(readFileSync(resolve(src,'similarity-review.json'),'utf8')));
for(const c of special.cases){assert.equal(c.status,'passed');checkFile(c.evidence,c.evidenceSha256);}
for(const file of part.publicFiles)if(!receiptOnly||!file.path.endsWith('.glb'))checkFile(`public/${file.path}`,file.sha256);
assert.equal(behavior.passed,37);assert.equal(behavior.passiveBehaviorChecks,37);assert.equal(behavior.comboChecks,74);assert.equal(behavior.timelineChecks,296);
assert.equal(reports['train-report.json'].status,'passed');assert.equal(special.status,'passed');assert.equal(pack.passed,37);
assert.equal(review.reviewedSlots,222);assert.equal(review.scopedReferenceHeroes,37);assert.equal(part.blindAdmission,false);
assert.equal(review.completeGoldHeroes,review.heroes.filter(x=>x.admission.completeLiveHero).length);
const result={mode:receiptOnly?'committed-receipts-only':'receipts-and-local-package-bytes',heroes:37,slots:222,templates:seenTemplates.size,statuses:seenStatus.size,vfx:seenVfx.size,reviewedSimilarPairs:div.semanticReview.pairs.length,completeLiveHeroes:review.completeGoldHeroes,blindCertifiedHeroes:0,trainEligible:false};
console.log(JSON.stringify(result));
if(process.argv.includes('--require-complete'))assert.equal(review.completeGoldHeroes,37,'FULL_HERO_ACCEPTANCE_PENDING');
