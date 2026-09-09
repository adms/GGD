import {own,has,use,say,armor,b,damageEdge} from './designs.mjs';
import {mana,shield,heal,buff,when,recent,delayed,dmg,card,seq,move,self,mobility} from './kit.mjs';
export const signatures={
 '01':'決鬥者請員工打工：雙召喚賺布局，主人騰不出手只能慢慢走',
 '02':'八神打拍子：同一招連按不集紫炎，鬼燒擺帥姿勢時腳步變慢',
 '03':'舞的加班費：實際突進接普攻，三次陽炎越忙越走不動',
 '04':'承太郎拍團體照：全區暫停，攝影師自己也必須定點擺姿勢',
 '20':'御坂踢販賣機：交替電擊充電，連鎖後才掉出治療飲料',
 '21':'小圓合約客服：有效救援才有希望，簽免死合約得短暫閉嘴',
 '23':'銀時偷喝草莓奶：偷閒存貨，喝奶怕被打斷，吐槽打斷別人',
 '24':'奇犽省電模式：閒置充電、移動耗電，一鍵放空後沒力普攻',
 '26':'柯南原地推理：觀察對方真實行為取證，說真相時自己站住',
 '27':'庫洛牌選錯工具：風把敵人吹遠，樹留人再跳近用短劍；交替卡牌補盾',
 '28':'艾莉絲淑女站姿：硬化時走得慢，忍不住就衝出去接自己的追擊',
 '30':'尼古貓貓拒絕上班：站著拖延換盾，真的移動盾就沒了',
 '31':'SUN樂裸裝攻略：讀招和反擊保持，開加速要拿護甲魔抗當賭注',
 '32':'THE END OF SON：極大範圍先變強追打我，再進賢者時間防禦歸零',
 '35':'炭治郎便當過辣：火刀較痛卻喘到走慢，吹涼調息比邊跑邊吃有效',
 '37':'吉伊卡哇借膽逃跑：隊友打架給勇氣，拿去逃命就少一串討伐叉',
};
export function adaptExisting(number,patch,{zeroDefenses}={}){
 const additions=[],combos=[];
 const tail=(slot,effects,note)=>{
  const d=patch.slots[slot];if(!d)throw Error(`Missing baseline ${number}/${slot}`);
  d.products.push({instanceId:`${slot.toLowerCase()}-parody`,template:{ref:'tpl-effect-sequence',params:{effects}}});
  // Mixed products inherit the original cast kind; only override effects in this tail product.
  const first=d.products[0].template.params??{};
  d.products.at(-1).template.params={...d.products.at(-1).template.params,castType:first.castType??'self',castTimeSec:first.castTimeSec??0,side:first.side??'enemies',radius:first.radius??2};
  d.purpose=note+'\n'+d.purpose;d.note=note+'\n'+d.note;additions.push({slot,note});
 };
 switch(number){
 case '01':tail('W',[own('slow25',{moveSpeedMult:.75},1.2,'self'),say('兩張卡，兩份勞保')],'新增代價：召喚／指揮女孩時主人減速25%1.2秒，召喚物照常行動。');break;
 case '02':tail('W',[own('slow25',{moveSpeedMult:.75},.8,'self'),say('鬼燒要擺Pose')],'新增代價：鬼燒擺姿勢0.8秒自身減速25%；原格擋與推離不變。');break;
 case '03':tail('EX',[own('slow20',{moveSpeedMult:.8},3,'self'),say('分身加班，本體腿痠')],'新增代價：陽炎出場三秒期間本體減速20%，換取既有最多三次殘像；突進仍可用。');break;
 case '04':tail('R',[own('root',{root:true},1.2,'self'),say('大家別動！我也不動！')],'新增代價：時停成立時自己也定身1.2秒，只能原地打近身目標；時間佇列、施法與到期規則保留。');break;
 case '20':return {additions:[{slot:'E',move:self('販賣機不吐飲料就踢一下：120護盾三秒；最近四秒用過W連鎖放電，自己額外回復160生命。E不集電、不耗過載。',[shield(120),when(heal(160,'self'),recent('W')),say('今天終於有找零')])}],combos:[b('W','E','caster','hp',{slot:'E',kind:'heal',conditionalOnly:true})]};
 case '21':tail('EX',[own('magic-break',{silenced:true},.6,'self'),say('簽約中請保持安靜')],'新增代價：簽免死合約後自己沉默0.6秒；友軍的一次救命額度與原有效保護計數不變。');break;
 case '23':tail('EX',[say('上班先學會吐槽','victim')],'保留喝奶／打斷連動，以命中時吐槽提示辨識實際中斷嘗試。');break;
 case '24':tail('EX',[own('numbness',{disarmed:true},1,'self'),say('電量0%，普攻也下班')],'新增代價：放空電力後自己繳械一秒，不能普攻；原三秒充電封鎖保留。');break;
 case '26':tail('R',[own('root',{root:true},.8,'self'),say('真相只有一個，先聽我講完')],'新增代價：推理宣布時自己定身0.8秒；線索仍須觀察實際事件取得，不能自己造證據。');break;
 case '27':return {additions:[
 {slot:'E',move:move('翔牌改成短跳送工具：沿合法落點飛躍0.5秒，沒有傷害或無限飛行；用來追上風牌吹遠的敵人。',seq([{kind:'leap',mode:'toPoint',applyTo:'self',apexHeight:.32,durationSec:.5,landRadius:1.83,onLand:[]}],'ground'),'fx.prim.arcane.dash')},
 {slot:'R',move:self('劍牌其實是短餐刀：四秒AD+15%、攻速+20%，普攻改為近身短距離；用樹牌留人再E接近，風牌可能把晚餐吹走。到期恢復原普攻距離，',[{kind:'applyBuff',applyTo:'self',duration:4,stackKey:'community-review-27-20260907.sword',maxStacks:1,modifiers:[{stat:'ad',op:'pctAdd',value:.15},{stat:'as',op:'pctAdd',value:.2},{stat:'range',op:'override',value:1.7}]},say('今天的庫洛牌是餐刀')])}],combos:[]};
 case '28':tail('W',[own('slow30',{moveSpeedMult:.7},3,'self'),say('淑女站好……我忍不了啦')],'新增代價：硬化三秒自己減速30%；可以用E接近或R衝刺打破站樁僵局。');break;
 case '30':tail('EX',[say('移動就算上班，拒絕！')],'保留真正移動就消失的懶人盾，以施放提示說清反制。');break;
 case '31':tail('R',[{kind:'applyBuff',applyTo:'self',duration:3,modifiers:[{stat:'armor',op:'pctAdd',value:-.25},{stat:'mr',op:'pctAdd',value:-.25}]},say('脫防具跑比較快')],'新增代價：加速三秒護甲魔抗各降低25%；格擋／精準滑步失敗更危險，讀招來源與上限不變。');break;
 case '35':tail('E',[say('便當太辣！站好吹涼！')],'保留完整呼吸規則，調息提示對應真正靜止回得較快，火刀的負擔仍有代價。');break;
 case '37':tail('W',[say('借你的勇氣先逃跑')],'保留借隊友勇氣逃跑和少打幾叉的資源取捨，逃跑時顯示同一笑點。');break;
 case '32':{
  const id=patch.projectId,originalR=patch.slots.R.products[0].template.params.effects;
  const curse=structuredClone(originalR.find(e=>e.kind==='spawnProjectile').onHit.find(e=>e.kind==='applyBuff'));
  // Owner accepted the existing 極大 tier; no global selector or new engine field.
  const r=move('THE END OF SON 前奏：0.8秒可中斷起手；自己付3%最大生命且至少留1HP，自身極大範圍內敵人受小級魔法傷害及四秒輸出-15%萎靡。',seq([dmg(),curse,say('大家先不要急著感謝我','victim'),{kind:'spendHealth',amount:{flat:0},pctMaxHealth:.03,minimumHp:1}],'ground'));
  r.cards[0].params.castTimeSec=.8;r.overrides={range:0,radiusTier:'極大'};
  const boost={kind:'applyBuff',sourceScope:'caster',stackKey:id+'.ex.boon',statusId:id+'.ex.boon',maxStacks:1,duration:2,polarity:'buff',dispellable:true,modifiers:[{stat:'outputDamagePct',op:'flat',value:.1}]};
  const weak={kind:'applyBuff',sourceScope:'caster',stackKey:id+'.ex.sage',statusId:id+'.ex.sage',maxStacks:1,duration:3,polarity:'debuff',dispellable:true,modifiers:[...zeroDefenses,{stat:'as',op:'pctAdd',value:-.6},{stat:'ms',op:'pctAdd',value:-.6}]};
  const ex=move('THE END OF SON：消耗三層負面能量，嘲諷自身極大範圍內敵人兩秒，依既有規則優先吸引自動攻擊。每名有自己R萎靡的敵人解除該詛咒，先傷害輸出+10%兩秒，再賢者時間三秒：護甲及魔抗固定零，攻速與移速各-60%（仍受GGD最低值限制）；原盾/無敵不會憑空消失。沒有自己R的敵人只走原本單次傷害與輸出-20%分支。',seq([{kind:'taunt',durationSec:2,maxTargets:20},use(id+'.r.curse',[boost,say('突然覺得自己超強！','victim'),delayed([weak,say('賢者時間：一切都空了','victim')],2,{stopOnCasterDeath:false})],'target',{onMissing:structuredClone(patch.slots.EX.products[0].template.params.effects[0].onMissing)})],'ground'));
  ex.overrides={range:0,radiusTier:'極大',statusCost:{statusId:id+'.negative-energy',count:3}};
  return {additions:[{slot:'R',move:r},{slot:'EX',move:ex}],combos:[],area:{tier:'極大',range:0,boostSec:2,weakSec:3,tauntSec:2,meaning:'Owner accepted the existing largest AoE tier. Only legal opposing bodies inside the caster-centered circle; scheduled weakness remains after caster death.'}};
 }
 }
 return {additions,combos};
}
