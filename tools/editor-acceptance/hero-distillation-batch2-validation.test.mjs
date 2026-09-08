import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPrompt,checkGroups,checkPublicFiles,safeRelative,overlapAudit } from './hero-distillation-batch2-validation.mjs';
const ids=Array.from({length:37},(_,i)=>`b2-${String.fromCharCode(97+Math.floor(i/26))}${String.fromCharCode(97+i%26)}`);
const groups=ids.map(id=>({groupId:id,partition:'external-evaluation-only',trainEligible:false,aliases:[id],publicPrompt:`public/prompts/${id}.json`,privateTeacher:`private/teachers/${id}.project.json`,privateCompiled:`private/compiled/${id}.json`}));
test('37 unique evaluation groups; training and duplicate admission rejected',()=>{
  checkGroups(groups);
  assert.throws(()=>checkGroups(groups.map((g,i)=>i?g:{...g,trainEligible:true})),/NO_TRAINING/);
  assert.throws(()=>checkGroups([...groups.slice(0,-1),groups[0]]),/DUPLICATE/);
});
test('only prompts, catalog and hash-addressed public GLB allowed',()=>{
  const files=['catalog.json',...ids.map(id=>`prompts/${id}.json`)].map(path=>({path}));
  checkPublicFiles(files,ids);
  assert.throws(()=>checkPublicFiles([...files,{path:'private/teachers/answer.json'}],ids),/NON_PUBLIC/);
  assert.throws(()=>checkPublicFiles(files.slice(1),ids),/MISSING/);
  assert.throws(()=>checkPublicFiles([...files,files[0]],ids),/DUPLICATE/);
});
test('private references, answer fields and unsafe traversal are rejected',()=>{
  const p={id:'b2-rem',outputSchema:'ggd-hero-project@2',catalog:'../catalog.json'};
  checkPrompt(p);
  assert.throws(()=>checkPrompt({...p,acceptedPlan:{}}),/TEACHER_FIELD/);
  assert.throws(()=>checkPrompt({...p,task:'read private/teachers/foo'}),/PRIVATE_ANSWER/);
  for(const f of ['../answer','/tmp/a','public/../../a','public\\answer'])assert.throws(()=>safeRelative(f),/UNSAFE/);
});
test('known name overlap is detected, not suppressed by changing hero ID',()=>{
  const examples=[{id:'old:HERO',heroId:'old',split:'train',messages:[{role:'user',content:JSON.stringify({request:{heroName:'蕾姆'}})}]}];
  assert.equal(overlapAudit([{groupId:'b2-rem',aliases:['蕾姆']}],examples)[0].matches.length,1);
  assert.equal(overlapAudit([{groupId:'b2-other',aliases:['其他人']}],examples)[0].matches.length,0);
});
