import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// This is an offline authoring helper, not a new runtime/template registry.
// Every emitted card points to a shipped enabled Main template.
const clone = x => structuredClone(x);
const damage = (tier='小', type='magic') => ({kind:'damage', damageType:type, amount:{damageTier:tier}});
const has = (id,subject='target') => ({kind:'status',subject,statusId:id});
const stat = (id,extra={},duration=2,applyTo='target') => ({kind:'applyStatus',statusId:id,duration,applyTo,...extra});
const shield = () => ({kind:'shield',amount:{flat:120},duration:3,absorbs:'all',stackKey:'b2-guard',onExisting:'keepLarger'});
const heal = applyTo => ({kind:'heal',amount:{flat:100},applyTo});
const slow = () => stat('slow40',{moveSpeedMult:0.6});
const knock = (from='caster') => ({kind:'knockback',distance:4,speed:12,from,subtractGap:false,uncontrollable:false});
// Standalone blast, not splash after an already-paid primary hit: include the
// engine-resolved epicentre target as well (shipped damageArea contract).
const area = (tier='小',payload=[]) => ({kind:'damageArea',radius:4,includeOrigin:true,amount:{damageTier:tier},damageType:'magic',maxTargets:8,...(payload.length?{onHitTargets:payload,onHitTargetsMode:'perTarget'}:{})});

function findNodes(value,predicate,out=[]) {
  if(value && typeof value==='object') {if(predicate(value))out.push(value); for(const child of Object.values(value))findNodes(child,predicate,out);}
  return out;
}

export function shippedStatusPresets(root) {
  // Identity/tag documents have no executable defaults. Reuse actual shipped
  // applyStatus nodes as well, retaining their flag values and durations.
  const choices={curse:['godie-h02k.w','curse'],blind:['godie-efur.q','blind'],confusion:['godie-e007.q','confusion']};
  return Object.fromEntries(Object.entries(choices).map(([key,[ability,id]])=>{
    const path=`content/abilities/${ability}.json`;
    const doc=JSON.parse(readFileSync(resolve(root,path),'utf8'));
    const node=findNodes(doc,x=>x.kind==='applyStatus'&&x.statusId===id&&!x.condition)[0];
    if(!node)throw Error(`Shipped status recipe missing: ${path}:${id}`);
    return [key,{node:clone(node),source:path}];
  }));
}

export function recipe(move, hero, presets) {
  const physical=['坦克','鬥士','狂戰','射手','硬輔'].includes(hero.origin);
  const type=physical?'physical':'magic';
  const hit=()=>damage('小',type);
  const charged=()=>({ ...damage('小',type),condition:has('rage','self') });
  const describeStatus=id=>`既有 ${id} 狀態（旗標與持續時間沿用出貨技能 ${presets[id].source}）`;
  let castType='targeted',side='enemies',effects=[],text='',template=null;
  switch(move.action) {
    case 'panic':
      template={ref:'tpl-event-passive',params:{hooks:[{on:'onDamageTaken',internalCooldown:4,target:'self',effects:[stat('rage',{moveSpeedMult:1.2},2,'self')]}]}};
      text='受到傷害後獲得既有 rage 狀態與 20% 移速加成，持續 2 秒，內置冷卻 4 秒。';break;
    case 'revenge':
      template={ref:'tpl-event-passive',params:{hooks:[{on:'onDamageTaken',internalCooldown:4,target:'self',effects:[stat('rage',{},3,'self'),shield()]}]}};
      text='受到傷害後獲得 3 秒 rage 與 120 點全傷害護盾，內置冷卻 4 秒；同名護盾只保留較大值。';break;
    case 'refund':
      template={ref:'tpl-event-passive',params:{hooks:[{on:'onAbilityCast',internalCooldown:4,target:'self',effects:[{kind:'restore',manaPct:0.03,applyTo:'self'}]}]}};
      text='施放技能後回復自身 3% 最大魔力，內置冷卻 4 秒；不是新貨幣或獨立資源系統。';break;
    case 'tag':
      effects=[hit(),slow(),charged()];text='打擊指定敵人並施加既有 slow40（減速 40%，2 秒）；自己有 rage 時追加小級傷害。';break;
    case 'cash':
      effects=[hit(),{...damage('中',type),condition:has('slow40')},charged()];
      text='打擊指定敵人；敵人有 slow40 時追加中級傷害，自己有 rage 時再追加小級傷害。未達條件不追加，也不憑空補狀態。';break;
    case 'prepare':
      castType='self';effects=[stat('rage',{},4,'self'),shield()];text='獲得既有 rage 狀態 4 秒與 120 點全傷害護盾 3 秒；rage 用於後續有條件攻擊。';break;
    case 'release':
      effects=[hit(),{...damage('小',type),condition:has('slow40')},{kind:'consumeStatus',shape:'single',statusId:'rage',subject:'self',count:'all',onConsumed:[damage('中',type),slow()]}];
      text='打擊指定敵人；目標有 slow40 時追加小級傷害。有 rage 時消耗自身全部 rage，追加中級傷害並使目標 slow40 2 秒；兩種前置都沒有時只有基本打擊。';break;
    case 'guard':
      castType='self';effects=[shield(),stat('rage',{},3,'self')];text='獲得 120 點全傷害護盾與 rage，持續 3 秒；不授予無敵，不假冒友軍保護。';break;
    case 'rescue':
      side='allies';effects=[heal('target'),shield(),{kind:'dispel',shape:'single',polarity:'debuff',count:1,pools:{status:true},order:'newest'}];
      text='對指定友軍回復 100 生命，給予 120 點全傷害護盾 3 秒，驅散一筆最新可驅散負面狀態；不是只給自己護盾。';break;
    case 'escape':
      castType='ground';effects=[{kind:'blink',shape:'single',to:'point',applyTo:'self'},stat('rage',{moveSpeedMult:1.2},2,'self')];text='自身瞬移到指定合法落點，隨後獲得 rage 與 20% 移速加成 2 秒；不保證穿越所有地形。';break;
    case 'rush':
      castType='ground';effects=[{kind:'dash',mode:'toPoint',speed:12,maxDistance:4,onEnd:[area('小',[slow()])],onEndOn:'always',onEndWhenDead:false}];text='朝指定方向衝刺至多 4 單位；衝刺結束或受阻時在實際終點半徑 4 內打擊最多 8 名敵人並施加 slow40 2 秒；中途死亡不補發。';break;
    case 'pull':
      effects=[hit(),knock('pull'),slow()];text='打擊指定敵人，依既有擊退機制向施法者拉近，施加 slow40 2 秒；不是抓取、載客或異空間。';break;
    case 'kick':
      effects=[hit(),knock(),charged()];text='打擊並推離指定敵人；自己有 rage 時追加小級傷害；落點走既有地形規則。';break;
    case 'zone':
      castType='ground';effects=[area('小',[slow()])];text='在命中中心半徑 4 內打擊最多 8 名敵人並施加 slow40 2 秒；圓心依既有範圍效果解析為主目標，無主目標時採施法點。這是一次區域技能，不假稱常駐陷阱。';break;
    case 'storm':
      castType='ground';effects=[area('中',[{...damage('小',type),condition:has('slow40')}])];text='命中中心半徑 4 內打擊最多 8 名敵人；其中帶 slow40 者各追加小級傷害。圓心依既有範圍效果解析為主目標，無主目標時採施法點。';break;
    case 'blind':
      effects=[hit(),clone(presets.blind.node),slow()];text=`打擊指定敵人並施加${describeStatus('blind')}及 slow40 2 秒；致盲不是遮蔽玩家螢幕。`;break;
    case 'confuse':
      effects=[hit(),clone(presets.confusion.node),slow()];text=`打擊指定敵人並施加${describeStatus('confusion')}及 slow40 2 秒；混亂結束後不維持失控。`;break;
    case 'frenzy':
      castType='self';effects=[stat('rage',{moveSpeedMult:1.2},4,'self'),{kind:'applyBuff',applyTo:'self',duration:4,modifiers:[{stat:'as',op:'pctAdd',value:0.25}],stackKey:'b2-haste'}];text='自身 rage 與 20% 移速、25% 攻速加成持續 4 秒；是短時增益，不新增變身或自動控制系統。';break;
    case 'train': {
      castType='self';
      const arrivals=['curse','blind','confusion'].map(id=>clone(presets[id].node));
      effects=[area('極小',[{kind:'weightedBranch',shape:'single',branches:[8,12,16].map(distanceUnits=>({weight:1,effects:[{kind:'blink',shape:'single',to:'caster',applyTo:'target',distanceUnits,onArrive:clone(arrivals)}]}))}])];
      text='起手後對周圍半徑 4 內最多 8 名敵人造成極小傷害，每位實際命中者各從 8／12／16 單位等權抽取一次，朝施法者方向瞬移（可越過施法者），落點由既有地形規則限制。抵達後套用既有 curse、blind、confusion 出貨配方。不表示全地圖均勻抽點；友軍不受影響，免傷／免控依共通規則。';break;
    }
    default:throw Error(`Unknown authoring action ${move.action}`);
  }
  const active=move.slot!=='PASSIVE';
  // Existing cast-cue families only: no new VFX definitions or emitter tuning.
  const visualKey=move.action==='train'?'fx.prim.void.nova'
    :['zone','storm'].includes(move.action)?'fx.prim.arcane.nova'
    :['rush','escape'].includes(move.action)?'fx.prim.arcane.dash'
    :move.action==='rescue'?'fx.prim.wind.pulse-sm'
    :['prepare','guard','frenzy','blind','confuse'].includes(move.action)?'fx.prim.arcane.pulse-sm'
    :physical?'fx.prim.arcane.slash':'fx.prim.arcane.bolt';
  return {
    name:move.name,
    purpose:`「${move.name}！」\n${text}\n角色演出：${hero.theme}。此技能為 GGD 惡搞改編，不是原作能力聲明。`,
    template:template??{ref:'tpl-effect-sequence',params:{castType,side,radius:4,castTimeSec:move.slot==='R'?0.7:0.1,effects}},
    bands:active?{rangeTier:castType==='self'?'極小':'中',cooldownTier:move.slot==='R'||move.slot==='EX'?'大':'小',manaCostTier:'小',castTimeTier:move.slot==='R'?'大':'小'}:{},
    mechanicsText:text,
    visual:active?{vfxKey:visualKey,attachTo:['zone','storm'].includes(move.action)?'point':'caster'}:null,
  };
}
