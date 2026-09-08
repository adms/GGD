/** Prospective, assistant-authored diagnostic. Not training data or Owner Gold. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';
import {revision} from './main-catalog-review.mjs';

// Reviewed against all 35 enabled main families; known broken cards unavailable.
// Whole pairs remain diagnostic-only even if future iterations use their errors.
export const scenarios=[
 ['blink-attack','自己沒有中途位置地瞬移到選定敵人前方，再造成一次抵達傷害；不是純位移。',['blink-strike']],
 ['blink-no-damage','自己同幀瞬移到任意指定地點，嚴禁任何附帶傷害，也不接受 leap 飛行。',[]],
 ['real-clones','召出兩具自己的分身，有自己的生命且會自動攻擊；主人死亡時可以消失。',['summon-agent']],
 ['enemy-copy','召喚分身時必須把所選敵人的完整技能組複製到自己的分身，不能改成施法者自己的身體。',[]],
 ['point-periodic','留下一個固定圓形傷害區，每秒重新判定圈內敵人，後來走進來也會中、離開就不再中。',['periodic-field']],
 ['caster-periodic','傷害圓跟著施法者走，每個間隔重新取圈內敵人，不綁初始名單。',['periodic-field']],
 ['periodic-heal','圓圈跟著施法者走，每秒回復所有圈內友軍生命及魔力，沒有傷害，不能只補單人。',[]],
 ['single-stat-growth','自己每八次擊殺獲得一點永久敏捷，可設基本敏捷上限；不增加其他兩圍。',['growth-charge']],
 ['triple-stat-growth','每八次擊殺，同一次觸發同時增加力量、敏捷、智慧三者，必須單張卡完整做到。',[]],
 ['damage-growth','每受到八次傷害就永久增加敏捷；擊殺次數不能替代受傷次數。',[]],
 ['self-restore-add','立即給自己回復最大生命的一半，採相加後不超過上限；不是把生命設成一半。',['life-manipulate']],
 ['friend-restore','指定一名友軍，立即回復生命及魔力，依各自最大值比例相加封頂，不移動對方。',['life-manipulate']],
 ['restore-set','無論目前生命是兩成或八成，都要直接設定成五成；不是加上半條最大生命。',[]],
 ['swap-life','把施法者與所選敵人的當前生命直接交換，不是回血或造成傷害。',[]],
 ['drain-recipient','敵人持續失去生命，施法者獲得回血；不能把回血給敵人。單張目前可用卡完整完成。',[]],
 ['leech-per-tick','每一跳敵人實際損失多少生命，施法者就回復相同生命；不接受固定一次回血。',[]],
 ['segmented-sweep','沿面向每0.05秒前進一段，每段重算那一圈敵人，整串每人只扣血一次，無終點追加爆炸。',['line-sweep','traveling-wave']],
 ['wave-terminal','分段前進的傷害波，前進中每人只中一次，最後另一次終點範圍爆炸；允許兩段分開算。',['traveling-wave']],
 ['sweep-repeat','沿面向逐段推進，站在重疊區的同一個敵人必須每段都再受傷；不能整串每人只中一次。',[]],
 ['sweep-instant','全線分段在同一個模擬幀全部判定，嚴禁逐段等待或物體飛行。',[]],
 ['moving-model-burst','一具模型沿面向飛出去，擦到敵人造成傷害，到達終點再爆炸傷害；本人不動。',['line-blast']],
 ['radial-damage','從身邊同時向外推出多道等角模型射線，各自有接觸傷害，射線間能有空隙，不能折成整片圓盤。',['radial-burst']],
 ['summon-vs-model','那些龍頭要有獨立生命、能被選取且自主攻擊，可以用已存在的英雄身體，不是只有會飛的美術模型。',['summon-agent']],
 ['model-homing','飛出去的模型必須每個 tick 修正方向追蹤移動中的敵人，不能只瞄施放當時的位置。',[]],
 ['combo-family','對一名敌人自動連段再重招收尾，節奏使用已有家族班表，每一段要附段號文字與打擊效果，收尾閃光震動。',['combo-finisher']],
 ['combo-player-input','每一刀何時出手由玩家當下按鍵決定，不能使用預先排好的班表或等間隔連擊。',[]],
 ['combo-finisher-ref','鎖定一人等間隔連击，人物可以原地被固定，最後必須引用並代放某個既有具名技能。',['lock-combo']],
 ['mark-delay','致命傷時扣一層具名保命符文，先完整無敵兩秒，兩秒過後才回血並擊退；不可同格發生。',[]],
 ['mark-immediate','具名保命層數可跨回合保留，致命傷消耗後同格無敵、回血、推退；同格處理是已批准的設計。',['mark-stacks']],
 ['rally-heal','把一個遠方友軍拉到自己腳邊並回滿生命及魔力，必須同一張卡，不能只位移或只回血。',[]],
 ['rally-only','把選定友軍移到施法者腳邊，不要治療或傷害，允許短 leap 而非真瞬移。',['teleport']],
 ['attack-direction','自己的普攻打到敵人後追加一次傷害；不是別人打到自己。',['on-attack']],
 ['react-direction','別人打傷自己後，只對這次傷害來源反擊一次，沒有其他連段和延遲收尾。',['on-hit-react']],
 ['plain-hit','站著不動，立即對選定敵人打一發，沒有狀態、位移、飛行或後續效果。',['single-strike','instant-blast','proxy-cast']],
 ['root-circle','在指定地點一圈敵人各受一次傷害並被定身，不要持續跳傷或召喚。',['proxy-cast','proxy-fanout']],
 ['friendly-group','指定地點讓所有圈內友軍立即回血，敵人不被治療或傷害，不能改單體。',[]],
 ['charge-end','本人直線衝至落點，到達才傷害並推開那裡的敵人，不打沿路。',['charge-push']],
 ['vertical-jump','自己原地垂直跳起後落回原座標，落地才震傷附近敵人，没有水平移動。',['leap-strike']],
 ['self-stat-only','只給自己暫時的數值屬性增益，不改外型、技能、生命或魔力。',['buff-self']],
 ['roster-approved','需求已明確批准近似：只對施放那刻圈中的敵人持續扣血，離開仍會扣，後進者不算。',['random-barrage','orbit-array']],
];

export function buildMainBenchmark(review){
 assert.equal(review.revision,revision);assert.equal(review.releaseQualified,false);assert.equal(scenarios.length,40);
 const catalog=review.rows.filter(r=>r.status==='enabled').map(({templateId,status,description})=>({templateId,status,description}));
 const unavailable=review.rows.filter(r=>r.status!=='enabled').map(({templateId,status,issue})=>({templateId,status,issue}));
 const cases=scenarios.map(([slug,request,ids])=>{
  const acceptedTargets=(ids.length?ids:[null]).map(id=>({decision:id?'accept':'refuse',templateId:id?'tpl-'+id:null}));
  for(const target of acceptedTargets)if(target.templateId)assert(catalog.some(c=>c.templateId===target.templateId),'UNAVAILABLE_TARGET');
  const id='main-diagnostic-'+slug;
  const messages=[{role:'system',content:review.system},{role:'user',content:JSON.stringify({task:'mechanism-template',sourceVersion:revision,request:mechanicsText(request),catalog:catalog.slice().sort((a,b)=>digest(id+a.templateId).localeCompare(digest(id+b.templateId))),unavailable,instruction:'只使用本次版本目錄，歷史版本記憶不能蓋過它。輸出 {decision,templateId}；拒絕為 {"decision":"refuse","templateId":null}。不可新增效果、改遊戲程式或把隔離卡當成已修好。'})}];
  return {id,task:'mechanism-template',split:'dev',lineage:'prospective-main-'+slug,messages,requestDigest:digest(messages),target:acceptedTargets[0],acceptedTargets,quality:'assistant-authored-personally-reviewed-prospective-diagnostic',trainingEligible:false,releaseGold:false};
 });
 assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 return {cases,manifest:{revision,catalogReviewSha256:digest(review),casesSha256:digest(cases),count:cases.length,trainingEligible:false,sealedTest:false,releaseQualified:false,purpose:'prospective main-catalog version adaptation; paired model comparison only, never substituted for historical R3 sealed test or full hero fidelity'}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [reviewFile,out]=process.argv.slice(2);assert(reviewFile&&out);assert(!fs.existsSync(out),'REFUSE_OVERWRITE_DIRECTORY');
 const data=buildMainBenchmark(JSON.parse(fs.readFileSync(reviewFile)));fs.mkdirSync(out,{recursive:true});
 for(const [name,value] of [['cases.private.json',data.cases],['manifest.json',data.manifest],['requests.json',data.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest}))]])fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(data.manifest));
}
