// Frozen, evaluation-only intake. Does not train, generate model answers or edit the source checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SOURCE_COMMIT = '0a8da174ead82e2241fa595d0f1c37f3194df334';
export const DATA = 'docs/_reports/hero-validation-batch2-37/data/';
export const SLOTS = ['PASSIVE', 'Q', 'W', 'E', 'R', 'EX'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const objectHash = data => hash(JSON.stringify(data));
const promptKeys = new Set(['id','name','work','theme','origin','task','evaluation','outputSchema','appearancePolicy','requirements','catalog']);
export function safeRelative(file) {
  assert(typeof file === 'string' && !path.isAbsolute(file) && !file.includes('\\') && !file.split('/').some(x => x === '..' || x === '.' || !x), 'UNSAFE_PATH');
  return file;
}
export function checkPrompt(prompt) {
  assert(Object.keys(prompt).every(k => promptKeys.has(k)), 'TEACHER_FIELD_IN_PROMPT');
  assert(!/private\/(teachers|compiled|evidence)|acceptedPlan|abilityDrafts/.test(JSON.stringify(prompt)), 'PRIVATE_ANSWER_REFERENCE');
  assert.equal(prompt.outputSchema, 'ggd-hero-project@2');
  assert.equal(prompt.catalog, '../catalog.json');
}
export function checkPublicFiles(files, ids) {
  const paths = files.map(f => safeRelative(f.path));
  assert.equal(new Set(paths).size, paths.length, 'DUPLICATE_PUBLIC_PATH');
  const allowed = new Set(['catalog.json', ...ids.map(id => `prompts/${id}.json`)]);
  for (const p of paths) assert(allowed.has(p) || /^assets\/[a-f0-9]{64}\.glb$/.test(p), 'NON_PUBLIC_FILE');
  for (const p of allowed) assert(paths.includes(p), 'MISSING_PUBLIC_FILE');
}
export function checkGroups(groups) {
  assert.equal(groups.length, 37);
  assert.equal(new Set(groups.map(g => g.groupId)).size, 37, 'DUPLICATE_GROUP');
  for (const g of groups) {
    assert.match(g.groupId, /^b2-[a-z]+$/);
    assert.equal(g.trainEligible, false, 'NO_TRAINING_ADMISSION');
    assert.equal(g.partition, 'external-evaluation-only');
    assert.equal(g.publicPrompt, `public/prompts/${g.groupId}.json`);
    assert.equal(g.privateTeacher, `private/teachers/${g.groupId}.project.json`);
    assert.equal(g.privateCompiled, `private/compiled/${g.groupId}.json`);
  }
}
export function overlapAudit(groups, examples) {
  const normalize = s => String(s).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  const seen = examples.map(e => {
    let request = {}; try { request = JSON.parse(e.messages.find(m => m.role === 'user').content).request; } catch {}
    return { id: e.id, split: e.split, heroId: e.heroId, names: [e.heroId, e.groupId, request?.heroName].filter(Boolean).map(normalize) };
  });
  return groups.map(g => ({ id: g.groupId, matches: seen.filter(e => g.aliases.some(a => e.names.includes(normalize(a)))).map(e => ({id:e.id,split:e.split})),
    scope: 'Exact normalized IDs/known aliases/heroName in the explicitly supplied frozen split only; not a full historical exposure certification.' }));
}

export function intake(repo, out, trainingFile) {
  assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
  const git = args => execFileSync('git', args, {cwd:repo,maxBuffer:64*1024*1024});
  git(['cat-file','-e',SOURCE_COMMIT+'^{commit}']);
  const scopes = ['tools/editor-acceptance/batch2-37', 'packages/shared/src', 'content', DATA];
  assert.equal(git(['diff',SOURCE_COMMIT,'--',...scopes]).length, 0, 'SOURCE_VERSION_CHANGED');
  assert.equal(git(['ls-files','--others','--exclude-standard','--',...scopes]).length, 0, 'UNTRACKED_SOURCE');
  const pins = {}, cache = new Map();
  const readBytes = file => {
    safeRelative(file);
    if (!cache.has(file)) {
      const bytes = git(['show',`${SOURCE_COMMIT}:${file}`]);
      cache.set(file,bytes); pins[file] = {sha256:hash(bytes),bytes:bytes.length};
    }
    return cache.get(file);
  };
  const read = file => JSON.parse(readBytes(DATA+file));
  const active=read('ACTIVE.json'), build=read('report.json'), partition=read('partition-report.json'), review=read('author-review.json');
  assert.equal(active.version,2); assert.equal(active.trainEligible,false);
  assert.equal(partition.blindAdmission,false);
  const receipts=['ACTIVE.json','partition-report.json','author-review.json','behavior-report.json','special-report.json','train-report.json','package-report.json','diversity-report.json'];
  for(const file of receipts) assert.equal(read(file).buildHash,objectHash(build),`STALE_RECEIPT:${file}`);
  checkGroups(partition.groups);
  checkPublicFiles(partition.publicFiles,partition.groups.map(g=>g.groupId));
  const publicBytes = new Map();
  for(const f of partition.publicFiles) {
    const bytes=f.path.endsWith('.glb') ? fs.readFileSync(path.join(repo,DATA,'public',f.path)) : readBytes(DATA+'public/'+f.path);
    assert.equal(hash(bytes),f.sha256,`PUBLIC_HASH:${f.path}`);
    publicBytes.set(f.path,bytes);
  }
  const cases=[];
  for(const g of partition.groups) {
    const prompt=read(g.publicPrompt), teacher=read(g.privateTeacher), compiled=read(g.privateCompiled);
    checkPrompt(prompt);
    assert.equal(prompt.id,g.groupId);assert.equal(teacher.projectId,g.groupId);
    assert.deepEqual(Object.keys(teacher.acceptedPlan.slots).sort(),[...SLOTS].sort());
    assert.deepEqual(Object.keys(compiled.abilityDrafts).sort(),[...SLOTS].sort());
    const row=build.heroes.find(h=>h.id===g.groupId), reviewed=review.heroes.find(h=>h.id===g.groupId);
    assert(row.schema&&row.compile&&row.basicKit);
    assert.equal(objectHash(prompt),row.promptSha256);
    assert.equal(objectHash(teacher),row.projectSha256);assert.equal(objectHash(teacher),reviewed.projectSha256);
    assert.equal(objectHash(compiled),row.compiledSha256);assert.equal(objectHash(compiled),reviewed.compiledSha256);
    assert.equal(reviewed.admission.trainEligible,false);
    cases.push({id:g.groupId,name:prompt.name,work:prompt.work,partition:g.partition,trainEligible:false,
      prompt:`model-input/${g.publicPrompt.slice(7)}`,teacher:`evaluator/${g.privateTeacher}`,compiled:`evaluator/${g.privateCompiled}`,
      sourceReportedAdmission:reviewed.admission,skillSlots:SLOTS,
      teacherSpecificComboTests:'Reference self-consistency tests only; not mandatory exact implementation for alternative model answers.'});
  }
  // Read-only upstream gate checks the pinned sources, catalogs, all 37 teachers and receipts.
  const gate = execFileSync(process.execPath,['tools/editor-acceptance/batch2-37/check.mjs','--receipt-only'],{cwd:repo,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  const trainingBytes=fs.readFileSync(trainingFile), examples=JSON.parse(trainingBytes);
  const overlaps=overlapAudit(partition.groups,examples);
  assert(overlaps.every(r=>!r.matches.length),'KNOWN_TRAIN_DEV_OVERLAP');
  const rubric={schema:'ggd-full-hero-evaluation-policy@1',unit:'whole-hero',trainEligible:false,blindCertified:false,
    comparison:['unmodified Gemma 4 12B IT + scripts','same base + fixed LoRA + identical scripts','pinned Codex reference (historical budget unknown)'],
    priorities:['identity/origin/attributes','six-slot mechanics/teams/timing/resources/causality','legal templates and references','required VFX/assets bindings','save/reload/compiler/import/game behavior'],
    exactTeacherNamesOrTemplatesRequired:false,allowEquivalentDesigns:true,
    hiddenRequirementsForbidden:true,missingEvidence:'not-tested, never pass',
    upstreamTeacherCombos:'Do not directly grade arbitrary model designs using private teacher-specific slots, IDs or preconditions.',
    modelInputRootOnly:'model-input',noPrivateRetrieval:true,noCodexRepair:true,
    use:'User-supplied held-out evaluation; not training, checkpoint selection, prompt tuning or automatic scorer tuning.',
    readiness:'Dataset intake only. Candidate-output behavioral scorer and identical A/B generation settings must be frozen before running models.',
    fullGameReadinessProven:false};
  const result={schema:'ggd-batch2-validation-intake@1',sourceCommit:SOURCE_COMMIT,engineCommit:build.engineCommit,
    buildHash:objectHash(build),counts:{heroes:37,slots:222,publicFiles:publicBytes.size},
    sourcePins:pins,upstreamReceiptCheck:{exit:0,result:JSON.parse(gate.trim()),runtimeReplay:false},
    trainingSnapshot:{sha256:hash(trainingBytes),examples:examples.length,basename:path.basename(trainingFile)},
    overlapAudit:overlaps,blindCertified:false,trainEligible:false,trainingChanged:false,modelInferenceStarted:false,
    exposure:'This assistant has inspected inventory names and five teacher kits for audit. The evaluated 12B must only receive model-input. Historical model training exposure remains uncertified.',
    samplePlan:{selection:'Risk-based, fixed before replay; not a random quality estimate',heroes:['b2-naofumi','b2-rin','b2-noor','b2-haga','b2-kisaragi']}};
  assert.equal(hash(fs.readFileSync(trainingFile)),result.trainingSnapshot.sha256,'TRAINING_CHANGED');
  assert.equal(git(['diff',SOURCE_COMMIT,'--',...scopes]).length,0,'SOURCE_CHANGED_DURING_INTAKE');
  const save=(file,bytes)=>{const target=path.join(out,safeRelative(file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});};
  for(const [file,bytes]of publicBytes)save('model-input/'+file,bytes);
  for(const g of partition.groups)for(const file of [g.privateTeacher,g.privateCompiled])save('evaluator/'+file,readBytes(DATA+file));
  for(const [file,data]of [['cases.json',cases],['rubric.json',rubric],['intake.json',result]])save(file,JSON.stringify(data,null,2)+'\n');
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [repo,out,training]=process.argv.slice(2);
  if(repo==='--receipts') {
    assert(out&&training,'USAGE: --receipts INTAKE_DIRECTORY NEW_RECEIPT_DIRECTORY');
    assert(!fs.existsSync(training),'REFUSE_OVERWRITE');
    const files=['intake.json','cases.json','rubric.json','sample.json'];
    const bytes=files.map(file=>[file,fs.readFileSync(path.join(out,file))]);
    const sample=JSON.parse(bytes.find(([f])=>f==='sample.json')[1]);
    assert.equal(hash(fs.readFileSync(path.join(out,sample.evidence.path))),sample.evidence.sha256,'SAMPLE_EVIDENCE_CHANGED');
    fs.mkdirSync(training,{recursive:true});
    for(const [file,data]of bytes)fs.writeFileSync(path.join(training,file),data,{flag:'wx'});
    console.log(JSON.stringify({receiptFiles:files,rawEvidenceCopied:false,teacherAnswersCopied:false}));
  } else {
    assert(repo&&out&&training,'USAGE: SOURCE_REPO NEW_OUTPUT FROZEN_EXAMPLES_JSON');
    const result=intake(path.resolve(repo),path.resolve(out),path.resolve(training));console.log(JSON.stringify(result.counts));
  }
}
