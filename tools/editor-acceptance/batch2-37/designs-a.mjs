import {clone,tier,dmg,heal,mana,shield,status,has,recent,low,distance,when,buff,consume,cd,cleanse,push,blink,dot,delayed,aoe,summon,evasion,hook,card,seq,move,passive,strike,self,ally,ground,healing,nova,line,mobility,form,edge,kit} from './kit.mjs';

// Individually authored v2 mechanics. No action-name dispatch to the rejected v1.
export function designsA(hero,presets){
 const cc=(id)=>clone(presets[id].node);
 switch(hero.id){
 case 'b2-popp': return kit('火候管理：熄掉預熱換定身，撤步後才能急救','b2-orphen','何布主動消掉火候換控制與撤步救援；歐菲持續汲取續戰。',{
  PASSIVE:passive('位移成功後回復自身最大魔力 4%，每 3 秒至多一次；撤退也要付施法成本。',[hook('onDashOrBlink',[mana(.04)],{internalCooldown:3})]),
  Q:strike('小級火焰打擊並標記 burn 3 秒；火候標記本身不造成持續傷害。',{damageType:'magic',status:status('burn',{},3)}),
  W:move('小級冰擊；消耗目標全部 burn 才定身 1.8 秒，沒有火候就只降溫打擊。',seq([dmg(),consume('burn',[status('root',{root:true},1.8)])]),'fx.prim.ice.pulse-sm'),
  E:mobility('瞬移到合法施法點，準備 4 秒急救窗口；不授予無敵。'),
  R:line('一條中級直線魔法；一次命中結算，烤肉梗不額外偷偷加 DOT。'),
  EX:healing('友軍回復 120；最近 4 秒使用 E，再追加 180 救急治療。','ally',[when(heal(180),recent('E'))]),
 },[edge('Q','W','foe','status:root',{slot:'W',kind:'consumeStatus'}),edge('E','EX','ally','hp',{slot:'EX',kind:'heal',conditionalOnly:true})]);
 case 'b2-rem': return kit('拖地女僕：把客人拉近才繳械，鬼化付血後自我修復','b2-guts','蕾姆拉人與短繳械控制節奏；凱茲以自損攻擊力及重劍續戰。',{
  PASSIVE:move('每 3 秒受傷可對攻擊者反擊一次小級物理傷害；固定反擊，不按來襲傷害比例返還。',card('tpl-on-hit-react',{reflectDamage:tier('小'),damageType:'physical',internalCooldown:3}),null),
  Q:move('拖把鉤拉指定敵人到身邊 1 單位外，不傷害；受地形與位移規則限制。',seq([{kind:'pull',shape:'single',destination:'caster',speed:18,stopDistance:1}]),'fx.prim.arcane.bolt'),
  W:strike('小級鐵球打擊；距離不超過 2.5 才繳械 1.5 秒（numbness 旗標），遠客人不列入清場。',{},[when(status('numbness',{disarmed:true},1.5),distance('<=',2.5))]),
  E:self('鬼化加班：支付最大生命 12%，至少保留 1 HP；攻擊力 +35 持續 3 秒，沒有免費回血。',[{kind:'spendHealth',amount:{flat:0},pctMaxHealth:.12,minimumHp:1},buff('ad',35)]),
  R:self('任何情況都得到 100 護盾 2 秒；生命低於 50% 時額外回復 240，不要求一定先用鬼化。',[shield(100,2),when(heal(240,'self'),low(.5))]),
  EX:move('向前衝鋒，落地打擊並推離人群；不是真實家務清潔。',card('tpl-charge-push',{dashDistance:200,dashDurationSec:.4,radius:150,damage:tier('小'),pushDistance:100,pushSpeed:600,castTimeSec:.1}),'fx.prim.arcane.dash'),
 },[edge('Q','W','foe','status:numbness',{slot:'W',kind:'applyStatus'},{setup:{foe:{x:5,z:0}}}),edge('E','R','caster','hp',{slot:'R',kind:'heal'},{setup:{caster:{hpPct:.55}}})]);
 case 'b2-zenitsu': return kit('補眠打卡：先等架勢完成才有瞬移，繳械後連閃','b2-ned','善逸必須等待睡姿窗口，連閃追著同一目標；Ned 是落點劍波幾何。',{
  PASSIVE:passive('位移後自身獲得 90 護盾 1 秒，每 3 秒至多一次；清醒時仍可被打。',[hook('onDashOrBlink',[shield(90,1)],{internalCooldown:3})]),
  Q:self('原地打瞌睡：自身定身 0.5 秒，0.55 秒後取得 octuple-slash-window 3 秒。它是自願架勢，不是受敵方睡眠就變無敵。',[status('root',{root:true},.5,'self'),delayed([status('octuple-slash-window',{},3,'self')],.55)]),
  W:move('指定敵人小級斬擊；只有消耗完成的補眠窗口才瞬移到目標前 1 單位，落地再斬一次。',seq([dmg('小',{damageType:'physical'}),consume('octuple-slash-window',[blink({to:'targetUnit',stopShortUnits:1,onArrive:[dmg('小',{damageType:'physical'})]})],'self')]),'fx.prim.lightning.slash'),
  E:strike('鼾聲造成小級物理傷害，再使目標 numbness 繳械 2.5 秒。',{status:status('numbness',{disarmed:true},2.5)}),
  R:move('對被 E 繳械的目標才安排 3 次雷閃，每 0.3 秒小級物理傷害，最後一下不额外乘段數；目標死亡後停止。',seq([when(delayed([dmg('小',{damageType:'physical'})],.3,{count:3,intervalSec:.3,strikeReposition:{who:'caster',distU:1.5,ringN:4,stepPerStrike:1}}),has('numbness'))]),'fx.prim.lightning.nova'),
  EX:mobility('直接瞬移離場；沒有補眠窗口也能逃命，但不會給 W 多一張打卡卡。'),
 },[edge('Q','W','caster','x',{slot:'W',kind:'consumeStatus'},{setup:{foe:{x:5,z:0}},waitSec:.8}),edge('E','R','foe','hp',{slot:'R',kind:'delayed'},{expect:'decrease'})]);
 case 'b2-rin': return kit('寶石分期：先付魔力入庫，擊發讀真實存量，破魔後回款','b2-kaiji','凜與開司共用實付魔力存款加傷；凜擊發後清空，開司可留著存款或消耗換盾，這條列為相似例外，不冒稱全新銀行玩法。',{
  PASSIVE:passive('普攻回復最大魔力 3%，每 3 秒一次；不產生新貨幣。',[hook('onBasicAttack',[mana(.03)],{internalCooldown:3})]),
  Q:self('寶石預付款：另外支付 120 魔力，按實際支付量存入既有 nen-banked 4 秒；不足只能存實際扣掉的量。',[{kind:'spendMana',amount:{flat:120},applyTo:'self',bankAs:{statusId:'nen-banked',durationSec:4}}]),
  W:move('小級寶石打擊，追加 nen-banked 實際儲量的 1 倍（上限 180）；擊發後清空存量並退最大魔力 1% 手續費，不能同一顆寶石無限報帳。',seq([dmg('小',{bankedBonus:{statusId:'nen-banked',coeff:1,max:180}}),consume('nen-banked',[mana(.01)],'self')]),'fx.prim.arcane.bolt'),
  E:strike('八極拳小級物理打擊並給 magic-break 3 秒標記；此標記不自帶減魔抗，重點是記錄催款對象。',{status:status('magic-break',{},3)}),
  R:move('中級定向魔法；目標有催款標記，消耗它並回復自身最大魔力 12%，同時讓對方沉默 1 秒。',seq([dmg('中'),consume('magic-break',[mana(.12),status('magic-break',{silenced:true},1)])]),'fx.prim.arcane.nova'),
  EX:healing('友軍回復 120；退款只退生命，寶石存量不會回來。'),
 },[edge('Q','W','foe','hp',{slot:'Q',kind:'spendMana'},{expect:'decrease'}),edge('E','R','caster','mana',{slot:'R',kind:'consumeStatus'},{setup:{caster:{manaPct:.6}}})]);
 case 'b2-uncle': return kit('精靈客服：先送錯敵人增益再撤單，結界收據换代理助手','b2-haga','舅舅有可撤回的錯送增益，羽賀控制別人的施法與標記定位。',{
  PASSIVE:passive('自己獲得護盾時回復最大魔力 3%，每 3 秒一次；幫別人套盾不算自己獲盾。',[hook('onShieldGained',[mana(.03)],{internalCooldown:3})]),
  Q:move('客服選错收件人：替敵人增加 50 攻擊力，持續 3 秒，可被驅散；這是真實代價。',seq([buff('ad',50,3,{applyTo:'target',polarity:'buff',dispellable:true})])),
  W:move('撤回最近一份敵方增益（buff pool）；然後定身 1 秒。沒有訂單只剩定身，不會憑空偷取攻擊力。',seq([cleanse({polarity:'buff',pools:{buffs:true},count:1}),status('root',{root:true},1)])),
  E:self('精靈給了一張結界收據：180 護盾 3 秒，spell-shield 標記 3 秒；標記不自帶免疫。',[shield(180),status('spell-shield',{},3,'self')]),
  R:self('交出結界收據才能叫來一名 4 秒的自己分身；生命／攻擊倍率欄位各 0.3，依正式屬性管線產生，不繼承主人當下增益；該來源最多 2 具，本體死亡消失。',[consume('spell-shield',[summon()],'self')]),
  EX:line('攻略正確的直線魔法，中級單次傷害；不沿用不生效的蛇行參數。'),
 },[edge('Q','W','foe','stat:ad',{slot:'W',kind:'dispel'},{expect:'decrease'}),edge('E','R','caster','summons',{slot:'R',kind:'consumeStatus'})]);
 case 'b2-boxxo': return kit('流動販賣機：補給產生一次營業憑證，搬運後重新選友軍補給圈','b2-takopi','阿箱產消補給憑證與搬動營業區；章魚嗶直接把隊友接回安全距離。',{
  PASSIVE:passive('自身受傷後得到 80 護盾 2 秒，內置冷卻 4 秒；拉蜜絲與阿箱共用一條生命，不生成第二個可控玩家。',[hook('onDamageTaken',[shield(80,2)],{internalCooldown:4})]),
  Q:healing('指定隊友喝飲料回復 120；售出後自身獲得 moon-combo 營業憑證 4 秒。','ally',[status('moon-combo',{},4,'self')]),
  W:ally('消耗自身全部營業憑證，給指定隊友 240 護盾 3 秒；沒有購買紀錄就沒有贈品。',[consume('moon-combo',[shield(240)],'self')]),
  E:move('拉蜜絲搬運到施法點，0.35 秒後落地；不扔敵人，也不讓阿箱自行走下機台。',card('tpl-teleport',{destination:'castPoint',travelSec:.35,arriveRadius:150,castTimeSec:.1}),'fx.prim.arcane.dash'),
  R:self('移動後 4 秒內才開快閃店：三次每秒重選自身半徑 3 內最多 4 位友軍，各回復 80，離開就不再補；不是對友軍造成傷害的 periodic-field。',[when(delayed([heal(80)],.5,{shape:'circle',radius:3,side:'allies',maxTargets:4,targetMode:'reresolve',anchor:'caster',count:3,intervalSec:1}),recent('E'))]),
  EX:ally('退貨服務：指定友軍驅散最多 3 項負面狀態／DOT／增益，回復 100。',[cleanse(),heal(100)]),
 },[edge('Q','W','ally','shield',{slot:'W',kind:'consumeStatus'},{metric:{actor:'ally',field:'shield',sample:'max'}}),edge('E','R','ally','hp',{slot:'R',kind:'delayed'},{sourceTarget:'ally',observeSec:2})]);
 case 'b2-shadow': return kit('觀眾站位管理：聚敵等待爆場，練台詞提高直線收尾','b2-goblin','闇影把敵人拉到自己周围延爆，哥布林殺手拉入指定工地反覆判定。',{
  PASSIVE:passive('終極技施放後給自己 160 護盾 2 秒，每 5 秒一次；演說前仍可被打斷。',[hook('onUltimateCast',[shield(160,2)],{internalCooldown:5})]),
  Q:self('工作人員引導觀眾：半徑 6 內最多 6 名敵人拉到自己 1.5 單位外。',[{kind:'pull',shape:'circle',radius:6,side:'enemies',maxTargets:6,destination:'caster',speed:20,stopDistance:1.5}]),
  W:self('等 0.7 秒才在自己半徑 3 重新選敵，最多 6 人中級魔法傷害；敵人走開可躲，本體死亡取消。',[delayed([dmg('中')],.7,{shape:'circle',radius:3,side:'enemies',maxTargets:6,targetMode:'reresolve',anchor:'caster'})]),
  E:move('對鏡練台詞，AP +80 持續 3 秒；沒有無敵。',card('tpl-buff-self',{duration:3,modifiers:[{stat:'ap',op:'flat',value:80}],castTimeSec:.1})),
  R:line('中級直線魔法加 0.7725 AP（正式出身縮放後）；只有實際 AP 增益能提高這段，沒有偽裝成原作核爆。',{damage:{damageTier:'中',ratios:[{stat:'ap',coeff:.8}]}}),
  EX:move('閃到指定敵人前 1.8 單位並打小級物理傷害；不生成假的分身。',card('tpl-blink-strike',{damage:tier(),range:6,stopShortUnits:1.8,castTimeSec:.1}),'fx.prim.lightning.slash'),
 },[edge('Q','W','foe','hp',{slot:'Q',kind:'pull'},{expect:'decrease',setup:{foe:{x:5,z:0}}}),edge('E','R','foe','hp',{slot:'E',kind:'applyBuff'},{expect:'decrease'})]);
 case 'b2-bojji': return kit('搔癢決鬥：有限閃避讓攻擊落空，再把繳械轉為定身','b2-luckyman','波吉與幸運超人都使用受上限限制的閃避窗口；波吉閃過後回血且繳械轉定身，幸運超人閃過回魔並另有隨機贈品。這條同族防禦列為相似例外。',{
  PASSIVE:passive('真正閃過一次攻擊才回復自己 70 生命，每 2 秒一次；普通被打不回血。',[hook('onEvade',[heal(70,'self')])]),
  Q:self('縮身 1.8 秒，提高普通攻擊迴避機會，仍受正式機率上限限制；不閃技能與真傷，不是保證無敵。',[evasion()]),
  W:strike('王室搔癢小級物理打擊；附加 numbness 繳械 2 秒。',{status:status('numbness',{disarmed:true},2)}),
  E:mobility('短距合法瞬移換站位；被動只在真正閃避時回血，位移本身不算閃避。'),
  R:move('消耗敵人的 numbness，轉為 root 定身 1.8 秒並小級打擊；沒繳械就只打一下。',seq([dmg('小',{damageType:'physical'}),consume('numbness',[status('root',{root:true},1.8)])])),
  EX:ally('把勇氣借給隊友：140 護盾 2 秒，不把自己變成巨人。',[shield(140,2)]),
 },[edge('Q','ATTACK','caster','hp',{slot:'Q',kind:'evasion'},{targetActor:'foe',targetTarget:'caster',waitSec:.2,observeSec:1.2}),edge('W','R','foe','status:root',{slot:'R',kind:'consumeStatus'})]);
 case 'b2-maomao': return kit('試藥與解毒：自己試吃會壓低治療，先解毒才能喝滿；樣本換友軍處方','b2-keyaru','貓貓要解除自己真實 DOT 與重創；凱亞爾以治療收據供後續服務。',{
  PASSIVE:passive('每次自己接受治療後回復最大魔力 3%，內置冷卻 3 秒；治療別人不觸發自己的受療事件。',[hook('onHeal',[mana(.03)],{internalCooldown:3})]),
  Q:self('試吃：自身 poison 降低受療為 50% 持續 3 秒，另有每秒極小真傷共 3 秒。這是虛構藥劑，沒有現實配方。',[status('poison',{healingTakenMult:.5},3,'self'),dot({applyTo:'self',damageType:'true'})]),
  W:move('先移除自己最多 3 項可驅散負面／DOT，再回復 120；解毒与回血是兩段獨立效果。',[seq([cleanse()],'self'),card('tpl-heal',{target:'self',amount:{flat:120},castTimeSec:.1})],'fx.prim.wind.pulse-sm'),
  E:self('採樣表完成：得到 moon-combo 樣本 4 秒和 80 護盾 2 秒；不是新資源系統。',[status('moon-combo',{},4,'self'),shield(80,2)]),
  R:ally('有樣本才開處方：消耗自身 moon-combo，為友軍驅散負面並回復 240；缺樣本不假裝開藥成功。',[consume('moon-combo',[cleanse(),heal(240)],'self')]),
  EX:move('敵人試飲警示：施加 grievous-wounds，受療、吸血與自然回復各為 50%，持续 3 秒。',seq([status('grievous-wounds',{healingTakenMult:.5,lifestealMult:.5,regenMult:.5},3)])),
 },[edge('Q','W','caster','hp',{slot:'W',kind:'dispel'}),edge('E','R','ally','hp',{slot:'R',kind:'consumeStatus'})],['Q 的自傷不能拿來證明前置帶來額外輸出；驗證比較實際淨化與回血。']);
 case 'b2-elma': return kit('攻略壓血：支付生命跨過門檻才拿厚盾，重甲再換重劍','b2-noor','艾爾瑪主動壓血換護盾；諾爾要精準擋指定來源的來襲。',{
  PASSIVE:passive('受到物理傷害才回復最大魔力 4%，每 3 秒一次；真傷與魔法傷害不觸發。',[hook('onDamageTaken',[mana(.04)],{damageType:'physical',internalCooldown:3})]),
  Q:self('照攻略支付最大生命 15%，底線 1 HP；先得到 60 護盾 2 秒，代價不被自己的護盾抵銷。',[{kind:'spendHealth',amount:{flat:0},pctMaxHealth:.15,minimumHp:1},shield(60,2)]),
  W:self('血量低於 50% 才給 300 護盾 3 秒；高血量按只回復最大魔力 2%，不可無代價厚盾。',[mana(.02),when(shield(300),low(.5))]),
  E:move('重劍模式 3 秒攻擊力 +70；只改戰鬥屬性，未冒稱更换原作裝甲模型。',card('tpl-buff-self',{duration:3,modifiers:[{stat:'ad',op:'flat',value:70}],castTimeSec:.1})),
  R:strike('中級重擊加 0.8 AD；受 E 實際攻擊力影響。',{damage:{damageTier:'中',ratios:[{stat:'ad',coeff:.8}]}}),
  EX:healing('攻略漏寫的補包：自療 120，不是復活。','self'),
 },[edge('Q','W','caster','shield',{slot:'W',kind:'shield'},{setup:{caster:{hpPct:.55}},metric:{actor:'caster',field:'shield',sample:'max'}}),edge('E','R','foe','hp',{slot:'E',kind:'applyBuff'},{expect:'decrease'})]);
 case 'b2-albus': return kit('速通重試：已花的冷卻才能縮短，捷徑解鎖隊友急救','b2-klaus','阿爾巴斯主動重置有限的按鍵節奏；克勞斯委派定時工作。',{
  PASSIVE:passive('每 3 秒一次，普攻回復自己 40 生命；不回捲任何公共世界狀態。',[hook('onBasicAttack',[heal(40,'self')],{internalCooldown:3})]),
  Q:strike('小級斬擊，這段速通照常支付魔力與冷卻。'),
  W:self('攻略跳段：縮短自己 Q 剩餘冷卻 1.5 秒，不碰其他技能或隊友；沒用過 Q 就沒有收益。',[cd('Q',1.5)]),
  E:mobility('走有限合法捷徑；先走捷徑的 4 秒內可使用 R 的急救分支。'),
  R:ally('隊友得到 100 護盾 2 秒；最近 4 秒用過 E，額外回復 200。這是趕到現場急救，不是讀檔。',[shield(100,2),when(heal(200),recent('E'))]),
  EX:move('指定敵人承受三跳極小物理 DOT，間隔 0.3 秒；自己原地低弧落地再造成半徑 1.83 的小級物理收尾，敵人離遠就只中 DOT。不鎖敵、不給施法者無敵。',card('tpl-lock-combo',{hitCount:3,hitIntervalSec:.3,damageType:'physical',perHitDamage:tier('極小'),finisherDamage:tier('小'),finisherRadius:100,lockTarget:'none',casterGuard:'none',trigger:'onCast'})),
 },[edge('Q','W','caster','cooldown:Q',{slot:'W',kind:'modifyCooldown'},{expect:'decrease',waitSec:.4,observeSec:.2}),edge('E','R','ally','hp',{slot:'R',kind:'heal'})]);
 case 'b2-goblin': return kit('工地誘導：把敵人拉進固定施工區，再把盲目亂闖者拋走','b2-kumoko','哥殺用拉人維持可離開的傷害工地；蜘蛛子以可到期的定身網與毒為主。',{
  PASSIVE:passive('施加控制後獲得 80 護盾 2 秒，每 3 秒一次。',[hook('onCrowdControlApplied',[shield(80,2)],{internalCooldown:3})]),
  Q:ground('以起手命中者位置（沒有命中則施法點）固定半徑 2.5，建立三次每 0.5 秒重選敵人的施工傷害區，每次極小物理傷害；離開可躲，沒有隱形陷阱實體。',[delayed([dmg('極小',{damageType:'physical'})],.5,{shape:'circle',radius:2.5,side:'enemies',maxTargets:4,targetMode:'reresolve',anchor:'point',count:3,intervalSec:.5})]),
  W:move('先把指定敵人拉到自己前 1 單位，便於把他帶到預定工地。',seq([{kind:'pull',shape:'single',destination:'caster',speed:20,stopDistance:1}])),
  E:strike('小級工具打擊，沿用出貨 blind 失手率 50% 配方；不使玩家螢幕全黑。',{status:cc('blind')}),
  R:move('敵人被致盲時才追加推離 4 單位；一般情況只有小級打擊，施工流程可被對方淨化打斷。',seq([dmg('小',{damageType:'physical'}),when(push(4),has('blind'))])),
  EX:self('工安帽 200 護盾 3 秒，避免工頭自己先下班。',[shield(200)]),
 },[edge('W','Q','foe','hp',{slot:'W',kind:'pull'},{expect:'decrease',setup:{foe:{x:5,z:0}},targetPoint:{x:0,z:0}}),edge('E','R','foe','x',{slot:'R',kind:'knockback'})]);
 case 'b2-maple': return kit('怕痛毒盾：挨打有固定回禮，怪物模式才開毒龍收尾','b2-naofumi','梅普露自保與毒性變身；尚文把厚盾給隊友並處理施法者與隊友不同位置。',{
  PASSIVE:move('受到傷害時，每 3 秒對攻擊者回禮一次極小魔法傷害；是固定傷害，不宣稱百分比反彈。',card('tpl-on-hit-react',{reflectDamage:tier('極小'),damageType:'magic',internalCooldown:3}),null),
  Q:self('自己得到 260 全傷害護盾 3 秒，保護自己不等於保護隊友。',[shield(260)]),
  W:self('保護料理：回復自己 120，若最近 4 秒用過 Q，另外回復最大魔力 10%。',[heal(120,'self'),when(mana(.1),recent('Q'))]),
  E:form('進入 4 秒的 alternate 怪物戰鬥模式；產生正式 counterpart，外觀沿用代理，不能稱美術變怪物完成。','alternate',{modifiers:[{stat:'armor',op:'flat',value:25}],buffDurationSec:4}),
  R:move('怪物模式才給敵人 3 秒 poison 與每秒極小魔法 DOT；本體模式只有小級咬擊。',seq([dmg(),when(dot(),{kind:'form',subject:'self',form:'alternate'}),when(status('poison',{},3),{kind:'form',subject:'self',form:'alternate'})])),
  EX:ally('隊友回復 100 與 100 護盾 2 秒；不疊加永久防禦。',[heal(100),shield(100,2)]),
 },[edge('Q','W','caster','mana',{slot:'W',kind:'restore'},{setup:{caster:{manaPct:.6}}}),edge('E','R','foe','status:poison',{slot:'R',kind:'applyStatus'})]);
 case 'b2-naofumi': return kit('隊友盾牌通行證：友盾產生可兌換保護，先推開威脅再接人','b2-maple','尚文兩條連動都以隊友為受益者，梅普露主要保護自己。',{
  PASSIVE:passive('同隊友軍受傷時自身回復最大魔力 3%，每 3 秒一次；不自動替隊友承受整發傷害。',[hook('onAllyDamaged',[mana(.03)],{internalCooldown:3})]),
  Q:ally('指定隊友獲得 240 護盾 3 秒及 spell-shield 通行標記；標記只供後招辨識，不自帶免控。',[shield(240),status('spell-shield',{},3)]),
  W:ally('消耗該隊友的通行標記，追加 200 治療；沒有標記不兌換，先前的護盾仍按原到期時間運作。',[consume('spell-shield',[heal(200)])]),
  E:move('盾擊把敵人推離 3 單位並造成小級物理傷害；接人前先清空門口。',seq([dmg('小',{damageType:'physical'}),push(3)])),
  R:ally('先給指定隊友 80 治療；最近 4 秒清過門口，額外把隊友瞬移到自己旁邊，抵達給 180 護盾 2 秒。',[heal(80),when(blink({to:'caster',applyTo:'target',onArrive:[shield(180,2)]}),recent('E'))]),
  EX:self('自己得到 150 護盾 2 秒，與 Q 的友盾分開計數。',[shield(150,2)]),
 },[edge('Q','W','ally','hp',{slot:'W',kind:'consumeStatus'}),edge('E','R','ally','distance:caster',{slot:'R',kind:'blink'},{expect:'decrease',setup:{ally:{x:0,z:5}}})]);
 case 'b2-makoto': return kit('商店距離學：移開近客提升遠射，定點營業區提供控場收尾','b2-popp','深澄真靠實際距離倍率與固定位置營業；何布是火候消耗及救援窗口。',{
  PASSIVE:passive('每次終極技命中後自己回復 80 生命，內置冷卻 3 秒；不是全場無限供魔。',[hook('onUltimateHit',[heal(80,'self')],{internalCooldown:3})]),
  Q:move('產品展示先請客人後退：推離指定敵人 3 單位，不造成傷害。',seq([push(3)])),
  W:move('弓術定點單射，小級物理傷害，距離 0 到 8 由 0.5 倍線性提高到 1.5 倍，超過按上限；真實距離決定輸出。',seq([dmg('小',{damageType:'physical',distanceScale:{atRange:8,near:.5,far:1.5}})]),'fx.prim.physical.bolt'),
  E:ground('以起手命中中心（沒有命中則施法點）固定半徑 3，每 0.5 秒重選最多 4 名敵人，共三次 slow40 減速 40% 持續 2 秒；沒有全圖界域。',[delayed([status('slow40',{moveSpeedMult:.6},2)],.5,{shape:'circle',radius:3,side:'enemies',maxTargets:4,targetMode:'reresolve',count:3,intervalSec:.5})]),
  R:move('中級集中魔法；消耗已在營業範圍沾到的 slow40，才追加沉默 1.2 秒。',seq([dmg('中'),consume('slow40',[status('magic-break',{silenced:true},1.2)])]),'fx.prim.arcane.nova'),
  EX:healing('指定合作隊友回復 120，售後範圍照正式施法距離。'),
 },[edge('Q','W','foe','hp',{slot:'Q',kind:'knockback'},{expect:'decrease'}),edge('E','R','foe','status:magic-break',{slot:'R',kind:'consumeStatus'})]);
 case 'b2-noor': return kit('只擋得住就算：物理技能反制短窗，成功反彈才有下一張盾','b2-elma','諾爾讀真實入射傷害與時間，艾爾瑪主動壓血，不做假反彈。',{
  PASSIVE:passive('真正反彈成功才給自己 rage 收據 3 秒；每 2 秒一次，不是受到傷害就給。',[hook('onReflectSuccess',[status('rage',{},3,'self')])]),
  Q:self('取得護甲 +10 與 1.8 秒不限定角度的物理技能反制；反彈成功後會一併提早撤下護甲與反制：只對 physical 的 ability 來襲，以原始傷害的 100% 產生魔法回擊（仍受對方減傷）並免去原發；1 次後撤下。普通攻擊、魔法、真傷不列入。',[buff('armor',10,1.8,{hooks:[hook('onDamageTaken',[dmg('極小',{amount:{flat:0},incomingPct:{basis:'raw',perRank:[1],maxChainDepth:1,negateOriginal:true}})],{target:'event',damageSource:'ability',damageType:'physical',maxTriggers:1,onConsumed:'detachSource',internalCooldown:0})]})]),
  W:strike('新人重擊，小級物理傷害；消耗反彈收據才給自己 220 生命回復。',{},[consume('rage',[heal(220,'self')],'self')]),
  E:self('先做好防護，spell-shield 收據 3 秒與 100 護盾。',[status('spell-shield',{},3,'self'),shield(100)]),
  R:self('把防護收據換成 300 護盾 3 秒；沒有收據不發厚盾。收據不等於萬能反彈。',[consume('spell-shield',[shield(300)],'self')]),
  EX:move('將指定敵人拉到身旁，準備下一次反制；不是反射位移。',seq([{kind:'pull',shape:'single',destination:'caster',speed:15,stopDistance:1.5}])),
 },[edge('Q','W','caster','hp',{slot:'Q',kind:'applyBuff'},{targetActor:'foe',targetTarget:'caster',waitSec:.2,observeSec:.5}),edge('E','R','caster','shield',{slot:'R',kind:'consumeStatus'},{metric:{actor:'caster',field:'shield',sample:'max'}})],['Q 不承諾方向角判定；只承諾有界的物理技能時間窗。']);
 case 'b2-touka': return kit('工頭坑洞：拋入延時落點，再用入坑紀錄收場','b2-goblin','托卡用單次延時地點與空中拋投，哥殺是反覆重選的固定施工區。',{
  PASSIVE:passive('位移成功後回復自己 50 生命，每 3 秒一次；沒有死亡換身。',[hook('onDashOrBlink',[heal(50,'self')],{internalCooldown:3})]),
  Q:ground('以起手命中中心（沒有命中則施法點）定坑，0.6 秒後重選半徑 2.5 的敌人，各定身 2 秒；坑是一次排程區域，沒有永久地形洞。',[delayed([status('root',{root:true},2)],.6,{shape:'circle',radius:2.5,side:'enemies',maxTargets:4,targetMode:'reresolve',anchor:'point'})]),
  W:move('聖劍當釣竿：將命中敵人先拉至自己再沿方向拋出 100 WC3 距離（由現有模板換算世界單位），0.4 秒落地造成小級魔法傷害；不是無限高度坑。',card('tpl-pull-throw',{mode:'toPoint',grabMode:'dragToCaster',throwMode:'distance',throwDistance:100,durationSec:.4,apexHeight:100,landRadius:2,landDamageTier:'小',castTimeSec:.1}),'fx.prim.arcane.dash'),
  E:strike('貼上 root 定身 2 秒的入坑紀錄，小級物理傷害；可被淨化。',{status:status('root',{root:true},2)}),
  R:move('消耗目標的定身紀錄，推離 4 單位並小級物理傷害；沒中坑不額外搬人。',seq([dmg('小',{damageType:'physical'}),consume('root',[push(4)])])),
  EX:mobility('工頭先撤離至合法指定點，不改寫地形也不復活勇者。'),
 },[edge('W','Q','foe','status:root',{slot:'W',kind:'leap'},{setup:{foe:{x:5,z:0}},targetPoint:{x:0,z:0}}),edge('E','R','foe','x',{slot:'R',kind:'consumeStatus'})]);
 case 'b2-haga': return kit('重現工單：標記之後可跳到當事人，沉默後回收測試魔力','b2-uncle','羽賀使用標記定位與施法封鎖，不先送錯攻擊力也不召喚客服。',{
  PASSIVE:passive('施放 E 重現工單後回復自己最大魔力 4%，每 3 秒一次；明確綁 E 施法事件，不把 magic-break 標記冒稱通用硬控事件。',[hook('onAbilityCast',[mana(.04)],{abilitySlot:'E',internalCooldown:3})]),
  Q:move('在敵人身上留下 camera-mark 4 秒（依施法者分開），本身不造成傷害、不取得全圖視野。',seq([status('camera-mark',{sourceScope:'caster'},4)])),
  W:move('指定自己留下 camera-mark 的當事人，才瞬移到他前 1.5 單位；未標記目標不位移。跨槽不使用只認同技能來源的 markedUnit。',seq([when(blink({to:'targetUnit',stopShortUnits:1.5}),{...has('camera-mark'),appliedBy:'self'})])),
  E:move('先凍結重現環境：敵人 magic-break 沉默 2 秒，能走能普攻；這不是 stun。',seq([status('magic-break',{silenced:true},2)])),
  R:move('移除敵人最多 2 項增益；若仍有 magic-break，回復自己最大魔力 10% 並消耗該標記。',seq([cleanse({polarity:'buff',pools:{buffs:true,shields:true},count:2}),consume('magic-break',[mana(.1)])])),
  EX:ally('熱修補丁：指定隊友驅散最多 3 項負面，得到 120 護盾 2 秒，不動存檔。',[cleanse(),shield(120,2)]),
 },[edge('Q','W','caster','x',{slot:'W',kind:'blink'},{setup:{foe:{x:5,z:0}}}),edge('E','R','caster','mana',{slot:'R',kind:'consumeStatus'},{setup:{caster:{manaPct:.6}}})]);
 case 'b2-kisaragi': return kit('誤點電車：驗票聚客後分別送到隨機錯站，煞車蓄力解除後再出發','b2-shadow','電車逐敵抽距離並抵達套三狀態；闇影只聚敵延爆，沒有傳送乘客。',{
  PASSIVE:passive('電車受傷後獲得 120 護盾 2 秒，每 4 秒一次；可操作本體由真實電車 GLB 提供。',[hook('onDamageTaken',[shield(120,2)],{internalCooldown:4})]),
  Q:self('驗票集合：半徑 7 內最多 8 名敵人拉向車身，在 2 單位外停下；友軍不拉。',[{kind:'pull',shape:'circle',radius:7,side:'enemies',maxTargets:8,destination:'caster',speed:20,stopDistance:2}]),
  W:self('緊急煞車：自身 root 定身 3 秒並給 140 護盾；E 可以消耗這個定身後啟動額外閃移。',[status('root',{root:true},3,'self'),shield(140,3)]),
  E:ground('消耗自身煞車 root 才瞬移到合法施法點，沒有煞車不發車；到站極小級範圍傷害。',[consume('root',[blink({onArrive:[aoe([])]})],'self')],'fx.prim.arcane.dash'),
  R:self('以半徑 4 與敵人碰撞體重疊選取最多 8 名敵人，先受極小傷害，各自等權抽 8／12／16 單位，朝施法者方向瞬移，可越過車身；合法落點裁切。抵達依出貨配方施加 curse、blind、confusion。不是全地圖均勻亂數；友軍與圈外排除。',[aoe([{kind:'weightedBranch',shape:'single',branches:[8,12,16].map(distanceUnits=>({weight:1,effects:[blink({to:'caster',applyTo:'target',distanceUnits,onArrive:['curse','blind','confusion'].map(cc)})]}))}],4,{maxTargets:8})],'fx.prim.void.nova'),
  EX:move('車門即將關閉：指定敵人小級物理傷害與 1 秒繳械；不搬動友軍。',seq([dmg('小',{damageType:'physical'}),status('numbness',{disarmed:true},1)])),
 },[edge('Q','R','foe','status:curse',{slot:'Q',kind:'pull'},{setup:{foe:{x:6,z:0}},waitSec:.8}),edge('W','E','caster','x',{slot:'E',kind:'consumeStatus'},{setup:{foe:{x:5,z:0}}})]);
 default:return null;
 }
}
