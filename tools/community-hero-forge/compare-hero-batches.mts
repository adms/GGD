import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { shippedHeroCatalog } from '../../packages/shared/testkit/heroPackageFixture.js';
import { zHeroProject } from '../../packages/shared/src/content/heroForge/schema.js';
import { generateHeroDraft, compileGeneratedHeroDraft } from '../../packages/shared/src/content/heroForge/generator.js';
import { inspectDiversity } from './kit-diversity.mjs';

const { values } = parseArgs({ options: { 'batch2-root': { type:'string' }, out:{type:'string'},
  'batch-dir':{type:'string',default:'materials/community-hero-forge'}, 'asset-intake':{type:'string'} } });
if (!values['batch2-root'] || !values.out) throw Error('--batch2-root <verified batch2 repository> --out <report.json>');
const root=path.resolve(import.meta.dirname,'../..'), batch=path.resolve(root,values['batch-dir']!);
const reference=path.resolve(values['batch2-root'],'docs/_reports/hero-validation-batch2-37/data');
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=(x:unknown)=>createHash('sha256').update(Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const fileHash=(p:string)=>hash(fs.readFileSync(p));
const policy=read(path.join(root,'materials/community-hero-forge/design-policy.json'));
const protectedPaths=['packages/shared/src/sim','packages/shared/src/content/schema','packages/shared/src/content/templates/expand.ts','content/ability-templates','content/status-effects'];
const changed=execFileSync('git',['diff','--name-only',policy.engineBaseline,'--',...protectedPaths],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','--',...protectedPaths],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
const runtimeChanges=[...new Set([...changed,...untracked])].filter(p=>!p.includes('.test.')&&!p.includes('.spec.'));
const catalog=shippedHeroCatalog();
const templates=[...catalog.documents].filter(([k])=>k.startsWith('ability-templates/')).map(([,d])=>d);
const configs=[...catalog.documents].filter(([k])=>k.startsWith('config/')).map(([,d])=>d);
const errors:string[]=[], heroes:any[]=[], provenance:any[]=[];
function compile(file:string,batchId:string) {
  const project=zHeroProject.parse(read(file));
  for(const slot of Object.values(project.acceptedPlan!.slots)) for(const product of slot.products) {
    if((catalog.documents.get(`ability-templates/${product.template.ref}`) as any)?.status!=='enabled') errors.push(`DISABLED_TEMPLATE:${project.projectId}:${product.template.ref}`);
  }
  const result=compileGeneratedHeroDraft(generateHeroDraft(project.acceptedPlan!,{heroId:project.projectId,heroName:project.brief.name,
    modelKey:project.presentation.modelKey,presentation:project.presentation}),templates as any,configs);
  if(!result.ok){errors.push(`COMPILE:${project.projectId}:${JSON.stringify(result.failures)}`);return;}
  heroes.push({id:project.projectId,name:project.brief.name,draft:result.draft,batch:batchId});
  provenance.push({id:project.projectId,batch:batchId,source:file,sha256:fileHash(file),revision:project.revision});
}
const index=read(path.join(batch,'index.json'));
for(const row of index.heroes) compile(path.join(batch,row.project),'first');
const build=read(path.join(reference,'report.json')), behavior=read(path.join(reference,'behavior-report.json'));
if(build.heroCount!==37 || build.slotCount!==222 || build.failures.length) throw Error('INVALID_BATCH2_BUILD');
if(behavior.buildHash!==hash(build) || behavior.passed!==37) throw Error('STALE_BATCH2_BEHAVIOR');
for(const row of build.heroes) {
  const project=path.join(reference,`private/teachers/${row.id}.project.json`), compiled=path.join(reference,`private/compiled/${row.id}.json`);
  if(hash(read(project))!==row.projectSha256 || hash(read(compiled))!==row.compiledSha256) throw Error(`BATCH2_SOURCE_MISMATCH:${row.id}`);
  compile(project,'second');
}
const diversity=inspectDiversity(heroes);
const previous=read(path.resolve(values['batch2-root'],'tools/editor-acceptance/batch2-37/similarity-review.json'));
const unresolvedSimilarLoops=previous.pairs.filter((p:any)=>p.classification==='accepted-similar-loop');
let assets;
if(values['asset-intake']) {
  const base=path.resolve(values['asset-intake']), pairs=read(path.join(base,'pairs.json')), validation=read(path.join(base,'validation.json'));
  assets={source:base,pairsSha256:fileHash(path.join(base,'pairs.json')),validationSha256:fileHash(path.join(base,'validation.json')),
    characters:pairs.count,productionReady:pairs.production_ready_characters,automaticImportAllowed:pairs.automatic_import_allowed,
    declaredFileProofs:validation.file_proofs_verified,proofBytesRechecked:false,
    note:'Candidate index only. This diagnostic does not admit models, retarget skeletons or verify rendered assets.'};
}
const result={schema:'ggd-cross-batch-design-review@1',policyVersion:policy.version,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  runtimeChanges,errors,compiledHeroes:heroes.length,compiledSlots:heroes.length*6,
  reference:{buildHash:hash(build),engineCommit:build.engineCommit,previousBehaviorPassed:behavior.passed,currentRuntimeBehaviorRerun:false},
  catalog:{enabledTemplates:templates.filter((t:any)=>t.status==='enabled').length,statuses:[...catalog.documents.keys()].filter(k=>k.startsWith('status-effects/')).length},
  diversity,unresolvedSimilarLoops,assets,provenance,
  validationSetReady:false,publicationReady:false,
  limits:['Current compilation and structural comparison are not causal combo tests or creativity judgments.',
    'Previously accepted similar loops remain unresolved under the new unique-signature policy.',
    'First-batch unfinished designs remain candidates; no automatic admission to a verified evaluation set.']};
fs.mkdirSync(path.dirname(path.resolve(values.out)),{recursive:true});fs.writeFileSync(values.out,JSON.stringify(result,null,2)+'\n');
const failed=runtimeChanges.length||errors.length;
console.log(JSON.stringify({compiledHeroes:heroes.length,compiledSlots:heroes.length*6,runtimeChanges,errors,
  exactPairs:diversity.exactDuplicateKitPairs.length,nearPairs:diversity.nearDuplicateKitPairs.length,unresolvedSimilarLoops:unresolvedSimilarLoops.length,
  validationSetReady:false,exitCode:failed?1:2}));
process.exitCode=failed?1:2;
