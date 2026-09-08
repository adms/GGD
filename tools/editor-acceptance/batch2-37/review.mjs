import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {roster} from './roster.mjs';
import {reviewReceipts,commonFindings} from './author-review.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const build=read('report.json'),behavior=read('behavior-report.json'),train=read('train-report.json'),pack=read('package-report.json'),special=read('special-report.json'),diversity=read('diversity-report.json'),partition=read('partition-report.json');
for(const r of [behavior,train,pack,special,diversity,partition])assert.equal(r.buildHash,hash(build),'STALE_EVIDENCE');
const identities=JSON.parse(readFileSync(resolve(root,'tools/editor-acceptance/batch2-37/identity-sources.json'),'utf8'));
const reviewed={schema:'ggd-batch2-author-review@2',buildHash:hash(build),reviewType:'two-agent-authored-slot-source-review',independentHumanReview:false,commonFindings,heroes:[],legalityHeroes:0,behaviorHeroes:0,reviewedSlots:0,scopedReferenceHeroes:0,completeGoldHeroes:0,blindCertifiedHeroes:0,trainEligible:false};
const md=['# 第二批37名英雄：逐名逐槽複核','',...commonFindings.map(x=>`- ${x}`),'',
 '此表是代理作者的具體審查與機械證據索引。全部正文與逐槽參數均在下方；37名玩法差異及接受的相似例外見「特色差異矩陣.md」。',''];
assert.equal(reviewReceipts.length,37);assert.equal(new Set(reviewReceipts.map(x=>x.id)).size,37);
for(const h of roster){
 const p=read(`private/teachers/${h.id}.project.json`),d=read(`private/compiled/${h.id}.json`),b=behavior.heroes.find(x=>x.id===h.id),receipt=reviewReceipts.find(x=>x.id===h.id),identity=identities.heroes.find(x=>x.id===h.id);
 assert(receipt,`REVIEW_MISSING:${h.id}`);assert.equal(receipt.projectSha256,hash(p),`MANUAL_PROJECT_REVIEW_STALE:${h.id}`);assert.equal(receipt.compiledSha256,hash(d),`MANUAL_COMPILED_REVIEW_STALE:${h.id}`);
 for(const m of h.moves)assert(typeof receipt.slots[m.slot]==='string'&&receipt.slots[m.slot].length>15,`SLOT_REVIEW_MISSING:${h.id}.${m.slot}`);
 const br=build.heroes.find(x=>x.id===h.id),pr=pack.heroes.find(x=>x.id===h.id);
 const legality=br.schema&&br.compile&&br.basicKit,behaviorOK=b.status==='passed';
 const scoped=legality&&behaviorOK&&pr.status==='passed'&&special.status==='passed'&&train.status==='passed';
 const row={id:h.id,name:h.name,projectSha256:hash(p),compiledSha256:hash(d),identity,review:receipt,
  admission:{legal:legality,behavior:behaviorOK,agentSemanticReview:true,diversity:'reviewed-with-explicit-similar-exceptions',offlinePackage:pr.status==='passed',scopedDevelopmentReference:scoped,completeLiveHero:false,blindEvaluation:false,trainEligible:false},
  limits:[...(h.limitations??[]),...(receipt.limitations??[]),'rank1因果與到期/特別邊界有證據；未窮舉所有等級、所有英雄交互與競技平衡。','正式遊戲匯入、渲染、操作與碰撞未驗收。',...(h.id==='b2-kisaragi'?['真電車模型已驗；細長車體仍用既有0.6碰撞半徑，需遊戲視覺對位審查。']:['本體使用已核准代理；原作角色外觀尚未完成。']),'沒有完整歷史訓練資料/所有別名暴露簽核，因此不授予嚴格盲測資格。']};
 reviewed.heroes.push(row);reviewed.legalityHeroes+=+legality;reviewed.behaviorHeroes+=+behaviorOK;reviewed.scopedReferenceHeroes+=+scoped;reviewed.reviewedSlots+=h.moves.length;
 md.push(`## ${h.number}. ${h.name}｜${h.origin}`,'',`${h.work}：${h.theme}。`,'',`來源身分：${identity.originalIdentityFinding}；版本：${identity.versionScope}。${identity.ggdAdaptationBoundary}`,'',identity.sources.map(s=>`[${s.title}](${s.url})`).join('；'),'',`招牌：${h.signature}`,'',`最接近者：${h.difference}`,'',`因果：${b.pairs.map(x=>`${x.source} → ${x.target}，${x.metric.actor}.${x.metric.field}，差中差 ${x.interaction}（${x.status}）`).join('；')}。`,'',
  '| 槽 | 招式與模板 | 冷卻／魔力／射程 rank1 | 逐槽審查 |','|---|---|---|---|');
 for(const m of h.moves){const a=d.abilityDrafts[m.slot],s=p.acceptedPlan.slots[m.slot];md.push(`| ${m.slot} | ${m.name}；${s.products.map(x=>x.template.ref).join(' + ')} | ${a.cooldown[0]}秒／${a.manaCost[0]}／${a.range} | ${receipt.slots[m.slot]} |`);}
 md.push('');for(const m of h.moves)md.push(`**${m.slot}：${m.name}**`,'',d.abilityDrafts[m.slot].description,'');
 md.push(`限制：${row.limits.join('；')}`,'');
}
writeFileSync(resolve(dir,'author-review.json'),JSON.stringify(reviewed,null,2)+'\n');
writeFileSync(resolve(dir,'../英雄設計與逐名審查.md'),md.join('\n').trimEnd()+'\n');
writeFileSync(resolve(dir,'ACTIVE.json'),JSON.stringify({schema:'ggd-batch2-active@2',version:2,buildHash:hash(build),supersedes:{commit:'d374865c1',version:1,status:'rejected'},entrypoint:'node tools/editor-acceptance/batch2-37/run.mjs',admissionReport:'author-review.json',publicModelInputOnly:'public',privateTeacherRoot:'private',trainEligible:false},null,2)+'\n');
console.log(JSON.stringify({heroes:reviewed.scopedReferenceHeroes,slots:reviewed.reviewedSlots,completeLiveHeroes:0,blindCertifiedHeroes:0,trainEligible:false}));
