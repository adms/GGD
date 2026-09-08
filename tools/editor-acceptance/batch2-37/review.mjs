import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {roster} from './roster.mjs';
import {reviewNotes,commonFindings} from './author-review.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const build=read('report.json'),behavior=read('behavior-report.json'),train=read('train-report.json'),pack=read('package-report.json');
for(const r of [behavior,train,pack])assert.equal(r.buildHash,hash(build),'STALE_EVIDENCE');
const reviewed={schema:'ggd-batch2-author-review@1',buildHash:hash(build),reviewType:'single-author-source-review',independentReview:false,commonFindings,heroes:[],completeGoldHeroes:0};
const md=['# 第二批 37 名英雄：逐名設計與審查','',
  '這是一次作者自審與腳本證據的索引，不是獨立人審或完整遊戲驗收。機制沿用既有積木；全部仍為代理外觀，完整黃金答案准入數為 0。',''];
for(const h of roster){
  assert(reviewNotes[h.id],`REVIEW_MISSING:${h.id}`);
  const p=read(`private/teachers/${h.id}.project.json`),d=read(`private/compiled/${h.id}.json`),b=behavior.heroes.find(x=>x.id===h.id);
  const row={id:h.id,name:h.name,sourceDesignReview:'reviewed-once',projectSha256:hash(p),compiledSha256:hash(d),note:reviewNotes[h.id],
    twoComboChecks:b.status,packageReplay:pack.heroes.find(x=>x.id===h.id).status,
    fullAcceptance:'blocked',blockers:['原作／指定本體外觀未驗證','逐名完整被動、友軍、失敗邊界與各等級效果尚未覆蓋','正式遊戲匯入與顯示未驗收','最終訓練暴露／別名隔離尚未簽核']};
  reviewed.heroes.push(row);
  md.push(`## ${h.number}. ${h.name}｜${h.origin}`,'',`${h.work}：${h.theme}。`,'',`自審：${row.note}`,'',`連招：${b.pairs.map(x=>`${x.source} → ${x.target}（${x.status}）`).join('；')}。ZIP 重播：${row.packageReplay}。`,'',
    '| 槽 | 招式 | 既有模板 | rank-1 冷卻／魔力／射程 | 既有施法提示 VFX |','|---|---|---|---|---|');
  for(const m of h.moves){const a=d.abilityDrafts[m.slot],s=p.acceptedPlan.slots[m.slot];md.push(`| ${m.slot} | ${m.name} | ${s.products[0].template.ref} | ${a.cooldown[0]} 秒／${a.manaCost[0]}／${a.range} | ${a.vfxKey??'無主動施法提示'} |`);}
  md.push('');
  for(const m of h.moves)md.push(`**${m.slot}：${m.name}**`,'',d.abilityDrafts[m.slot].description,'');
}
writeFileSync(resolve(dir,'author-review.json'),JSON.stringify(reviewed,null,2)+'\n');
writeFileSync(resolve(dir,'../英雄設計與逐名審查.md'),md.join('\n').trimEnd()+'\n');
console.log(JSON.stringify({sourceDesignReviewed:reviewed.heroes.length,completeGoldHeroes:0}));
