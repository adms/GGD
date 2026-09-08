import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {roster} from './roster.mjs';
import {inspectDiversity} from './diversity.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const tables={templates:{},effects:{},hooks:{},conditions:{},statuses:{},roles:{},targets:{},timing:{},vfx:{}};
const add=(table,key,id)=>{if(key===undefined||key===null)return;const row=tables[table][key]??={occurrences:0,heroes:new Set()};row.occurrences++;row.heroes.add(id);};
let multiCardSlots=0;
const heroes=roster.map(h=>{
 const draft=read(`private/compiled/${h.id}.json`),project=read(`private/teachers/${h.id}.project.json`);
 add('roles',h.origin,h.id);
 const walk=(x,condition=false)=>{
  if(!x||typeof x!=='object')return;
  if(x.kind)add(condition?'conditions':'effects',x.kind,h.id);
  if(x.on)add('hooks',x.on,h.id);
  if(x.statusId)add('statuses',x.statusId,h.id);
  for(const k of ['shape','side','applyTo','who','to','anchor','targetMode'])if(typeof x[k]==='string')add('targets',`${k}:${x[k]}`,h.id);
  for(const k of ['delaySec','duration','durationSec','intervalSec','internalCooldown','count'])if(typeof x[k]==='number')add('timing',`${k}:${x[k]}`,h.id);
  for(const [k,v] of Object.entries(x))walk(v,condition||k==='condition');
 };
 for(const [slot,a] of Object.entries(draft.abilityDrafts)){
  const ps=project.acceptedPlan.slots[slot].products;
  if(ps.length>1)multiCardSlots++;
  for(const p of ps)add('templates',p.template.ref,h.id);
  add('targets',`cast:${a.castType}/${a.targetsEnemies?'enemies':'allies-or-self'}`,h.id);
  walk(a.effects);walk(a.passive);
  for(const key of new Set([a.vfxKey,...(a.vfxLayers??[]).map(x=>x.vfxKey)].filter(Boolean)))add('vfx',key,h.id);
 }
 return {...h,draft};
});
const coverage=Object.fromEntries(Object.entries(tables).map(([name,t])=>[name,Object.entries(t).map(([key,r])=>({key,occurrences:r.occurrences,heroCount:r.heroes.size,heroes:[...r.heroes].sort()})).sort((a,b)=>b.heroCount-a.heroCount||a.key.localeCompare(b.key))]));
const semantic=JSON.parse(readFileSync(resolve(root,'tools/editor-acceptance/batch2-37/similarity-review.json'),'utf8'));
const result={...inspectDiversity(heroes),schema:'ggd-batch2-diversity-report@2',buildHash:sha(read('report.json')),coverage,multiCardSlots,
 semanticReview:semantic,uniqueSignatureCount:null,
 interpretation:'結構診斷不是玩法數。相似例外保留原分類，不以改名、VFX或數值冒稱新創意；逐名最接近者差異與逐對例外共同審查。'};
writeFileSync(resolve(dir,'diversity-report.json'),JSON.stringify(result,null,2)+'\n');
const md=['# 37 名招牌玩法與相似例外','',result.interpretation,'',
 '| # | 英雄／定位 | 招牌與可執行笑點 | 最接近者與實質差異 | 兩條因果測量 |','|---|---|---|---|---|'];
for(const h of roster)md.push(`| ${h.number} | ${h.name}／${h.origin} | ${h.signature} | ${roster.find(x=>x.id===h.closest)?.name}：${h.difference} | ${h.combos.map(c=>`${c.sourceActor??'caster'}.${c.source} → ${c.targetActor??'caster'}.${c.target}，${c.metric.actor}.${c.metric.field}`).join('；')} |`);
md.push('','## 明列接受的相似例外','');
for(const pair of semantic.pairs)md.push(`### ${pair.heroes.map(id=>roster.find(h=>h.id===id).name).join('／')}`,'',`分類：${pair.classification}。共同機制：${pair.shared}`,'',`角色契合與實際笑點：${pair.fitAndJoke}`,'',`仍有差異：${pair.difference}`,'',`保留的相似性：${pair.residual}`,'');
md.push('## 編譯產物覆蓋','',`結構診斷：整套完全相同 ${result.exactDuplicateKitPairs.length} 對、Jaccard ≥ 0.7 的整套近似 ${result.nearDuplicateKitPairs.length} 對；${result.distinctNormalizedAbilities} 種正規化技能形狀，最常共用技能形狀涵蓋 ${result.mostSharedAbilityHeroCount} 名。這些不是獨創玩法或好玩證明。`,'',`多卡槽 ${multiCardSlots}／222。完整頻率與英雄 ID 見 data/diversity-report.json。`,'');
for(const [name,rows] of Object.entries(coverage))md.push(`- ${name}：${rows.length} 類；最多共用 ${rows[0]?.heroCount??0}／37（${rows[0]?.key??'無'}）。`);
writeFileSync(resolve(dir,'../特色差異矩陣.md'),md.join('\n')+'\n');
console.log(JSON.stringify({exactPairs:result.exactDuplicateKitPairs.length,nearPairs:result.nearDuplicateKitPairs.length,reviewedExceptions:semantic.pairs.length,coverage:Object.fromEntries(Object.entries(coverage).map(([k,v])=>[k,v.length])),multiCardSlots}));
