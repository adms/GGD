import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {atomize,replayAtoms,atomizeCompact} from './hero-distillation-atomic.mjs';

test('atomizer replays nested object/array values without a large answer',()=>{
  const effect={kind:'applyStatus',statusId:'$hero.violet-flame',duration:4,sourceScope:'caster',dispellable:false,stacks:1};
  const value={hooks:[{on:'onDamage',effects:Array.from({length:12},()=>effect)},{on:'onCast',effects:Array.from({length:8},()=>effect)}]};
  const atoms=atomize(value,{slot:'PASSIVE',product:0});
  assert(atoms.length>1);assert(atoms.every(atom=>JSON.stringify(atom).length<=600));assert.deepEqual(replayAtoms(atoms),value);
});

test('atomizer deterministically expands the 74-hero compact teacher without changing split',()=>{
  const root=path.resolve('docs/_reports/hero-finetune-research/hero74-compact-v8'),parent=fs.mkdtempSync(path.join(os.tmpdir(),'ggd-atomic-')),out=path.join(parent,'output');
  const report=atomizeCompact(root,out),manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));
  assert.equal(report.counts.all.heroes,74);assert(report.counts.all.tasks>518);assert(report.maxOutputChars<=600);assert.equal(manifest.schema,'ggd-distillation-atomic-frozen-data@1');
});
