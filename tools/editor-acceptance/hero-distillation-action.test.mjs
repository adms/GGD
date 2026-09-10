import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {actionize,replayActions,actionizeCompact} from './hero-distillation-action.mjs';

test('action queue derives every cursor from previous shapes',()=>{
  const effect={kind:'applyStatus',statusId:'$hero.mark',duration:4,sourceScope:'caster',dispellable:false};
  const value={hooks:[{on:'onDamage',effects:Array.from({length:12},()=>effect)}]};const actions=actionize(value);
  assert(actions.length>1);assert(actions.every(item=>JSON.stringify(item.answer).length<=600));assert.deepEqual(replayActions(actions),value);
});

test('action projection retains 74-hero split and has no oversize response',()=>{
  const source=path.resolve('docs/_reports/hero-finetune-research/hero74-compact-v8'),parent=fs.mkdtempSync(path.join(os.tmpdir(),'ggd-action-')),out=path.join(parent,'output');const report=actionizeCompact(source,out),manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));
  assert.equal(report.counts.all.heroes,74);assert(report.counts.all.tasks>518);assert(report.maxOutputChars<=600);assert.equal(manifest.schema,'ggd-distillation-action-frozen-data@1');
});
