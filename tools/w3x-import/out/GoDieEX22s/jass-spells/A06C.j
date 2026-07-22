// rawcode: A06C
// hero: godie-hvsh (slot E)  championDoc: content/champions/godie-hvsh.json
// nameZh: 鮮血神殿
// abilityDoc: content/abilities/godie-hvsh.e.json
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=helper-ref; called from MOv (events: TimerEventPeriodic) cond=None actions=MEv (trigger var None)
// w3a base: AChw  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 120, "2": 195, "3": 270, "4": 345}
// range: {"1": 100.0, "2": 100.0, "3": 100.0, "4": 100.0}
// duration: {"1": 10.0, "2": 10.0, "3": 10.0, "4": 10.0}
// hero_duration: {"1": 10.0, "2": 10.0, "3": 10.0, "4": 10.0}
// slice tiers: core=['MEv', 'MOv'] depth1=['MVv', 'gt', 'MXv'] depth2=[]

// --- gt (depth1, line 2287 in war3map.j) ---
function gt takes real At,location Ft returns group
set et=CreateGroup()
call GroupEnumUnitsInRangeOfLoc(et,Ft,At,ot)
return et
endfunction

// --- MVv (depth1, line 19963 in war3map.j) ---
function MVv takes nothing returns boolean
return((IsPlayerAlly(GetOwningPlayer(GetEnumUnit()),GetOwningPlayer(NO))==false)and(IsUnitAliveBJ(GetEnumUnit()))and(IsUnitType(GetEnumUnit(),UNIT_TYPE_STRUCTURE)==false)and(GetUnitTypeId(GetEnumUnit())!='earc')and(GetUnitTypeId(GetEnumUnit())!='nska'))!=null
endfunction

// --- MEv (core, line 19966 in war3map.j) ---
function MEv takes nothing returns nothing
if(MVv())then
call UnitDamageTargetBJ(NO,GetEnumUnit(),(75.*I2R(GetUnitAbilityLevelSwapped('A06C',dR))),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
call SetUnitLifePercentBJ(e[(1+GetPlayerId(GetOwningPlayer(NO)))],(GetUnitLifePercent(e[(1+GetPlayerId(GetOwningPlayer(NO)))])+1.))
set jE=GetUnitLoc(e[(1+GetPlayerId(GetOwningPlayer(NO)))])
call AddSpecialEffectLocBJ(jE,"Abilities\\Spells\\Undead\\ReplenishMana\\SpiritTouchTarget.mdl")
call DestroyEffect(bj_lastCreatedEffect)
endif
endfunction

// --- MXv (depth1, line 19975 in war3map.j) ---
function MXv takes nothing returns boolean
return(IsUnitAliveBJ(NO))
endfunction

// --- MOv (core, line 19978 in war3map.j) ---
function MOv takes nothing returns nothing
if(MXv())then
set bO=GetUnitLoc(NO)
set bj_wantDestroyGroup=true
call ForGroupBJ(gt(580.,bO),function MEv)
call RemoveLocation(bO)
else
call DisableTrigger(GetTriggeringTrigger())
endif
endfunction
