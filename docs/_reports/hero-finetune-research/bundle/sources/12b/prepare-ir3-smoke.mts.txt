import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { shortContract, sourceReferences } from './ir-v3.mts';
import { hash } from './ir-compiler.mts';
const here = path.dirname(fileURLToPath(import.meta.url)), out = path.resolve(process.argv[2]);
assert.equal(path.dirname(out), here); assert(!fs.existsSync(out));
const base = path.join(here, 'ir2-jsonschema-smoke-v1');
const prior = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
const previous = JSON.parse(fs.readFileSync(path.join(base, 'requests.json'), 'utf8'));
const system = `依完整 GGD 改編原文輸出六槽機制計畫，不借用同名角色其他版本。只輸出一個 JSON，不要推理或 Markdown。
輸出格式是 hero-mechanism-plan@3，根欄位只准 schema,hero,relations,slots。依 contract 的型別與欄位；所有物件嚴格，不可自造欄位或 op。
可選的 nullable 欄位沒指定就由 script 填 null；不是字串 "null"。機制需要的非optional數值／方向／分支必須明寫。未知數值不可猜成原文事實。mechanismGaps 只列未能完整表達的機制，不把可留null的數值當缺機制。
identityRefs 與 relations.ref 選 sourceReferences 中的行ID；不要抄引文。每個action不寫evidence，由script附原槽全文作來源背景，這不會替你修正機制。
完整涵蓋每槽的目標、觸發、時序、資源、條件與跨槽關係。relations 不需要為每個技能創造被動到技能的獨立關係，只寫原文明示的關係。
PASSIVE用passive；自身護盾／增益用self；單體dot與control、chain、projectile、status_branch用targeted；落點leap與barrage用ground；area_pulses可用ground(point)或self(caster)。
單體持續傷害是dot；固定地面區域按時間重新判定敵人是area_pulses，不要互換。先移動再傷害與推移需要完整動作，不可只留下knockback；未說擊退的跳躍不能擅自加pushOnLand。
投射物命中效果放projectile.onHit；施放自傷是spend_health。status_branch.present是有該狀態時，missing是沒有時，兩支非空；消耗來源與效果方向不可反轉。
originBasis只有原文明示出身職業才source，否則proposal。字串陣列寫陣列。特效及細部參數不在這次模型输出範圍。
這是草稿生成，不得因schema可解析就聲稱原意或引擎完整支援。`;
const requests = previous.map((r: any) => {
  const source = JSON.parse(r.messages[1].content).source;
  const messages = [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({
    source, sourceReferences: sourceReferences(source), contract: shortContract() }) }];
  return { id: r.id, messages, requestDigest: hash(JSON.stringify(messages)) };
});
const checkerFiles = ['ir-v3.mts', 'ir-v2.mts', 'semantic-ir.mts', 'ir-compiler.mts', 'ir-behavior.mts',
  'source-negative-probes.mts', 'probe-harness.mts', 'normalize.mjs', 'intake.mjs', 'evaluate-ir3.mts'];
const execution = Object.fromEntries(['seed','thinking','temperature','maxTokens','maxPromptTokens','maxContextTokens',
  'prefillStepSize','repairAttempts','quantization','model','revision','modelDirectory','metalLimitGiB','caseSeconds',
  'workerMinutes','loadSeconds','guard'].map(k => [k, prior[k]]));
const protocol = { ...execution, schema: 'ggd-hero12b-short-mechanism-protocol@1', createdAt: new Date().toISOString(),
  selected: requests.map((r: any) => r.id), heroCount: requests.length, requestSha256: hash(JSON.stringify(requests)),
  checkerFiles, checkerPins: Object.fromEntries(checkerFiles.map(f => [f, hash(fs.readFileSync(path.join(here, f)))])),
  generatorSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  purpose: 'new short IR3 system baseline, NOT finetune gain; all19 operation families and six slots retained',
  engineSnapshot: 'current-engine-v1', frozenEngineCopy: 'isolated-engine-v1',
  notTraining: true, notBlind: true, canPromoteModel: false, releaseQualified: false,
  predeclaredMetrics: ['all4 accounting','strict final JSON','IR3 and unchanged IR2 semantics','frozen-engine compile',
    'same partial probes plus pre-frozen negative controls','manual full-source review'],
  limitations: ['No independent final holdout', 'Whole-slot provenance is not evidence of entailment',
    'Input contract and prompt changed together; no pure serialization or LoRA causal claim',
    'Compile/probe success is not whole-hero qualification'] };
fs.mkdirSync(out);
for (const [f,v] of Object.entries({ 'manifest.json': protocol, 'requests.json': requests }))
  fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({ heroes: protocol.heroCount, requestSha256: protocol.requestSha256,
  requestCharacters: requests.map((r: any) => r.messages.reduce((n: number,m: any)=>n+m.content.length,0)) },null,2));
