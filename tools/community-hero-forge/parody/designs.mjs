// First-batch approved parody adaptations. Character names/source prose live in immutable recipes.
import {dmg,heal,mana,shield,status,recent,low,distance,when,buff,cd,cleanse,push,blink,delayed,aoe,summon,hook,card,seq,move,passive,strike,self,ally,ground,healing,line,mobility,edge,kit} from './kit.mjs';
const own=(id,flags={},duration=4,to='target')=>status(id,{sourceScope:'caster',...flags},duration,to);
const has=(id,subject='target')=>({kind:'status',statusId:id,subject,appliedBy:'self'});
const consumeOwnedStatus=(id,effects,subject='target',extra={})=>({kind:'consumeStatus',shape:'single',statusId:id,count:'all',subject,appliedBy:'self',onConsumed:effects,...extra});
const say=(text,applyTo='self')=>({kind:'floatingText',shape:'single',text,applyTo,durationSec:1});
const phys=(t='小',extra={})=>dmg(t,{damageType:'physical',...extra});
const life=p=>({kind:'spendHealth',amount:{flat:0},pctMaxHealth:p,minimumHp:1});
const dash=(n=3,extra={})=>({kind:'dash',mode:'forward',speed:8,maxDistance:n,...extra});
const armor=(amount,duration=3)=>({kind:'applyBuff',applyTo:'self',duration,modifiers:[{stat:'armor',op:'flat',value:amount},{stat:'mr',op:'flat',value:amount}]});
const b=(source,target,actor,field,remove,extra={})=>edge(source,target,actor,field,remove,extra);
const damageEdge=(source,target,remove,extra={})=>b(source,target,'foe','hp',remove,{expect:'decrease',...extra});
export const rewritten=['05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','22','25','29','33','34','36'];
export function redesign(n){switch(n){
case '05':return kit('過熱機器人：砲擊把自己燒到跑不動，排氣拿敵人當散熱片','35','洛克人消耗過熱換排氣；炭治郎在水火間分配呼吸與短暫負擔。',{
 PASSIVE:passive('Q 或 R 開火後散熱器卡住，自身減速40%四秒；排氣或冷卻才能解除。',[...['Q','R'].map(abilitySlot=>hook('onAbilityCast',[own('slow40',{moveSpeedMult:.6},4,'self')],{abilitySlot,internalCooldown:0})),hook('onAbilityCast',[shield(120,2)],{abilitySlot:'E',condition:recent('W'),internalCooldown:0})]),
 Q:line('小鋼砲直線中級魔法傷害；開砲有過熱代價。'),
 W:self('散熱排氣：消耗自己的過熱，才對周圍三格敵人造成小級傷害並回復自身8%魔力；沒熱就吹冷氣。',[consumeOwnedStatus('slow40',[aoe([],3,{amount:{damageTier:'小'}}),mana(.08),say('拿你當散熱片！')],'self')]),
 E:mobility('滑行到指定點；排氣後四秒內再由被動給自己120護盾。'),
 R:move('三發砲彈每0.35秒追著指定敵人結算極小傷害；可用排氣解過熱。',card('tpl-lock-combo',{hitCount:3,hitIntervalSec:.35,perHitDamage:{damageTier:'極小'},damageType:'magic',lockTarget:'none',casterGuard:'none'})),
 EX:self('關機保固：180護盾三秒；有過熱時護盾仍不解除減速，請自己找W。',[shield(180),say('本產品不含散熱風扇')]),
},[damageEdge('Q','W',{slot:'W',kind:'consumeStatus'}),b('W','E','caster','shield',{slot:'PASSIVE',kind:'shield'},{metric:{actor:'caster',field:'shield',sample:'max'}})]);
case '06':return kit('吃撐二選一：把對手當午餐，吐出去打人或吞下去補血','05','卡比一次吃飽同時鎖住兩種兌換；不是攻擊後自動附傷。',{
 PASSIVE:passive('Q進食成功施法後取得一份食材四秒；刷新一份，不累積無限餐點。',[hook('onAbilityCast',[own('ingredient',{},4,'self')],{abilitySlot:'Q',internalCooldown:0})]),
 Q:move('把指定敵人拉到身前1.5格，自己吃撐減速40%兩秒；不消滅敵方英雄。',seq([{kind:'pull',shape:'single',destination:'caster',speed:12,stopDistance:1.5},own('slow40',{moveSpeedMult:.6},2,'self')])),
 W:move('吐星星：消耗自己食材，對指定敵人小級打擊並推開四格；消耗後不能立刻拿同一份補血。',seq([consumeOwnedStatus('ingredient',[dmg(),push(4),say('不好吃！','victim')],'self')])),
 E:mobility('圓滾滾飄走，合法瞬移；不複製對手模型或技能。'),
 R:ground('鍋蓋落地：0.7秒後重選落點兩格敵人造成中級傷害；跑開即可躲。',[delayed([dmg('中')],.7,{shape:'circle',radius:2,side:'enemies',targetMode:'reresolve',anchor:'point'})]),
 EX:self('消化：消耗同一份食材回復240生命；這回合的星星就當午餐吃掉。',[consumeOwnedStatus('ingredient',[heal(240,'self'),say('下午茶取消戰鬥')],'self')]),
},[damageEdge('Q','W',{slot:'W',kind:'consumeStatus'}),b('Q','EX','caster','hp',{slot:'EX',kind:'consumeStatus'})]);
case '07':return kit('伸縮自在的口香糖：先黏、再推遠，拉長了才像在打人','08','西索操縱敵人距離；米卡莎花時間補氣後移動並斬擊。',{
 PASSIVE:passive('自己真正施加控制後得到60護盾一秒，每三秒一次；表演翻車仍會掉血。',[hook('onCrowdControlApplied',[shield(60,1)],{internalCooldown:3})]),
 Q:strike('把自己的口香糖黏上敵人四秒，減速20%；別人的糖不算。',{status:own('slow20',{moveSpeedMult:.8})}),
 W:move('收線：只有自己黏過的敵人才被拉至身前；起手距離超過四格還多一次小級傷害。',seq([consumeOwnedStatus('slow20',[when(phys(),distance('>',4)),{kind:'pull',shape:'single',destination:'caster',speed:14,stopDistance:1.5},say('拉太長會痛喔','victim')])])),
 E:move('先將敵人推遠四格，替口香糖上弦；這招不自帶傷害。',seq([push(4)])),
 R:move('收表演費：中級打擊；仍黏著自己的糖時定身一秒，控制可以被淨化。',seq([phys('中'),when(own('root',{root:true},1),has('slow20'))])),
 EX:mobility('魔術師換位離場，不留假的可攻擊分身。'),
},[b('Q','W','foe','distance:caster',{slot:'W',kind:'consumeStatus'},{expect:'decrease',setup:{foe:{x:5,z:0}}}),damageEdge('E','W',{slot:'W',kind:'damage',conditionalOnly:true},{beforeSteps:[{kind:'cast',slot:'Q',waitSec:.3}]})]);
case '08':return kit('瓦斯費先付：原地換罐挨打，補氣後的斬擊才有第二刀','34','補氣會把自己鎖在原地；高速婆婆是高速與煞停的攻防交換。',{
 PASSIVE:passive('成功位移後得到80護盾一秒，每三秒一次；這是安全繩保險，不是無敵。',[hook('onDashOrBlink',[shield(80,1)],{internalCooldown:3})]),
 Q:strike('近身小級刀擊；四秒內換過E瓦斯罐才追加一刀極小物理傷害。',{},[when(phys('極小'),recent('E'))]),
 W:move('鋼索斜飛：沿指定方向前進三格，沿途敵人各吃一次極小刀擊。',seq([dash(3,{onTouch:[phys('極小')]})],'skillshot'),'fx.prim.wind.slash'),
 E:self('換瓦斯罐：自身定身0.7秒，回復15%魔力；敵人可以趁換罐進攻。',[own('root',{root:true},.7,'self'),mana(.15),say('瓦斯費誰付？')]),
 R:move('報銷刀片：指定敵人四段極小斬擊；四秒內用過W再退回5%魔力。',[card('tpl-lock-combo',{hitCount:4,hitIntervalSec:.2,perHitDamage:{damageTier:'極小'},damageType:'physical',lockTarget:'none',casterGuard:'none'}),card('tpl-effect-sequence',{effects:[when(mana(.05),recent('W'))],radius:2.75,castType:'targeted',castTimeSec:0})]),
 EX:mobility('脫離危險到合法施法點，沒有免費補瓦斯。'),
},[damageEdge('E','Q',{slot:'Q',kind:'damage',conditionalOnly:true}),b('W','R','caster','mana',{slot:'R',kind:'restore',conditionalOnly:true},{setup:{caster:{manaPct:.4}},observeSec:.4})]);
case '09':return kit('賢狼保險：拿自己的血當保費，快破產時才開出大額理賠','21','赫蘿以自己健康作保；小圓累積友軍有效保護後兌換希望。',{
 PASSIVE:passive('隊友實際受傷後，自己回復4%魔力，每三秒一次；不是鼓勵站著白挨打的回血光環。',[hook('onAllyDamaged',[mana(.04)],{internalCooldown:3})]),
 Q:move('禁止退貨：敵方小級魔法傷害並受療減半三秒。',seq([dmg(),own('grievous-wounds',{healingTakenMult:.5},3)])),
 W:ally('墊付保費：自己付最大生命15%但至少留1HP，指定隊友回復160。',[life(.15),heal(160),say('利息另計','victim')]),
 E:ally('理賠審核：隊友得到120護盾；自己生命低於50%時再追加240治療。',[shield(120),when(heal(240),low(.5))]),
 R:self('先救保險公司：自己回復220生命與20%魔力；不改隊友帳戶。',[heal(220,'self'),mana(.2)]),
 EX:ally('售後服務：淨化指定隊友最多三項負面；自己減速30%兩秒去跑腿。',[cleanse(),own('slow30',{moveSpeedMult:.7},2,'self')]),
},[b('W','E','ally','hp',{slot:'E',kind:'heal',conditionalOnly:true},{setup:{caster:{hpPct:.6}}}),b('W','R','caster','hp',{slot:'R',kind:'heal'},{setup:{caster:{hpPct:1}},note:'保費造成真實生命缺口，R治療只填實際缺口。'})]);
case '10':return kit('Zero遙控上班：敵人先點名，隊友加速幹活，自己慢半拍開會','01','魯路修把發令成本留給自己；遊戲用真召喚與陷阱佈局。',{
 PASSIVE:passive('發出W命令後自己減速50%兩秒；隊友衝鋒，總指揮還在開會。',[hook('onAbilityCast',[own('slow50',{moveSpeedMult:.5},2,'self')],{abilitySlot:'W',internalCooldown:0})]),
 Q:move('先點名：指定敵人減速25%三秒；並不永久控制對方。',seq([own('slow25',{moveSpeedMult:.75},3)])),
 W:ally('指定隊友攻擊力+20三秒；四秒內點名過Q再增加移速40%。',[buff('ad',20,3,{applyTo:'target'}),when(own('rage',{moveSpeedMult:1.4},3),recent('Q')),say('你去，我開會','victim')]),
 E:ally('遠端加班保險，指定隊友180護盾三秒。',[shield(180)]),
 R:self('命令執行後才能喊撤退：最近四秒用過W，自己周圍三格敵人恐懼0.8秒。',[when(delayed([own('fear',{feared:true},.8)],.1,{shape:'circle',radius:3,side:'enemies',targetMode:'reresolve',anchor:'caster'}),recent('W'))]),
 EX:mobility('總指揮緊急離席，瞬移到合法指定點。'),
},[b('Q','W','ally','z',{slot:'W',kind:'applyStatus',conditionalOnly:true},{targetSteps:[{kind:'cast',slot:'W',waitSec:.3},{kind:'move',actor:'ally',point:{x:0,z:6},waitSec:.5}]}),b('W','R','foe','status:fear',{slot:'R',kind:'delayed',conditionalOnly:true})]);
case '11':return kit('史萊姆試吃會：真的挨過物理或魔法，才能分別吐出不同口味','06','利姆路按來襲傷害型別取樣；卡比主動吃一份後選吐出或消化。',{
 PASSIVE:passive('受到物理傷害留物理樣本、魔法傷害留魔法樣本四秒，兩口味分開；真伤不供樣本。',[hook('onDamageTaken',[own('rage',{},4,'self')],{damageType:'physical'}),hook('onDamageTaken',[own('spell-shield',{},4,'self')],{damageType:'magic'})]),
 Q:move('魔法口味：小級魔法打擊，消耗自己的魔法樣本才追加小級魔法傷害。',seq([dmg(),consumeOwnedStatus('spell-shield',[dmg(),say('這口是魔法','victim')],'self')])),
 W:self('變果凍，120護盾三秒；樣本標記本身並非魔法免疫。',[shield(120)]),
 E:move('物理口味：小級物理打擊，消耗自己的物理樣本才把敵人推開三格。',seq([phys(),consumeOwnedStatus('rage',[push(3)],'self')])),
 R:self('綜合口味：兩份樣本各可換120生命，沒有的口味不出餐；每份只消耗一次。',[consumeOwnedStatus('rage',[heal(120,'self')],'self'),consumeOwnedStatus('spell-shield',[heal(120,'self')],'self')]),
 EX:mobility('縮成一坨跑掉；不複製敵人的技能。'),
},[damageEdge('E','Q',{slot:'Q',kind:'consumeStatus'},{sourceActor:'foe',sourceTarget:'caster'}),b('W','E','foe','x',{slot:'E',kind:'consumeStatus'},{sourceActor:'foe',sourceTarget:'caster'})]);
case '12':return kit('投影保固：山寨盾真的碎了，才能把退貨單投影成第二把劍','31','士郎要先損失真正護盾；SUN樂靠短窗格擋與實際移動閃避。',{
 PASSIVE:passive('自己的護盾實際破裂後取得保固單四秒，每兩秒一次；空放護盾不給。',[hook('onShieldBroken',[own('rage',{},4,'self')])]),
 Q:strike('投影小刀小級物理打擊；消耗保固單追加小級劍擊並回復5%魔力。',{},[consumeOwnedStatus('rage',[phys(),mana(.05),say('保固換新！','victim')],'self')]),
 W:self('廉價投影盾：只有40吸收量、持續三秒。敵人不打破就拿不到退貨單。',[shield(40,3)]),
 E:move('把鍋鏟當劍丟：小級打擊並定身0.6秒。',seq([phys(),own('root',{root:true},.6)])),
 R:move('廚房劍雨，三發小級物理傷害；不召喚永久武器庫。',card('tpl-random-barrage',{count:3,intervalSec:.3,impactDamage:{damageTier:'小'},damageType:'physical',impactRadius:100,scatterRadius:100})),
 EX:self('保固也能折現：消耗同一張保固單回復220生命，和Q只能選一邊。',[consumeOwnedStatus('rage',[heal(220,'self')],'self')]),
},[damageEdge('W','Q',{slot:'Q',kind:'consumeStatus'},{sourceSteps:[{kind:'cast',slot:'W',waitSec:.2},...Array.from({length:5},()=>({kind:'cast',actor:'foe',slot:'Q',target:'caster',waitSec:.2}))],sourceIndexes:[0],responseIndex:6}),b('W','EX','caster','hp',{slot:'EX',kind:'consumeStatus'},{sourceSteps:[{kind:'cast',slot:'W',waitSec:.2},...Array.from({length:5},()=>({kind:'cast',actor:'foe',slot:'Q',target:'caster',waitSec:.2}))],sourceIndexes:[0],responseIndex:6})]);
case '13':return kit('自拍狙擊：架好相機才有大頭照，嫌臉太大就把人推遠','18','詩乃讀射擊距離與完成架槍；金閃閃讀敵人魔力餘額。',{
 PASSIVE:passive('W架槍後0.6秒才取得焦點四秒；沒有瞬間瞄準。',[hook('onAbilityCast',[delayed([own('camera-mark',{},4,'self')],.6)],{abilitySlot:'W',internalCooldown:0})]),
 Q:move('證件照：小級射擊，消耗完成的焦點再追加中級物理傷害。',seq([phys(),consumeOwnedStatus('camera-mark',[phys('中'),say('不要動，拍糊了','victim')],'self')])),
 W:self('架腳架：自己定身0.7秒並取得80護盾；P在架穩後給焦點。',[own('root',{root:true},.7,'self'),shield(80,1)]),
 E:move('鏡頭裝不下：將敌人推遠四格，不自帶傷害。',seq([push(4)])),
 R:move('遠景照：小級物理傷害，起手距離超過四格追加中級傷害；貼臉不算遠景。',seq([phys(),when(phys('中'),distance('>',4))])),
 EX:mobility('背著腳架撤離合法落點，不洗掉Q冷卻。'),
},[damageEdge('W','Q',{slot:'Q',kind:'consumeStatus'}),damageEdge('E','R',{slot:'R',kind:'damage',conditionalOnly:true})]);
case '14':return kit('改作業的殺老師：先讓學生看不清，再把錯題收回換全班補血','26','殺老師回收自己施加的致盲來補隊；柯南收集敵方事件後宣布真相。',{
 PASSIVE:passive('自己施加控制後，移速增加20%兩秒，每三秒一次；趕著批下一份。',[hook('onCrowdControlApplied',[own('rage',{moveSpeedMult:1.2},2,'self')],{internalCooldown:3})]),
 Q:move('零分粉筆：敵人小級魔法傷害，普攻失手40%三秒。',seq([dmg(),own('blind',{missChance:.4},3)])),
 W:move('發還考卷：消耗自己給敵人的致盲，解除他的視力問題；自己周圍三格友軍各回復160。',seq([consumeOwnedStatus('blind',[delayed([heal(160)],.1,{shape:'circle',radius:3,side:'allies',anchor:'caster',targetMode:'reresolve'}),say('訂正完可以睜眼','victim')])])),
 E:mobility('高速巡堂移動到合法落點，沒有保證閃避。'),
 R:move('下課前小考：三次極小魔法打擊；同目標死亡即停止。',card('tpl-lock-combo',{hitCount:3,hitIntervalSec:.25,perHitDamage:{damageTier:'極小'},damageType:'magic',lockTarget:'none',casterGuard:'none'})),
 EX:ally('補習班保護：給隊友180護盾；自己慢30%兩秒去擦黑板。',[shield(180),own('slow30',{moveSpeedMult:.7},2,'self')]),
},[b('Q','W','ally','hp',{slot:'W',kind:'consumeStatus'}),b('Q','E','caster','distance:foe',{slot:'PASSIVE',kind:'applyStatus'},{expect:'increase',targetSteps:[{kind:'move',point:{x:-5,z:0},waitSec:.4}]})]);
case '15':return kit('兄貴先護弟：保護队友再用摔角報銷醫藥費','36','比利保隊友後自己回血；蘭斯把仇恨拉向自己供隊友撤退。',{
 PASSIVE:passive('隊友受傷時自己護甲魔抗各+15兩秒，每三秒一次。',[hook('onAllyDamaged',[armor(15,2)],{internalCooldown:3})]),
 Q:move('握手不要跑：敵人拉到身前1.5格。',seq([{kind:'pull',shape:'single',destination:'caster',speed:12,stopDistance:1.5}])),
 W:ally('先罩小弟：指定隊友200護盾三秒；自己不偷領同一片盾。',[shield(200),say('兄弟我罩你','victim')]),
 E:move('擠進人群：向前衝三格，沒有暗藏的衝撞傷害。',seq([dash()],'skillshot'),'fx.prim.arcane.dash'),
 R:strike('近身擂台重擊；四秒內先用過W保護隊友，自己回復240生命。',{},[when(heal(240,'self'),recent('W'))]),
 EX:self('站在一起才壯：140護盾兩秒，最近四秒用過Q再加護甲魔抗各20。',[shield(140,2),when(armor(20,2),recent('Q'))]),
},[b('W','R','caster','hp',{slot:'R',kind:'heal',conditionalOnly:true}),b('Q','EX','caster','stat:armor',{slot:'EX',kind:'applyBuff',conditionalOnly:true})]);
case '16':return kit('魔法少女換裝事故：穿近戰卡會丟掉魔攻，卸妝才退票','33','伊莉雅交換AD/AP；刀太交換移速與攻擊力並以重劍姿態回血。',{
 PASSIVE:passive('施放EX準備卸妝時回復5%魔力，每三秒一次；並非普攻免費附傷。',[hook('onAbilityCast',[mana(.05)],{abilitySlot:'EX',internalCooldown:3})]),
 Q:move('魔法拳：小級物理傷害加0.8AD；近戰服提供AD，仍遵守本遊戲的通用技能係數。',seq([phys('小',{amount:{damageTier:'小',ratios:[{stat:'ad',coeff:.8}]}})])),
 W:self('近戰職階裝填：三秒攻擊力+80、魔法攻擊力-20。',[{kind:'applyBuff',applyTo:'self',statusId:'rage',sourceScope:'caster',duration:3,modifiers:[{stat:'ad',op:'flat',value:80},{stat:'ap',op:'flat',value:-20}]},say('魔法少女用拳頭！')]),
 E:ally('借你緞帶：指定隊友140護盾三秒，不假裝成換装。',[shield(140)]),
 R:line('魔法光束：中級魔法傷害加0.8AP；穿近戰服時這招會弱，選裝有取捨。',{damage:{damageTier:'中',ratios:[{stat:'ap',coeff:.8}]}}),
 EX:self('卸妝退票：消耗自己的職階增益還原攻擊力與魔法攻擊力，回復10%魔力；沒有衣服不退額外魔力。',[consumeOwnedStatus('rage',[mana(.1)],'self')]),
},[damageEdge('W','Q',{slot:'W',kind:'applyBuff'}),b('W','R','foe','hp',{slot:'W',kind:'applyBuff'},{expect:'increase'})]);
case '17':return kit('骨王年會：自己站住講幹話換魔攻，保鑣與提早散會救場','04','骨王限制的是自己的移動；承太郎會真實停止區域時間。',{
 PASSIVE:passive('R演說開始時獲得120護盾一秒，每五秒一次；護盾不等於免打斷。',[hook('onUltimateCast',[shield(120,1)],{internalCooldown:5})]),
 Q:line('例行業務魔法：小級魔法傷害加0.5AP。',{damage:{damageTier:'小',ratios:[{stat:'ap',coeff:.5}]}}),
 W:self('會議室鎖門：自己定身兩秒，AP+70兩秒；可以施法，但不能逃跑。',[own('root',{root:true},2,'self'),buff('ap',70,2),say('我其實也不知道在講什麼')]),
 E:move('請一名四秒保鑣，攻擊/生命倍率各0.3，最多兩名；死亡跟著散會。',card('tpl-summon-agent',{body:'self',count:1,durationSec:4,damageMult:.3,hpMult:.3,maxAlive:2,onOwnerDeath:'despawn'})),
 R:line('0.8秒可中斷的魔法簡報，中級魔法傷害加0.8AP；趁會議加成放，敵人可控制打斷。',{castTimeSec:.8,damage:{damageTier:'中',ratios:[{stat:'ap',coeff:.8}]}}),
 EX:self('提早散會：解除自己的會議定身才能取得240生命；若已坐完會，沒出席費。',[consumeOwnedStatus('root',[heal(240,'self')],'self')]),
},[damageEdge('W','R',{slot:'W',kind:'applyBuff'},{waitSec:.3}),b('W','EX','caster','hp',{slot:'EX',kind:'consumeStatus'},{waitSec:.3})]);
case '18':return kit('王之信用審查：先扣對手魔力，餘額不足才加收寶具手續費','13','金閃閃讀敵方魔力；詩乃讀距離與架槍焦點。',{
 PASSIVE:passive('R真正命中敵人後自己回復8%魔力，每次施法一次；空放不退款。',[hook('onDamageDealt',[mana(.08)],{abilitySlot:'R',damageSource:'ability',oncePerCast:true,internalCooldown:0})]),
 Q:move('刷卡驗資：指定敌人小級魔法傷害，另扣目標120魔力；不足只扣剩餘量。',seq([dmg(),{kind:'spendMana',amount:{flat:120},applyTo:'target'},say('餘額不足也敢見本王','victim')])),
 W:self('富人護盾：120護盾；自己魔力超過50%再加100護盾，同一來源採較大值不無限疊。',[shield(120),when(shield(220),{kind:'stat',subject:'self',stat:'mp',mode:'percent',op:'>',value:.5})]),
 E:move('排隊請後退：敵人推離三格，不再给一片無關的自己護盾。',seq([push(3)])),
 R:move('逾期手續費：中級魔法傷害，目標魔力低於50%再追加小級傷害。',seq([dmg('中'),when(dmg(),{kind:'stat',subject:'target',stat:'mp',mode:'percent',op:'<',value:.5})])),
 EX:move('回收贈品：移除目標最近一項可驅散增益，魔法打擊小級。',seq([cleanse({polarity:'buff',pools:{buffs:true},count:1}),dmg()])),
},[damageEdge('Q','R',{slot:'R',kind:'damage',conditionalOnly:true},{setup:{foe:{manaPct:.51}},waitSec:.2,observeSec:.3}),b('Q','W','caster','shield',{slot:'W',kind:'shield',conditionalOnly:true},{expect:'decrease',setup:{caster:{manaPct:.51}},waitSec:.2,observeSec:.3,metric:{actor:'caster',field:'shield',sample:'max'}})]);
case '19':return kit('雙刀鍵盤鬼：Q後換W才退Q冷卻，無腦同鍵連點不報銷','02','桐人跨槽退冷卻；八神是同槽的三次獨立輸入窗口。',{
 PASSIVE:passive('W成功施法且四秒內用過Q，減少Q冷卻四秒；同按Q、隔太久W都不退。',[hook('onAbilityCast',[cd('Q',4),say('連點器不算雙刀！')],{abilitySlot:'W',condition:recent('Q'),internalCooldown:3})]),
 Q:strike('右手小級劍擊，實際冷卻留給W接續；仍支付自己的魔力。'),
 W:strike('左手小級劍擊；P只在Q→W時報銷Q冷卻，不直接給無敵。'),
 E:mobility('側步離場到合法落點，不自動重置雙刀。'),
 R:move('限量四連斬：四段極小傷害，最後不再乘一次段數。',card('tpl-lock-combo',{hitCount:4,hitIntervalSec:.2,perHitDamage:{damageTier:'極小'},damageType:'physical',lockTarget:'none',casterGuard:'none'})),
 EX:self('左手忙完才包紮：回復100生命，四秒內用過W再回復120。',[heal(100,'self'),when(heal(120,'self'),recent('W'))]),
},[b('Q','W','caster','cooldown:Q',{slot:'PASSIVE',kind:'modifyCooldown'},{expect:'decrease'}),b('W','EX','caster','hp',{slot:'EX',kind:'heal',conditionalOnly:true})]);
case '22':return kit('昴的免死薪水：每回合只領一次，拿血幫隊友後自己哭著討拍','25','昴支付生命與一次免死；埼玉提購物袋使普攻不能用，再選收場或分菜。',{
 PASSIVE:move('每回合一張免死卡，受致命傷消耗後保留15%生命並0.5秒免傷；無死亡回溯、無永久疊屬性。',card('tpl-mark-stacks',{markId:'community-review-22-20260907.second-chance',initial:1,max:1,resetOn:'round',durationSec:-1,lethalMode:'save',perStackLost:[],surviveHpPct:.15,invulnerableSec:.5,restoreHealthPct:0,aoeRadius:0}),null),
 Q:move('我很有用：小級物理打擊，敵人減速20%兩秒。',seq([phys(),own('slow20',{moveSpeedMult:.8},2)])),
 W:ally('逞強代班：自己付最大生命20%至少留1HP，队友拿220護盾三秒。',[life(.2),shield(220),say('我真的沒事','self')]),
 E:self('哭著找人：120護盾，自己減速20%兩秒，保護仍有代價。',[shield(120),own('slow20',{moveSpeedMult:.8},2,'self')]),
 R:self('討拍急救：回復100；生命低於50%再回復260。討拍時自己一秒不能普攻。',[when(heal(260,'self'),low(.5)),heal(100,'self'),own('numbness',{disarmed:true},1,'self')]),
 EX:mobility('逃跑不算讀檔，瞬移到合法落點；不補回免死卡。'),
},[b('W','R','caster','hp',{slot:'R',kind:'heal',conditionalOnly:true},{setup:{caster:{hpPct:.6}}})]);
case '25':return kit('一拳特價日：提著菜不能普攻，放下購物袋才打得出認真拳','22','購物狀態有輸出或分菜兩種消費；不是失去一條命換固定補血。',{
 PASSIVE:passive('用EX招呼隊友來分菜時回復8%魔力，每四秒一次；有沒有菜只決定EX能否治療。',[hook('onAbilityCast',[mana(.08)],{abilitySlot:'EX',internalCooldown:4})]),
 Q:strike('普通拳小級物理傷害加0.8AD，不保證一拳秒殺。',{damage:{damageTier:'小',ratios:[{stat:'ad',coeff:.8}]}}),
 W:self('超市衝刺：四秒自己移速+50%但不能普攻；雙手提菜的狀態只能消費一次。',[own('numbness',{disarmed:true,moveSpeedMult:1.5},4,'self'),say('特價只到五點！')]),
 E:mobility('抄近路買菜，瞬移到合法落點，仍遵守落點限制。'),
 R:move('放下菜再認真：普通小級打擊；消耗自己購物狀態才追加大級物理傷害，消耗後移速和繳械一起結束。',seq([phys(),consumeOwnedStatus('numbness',[phys('大'),say('菜壓壞了！','victim')],'self')])),
 EX:ally('分菜：消耗自己的購物狀態，指定隊友回復260；分完就不能拿同一袋打認真拳。',[consumeOwnedStatus('numbness',[heal(260)],'self')]),
},[damageEdge('W','R',{slot:'R',kind:'consumeStatus'}),b('W','EX','ally','hp',{slot:'EX',kind:'consumeStatus'})]);
case '29':return kit('芙莉蓮掛號處：治療約兩秒後，先給候診者盾；病人跑掉就白等','30','芙莉蓮保護等候指定落點的隊友；尼古貓把不移動本身兌成保命盾。',{
 PASSIVE:passive('自己真正接受治療後回復5%魔力，每三秒一次；不是持續白拿藍。',[hook('onHeal',[mana(.05)],{internalCooldown:3})]),
 Q:line('普通攻擊魔法，中級直線魔法傷害；招式名普通不代表無限傷害。'),
 W:ally('候診保險：指定队友160護盾三秒；四秒內開過E掛號，再加100護盾。',[shield(160),when(shield(260),recent('E'))]),
 E:move('掛號排隊：以指定隊友當下落點約兩秒後重選兩格內友軍，各回復220；病人走掉可落空。',seq([delayed([heal(220)],2,{shape:'circle',radius:2,side:'allies',anchor:'point',targetMode:'reresolve'})],'targeted','allies'),'fx.prim.wind.pulse-sm'),
 R:move('花園候診室：三次每秒重選自身三格友軍各回復60；原地站好，不是傷害友軍的魔法領域。',seq([delayed([heal(60)],.5,{shape:'circle',radius:3,side:'allies',anchor:'caster',targetMode:'reresolve',count:3,intervalSec:1})],'self'),'fx.prim.wind.pulse-sm'),
 EX:mobility('把診間搬到自己身邊，瞬移到合法落點；已約好的E地點不會跟著搬。'),
},[b('E','W','ally','shield',{slot:'W',kind:'shield',conditionalOnly:true},{metric:{actor:'ally',field:'shield',sample:'max'},waitSec:.3}),b('EX','R','ally','hp',{slot:'R',kind:'delayed'},{sourcePoint:{x:0,z:5},setup:{ally:{x:0,z:5}},observeSec:2})]);
case '33':return kit('刀太的健身鐵片：背重劍變慢變強，丟掉鐵片才跑得動','16','刀太用移速負擔換攻擊與自療；伊莉雅是物理/魔法輸出的職階交換。',{
 PASSIVE:passive('背著自己的slow40重劍增益受傷時回復60生命，每兩秒一次；空身不領健身補貼。',[hook('onDamageTaken',[when(heal(60,'self'),has('slow40','self'))])]),
 Q:strike('黑棒劍小級物理傷害加0.8AD，真實讀重量模式增加的AD。',{damage:{damageTier:'小',ratios:[{stat:'ad',coeff:.8}]}}),
 W:self('負重深蹲：回復100；仍背重劍時再回復180。',[when(heal(180,'self'),has('slow40','self')),heal(100,'self')]),
 E:self('掛上鐵片：四秒AD+45、移速-40%，同一份具名buff，卸下時一起還原。',[{kind:'applyBuff',statusId:'slow40',sourceScope:'caster',applyTo:'self',duration:4,modifiers:[{stat:'ad',op:'flat',value:45},{stat:'ms',op:'pctAdd',value:-.4}]},say('這支啞鈴有劍柄')]),
 R:move('健身成果展示，兩次小級物理傷害；不是永久吸血。',card('tpl-lock-combo',{hitCount:2,hitIntervalSec:.3,perHitDamage:{damageTier:'小'},damageType:'physical',lockTarget:'none',casterGuard:'none'})),
 EX:self('卸鐵片：消耗自己的重劍buff才回復8%魔力並得到25%移速兩秒；沒掛過不補貼。',[consumeOwnedStatus('slow40',[mana(.08),own('rage',{moveSpeedMult:1.25},2,'self')],'self')]),
},[damageEdge('E','Q',{slot:'E',kind:'applyBuff'}),b('E','W','caster','hp',{slot:'W',kind:'heal',conditionalOnly:true})]);
case '34':return kit('高速婆婆測速照：先違規加速再剎車，把罰單塞給追兵','08','婆婆主動降防加速，剎停以最近衝刺解鎖推敵；米卡莎需原地補氣。',{
 PASSIVE:passive('R催油門後護甲和魔抗各降低30兩秒；跑很快不代表撞車不痛。',[hook('onAbilityCast',[armor(-30,2)],{abilitySlot:'R',internalCooldown:0})]),
 Q:move('直線違規：衝六格，沿途敌人各受一次小級物理傷害，不鎖住目標。',seq([dash(6,{onTouch:[phys()]})],'skillshot'),'fx.prim.arcane.dash'),
 W:self('急剎：自己定身0.5秒；四秒內用過Q，周圍三格敌人被推開三格。',[own('root',{root:true},.5,'self'),when(delayed([push(3)],.1,{shape:'circle',radius:3,side:'enemies',anchor:'caster',targetMode:'reresolve'}),recent('Q')),say('這裡沒有測速照相吧？')]),
 E:move('收罰單：指定敵人減速40%兩秒；四秒內用過W再繳械一秒。',seq([own('slow40',{moveSpeedMult:.6},2),when(own('numbness',{disarmed:true},1),recent('W'))])),
 R:self('破表油門：自身移速增加60%兩秒，P同步降防。',[own('rage',{moveSpeedMult:1.6},2,'self')]),
 EX:mobility('下個路口再見：短距離合法瞬移，不取消既有罰單或冷卻。'),
},[b('Q','W','foe','x',{slot:'W',kind:'delayed',conditionalOnly:true},{setup:{foe:{x:7,z:0}},waitSec:1}),b('W','E','foe','status:numbness',{slot:'E',kind:'applyStatus',conditionalOnly:true})]);
case '36':return kit('蘭斯嘴砲隊長：全怪來打我，隊友趁我挨揍跑掉','15','蘭斯用真正嘲諷把攻擊引向自己；比利先給單體隊友盾再自療。',{
 PASSIVE:passive('自己受傷時，三秒內用過W才回復80生命，每兩秒一次；嘴砲前被打沒有安慰獎。',[hook('onDamageTaken',[when(heal(80,'self'),recent('W',3))])]),
 Q:strike('粗魯一刀小級物理傷害；三秒內用過W，再多極小物理傷害。',{},[when(phys('極小'),recent('W',3))]),
 W:self('嘴砲搶仇恨：三格內敵人嘲諷自己1.2秒，取得180護盾；依GGD規則優先自動索敵。',[{kind:'taunt',radius:3,durationSec:1.2,maxTargets:6},shield(180,2),say('有種都衝我來！')]),
 E:move('勇者先衝：貼地前進三格，敵人仍可用地形攔截。',seq([dash()],'skillshot'),'fx.prim.arcane.dash'),
 R:ally('隊友先走：指定隊友移速+40%三秒；四秒內用過W再給240護盾。',[own('rage',{moveSpeedMult:1.4},3),when(shield(240),recent('W'))]),
 EX:self('事後裝沒事：回復160生命，不把自己的嘲諷轉嫁隊友。',[heal(160,'self')]),
},[damageEdge('W','Q',{slot:'Q',kind:'damage',conditionalOnly:true}),b('W','R','ally','shield',{slot:'R',kind:'shield',conditionalOnly:true},{metric:{actor:'ally',field:'shield',sample:'max'}})]);
default:return null;
}}
export {own,has,consumeOwnedStatus,say,phys,life,dash,armor,b,damageEdge};
