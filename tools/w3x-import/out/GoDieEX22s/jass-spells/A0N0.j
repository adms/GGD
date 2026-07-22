// rawcode: A0N0
// hero: godie-h01u (slot E)  championDoc: content/champions/godie-h01u.json
// nameZh: 鬼神烈戟
// abilityDoc: content/abilities/godie-h01u.e.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=eue actions=eWe (trigger var Jq)
// w3a base: Aroa  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 250, "2": 350, "3": 450, "4": 550}
// area: {"2": 500.0, "3": 500.0, "4": 500.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 3.0}
// hero_duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 3.0}
// data[1] per level: {"1": 0.0}
// data[2] per level: {"1": -3, "2": -6, "3": -9, "4": -12}
// slice tiers: core=['eue', 'eWe'] depth1=['Vt', 'gt', 'ewe'] depth2=['eUe']

// --- Vt (depth1, line 2245 in war3map.j) ---
function Vt takes location Et,real Xt,real Ot returns location
return Location(GetLocationX(Et)+Xt*Cos(Ot*bj_DEGTORAD),GetLocationY(Et)+Xt*Sin(Ot*bj_DEGTORAD))
endfunction

// --- gt (depth1, line 2287 in war3map.j) ---
function gt takes real At,location Ft returns group
set et=CreateGroup()
call GroupEnumUnitsInRangeOfLoc(et,Ft,At,ot)
return et
endfunction

// --- eue (core, line 26125 in war3map.j) ---
function eue takes nothing returns boolean
return(GetSpellAbilityId()=='A0N0')
endfunction

// --- eUe (depth2, line 26128 in war3map.j) ---
function eUe takes nothing returns boolean
return(IsUnitEnemy(GetEnumUnit(),GetOwningPlayer(GetTriggerUnit())))
endfunction

// --- ewe (depth1, line 26131 in war3map.j) ---
function ewe takes nothing returns nothing
if(eUe())then
call UnitDamageTargetBJ(XE,GetEnumUnit(),((150.+(200.*I2R(GetUnitAbilityLevelSwapped('A0N0',XE))))+(3.*I2R(GetHeroStatBJ(0,XE,true)))),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
call AddSpecialEffectTargetUnitBJ("origin",GetEnumUnit(),"Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl")
call DestroyEffect(bj_lastCreatedEffect)
endif
endfunction

// --- eWe (core, line 26138 in war3map.j) ---
function eWe takes nothing returns nothing
set XE=GetTriggerUnit()
set OE[4]=GetUnitLoc(GetTriggerUnit())
set bj_forLoopAIndex=1
set bj_forLoopAIndexEnd=3
loop
exitwhen bj_forLoopAIndex>bj_forLoopAIndexEnd
call CreateNUnitsAtLoc(1,'o01X',GetOwningPlayer(GetTriggerUnit()),OE[4],bj_UNIT_FACING)
call ShowUnitHide(bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A0N2')
set OE[5]=Vt(OE[4],256,GetRandomReal(0,360))
call IssuePointOrderByIdLoc(bj_lastCreatedUnit,$D0271,OE[5])
call RemoveLocation(OE[5])
set bj_forLoopAIndex=bj_forLoopAIndex+1
endloop
call CreateNUnitsAtLoc(1,'o01X',GetOwningPlayer(GetTriggerUnit()),OE[4],bj_UNIT_FACING)
call ShowUnitHide(bj_lastCreatedUnit)
call ForGroupBJ(gt(530.,OE[4]),function ewe)
call KillUnit(bj_lastCreatedUnit)
call RemoveUnit(bj_lastCreatedUnit)
call RemoveLocation(OE[4])
endfunction
