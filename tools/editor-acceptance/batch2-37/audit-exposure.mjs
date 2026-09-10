// Snapshot a supplied inventory / training manifest without altering either.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {roster} from './roster.mjs';
assert(process.argv[2]&&process.argv[3],'Usage: node audit-exposure.mjs inventory.json frozen/examples.json');
const hash=x=>createHash('sha256').update(x).digest('hex');
const inventoryBytes=readFileSync(process.argv[2]),exampleBytes=readFileSync(process.argv[3]);
const inventory=JSON.parse(inventoryBytes),examples=JSON.parse(exampleBytes);
const normal=s=>s.normalize('NFKC').replace(/[\s·・。.-]/g,'').toLowerCase();
const groups=[...new Set(examples.map(e=>e.groupId))].sort();
const trainingNames=[...new Set(examples.map(e=>{try{return JSON.parse(e.messages.find(m=>m.role==='user').content).request?.heroName;}catch{return undefined;}}).filter(Boolean))].sort();
const result={schema:'ggd-batch2-exposure-audit@1',inventory:{sha256:hash(inventoryBytes),schema:inventory.schema,observedAt:inventory.observedAt,totalEntries:inventory.rows.length},
  frozenExamples:{sha256:hash(exampleBytes),count:examples.length,groups,heroNames:trainingNames},
  scope:'Exact and containment name screening against two supplied local snapshots, not a full alias or historical model exposure audit.',
  status:'partial-not-certified-blind',heroes:roster.map(h=>({id:h.id,name:h.name,
    exactRosterMatches:inventory.rows.filter(r=>normal(r.name)===normal(h.name)).map(r=>({id:r.id,name:r.name})),
    possibleRosterMatches:inventory.rows.filter(r=>normal(r.name).includes(normal(h.name))).map(r=>({id:r.id,name:r.name})),
    exactTrainingNameMatches:trainingNames.filter(n=>normal(n)===normal(h.name)),
    trainingMentions:examples.filter(e=>JSON.stringify(e.messages).includes(h.name)).map(e=>({id:e.id,split:e.split})),
    blindAdmission:false})),
  adjudication:[
    {name:'貓貓',possibleRosterName:'尼古貓貓',decision:'不同名單身分；子字串相同不是同角色證據。仍需別名簽核。'},
    {name:'不死',possibleRosterName:'不死之身-無 - 藤井八雲',decision:'不同作品人物；形容詞命中不是同角色證據。仍需別名簽核。'}],
  rules:['主線若更換訓練資料，必須重跑隔離檢查。','看過教師答案或用本批挑模型／改提示後，本批只能稱開發驗證。','本檔不把任何候選加入訓練，也不讀權重或執行模型。']};
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
writeFileSync(resolve(root,'docs/_reports/hero-validation-batch2-37/data/exposure-report.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({heroes:37,exactRosterMatchHeroes:result.heroes.filter(h=>h.exactRosterMatches.length).length,trainingMentionHeroes:result.heroes.filter(h=>h.trainingMentions.length).length,blindCertified:false}));
