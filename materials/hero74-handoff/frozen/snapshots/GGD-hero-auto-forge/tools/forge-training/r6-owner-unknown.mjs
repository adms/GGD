/** One additional unknown claim for each of the 54 TRAIN-only Owner sources.
 * Full originals were reread; no test source, external canon or runtime fill-in.
 */
import assert from 'node:assert/strict';
import {digest,mechanicsText} from './dataset.mjs';
export const claims=[
 ['e002.e','光束的飛行速度固定為每秒十四距離。','14是施法距離，未提供光束速度。'],
 ['e002.ex','七次斬擊中每兩次相隔零點五秒。','只給次數與倍率，沒有兩擊間隔。'],
 ['e002.passive','格擋成功後會回復消耗掉的魔力。','魔法格擋不證明另有回魔事件；台詞不是機制。'],
 ['e002.q','成功迴避物理攻擊後會偷取攻擊者的魔力。','只說迴避機率，不能以台詞推論偷魔。'],
 ['e002.r','反彈可以命中距離施法者六以內的所有敵人。','反彈時限與倍率明確，範圍與全體受擊未交代。'],
 ['e002.w','風王鐵槌的圓形有效半徑精確為五。','前方圓形傷害有說，沒有半徑數值。'],
 ['e00w.e','飛行狀態讓剎那的移動速度增加60%。','60等數列屬於攻擊速度，移速幅度未說明。'],
 ['e00w.ex','裝備御雷劍同時增加剎那的最大生命。','機率與飛行持續時間不證明最大生命提升。'],
 ['e00w.passive','這次拋摔把敵人移動到剎那背後六距離。','描述旋轉拋摔，但未給落點與距離。'],
 ['e00w.q','旋風必定將每名敵人擊退六距離。','6是有效半徑；擊退只寫一段距離。'],
 ['e00w.r','雷光斬擊的傷害範圍半徑固定為十一。','11是施法距離，小範圍未定量。'],
 ['e00w.w','這次落雷只會命中已被普通攻擊鎖定的單一敵人。','正文有範圍敌方但未排除範圍內其他敵人？此命題把範圍縮成單一有歧義，改由建置守衛禁止。'],
 ['edem.e','衝刺過程中施法者完全免疫傷害。','高速衝刺與沿途傷害不建立無敵。'],
 ['edem.ex','每次燃燒傷害都能暴擊。','週期傷害與狀態明確，暴擊能力未交代。'],
 ['edem.passive','反彈的傷害倍率等於原傷害的兩倍。','只給20%機率，沒有反彈倍率。'],
 ['edem.q','火焰命中後的第一次燃燒必須等一秒才發生。','每秒頻率與三秒持續不明示第一跳時刻。'],
 ['edem.r','麒麟觸發會消耗並移除敵人的燃燒標記。','燃燒為觸發条件，未明說消耗。'],
 ['edem.w','攻速與移速減益可被友方驅散技能解除。','效果數值與時間有寫，可驅散性沒寫。'],
 ['efur.e','龍形衝擊波會讓施法者向前衝刺。','衝刺只在被剔除台詞，不在正文機制。'],
 ['efur.ex','觸發額外心臟傷害後會清除敵人的致盲。','致盲是條件，不等於被消耗。'],
 ['efur.passive','四種強化在死亡復活後會從法術強度重新開始輪替。','有輪替順序，沒有死亡後的索引重置規則。'],
 ['efur.q','瞬移完成時會回復施法者的生命。','位移與致盲明寫，回復未提供。'],
 ['efur.r','每顆流星的小範圍半徑固定為二十四。','24為整體有效半徑；每顆小範圍半徑未明示。'],
 ['efur.w','擊退過程撞牆會暈眩敵人。','6距離擊退明寫，撞牆後續未知。'],
 ['emfr.e','爆炎標記維持十二秒後才自然消失。','12秒是變身時長，沒有給標記的獨立時長。'],
 ['emfr.ex','歸零後的AP加成會轉成永久的最大魔力。','短暫AP歸零不交代額外永久轉換。'],
 ['emfr.passive','魔力耗盡時生命再生會自動停止。','每秒回復與燒魔已寫，零魔時行为未寫。'],
 ['emfr.q','緩慢會讓敵人的移速減少50%。','只寫緩慢移速及一秒，未給百分比。'],
 ['emfr.r','多次施法可以儲存多層待觸發的雷神一擊。','施法後下一次普攻触發，不明示多層儲存規則。'],
 ['emfr.w','變身狀態在死亡後仍會保留剩餘持續時間。','不可疊加與12秒不交代跨死亡保留。'],
 ['h01u.e','沒有破甲的敵人也必定承受額外100%AP傷害。','破甲是已給充分條件，未明示其他情形必定發生或禁止。'],
 ['h01u.ex','提升至10的攻速上限會在八秒後恢復。','被動未給八秒；不借其他技能持續時間。'],
 ['h01u.passive','擊殺獲得的攻擊距離會在新的獨立對戰中繼承。','永久成長未定義帳號或跨獨立對戰持久化。'],
 ['h01u.q','普攻攻速疊加的最大層數為十。','每次10%不是十層上限，未給最大層數。'],
 ['h01u.r','攻擊與受傷兩個觸發共用同一個內部冷卻。','兩類事件20%有說，但冷卻共享關係未說。'],
 ['h01u.w','破甲會將敵人的防禦降低到原本一半。','持續一秒明寫，破甲幅度未寫。'],
 ['h02k.e','加攻速與自爆兩個機率共用同一次隨機抽籤。','4%與2%未說是否互斥或共享抽籤。'],
 ['h02k.ex','目標同時致盲與混亂時，其死亡機率必定是5/6。','兩個獨立條件的數值，不給同時成立時的合併規則。'],
 ['h02k.passive','燃燒每一跳按照敵人的最大生命計算。','1%生命未交代最大／當前基準，亦未給每跳間隔。'],
 ['h02k.q','敵人沒有燃燒時，也必定被額外致盲五秒。','有燃燒的充分條件不能推導無條件保證。'],
 ['h02k.r','抓取敵人時會將其放在熊貓身後。','抓取過來沒有明確落點在身後。'],
 ['h02k.w','癱瘓和詛咒的持續時間都精確為十秒。','10秒属于有條件混亂，不是癱瘓／詛咒時長。'],
 ['h02v.e','消化液會在受傷後立刻結算第一筆傷害。','每秒與三秒不明示首跳即時。'],
 ['h02v.ex','2%最大生命傷害以施法者自身最大生命為基準。','沒有把敵人／自身的基準持有者明確寫出，不猜。'],
 ['h02v.passive','敵人致盲之後，其普通攻擊必定全部落空。','有致盲標記與六秒，未給命中規則數值。'],
 ['h02v.q','每秒生命回復以草泥馬的最大生命計算。','1/2/3/4%生命未給最大／現存基準。'],
 ['h02v.r','緩慢效果會把移動速度降低50%。','狀態與六秒有寫，緩慢幅度未知。'],
 ['h02v.w','自己生命門檻的30%以最大生命為分母。','未明示百分比基準，不能借常見慣例補全。'],
 ['hapm.e','麻痺會完全禁止敵人施放技能。','只給狀態名與時間，沒給麻痺的全部能力限制。'],
 ['hapm.ex','連續九次斬擊期間敵人不可移動。','沒有寫束縛／不可移動，不由連斬名稱推論。'],
 ['hapm.passive','初始十二層試煉會在每個新帳號登入時恢復。','跨回合明示，但帳號登入及恢復規則未知。'],
 ['hapm.q','每次延長狂怒都使六十秒技能冷卻一起延長兩秒。','延長的是狀態時間，不交代冷卻同步變動。'],
 ['hapm.r','衝刺會使沿途經過的每個敵人都受到傷害。','只寫衝刺後周圍一擊，沿途傷害未說明。'],
 ['hapm.w','被拋出的主目標在撞到牆時會反彈回施法者。','抓回拋出與直線傷害不建立撞牆反彈。'],
];
// Remove a known ambiguous draft before exporting any training data; preserve
// its review reason above as an explicit curation decision, not a model label.
const replacement=['e00w.w','落雷範圍的有效半徑明確為六。','只說範圍內敵方，没有給落雷半徑。'];
export function buildUnknown(original,snapshot){
 const train=original.filter(c=>c.task==='owner-mechanism'&&c.split==='train'),ids=[...new Set(train.map(c=>c.sourceId))];
 assert.equal(ids.length,54);assert.deepEqual(claims.map(([id])=>'godie-'+id).sort(),ids.sort());
 const cases=[],review=[];
 for(const draft of claims){const [short,claim,reason]=draft[0]===replacement[0]?replacement:draft,id='godie-'+short,parent=train.find(c=>c.sourceId===id),source=snapshot.sources.find(s=>s.id===id);
  assert(!original.some(c=>c.sourceId===id&&c.split!=='train'),'SOURCE_SPLIT_LEAK');
  const input=JSON.parse(parent.messages[1].content);assert.equal(input.source.text,mechanicsText(source.ownerOriginal));assert.equal(input.source.snapshot,digest(source.ownerOriginal));
  assert(!original.some(c=>c.sourceId===id&&JSON.parse(c.messages[1].content).claim?.replace(/\s/g,'')===claim.replace(/\s/g,'')),'EXISTING_CLAIM');
  const messages=[structuredClone(parent.messages[0]),{role:'user',content:JSON.stringify({...input,claim})}],target={verdict:'not-stated'};
  const c={...parent,id:'r6-owner-unknown-'+short,messages,requestDigest:digest(messages),target,acceptedTargets:[target],reviewReason:reason,cohort:'train-source-missing-information',quality:'personally-reviewed-historical-owner-not-human-gold'};cases.push(c);
  review.push({id:c.id,sourceId:id,sourceOriginal:source.ownerOriginal,claim,target,reason,fullSourcePersonallyRead:true,claimPersonallyReviewed:true,rejectedAmbiguousDraft:draft[0]===replacement[0]?draft:null});
 }
 return{cases,review};
}
