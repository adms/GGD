/** Conditional next-iteration curriculum. Does not alter R4 or start training.
 * Labels concern the supplied, reviewed capability cards, not arbitrary params.
 * Main diagnostic families are already exposed: no unseen-source/Gold claim.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';

// One positive and one unsupported conjunction per enabled family. Alternatives
// are intentional: geometrically/semantically interchangeable cards are not errors.
export const pairs = [
 ['proxy-cast','對鎖定的敵人造成一次傷害並減速，整段沒有移動、飛行、連擊或其他目標。',['proxy-cast'],'對鎖定敵人造成一次傷害，並同時解除該敵人身上的全部正面狀態；不能省略驅散。'],
 ['periodic-field','術者移動時，傷害區也隨他移動；每隔一段時間檢查區內敵人。甲走出不再受傷，乙後來走入開始受傷，第一段容許等待間隔。',['periodic-field'],'跟著術者的區域每隔一段時間重新選取友軍並補魔；絕不傷害任何人，而且每次新進友軍都要獲益。'],
 ['life-manipulate','自身的魔力不足時，按最大魔力的一定比例加回魔力，超過上限的部分丟棄；生命不變，也不換位置。',['life-manipulate'],'把自己的魔力上限與一名友軍的魔力上限互換，當前魔力值完全不改。'],
 ['lock-combo','一次施放後對同一敵人固定節拍多次打擊，自己可以原地固定；最後要代放一招既有技能作為結尾。',['lock-combo'],'連段每次命中都交換雙方當前魔力，而不是扣血；最後還要依交換次數永久增長敏捷。'],
 ['single-strike','不靠投射物或移動，只讓選定敵人立即承受單次傷害；不附加狀態，沒有第二段。',['single-strike','instant-blast','proxy-cast'],'選定敌人承受一次傷害後，必須立即把這一擊造成的實際傷害等額轉成施法者護盾。'],
 ['locust-line','只做美術：同時沿直線放出數個固定位置的模型，沒有飛行也沒有傷害或生命值。',['locust-line'],'沿直線放出模型，每具都必須有生命值、能自主選敵攻擊，並固定阻擋敵人的路徑。'],
 ['instant-blast','點選地面，圈中的敵人只受一次傷害；不控制、不延遲、不殘留傷害場，也沒有飛行物。',['instant-blast','ground-nova','proxy-cast','proxy-fanout'],'點選地面後，圈中的敵人只受一次傷害，並且逐一永久扣掉一級英雄等級。'],
 ['mark-stacks','持有可消耗的具名保命層數；受到致命傷消耗一層，同一格給自己無敵與回復，可把剩餘層數保留到下一回合；不要求跨新對局。',['mark-stacks'],'保命層數消耗後要寫進玩家帳號，離線再登入新開的對局也必須保留原數量。'],
 ['proxy-fanout','以指定地點為中心，圓圈內敵人各受一次傷害與減速；沒有代理單位，沒有持續場。',['proxy-fanout','proxy-cast'],'同一招在四個彼此獨立的地點同時結算圓形伤害及定身，必須是一張卡，不接受只留一個地點。'],
 ['charge-push','讓施法者衝到一個落點，抵達才傷害那裡的敵人，並把他們往落點拉；途經位置不需要傷害。',['charge-push'],'施法者衝到落點時，途中碰到的每個敵人都必須被持續拖在身邊，停下後再一同丟出去。'],
 ['line-blast','術者留在原地，一具演出模型向前運動，碰到敵人算接觸傷害，走到終點再算另一次圈傷，兩部分独立。',['line-blast'],'術者留在原地，飛行模型每格追蹤敵人的最新位置，撞牆立即反射轉向，最後還要爆炸傷害。'],
 ['blink-strike','自己直接出現在所選敵人前方，過程沒有飛行位置，出現時造成一擊；這次到達傷害不可省。',['blink-strike'],'自己與所選敵人在同一格互換座標，且兩人都不能受到附帶傷害。'],
 ['line-sweep','傷害依面向分段向前推進，每0.05秒前進一段；每段重抓附近敵人，已命中者後面不再中。',['line-sweep','traveling-wave'],'傷害逐段向前推進，同一敵人待在重疊部分時每一段都必須重新扣血，不能去重。'],
 ['radial-burst','以術者為中心向各方向同時發出多具模型，等角間隔且各自沿路碰撞傷害，允許射線之間無傷害的空白區。',['radial-burst'],'等角向外飛出的每具模型都要自帶血條、能被殺死，還要自主施放召喚者的全部技能。'],
 ['orbit-array','我明確接受把幾何陣列近似成施放當刻選到的一批敵人持續受傷；離開也照扣，之後才進來的不加入。',['orbit-array','random-barrage'],'法陣射線必須持續繞中心旋轉，每一格依真實射線位置決定命中與空隙；不可折算成圓盤或固定名單。'],
 ['on-hit-react','自己被敵人打傷後，只給剛剛的施害者一次反擊傷害，可配置觸發機率和冷卻；承受的原傷害照常保留。',['on-hit-react'],'敌人準備施放技能但尚未造成傷害前，立即反擊並取消其施法；不能等自己受傷後才觸發。'],
 ['buff-self','只讓自己的數值属性暫時增加，期間不替換外觀、不更換技能，也不生成任何實體。',['buff-self'],'暫時把自己替換成另一個英雄的外觀和整套技能，結束時完整還原原本技能冷卻。'],
 ['locust-strike','選一個地點，在該處固定播放一具美術模型的剪輯；這層沒有任何傷害、召喚或位移。',['locust-strike'],'選一個地點播放模型剪輯，同一張卡還必須復活該處所有已死亡友軍。'],
 ['leap-strike','本人原地拋物線起跳再降回起點，落地震傷周邊敵人；不是瞬間消失出現，也不要求沿路攻擊。',['leap-strike'],'把整圈友軍同時拋向所選地點，落地後逐人回滿生命；不接受只搬一人。'],
 ['locust-travel','沒有血條的單具模型沿直線飛過去，只是演出，不造成傷害也不追蹤移動目標。',['locust-travel'],'同一具模型沿預先指定的曲線繞過三個不同控制點，轉彎方向不可用直線替代。'],
 ['teleport','將所選友軍搬到自己的位置，接受短暫leap，落地不傷害、不回復；不是把友軍送往另一個任意座標。',['teleport'],'把一名友軍無視所有牆體搬到地圖任意指定座標，必須同幀到達，不能改成拉到施法者身旁。'],
 ['random-barrage','這次已批准不用逐發落點：施放時選中的圈內敵人依固定節奏掉血，後來離開仍然掉，後來進來不算。',['random-barrage','orbit-array'],'每一發都重新隨機選落點，敵人走出那一發範圍就必須躲過，後入場者也要依落點判定；不能用初始名單近似。'],
 ['locust-orb','只需在中心附近固定放一具球體模型，播完消失；沒有生命值、攻擊或移動。',['locust-orb','locust-strike'],'中心球體必須吸收進入範圍的敵方投射物，儲存後按玩家按鍵逐枚反射。'],
 ['dragon-quake','美術層需要在圓環上等分放十二具模型，全部固定不動，到壽命結束消失；沒有傷害與震動。',['dragon-quake','locust-orb'],'圓環上十二具模型要各自向心移動，碰撞後合成一個有生命值且可被選取的召喚物。'],
 ['summon-agent','用既有英雄身體生成具有生命的召喚單位，自主攻擊、到時間清除，可限制同時存在數量；不複製敵方技能。',['summon-agent'],'選取敵方英雄後，召出完全繼承該敵人所有技能及其當下冷卻的可手動操控分身。'],
 ['combo-finisher','一名敵人受到自動連擊，使用已有連段家族的時間表，每段有段號與打擊演出，收尾有閃光和震動。',['combo-finisher'],'玩家每一次即時按鍵才決定下一刀的時間與落點，不允许预排節奏，而且每刀都能獨立取消。'],
 ['traveling-wave','每隔可調時間向前推進一段圓形傷害，已命中的敵人後續段不重複扣血，終點另有一次爆炸。',['traveling-wave'],'每隔可調時間向前推進傷害波，波必須跟著選定移動敵人的新位置逐格轉向追蹤。'],
 ['ground-nova','在選定地面範圍震傷敵人一次，術者不必移到那裡；不需要暈眩、定身或持續傷害。',['ground-nova','instant-blast','proxy-cast','proxy-fanout'],'施法者腳下圓形範圍的所有隊友立即復活且回滿生命，敵人完全不受影響。'],
 ['on-attack','自己的普攻造成傷害後追加傷害，可以有條件、機率與內置冷卻；不需要等待自己被攻擊。',['on-attack'],'自己的普通攻擊命中後立即偷走敵人正在使用的技能，替換自己的Q鍵並保留對方冷卻。'],
 ['locust-swarm','幾具沒有生命的美術模型同時等角向外運動，各自是純演出，不能自動攻擊或造成傷害。',['locust-swarm'],'多具模型等角向外運動，每具都必須在被敵人攻擊三次後碎裂並使攻擊者永久失去生命上限。'],
];

export function build(review, priorCases) {
 assert.equal(review.revision,'4793eaaaf2775b2081f5eca5881db32e0aab0ea8');
 assert([30,29].includes(review.counts.enabled),'UNREVIEWED_ENABLED_COUNT');
 assert.deepEqual(review.counts,{total:46,enabled:review.counts.enabled,quarantined:35-review.counts.enabled,draft:11});
 const catalog=review.rows.filter(r=>r.status==='enabled').map(({templateId,status,description})=>({templateId,status,description}));
 const unavailable=review.rows.filter(r=>r.status!=='enabled').map(({templateId,status,issue})=>({templateId,status,issue}));
 const selectedPairs=pairs.filter(p=>catalog.some(c=>c.templateId==='tpl-'+p[0]));
 assert.deepEqual(selectedPairs.map(p=>'tpl-'+p[0]).sort(),catalog.map(c=>c.templateId).sort());
 if(review.counts.enabled===29)assert(review.rows.some(r=>r.templateId==='tpl-summon-agent'&&r.status==='quarantined'&&r.issue==='#1076'),'SUMMON_QUARANTINE_REQUIRED');
 const oldRequests=new Set(priorCases.map(c=>JSON.parse(c.messages[1].content).request).filter(Boolean));
 const cases=[];
 for(const [family,yes,alternatives,no] of selectedPairs)for(const [variant,request,ids] of [['supported',yes,alternatives],['unsupported',no,[]]]) {
  assert(!oldRequests.has(request),'EXACT_REQUEST_REUSE');
  const id=`main-candidate-${family}-${variant}`;
  const acceptedTargets=(ids.length?ids:[null]).map(x=>({decision:x?'accept':'refuse',templateId:x?'tpl-'+x:null}));
  for(const t of acceptedTargets)if(t.templateId)assert(catalog.some(c=>c.templateId===t.templateId),'UNAVAILABLE_TARGET');
  const input={task:'mechanism-template',sourceVersion:review.revision,request,catalog:catalog.slice().sort((a,b)=>digest(id+a.templateId).localeCompare(digest(id+b.templateId))),unavailable,instruction:'只使用此份版本目錄。輸出 {decision,templateId}，拒絕時 templateId=null。一張卡必須承擔全部必要條件，不自行組合、不把隔離卡當成已修好；不生成參數。'};
  const messages=[{role:'system',content:review.system},{role:'user',content:JSON.stringify(input)}];
  cases.push({id,task:'mechanism-template',split:'train',lineage:`current-main-candidate-${family}`,messages,requestDigest:digest(messages),target:acceptedTargets[0],acceptedTargets,quality:'assistant-authored-reviewed-capability-card-classification; not Owner Gold',candidateOnly:true,trainingEligible:false,reviewReason:variant==='supported'?'Full conjunction covered by supplied card; alternative IDs accepted where declared behavior overlaps.':'Required conjunction has at least one missing capability; no implicit composition or approximation.'});
 }
 assert.equal(new Set(cases.map(c=>c.requestDigest)).size,cases.length);
 return {cases,manifest:{schema:'ggd-current-main-candidate-curriculum@1',createdAt:new Date().toISOString(),reviewSha256:digest(review),casesSha256:digest(cases),count:cases.length,positive:selectedPairs.length,negative:selectedPairs.length,catalog:review.counts,candidateOnly:true,trainingStarted:false,trainingApproved:false,releaseQualified:false,ownerGold:false,scope:`Conditional classification curriculum, not source fidelity data. All ${selectedPairs.length} enabled families appear as accepted alternatives. Does not change R4.`,limitations:['Same template taxonomy and error families as exposed main diagnostic; not independent generalization evidence.','Classifies the supplied reviewed capability summaries, not every legal parameter combination.','No new full runtime validation or full original hero verification.',`${review.counts.quarantined} quarantined cards and eleven drafts stay unavailable.`,'Alternate valid templates are accepted; choosing one canonical training target does not make other accepted IDs incorrect.']}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const [reviewFile,priorFile,out]=process.argv.slice(2);assert(reviewFile&&priorFile&&out);
 assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const data=build(JSON.parse(fs.readFileSync(reviewFile)),JSON.parse(fs.readFileSync(priorFile)));
 fs.mkdirSync(out,{recursive:true});
 for(const [name,value] of [['cases.private.json',data.cases],['manifest.json',data.manifest]])fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(data.manifest));
}
