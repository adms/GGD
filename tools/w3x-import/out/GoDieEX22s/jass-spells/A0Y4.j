// rawcode: A0Y4
// hero: godie-h02r (slot E)  championDoc: content/champions/godie-h02r.json
// nameZh: 藤鞭
// abilityDoc: content/abilities/godie-h02r.e.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=civ actions=cEv (trigger var Nk)
// w3a base: ANhs  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 125, "2": 200, "3": 275, "4": 350}
// range: {"1": 500.0, "2": 700.0, "3": 900.0, "4": 1100.0}
// area: {"2": 450.0, "3": 450.0, "4": 450.0, "1": 450.0}
// data[1] per level: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// data[3] per level: {"1": 5, "2": 5, "3": 5, "4": 5}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[6] per level: {"1": 1, "2": 1, "3": 1, "4": 1}
// slice tiers: core=['civ', 'cEv'] depth1=['gt', 'cVv'] depth2=['cav', 'cnv']

// --- gt (depth1, line 2287 in war3map.j) ---
function gt takes real At,location Ft returns group
set et=CreateGroup()
call GroupEnumUnitsInRangeOfLoc(et,Ft,At,ot)
return et
endfunction

// --- civ (core, line 13329 in war3map.j) ---
function civ takes nothing returns boolean
return(GetSpellAbilityId()=='A0Y4')
endfunction

// --- cav (depth2, line 13332 in war3map.j) ---
function cav takes nothing returns boolean
return((IsPlayerAlly(GetOwningPlayer(GetEnumUnit()),GetOwningPlayer(aB))==false)and(IsUnitType(GetEnumUnit(),UNIT_TYPE_STRUCTURE)==false)and(IsUnitAliveBJ(GetEnumUnit())))!=null
endfunction

// --- cnv (depth2, line 13335 in war3map.j) ---
function cnv takes nothing returns boolean
return((IsUnitType(GetEnumUnit(),UNIT_TYPE_STRUCTURE)==false)and(IsUnitAliveBJ(GetEnumUnit()))and(GetOwningPlayer(GetEnumUnit())!=Player($C)))!=null
endfunction

// --- cVv (depth1, line 13338 in war3map.j) ---
function cVv takes nothing returns nothing
if(cav())then
call AddSpecialEffectTargetUnitBJ("chest",GetEnumUnit(),"Abilities\\Weapons\\IllidanMissile\\IllidanMissile.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call UnitDamageTargetBJ(aB,GetEnumUnit(),OB,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
endif
if(cnv())then
call AddSpecialEffectTargetUnitBJ("chest",GetEnumUnit(),"Abilities\\Spells\\NightElf\\TargetArtLumber\\TargetArtLumber.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call SetUnitPositionLoc(GetEnumUnit(),XB)
endif
endfunction

// --- cEv (core, line 13350 in war3map.j) ---
function cEv takes nothing returns nothing
set aB=GetTriggerUnit()
set EB=GetSpellTargetLoc()
set OB=(200.+(150.*I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit()))))
call TriggerSleepAction(1.)
set XB=GetUnitLoc(aB)
call ForGroupBJ(gt(480.,EB),function cVv)
call RemoveLocation(EB)
call RemoveLocation(XB)
endfunction
