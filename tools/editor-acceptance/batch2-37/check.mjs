// Fast, read-only handoff gate. It never invokes a model or changes a dataset.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {roster} from './roster.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const sha=x=>createHash('sha256').update(Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const build=read('report.json');
assert.equal(execFileSync('git',['log','-1','--format=%H','--','packages/shared/src'],{cwd:root,encoding:'utf8'}).trim(),build.engineCommit,'ENGINE_CHANGED');
const current=[];
for(const c of readdirSync(resolve(root,'content'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name))for(const f of readdirSync(resolve(root,'content',c)))if(f.endsWith('.json')&&!f.startsWith('_')){const d=JSON.parse(readFileSync(resolve(root,'content',c,f),'utf8'));if(d.id)current.push([`${c}/${d.id}`,d]);}
assert.equal(sha(current.sort(([a],[b])=>a.localeCompare(b,'en'))),build.catalogDigest,'CONTENT_CHANGED');
assert.equal(sha(read('public/catalog.json')),build.publicCatalogSha256,'PUBLIC_CATALOG_CHANGED');
assert.equal(roster.length,37);assert.equal(build.slotCount,222);assert.equal(build.trainEligible,false);assert.equal(build.counts.admitted,0);
const src=resolve(root,'tools/editor-acceptance/batch2-37');
assert.deepEqual(Object.keys(build.sourceHashes).sort(),readdirSync(src).filter(f=>/\.(mjs|json)$/.test(f)).sort(),'UNBOUND_SOURCE_FILE');
for(const [f,h] of Object.entries(build.sourceHashes))assert.equal(sha(readFileSync(resolve(src,f))),h,`SOURCE_CHANGED:${f}`);
for(const f of ['behavior-report.json','train-report.json','package-report.json','author-review.json'])assert.equal(read(f).buildHash,sha(build),`STALE_REPORT:${f}`);
const statuses=new Set(),templates=new Set(),vfx=new Set();
const walk=x=>{if(x&&typeof x==='object'){if(x.kind==='applyStatus'||x.kind==='consumeStatus')statuses.add(x.statusId);if(x.kind==='status')statuses.add(x.statusId);Object.values(x).forEach(walk);}};
for(const h of roster){
  const row=build.heroes.find(x=>x.id===h.id),p=read(`private/teachers/${h.id}.project.json`),d=read(`private/compiled/${h.id}.json`),prompt=read(`public/prompts/${h.id}.json`);
  assert.equal(sha(p),row.projectSha256,`TEACHER_CHANGED:${h.id}`);assert.equal(sha(d),row.compiledSha256,`COMPILED_CHANGED:${h.id}`);
  assert.equal(prompt.id,h.id);assert(!prompt.acceptedPlan&&!prompt.abilityDrafts,'TEACHER_LEAKED_IN_PROMPT');
  assert.equal(sha(prompt),row.promptSha256,`PROMPT_CHANGED:${h.id}`);
  for(const m of h.moves){const a=d.abilityDrafts[m.slot],s=p.acceptedPlan.slots[m.slot];assert.equal(s.products.length,1);templates.add(s.products[0].template.ref);walk(a.effects??a.passive);if(a.vfxKey)vfx.add(a.vfxKey);assert.equal(s.tuning.cooldownSec,a.cooldown[0]);assert.equal(s.tuning.manaCost,a.manaCost[0]);assert.equal(s.tuning.range,a.range);}
}
assert.deepEqual([...templates].sort(),['tpl-effect-sequence','tpl-event-passive']);
assert.deepEqual([...statuses].sort(),['blind','confusion','curse','rage','slow40']);
assert.equal(read('behavior-report.json').passed,37);assert.equal(read('train-report.json').status,'passed');
assert.equal(read('package-report.json').passed,37);
assert.equal(read('author-review.json').heroes.length,37);
if(process.argv.includes('--require-complete'))assert.equal(read('author-review.json').completeGoldHeroes,37,'FULL_HERO_ACCEPTANCE_PENDING');
console.log(JSON.stringify({heroes:37,slots:222,templates:[...templates].sort(),statuses:[...statuses].sort(),vfx:[...vfx].sort(),completeGoldHeroes:0,trainEligible:false}));
