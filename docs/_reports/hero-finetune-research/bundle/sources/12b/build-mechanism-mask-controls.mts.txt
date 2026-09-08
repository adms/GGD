/** Two reviewed controls for loss-mask engineering, not sufficient SFT admissions. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {WHOLE_PLANS} from './whole-plan-seeds-v1.mts';
import {ir4JSONSchema} from './ir4-json-schema.mts';
import {compileIR4,currentCatalog,checkEnginePins,hash} from './ir4-compiler.mts';
import {maskValues} from './semantic-loss-mask.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));checkEnginePins();const catalog=currentCatalog(),schema=ir4JSONSchema();
const policy='只依完整GGD改編原文生成六槽機制IR4。嚴格遵守JSON Schema，只輸出單一JSON，不輸出推理或Markdown。依原文而非LoL常識；保留否定、對象、時序、次數與跨槽關係。不得自行補取消的機制。evidence是來源連續原文，不代表已通過語意驗證。來源未定的nullable數值填null，必要缺口列mechanismGaps。若結構要求值但來源未定，只能提出有界預覽選擇並在tuningNotes說明未定，不宣称原文明示。特效細節、冷卻與包裝由script處理，不在此輸出。';
const rows=WHOLE_PLANS.map(f=>{
  const built=compileIR4(f.ir,f.source,catalog),excluded=[];
  for(const choice of f.choices)excluded.push({pointer:'/'+choice.path.split('.').join('/'),reason:choice.basis});
  for(const slot of Object.keys(f.ir.slots)){
    excluded.push({pointer:`/slots/${slot}/tuningNotes`,reason:'ungraded-editor-notes'});
    f.ir.slots[slot].actions.forEach((a:any,i:number)=>excluded.push({pointer:`/slots/${slot}/actions/${i}/evidence`,reason:'source-copy-scaffolding-not-mechanic-classification'}));
  }
  const target=maskValues(f.ir,excluded),input={source:f.source.hero,slots:f.source.slots,sources:f.source.sources};
  const messages=[{role:'system',content:policy+'\nJSON Schema:\n'+JSON.stringify(schema)},{role:'user',content:JSON.stringify(input)}];
  return {id:'mechanism-control-'+f.id,heroId:f.id,sourceSha256:f.source.hero.sourceSha256,sourceFamily:'League of Legends GGD adaptations',
    split:'engineering-control-only',messages,requestDigest:hash(JSON.stringify(messages)),target,
    compiledSha256:hash(JSON.stringify(built.compiled)),fullHeroRecipeTrainingAdmitted:false,
    directSourceLabelMasksReviewed:true,trainingMayStart:false,freshBlind:false,historicallyExposed:true,
    unresolvedSourceChoices:f.choices.filter(c=>c.affectsMechanicClassification),
    caveat:'Masking direct labels does not remove teacher-forcing context or establish whole-hero correctness. Two same-family controls cannot demonstrate generalization.'};
});
const manifest={schema:'ggd-ir4-masked-mechanism-controls@1',createdAt:new Date().toISOString(),heroes:rows.length,slots:12,
  datasetSha256:hash(JSON.stringify(rows)),responseSchemaSha256:hash(JSON.stringify(schema)),
  checkerPins:Object.fromEntries(['build-mechanism-mask-controls.mts','semantic-loss-mask.mjs','ir4-json-schema.mts','ir-v4.mts','ir4-compiler.mts','whole-plan-seeds-v1.mts'].map(f=>[f,hash(fs.readFileSync(path.join(here,f)))])),
  excludedValueCounts:rows.map(r=>({heroId:r.heroId,values:r.target.excluded.length,maskedBytes:r.target.maskedBytes,totalBytes:r.target.totalBytes})),
  nullUnknownsRemainSupervised:true,arbitraryResearchValuesDirectlySupervised:false,indirectConditioningStillPresent:true,
  trainingAdmitted:0,modelTraining:false,modelInference:false,finalBlind:false,
  nextGate:'CPU real-tokenizer span alignment and loss-mask tests, then broaden source-reviewed controls before GPU quality experiment.'};
checkEnginePins();fs.mkdirSync(out);
for(const [f,v] of Object.entries({'manifest.json':manifest,'dataset.private.json':rows,'response-schema.json':schema}))fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(manifest,null,2));
