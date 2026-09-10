// Independent authored kits 19–36. These helpers only compose shipped templates.
import {clone,tier,dmg,heal,mana,shield,status,has,recent,low,distance,when,buff,consume,cd,cleanse,push,blink,dot,delayed,aoe,summon,evasion,hook,card,seq,move,passive,strike,self,ally,ground,healing,nova,line,mobility,form,edge,kit} from './kit.mjs';
const named=(name,m)=>({...m,name});
const injury=p=>({kind:'spendHealth',amount:{flat:0},pctMaxHealth:p,minimumHp:1});
const debit=(p,extra={})=>({kind:'spendMana',amount:{flat:0},pctCurrentMana:p,applyTo:'self',...extra});
const manaWall=(durationSec=3,who='self')=>({kind:'manaBarrier',shape:'single',who,perMana:2,damageTypes:['physical','magic'],durationSec,minManaReserve:10});
const silence=()=>status('magic-break',{silenced:true},2.5);
const root=()=>status('root',{root:true},2.5);
const attackEdge=(source,remove,extra={})=>edge(source,'ATTACK','foe','hp',remove,{expect:'decrease',observeSec:1.2,...extra});
const finite='所有招式名稱與喜劇因果均為 GGD 改編；原作能力不等於此處數值或競技規則。';

function designsBInner(hero,presets){
 switch(hero.id){
 case 'b2-guts': return kit('先支付生命開加班增益，以普攻清運；低血時才能領工傷回復。','b2-elma','凱茲用自損換持續攻擊，再自行恢復；艾爾瑪以低血閾值與承傷保固為核心。',{
  PASSIVE:named('工傷先別打卡',passive('自身生命低於一半時，普通攻擊額外造成極小物理傷害；每 2 秒最多一次。',[hook('onBasicAttack',[when(dmg('極小',{damageType:'physical'}),low())],{target:'event'})])),
  Q:named('這把劍不進垃圾車',line('沿面向斬出直線物理清運波，打擊線上的敵人。',{damageType:'physical'})),
  W:named('自願加班同意書',self('支付最大生命 18%（保留至少 1 HP），攻擊力增加 90，持續 4 秒。',[injury(.18),buff('ad',90,4)])),
  E:named('工傷才能領補助',self('只在生命低於一半時回復自身 160 生命；高血量時不發補助。',[when(heal(160,'self'),low())],'fx.prim.wind.pulse-sm')),
  R:named('大型垃圾整排清運',move('向前低弧衝撞，落地時對落點周圍敵人造成物理傷害並推開；不是沿途連續碰撞。',card('tpl-charge-push',{dashDistance:220,dashDurationSec:.4,radius:100,damage:tier('中'),damageType:'physical',pushDistance:160,castTimeSec:.1}),'fx.prim.arcane.dash')),
  EX:named('安全帽只保護額頭',self('取得 180 點全傷害護盾 3 秒；不抵銷已支付的生命。',[shield(180,3)]))
 },[attackEdge('W',{slot:'W',kind:'applyBuff',stat:'ad'}),edge('W','E','caster','hp',{slot:'E',kind:'heal',conditionalOnly:true},{setup:{caster:{hpPct:.6}},note:'先從 60% 血支付 18% 最大生命，再確認低血補助；沒有 W 時 E 無效。'})],[finite,'狂戰是支付生命與攻擊力增益，沒有宣稱狂戰士鎧甲換模。']);

 case 'b2-keyaru': return kit('自己就診拿到病歷暫態，再把病歷換成隊友護盾或回復魔力的帳單處理。','b2-takopi','凱亞爾以自身真治療事件建立醫療帳單的消耗選擇；章魚嗶以搬移隊友與友善道具保護為主。',{
  PASSIVE:named('病歷影印需要工本費',passive('自身接受治療後取得 rage 病歷暫態 4 秒；onHeal 的持有者是受治者，每 2 秒最多一次。',[hook('onHeal',[status('rage',{},4,'self')])])),
  Q:named('醫生先給自己掛號',healing('回復自身 120 生命；缺血時的真治療事件會建立病歷。','self')),
  W:named('病歷換職災保險',ally('消耗自己全部 rage 病歷，對指定友軍給予 190 點護盾 3 秒。未持有病歷則沒有護盾。',[consume('rage',[shield(190,3)],'self') ])),
  E:named('麻醉單請勿填錯',move('指定敵人被施加 magic-break，明確帶 silenced 旗標 2.5 秒；不造成麻醉傷害。',card('tpl-apply-status',{status:{statusId:'magic-break',duration:2.5,silenced:true},castTimeSec:.1}))),
  R:named('門診加號先救人',healing('治療指定友軍 120 生命，並驅散最多 3 筆可驅散負面狀態、DOT 或增益来源。','ally',[cleanse()])),
  EX:named('電子帳單回饋魔力',self('消耗自己全部 rage 病歷，回復自身最大魔力 20%；不是新增帳單資源或金幣系統。',[consume('rage',[mana(.2)],'self')]))
 },[edge('Q','W','ally','shield',{slot:'W',kind:'consumeStatus'},{sourceTarget:'caster',targetTarget:'ally'}),edge('Q','EX','caster','mana',{slot:'EX',kind:'consumeStatus'},{sourceTarget:'caster',setup:{caster:{manaPct:.5,hpPct:.5}}})],[finite,'僅醫療與帳單喜劇，不採用原作性暴力、記憶操控或復活能力。']);

 case 'b2-kaede': return kit('魔劍附魔同時改變普攻傷害與可消耗的附魔暫態，選擇繼續砍或卸載回魔。','b2-matthias','楓管理自身普攻附魔與卸載；馬提亞斯改變敵方護甲及施法能力。',{
  PASSIVE:named('劍上又跳出更新通知',passive('自己有 three-sword-style 附魔時，普攻對敵人追加極小魔法傷害，每 0.7 秒最多一次。',[hook('onBasicAttack',[when(dmg('極小'),has('three-sword-style','self'))],{target:'event',internalCooldown:.7})])),
  Q:named('安裝魔劍套件',move('取得 three-sword-style 暫態與 45 點攻擊力，維持 4 秒；原作的魔法劍士特徵改編為有期限附魔。',card('tpl-buff-self',{duration:4,modifiers:[{stat:'ad',op:'flat',value:45}],status:{statusId:'three-sword-style',duration:4},castTimeSec:.1}))),
  W:named('更新視窗全部穿透',line('發出直線魔法劍氣，打擊沿線敵人。')),
  E:named('電池型魔法裝甲',self('建立 3 秒魔力屏障：每 1 魔力吸收 2 物理或魔法傷害，保留 10 魔力；真傷不在屏障清單。',[manaWall()])),
  R:named('技能欄批次執行',move('以起手命中中心固定 3 秒魔法傷害場（無目標時採施法點），之後每秒重新選取圈內敵人；不是保證以游標點為中心。',card('tpl-periodic-field',{intervalSec:1,durationSec:3,radiusTier:'小',anchor:'point',applyTo:'enemies',damageTier:'中',damageType:'magic',castTimeSec:.1}),'fx.prim.arcane.nova')),
  EX:named('卸載附魔清快取',self('消耗自身全部 three-sword-style 暫態，回復 18% 最大魔力；卸載後被動魔法追加停止，攻擊力增益仍依原期限結束。',[consume('three-sword-style',[mana(.18)],'self')]))
 },[attackEdge('Q',{slot:'PASSIVE',kind:'damage',conditionalOnly:true}),edge('Q','EX','caster','mana',{slot:'EX',kind:'consumeStatus'},{setup:{caster:{manaPct:.5}}})],[finite,'無法以角色名字證明魔法劍更新視窗是原作能力；視窗只是此處附魔的笑點。','R 的 point 錨點沿用正式延遲解析：優先凍結首個起手目標位置，無目標才採施法點；後續每跳重新找人。']);

 case 'b2-matthias': return kit('批改護甲與魔法答案：先破甲讓普通劍術更有效，再消耗封咒換致盲。','b2-kaede','馬提亞斯改敵人防禦和失能類型；楓修改自己普攻和魔力使用。',{
  PASSIVE:named('老師題目真的過期了',passive('施加帶正式 cc 標籤的控制時回復自身最大魔力 5%，內置冷卻 3 秒；本套由 EX 致盲觸發，R 的 magic-break 沉默不派發此事件。',[hook('onCrowdControlApplied',[mana(.05)],{internalCooldown:3})])),
  Q:named('護甲答案扣二十分',move('指定敵人護甲降低 35，持續 4 秒，並明列 armor-break 暫態；不新增破甲規則。',seq([buff('armor',-35,4,{applyTo:'target',statusId:'armor-break',dispellable:true})]))),
  W:named('用鉛筆也能劍術考試',strike('對指定敵人造成小級物理斬擊，護甲變化走正式傷害減免。')),
  E:named('退回重寫保護欄',self('獲得 170 點全傷害護盾 3 秒。',[shield(170,3)])),
  R:named('期末考禁止交頭接耳',move('對指定敵人施加 magic-break 與 silenced 旗標 3 秒，期間不能施法。',seq([status('magic-break',{silenced:true},3)]))),
  EX:named('重修請先看黑板',move('消耗目標全部 magic-break，再施加正式 blind 出貨配方。沒有封咒時不能轉換為致盲。',seq([consume('magic-break',[clone(presets.blind.node)])])))
 },[attackEdge('Q',{slot:'Q',kind:'applyBuff',stat:'armor'}),edge('R','EX','foe','status:blind',{slot:'EX',kind:'consumeStatus'})],[finite,'採用轉生後第四紋魔法戰鬥者辨識點，批改與重修為 GGD 笑點。']);

 case 'b2-sinbad': return kit('少年商會強化合夥人出擊，自己巡迴換位讓遠處客人進入直線展示範圍。','b2-aladdin','辛巴達直接提高隊友戰鬥能力並自行進場；阿拉丁另召喚有期限的代理身體。',{
  PASSIVE:named('剪綵也是一種續航',passive('自己發生衝刺或瞬移後回復 70 生命，每 3 秒最多一次。',[hook('onDashOrBlink',[heal(70,'self')],{internalCooldown:3})])),
  Q:named('合夥人早鳥紅利',ally('指定友軍增加 70 攻擊力，持續 4 秒；可明確驅散，不改友敵陣營。',[buff('ad',70,4,{applyTo:'target',dispellable:true})])),
  W:named('商會代表自備保險',self('自身取得 3 秒魔力屏障，每 1 魔力抵擋 2 物理／魔法傷害，保留 10 魔力。',[manaWall()])),
  E:named('巡迴剪綵走捷徑',mobility('自身瞬移至指定合法地點；移動事件可觸發被動回復。')),
  R:named('七海規格產品示範',line('向前打出大範圍直線魔法展示；不宣稱七種魔裝皆已完整實作。',{length:11,width:2.1})),
  EX:named('合作夥伴急救條款',healing('治療指定友軍 120 生命，再清除可驅散負面效果。','ally',[cleanse()]))
 },[edge('Q','ATTACK','foe','hp',{slot:'Q',kind:'applyBuff',stat:'ad'},{sourceTarget:'ally',targetActor:'ally',targetTarget:'foe',expect:'decrease',setup:{ally:{x:1,z:0}}}),edge('E','R','foe','hp',{slot:'E',kind:'blink'},{expect:'decrease',sourcePoint:{x:5,z:0},targetPoint:{x:6,z:0},setup:{foe:{x:14,z:0}},waitSec:.8,observeSec:.5,note:'E 真換位讓原本在 R 長度 11 外的客人進入展示線；量 R 傷害，E 本身的 P 治療不充當第二連動。'})],[finite,'採少年辛巴達前傳的領袖與冒險者辨識點；不混入本篇成年王者所有能力。']);

 case 'b2-kumoko': return kit('蛛網把住客留在租屋處，毒牙持續扣血；主動撤步讓跟身毒圈改變覆盖位置。','b2-maomao','蜘蛛子控制領地與自身距離；貓貓以解毒和藥理處置為主。',{
  PASSIVE:named('租屋警報八隻眼',passive('自己施加控制後取得 100 點護盾 2 秒，內置冷卻 3 秒。',[hook('onCrowdControlApplied',[shield(100,2)],{internalCooldown:3})])),
  Q:named('玄關地墊有點黏',move('指定敵人被 root 定身 3 秒；這是主動蛛網控制，不是隱形陷阱物件。',card('tpl-apply-status',{status:{statusId:'root',duration:3,root:true},castTimeSec:.1}))),
  W:named('毒牙代收房租',move('對指定敵人施加每秒一跳、持續 3 秒的魔法 DOT；若目標被 root，追加一筆獨立 DOT。',seq([dot(),when(dot({stacking:'independent'}),has('root'))]))),
  E:named('房東來了躲牆角',mobility('瞬移至指定合法地點；以真正位置改變移動自己的環身攻擊中心。')),
  R:named('整個客廳都是我的網',move('周身建立 3 秒傷害場，每 0.5 秒重新找自己附近敵人；跟隨施法者，不是固定地點陷阱。',card('tpl-periodic-field',{intervalSec:.5,durationSec:3,radiusTier:'小',anchor:'caster',applyTo:'enemies',damageTier:'中',damageType:'magic',castTimeSec:.1}),'fx.prim.arcane.nova')),
  EX:named('蛛絲押金換防護',self('獲得 220 點全傷害護盾 3 秒並回復 60 生命，供脆弱蜘蛛撤離。',[shield(220,3),heal(60,'self')]))
 },[edge('Q','W','foe','hp',{slot:'W',kind:'dot',conditionalOnly:true},{expect:'decrease',observeSec:3.2}),edge('E','R','foe','hp',{slot:'E',kind:'blink'},{expect:'decrease',sourcePoint:{x:5,z:0},setup:{foe:{x:6,z:0}},observeSec:3.2})],[finite,'採蜘蛛魔物階段：蛛絲、毒牙與敏捷。沒有宣稱人形神化、蜘蛛素材或完整進化。']);

 case 'b2-yogiri': return kit('雙門檻下班結算：先通知再降到低血，只給有限傷害；不配合者被取消施法。','b2-misery','夜霧需要低生命與通知同時成立；米瑟利的期限贈品使控制形態轉換。',{
  PASSIVE:named('睡眠品質調查表',passive('自己受控制後取得 150 點護盾 2 秒，每 4 秒最多一次；不免疫所有威脅。',[hook('onCrowdControlReceived',[shield(150,2)],{internalCooldown:4})])),
  Q:named('下班通知已讀未回',move('指定敵人取得 curse 通知 4 秒；此處只作條件標記，不假稱原作即死。',seq([status('curse',{},4)]))),
  W:named('符合門檻才能結算',move('造成極小魔法傷害；目標同時帶 curse 且生命低於 45% 時追加中級魔法傷害，最後消耗通知並施加 1 秒沉默；沉默不另要求低血。傷害有限，沒有 kill 指令。',seq([dmg('極小'),when(dmg('中'),{all:[has('curse'),low(.45,'target')]}),consume('curse',[status('magic-break',{silenced:true},1)])]))),
  E:named('枕頭要搬去安靜處',mobility('瞬移到指定合法落點，調整離敵人的距離。')),
  R:named('全體不要吵我',move('指定地點附近敵人各受極小傷害並被沉默 2.5 秒；友軍不在清單。',seq([aoe([silence()],3)],'ground'))),
  EX:named('通知換成勿擾模式',move('消耗目標 curse 通知，改施加 2.5 秒 magic-break 沉默；沒有通知就不施加控制。',seq([consume('curse',[silence()])])))
 },[edge('Q','W','foe','hp',{slot:'W',kind:'damage',conditionalOnly:true},{expect:'decrease',setup:{foe:{hpPct:.4}}}),edge('Q','EX','foe','status:magic-break',{slot:'EX',kind:'consumeStatus'})],[finite,'保留不願被打擾和終結者辨識；無條件秒殺、概念抹殺都不在本改編中。']);

 case 'b2-kaiji': return kit('押上現有魔力留下可讀存款，再決定翻牌伤害或消耗下注保命；亂數只有清楚列出的有限獎項。','b2-luckyman','開司主動支付真魔力後抉擇；幸運超人的隨機救場由受到敵人攻擊觸發。',{
  PASSIVE:named('賭桌離場服務費',passive('施放大招後回復自身最大魔力 6%，內置冷卻 4 秒。',[hook('onUltimateCast',[mana(.06)],{internalCooldown:4})])),
  Q:named('午餐錢全押這次',self('額外支付自身當前魔力 35%，實付數由現有 nen-banked 存款標記保留 4 秒；不建立金幣或自訂籌碼。',[debit(.35,{bankAs:{statusId:'nen-banked',durationSec:4}})])),
  W:named('翻盤不是保證中獎',move('造成極小魔法傷害，並讀取 nen-banked 實付存款追加有限傷害，上限 180；存款不足時不會憑空取得滿額。',seq([dmg('極小',{bankedBonus:{statusId:'nen-banked',coeff:1,max:180}})]))),
  E:named('不看牌先退桌',self('消耗全部 nen-banked 存款標記，取得 210 點全傷害護盾 3 秒；提前退桌會失去後續讀取存款的機會。',[consume('nen-banked',[shield(210,3)],'self') ])),
  R:named('最後一把抽獎機',self('等機率抽到兩種有限結果之一：150 點護盾 3 秒，或回復最大魔力 15%。種子決定結果，不保證中大獎。',[{kind:'weightedBranch',shape:'single',branches:[{weight:1,effects:[shield(150,3)]},{weight:1,effects:[mana(.15)]}]}])),
  EX:named('地下勞動急救包',healing('指定友軍回復 120 生命；此處是有限治療，不償還原作賭債。'))
 },[edge('Q','W','foe','hp',{slot:'Q',kind:'spendMana'},{expect:'decrease'}),edge('Q','E','caster','shield',{slot:'E',kind:'consumeStatus'})],[finite,'本局不使用真錢；機率不能以單一好種子宣稱必贏。']);

 case 'b2-fushi': return kit('以主動受擊適應累積既有暫態，在受擊後選擇重建血肉或支援隊友生命與護盾。','b2-uncle','不死的暫態由實際受擊事件產生，重建只回復活人的生命；舅舅以主動變化與客服驅散為主。',{
  PASSIVE:named('這個痛我記住了',passive('受到傷害後取得 berserk 適應暫態 4 秒，內置冷卻 2 秒；不會憑空復活。',[hook('onDamageTaken',[status('berserk',{},4,'self')])])),
  Q:named('請溫柔敲擊測試',self('支付最大生命 8% 並取得 100 點護盾 2 秒；生命支付不是來襲傷害，不自行觸發受擊被動。',[injury(.08),shield(100,2)])),
  W:named('把破掉的地方長回來',self('消耗 berserk 適應暫態回復自身 220 生命；沒有實際受擊留下的暫態就不回復。',[consume('berserk',[heal(220,'self')],'self')],'fx.prim.wind.pulse-sm')),
  E:named('記憶形狀先借一塊',ally('指定友軍取得 190 點護盾 3 秒；若自己有 berserk 適應暫態，額外回復該友軍 100 生命。',[shield(190,3),when(heal(100,'target'),has('berserk','self'))])),
  R:named('耐用形狀保固四秒',move('獲得 60 護甲及 30 魔抗 4 秒；這是形態意象的數值強化，沒有換模或復活。',card('tpl-buff-self',{duration:4,modifiers:[{stat:'armor',op:'flat',value:60},{stat:'mr',op:'flat',value:30}],castTimeSec:.1}))),
  EX:named('換一雙腿先跑路',mobility('瞬移至指定合法地點；適應暫態仍依原期限到期。'))
 },[edge('Q','W','caster','hp',{slot:'W',kind:'consumeStatus'},{sourceActor:'foe',sourceTarget:'caster',waitSec:.2}),edge('Q','E','ally','hp',{slot:'E',kind:'heal',conditionalOnly:true},{sourceActor:'foe',sourceTarget:'caster',targetTarget:'ally',waitSec:.2})],[finite,'前世篇刺激與再生意象；未提供原作無限再生、死後復活、模仿外觀或死者復活。']);
 case 'b2-orphen': return kit('催收函先收訂金並分期扣血，縮短冷卻再寄；瞬移登門後提早普攻，真正觸發回魔被動。','b2-keyaru','歐菲把敵人當債務人，主體是敵方 DOT 及自己定量回血；凱亞爾是自療後消耗病歷保護同伴。',{
  PASSIVE:named('催收電話無須長談',passive('普通攻擊命中後回復自己最大魔力 4%，每 2 秒最多一次。',[hook('onBasicAttack',[mana(.04)])])),
  Q:named('我放出的光之催繳函',move('打擊敵人並施加 3 秒 DOT，每秒一跳；施法當下只回復自己一次 100 生命，不是每跳吸血。',card('tpl-drain-leech',{damageTier:'極小',apRatio:.2,damageType:'magic',leechFlat:100,intervalSec:1,durationSec:3,stacking:'refresh',castTimeSec:.1}),'fx.prim.arcane.bolt')),
  W:named('利息可以再寄一次',self('縮短 Q 尚未結束的冷卻 2 秒。Q 未進冷卻時不預存折扣。',[cd('Q',2)])),
  E:named('債務人請勿插話',move('指定敵人獲得 magic-break 與 silenced 旗標 2.5 秒，期間不能施法。',card('tpl-apply-status',{status:{statusId:'magic-break',duration:2.5,silenced:true},castTimeSec:.1}))),
  R:named('債主不用敲門',move('瞬移接近指定敵人後斬擊，落點保持現有模板安全間距。',card('tpl-blink-strike',{range:6,stopShortUnits:1.2,damage:tier('中'),damageType:'magic',castTimeSec:.1}),'fx.prim.arcane.dash')),
  EX:named('這筆急救算借你的',healing('回復指定友軍 120 生命，所有借款話術只是角色喜劇。'))
 },[edge('Q','W','caster','cooldown:Q',{slot:'W',kind:'modifyCooldown'},{expect:'decrease'}),edge('R','ATTACK','caster','mana',{slot:'PASSIVE',kind:'restore'},{setup:{caster:{manaPct:.5},foe:{x:5,z:0}},waitSec:.3,observeSec:.6,note:'R 先把人送到近戰距離，後續真普攻在同一短窗口觸發 P 回魔；無 R 尚在接近，消融 P 時照樣命中但沒有回款。這是提早取得回魔，不承諾無 R 永遠無法普攻。'})],[finite,'詠唱魔術士、地下放貸者為來源辨識；持續吸血連結與無限還款皆未宣稱。']);

 case 'b2-klaus': return kit('按開始排程後，後續傷害仍分時抵達；移動自己改變跟身自動作業的工作地點。','b2-albus','克勞斯把幾次出手預先排好等待執行；阿爾巴斯縮冷卻後重新主動操作。',{
  PASSIVE:named('自動回覆我正在忙',passive('每 4 秒回復自身最大魔力 4%；是真週期事件，不是離線掛機收入。',[hook('onInterval',[mana(.04)],{internalCooldown:4})])),
  Q:named('已加入工作佇列',self('取得 red-comet 排程授權暫態 4 秒，並增加移速 10%；到期必須重新授權。',[status('red-comet',{moveSpeedMult:1.1},4,'self')])),
  W:named('全部執行不要再問',move('對指定敵人排出 3 次間隔 0.5 秒的極小傷害；每次付款時仍需持有 red-comet，授權到期後不再付款。',seq([delayed([when(dmg('極小'),has('red-comet','self'))],.3,{count:3,intervalSec:.5})]),'fx.prim.arcane.bolt')),
  E:named('更改辦公室位置',mobility('瞬移到指定合法地點，使跟身週期作業的中心一同移動。')),
  R:named('移動式背景工作',move('自己周身執行 3 秒週期傷害，每 0.5 秒重新尋找敵人；不是替玩家自動走位。',card('tpl-periodic-field',{intervalSec:.5,durationSec:3,radiusTier:'小',anchor:'caster',applyTo:'enemies',damageTier:'中',damageType:'physical',castTimeSec:.1}),'fx.prim.arcane.nova')),
  EX:named('強制結束順便保命',self('消耗自身 red-comet 授權，獲得 200 點護盾 3 秒；原 W 後續付款因此停止。',[consume('red-comet',[shield(200,3)],'self')]))
 },[edge('Q','W','foe','hp',{slot:'W',kind:'damage',conditionalOnly:true},{expect:'decrease',observeSec:2}),edge('E','R','foe','hp',{slot:'E',kind:'blink'},{expect:'decrease',sourcePoint:{x:5,z:0},setup:{foe:{x:6,z:0}},observeSec:3.2})],[finite,'原作自動機能改為可取消的有限排程；不宣稱全遊戲 AI 自動代理。']);

 case 'b2-takopi': return kit('友善接送把夥伴接近後才吃到近距離保護，再把開心貼紙換成治療。','b2-keyaru','章魚嗶的第一條依赖友方位置，第二條是友方可消耗貼紙；凱亞爾自療後拿自己的病歷付款。',{
  PASSIVE:named('大家不要哭嗶',passive('同隊友軍受傷時，自己取得 90 點護盾 2 秒，每 3 秒最多一次。',[hook('onAllyDamaged',[shield(90,2)],{internalCooldown:3})])),
  Q:named('和好緞帶先接回來',move('把指定友軍搬到自己腳邊，使用現有 rallyToCaster 低弧位移；落點遵守既有合法地形。',card('tpl-teleport',{destination:'rallyToCaster',castTimeSec:.1,travelSec:.1}),'fx.prim.arcane.dash')),
  W:named('抱抱罩尺寸有限嗶',ally('友軍與自己距離在 2.5 以內時，給予 200 點護盾 3 秒；遠距離時抱抱罩套不到。',[when(shield(200,3),distance('<=',2.5))])),
  E:named('開心貼紙先貼對人',ally('在指定友軍身上施加 spell-shield 貼紙 4 秒；此處只作可消耗暫態，不自帶魔法免疫。',[status('spell-shield',{},4)])),
  R:named('道具說明書暖心頁',healing('治療指定友軍 120 生命並清除最多 3 筆可驅散負面效果。','ally',[cleanse()])),
  EX:named('貼紙集滿換繃帶',ally('消耗友軍身上全部 spell-shield 貼紙，回復其 190 生命；沒有貼紙就不付款。',[consume('spell-shield',[heal(190,'target')])]))
 },[edge('Q','W','ally','shield',{slot:'W',kind:'shield',conditionalOnly:true},{sourceTarget:'ally',targetTarget:'ally',setup:{ally:{x:5,z:0}}}),edge('E','EX','ally','hp',{slot:'EX',kind:'consumeStatus'},{sourceTarget:'ally',targetTarget:'ally'})],[finite,'只用友善道具與救援笑點；未實作時間倒流、替代死亡或原作悲劇事件。']);

 case 'b2-luckyman': return kit('兩種幸運保護覆蓋不同攻擊通道，真正閃避時才回魔；幸運受到正式機率上限與種子約束。','b2-kaiji','幸運在敵人的攻擊到來時才抽驗，沒有主動押注資源；開司付款後選擇翻盤或退桌。',{
  PASSIVE:named('剛好撿到零錢',passive('真正觸發閃避時回復最大魔力 10%，每 0.5 秒最多一次；未閃掉不退款。',[hook('onEvade',[mana(.1)],{internalCooldown:.5})])),
  Q:named('剛好香蕉皮滑了一下',self('增加普攻迴避機會 3 秒；填入 1 仍受正式 evasion 上限約束，不是保證無敵，也不閃技能。',[evasion({durationSec:3})])),
  W:named('剛好拳頭在這裡',strike('單體小級物理打擊；幸運不等於所有攻擊必中。')),
  E:named('剛好有張技能保單',self('增加普攻及技能迴避機會 3 秒，仍受正式機率上限限制，真傷未獲豁免。',[evasion({durationSec:3,dodgesAbilities:true})])),
  R:named('剛好天上掉贈品',self('等權抽取回復 150 生命或 180 點護盾 3 秒；結果由種子重現，不挑成功樣本冒稱必定保命。',[{kind:'weightedBranch',shape:'single',branches:[{weight:1,effects:[heal(150,'self')]},{weight:1,effects:[shield(180,3)]}]}])),
  EX:named('沒那麼幸運先搭便車',mobility('瞬移至合法落點；提供主動撤退途徑，不能只靠機率。'))
 },[edge('Q','ATTACK','caster','mana',{slot:'PASSIVE',kind:'restore'},{targetActor:'foe',targetTarget:'caster',waitSec:.2,observeSec:1.8,setup:{caster:{manaPct:.5}},seed:1234,note:'Q 提高普通攻擊迴避，敵人真普攻觸發 P 回魔；消融 P 後仍可閃避，回魔收益消失。'}),edge('E','W','caster','mana',{slot:'PASSIVE',kind:'restore'},{targetActor:'foe',targetTarget:'caster',waitSec:.2,observeSec:.3,setup:{caster:{manaPct:.5}},seed:1234,note:'E 打開技能迴避通道，敵人真物理技能觸發 P 回魔；消融 P 後仍閃過但不回魔。與 Q 是同一迴避回魔家族的兩種來源，不計為兩種全新招牌。'})],[finite,'任何單一種子只證明該種子行為；機率與到期仍需獨立邊界測試。','Q 普攻迴避與 E 技能迴避都銜接同一 P 回魔，屬兩種真事件通道的同族連動，不冒稱兩種全新機制。']);

 case 'b2-misery': return kit('贈品先讓敵人跑得快，退貨時消耗贈品轉成致盲；留著贈品則到期前吃到延遲封咒。','b2-yogiri','米瑟利先給敵方真移速好處，再用持有期限和退貨抉擇變成代價；夜霧需要低血加通知才結算有限傷害。',{
  PASSIVE:named('異界店主不包售後',passive('自己受到控制時回復最大魔力 8%，每 4 秒最多一次。',[hook('onCrowdControlReceived',[mana(.08)],{internalCooldown:4})])),
  Q:named('免費跑鞋條款另計',move('指定敵人取得 rage 贈品暫態 4 秒，移動速度提高 15%；這個好處真的生效，代價需另施技能。',seq([status('rage',{moveSpeedMult:1.15},4)]))),
  W:named('七天鑑賞期不含眼睛',move('消耗敵人全部 rage 贈品，施加正式 blind 配方。沒有贈品時不能退貨致盲。',seq([consume('rage',[clone(presets.blind.node)])]))),
  E:named('店長先移去門後',mobility('瞬移到指定合法落點，躲開領到跑鞋的客人。')),
  R:named('櫃檯保固不是無敵',self('建立 3 秒魔力屏障，只吸收物理和魔法傷害；耗盡可用魔力或到期即結束。',[manaWall()])),
  EX:named('小字條款稍後生效',move('0.7 秒後再次檢查目標是否仍持有 rage 贈品；仍持有才施加 2.5 秒 magic-break 沉默。標記提早消失就取消。',seq([delayed([when(silence(),has('rage'))],.7)])))
 },[edge('Q','W','foe','status:blind',{slot:'W',kind:'consumeStatus'}),edge('Q','EX','foe','status:magic-break',{slot:'EX',kind:'applyStatus',conditionalOnly:true},{observeSec:1.3})],[finite,'原作身分是神秘異界案內人；贈品條款商店與本六槽玩法是 GGD 原創，不稱為原作契約惡魔。']);

 case 'b2-nube': return kit('鬼手把遠處敵人拉進點名圈；魔力不足時，同學真受傷觸發班導回魔，才趕得及施放急救。','b2-naofumi','神眉以鬼手拉近點名及封咒控制為特徵；尚文以盾牌保護和隔離威脅為主。',{
  PASSIVE:named('班導還不能下班',passive('友軍受到傷害後，自己回復最大魔力 6%，每 3 秒最多一次。',[hook('onAllyDamaged',[mana(.06)],{internalCooldown:3})])),
  Q:named('鬼手抓回來點名',move('對指定敵人造成極小傷害並向自己拉近 3 單位；這是既有 knockback 拉向模式，不是空中抓取。',seq([dmg('極小'),push(3,'pull')]))),
  W:named('老師先幫你擋著',ally('指定友軍取得 210 點全傷害護盾 3 秒；確實放在該友軍身上。',[shield(210,3)])),
  E:named('符咒貼上禁止聊天',move('指定敵人施加 magic-break 與 silenced 旗標 2.5 秒。',card('tpl-apply-status',{status:{statusId:'magic-break',duration:2.5,silenced:true},castTimeSec:.1}))),
  R:named('全班留下來補課',self('對自身周圍半徑 2.5 的敵人造成小級範圍傷害，並施加 root 定身 1.5 秒；拉進點名圈才會命中。',[aoe([status('root',{root:true},1.5)],2.5,{amount:tier('小')})],'fx.prim.arcane.nova')),
  EX:named('保健室先解除惡靈',healing('治療指定友軍 120 生命並解除可驅散負面效果；不是對死亡單位復活。','ally',[cleanse()]))
 },[edge('Q','R','foe','hp',{slot:'Q',kind:'knockback'},{expect:'decrease',setup:{foe:{x:5,z:0}},observeSec:.6}),edge('Q','EX','ally','hp',{slot:'PASSIVE',kind:'restore'},{sourceActor:'foe',sourceTarget:'ally',targetTarget:'ally',setup:{caster:{manaPct:.04}},waitSec:.2,observeSec:.4,expectedControlResponseRejections:{preparedAblated:'no-mana',unprepared:'no-mana',unpreparedAblated:'no-mana'},note:'敵方測試 Q 真傷同學，觸發本人的 P 回魔，讓原本只有 4% 魔力的老師及時施放 EX 治療。源 Q 不是神眉的 Q；三個缺少 P 回款的對照在施法時都必須因 no-mana 拒絕，較晚自然回魔後仍可再救。'})],[finite,'鬼手與教師保護學生為辨識點；不宣稱新驅魔狀態或靈體專用引擎規則。','P→EX 是低魔力下提早取得救援施法的資源連動；完整護盾仍可能觸發正式 onAllyDamaged，不能宣稱護住同學就不會回魔。']);

 case 'b2-shinchan': return kit('春日部接力讓隊友更快追上對手，踩到玩具被定住後再由玩具箱送走。','b2-takopi','小新讓隊友自行跑得更快與把敵人送走；章魚嗶主動搬回隊友並給近距離道具保護。',{
  PASSIVE:named('動感超人不用補習',passive('自己施加控制後回復 60 生命，每 3 秒最多一次。',[hook('onCrowdControlApplied',[heal(60,'self')],{internalCooldown:3})])),
  Q:named('春日部接力棒快傳',ally('指定友軍取得 red-comet 與 35% 移速提升，持續 3 秒，真實改變跑動距離。',[status('red-comet',{moveSpeedMult:1.35},3)])),
  W:named('玩具散落請勿奔跑',move('指定敵人被 root 定身 2.5 秒；玩具只是主動控制的童趣演出，不是隱藏陷阱。',card('tpl-apply-status',{status:{statusId:'root',duration:2.5,root:true},castTimeSec:.1}))),
  E:named('小白帶我換條路',mobility('自己瞬移至合法落點，作為散步繞路的 GGD 改編。')),
  R:named('全體一起玩鬼抓人',move('周圍敵人受到極小傷害，並套用正式 confusion 出貨旗標；效果到期後恢復原行為。',seq([aoe([clone(presets.confusion.node)],3)],'self'),'fx.prim.arcane.nova')),
  EX:named('玩具箱彈簧送客',move('消耗目標 root 定身，再推離自己 4 單位。沒踩玩具、沒有 root 時不會被送走。',seq([consume('root',[push(4)])])))
 },[edge('Q','ATTACK','ally','x',{slot:'Q',kind:'applyStatus'},{sourceTarget:'ally',targetActor:'ally',targetTarget:'foe',waitSec:.2,observeSec:.7,setup:{ally:{x:0,z:0},foe:{x:8,z:0}}}),edge('W','EX','foe','x',{slot:'EX',kind:'consumeStatus'},{waitSec:.2,observeSec:.5})],[finite,'僅幼稚園、玩具與散步的童趣，不含性化內容。']);

 case 'b2-aladdin': return kit('笛聲叫來真代理樂團，再消耗演奏暫態追加團員；召喚後在圈內指揮，才會強化已到場團員的攻擊。','b2-sinbad','阿拉丁先增加有期限的攻擊身體，再用圈內指揮強化團員；辛巴達直接強化現有隊友並自己進場。',{
  PASSIVE:named('吹錯音先喘口氣',passive('施放大招時回復自身最大魔力 8%，每 4 秒最多一次。',[hook('onUltimateCast',[mana(.08)],{internalCooldown:4})])),
  Q:named('烏戈代班先派一位',move('召喚 1 具可獨立攻擊的自身代理 4 秒，攻擊與生命倍率欄位均為 30%，本招最多 3 具；同時取得 rage 演奏暫態 4 秒。代理不是烏戈原作模型。',[card('tpl-summon-agent',{body:'self',count:1,durationSec:4,damageMult:.3,hpMult:.3,formation:'ring',spread:1,maxAlive:3,onOwnerDeath:'despawn',cleanse:'none',castTimeSec:.1}),seq([status('rage',{},4,'self')],'self','allies')])),
  W:named('樂團加演再請一位',self('消耗自身 rage 演奏暫態再召喚 1 具同規格代理 4 秒，W 自己的上限為 3 具；沒有演奏暫態就不能加演。',[consume('rage',[summon({maxAlive:3,spread:1})],'self')])) ,
  E:named('團員到齊才打節拍',move('指定地點半徑 3 內的友方單位增加 80 攻擊力 4 秒，可驅散；先叫出代理再指揮，代理才會領到加班增益。',seq([buff('ad',80,4,{applyTo:'target',dispellable:true})],'ground','allies'))),
  R:named('魔法音樂課吹整排',line('發出直線魔法波動，打擊沿線敵人；演出是吹笛，幾何以編譯能力為準。',{length:10,width:1.8})),
  EX:named('暖風模式先照顧同學',healing('治療指定友軍 120 生命，並給予 100 點護盾 2 秒。','ally',[shield(100,2)]))
 },[edge('Q','W','caster','summons',{slot:'W',kind:'consumeStatus'},{observeSec:.5}),edge('Q','E','foe','hp',{slot:'E',kind:'applyBuff',stat:'ad'},{expect:'decrease',waitSec:.3,observeSec:2.5,targetPoint:{x:1,z:0},setup:{foe:{x:2,z:0}}})],[finite,'烏戈是來源中的召喚朋友；本驗證用真代理召喚測機制，沒有宣稱烏戈外形或召喚資產已完成。','代理使用角色文件與正式屬性管線，不繼承主人當下增益；Q、W 的 maxAlive 分別依技能來源計數，不是合計上限 3 具。']);

 case 'b2-ned': return kit('青蛙真跳躍進入短劍距離，推走敵人後再追入線斬；按空間而非標記額外傷害結算。','b2-bojji','Ned 以跳躍落點與劍氣幾何決定能否近斬；波吉在近身以閃避與失能爭取出手。',{
  PASSIVE:named('我真的是劍士不是坐騎',passive('發生衝刺或瞬移事件後增加 25 護甲 2 秒，每 3 秒最多一次；本套由 EX 瞬移觸發，Q 的 leap 跳躍不派發此事件。',[hook('onDashOrBlink',[buff('armor',25,2)],{internalCooldown:3})])),
  Q:named('蛙跳出差交通費',move('跳向指定合法落點，空中弧線與落地傷害由現有 leap-strike 執行；落地半徑約 1.8 單位。',card('tpl-leap-strike',{mode:'toPoint',applyTo:'self',apexHeight:250,durationSec:.4,landRadius:100,damage:tier('極小'),damageType:'physical',castTimeSec:.1}),'fx.prim.arcane.dash')),
  W:named('不是舌頭是近身劍',move('只在自己與敵人距離不大於 2.5 時造成中級物理斬擊；站太遠揮空，不另補位移。',seq([when(dmg('中',{damageType:'physical'}),distance('<=',2.5))]),'fx.prim.arcane.slash')),
  E:named('請退後不要問會不會呱',move('對敵人造成極小物理傷害並推離 3 單位；改變後续近身與線斬位置。',seq([dmg('極小',{damageType:'physical'}),push(3)]))),
  R:named('青蛙劍術會議沿線開',line('沿直線打出物理劍波；用方向和線寬決定命中，不是假分身攻擊。',{damageType:'physical',length:9,width:1.3})),
  EX:named('本體沒批假也能撤',mobility('瞬移至合法落點，觸發被動的短期護甲；沒有生成分身。'))
 },[edge('Q','W','foe','hp',{slot:'W',kind:'damage',conditionalOnly:true},{expect:'decrease',sourcePoint:{x:4,z:0},setup:{foe:{x:5,z:0}}}),edge('EX','W','caster','hp',{slot:'PASSIVE',kind:'applyBuff',stat:'armor'},{sourcePoint:{x:1,z:0},targetActor:'foe',targetTarget:'caster',waitSec:.2,observeSec:.3})],[finite,'青蛙劍士 Ned 為使用者已定身分；分身、舌頭攻擊或原作專屬招式未加到本改編。']);
 default:return undefined;
 }
}

// Explicit inputs for hooks whose prerequisite spans more than one skill, or
// whose similarly named movement primitive does not emit the desired event.
export function designsB(hero,presets){
 const d=designsBInner(hero,presets);
 if(!d)return d;
 if(hero.id==='b2-matthias')d.passiveScenarios=[{event:'onCrowdControlApplied',steps:[{kind:'cast',slot:'R',waitSec:.2},{kind:'cast',slot:'EX',waitSec:.5}]}];
 if(hero.id==='b2-ned')d.passiveScenarios=[{event:'onDashOrBlink',steps:[{kind:'cast',slot:'EX',point:{x:1,z:0},waitSec:.5}]}];
 return d;
}
