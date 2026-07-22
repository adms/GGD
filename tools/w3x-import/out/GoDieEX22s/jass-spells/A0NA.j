// rawcode: A0NA
// hero: godie-ntin (slot Q)  championDoc: content/champions/godie-ntin.json
// nameZh: 電離光槍 - 繁星飛躍
// abilityDoc: content/abilities/godie-ntin.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=gXv actions=gIv (trigger var LK)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=gNv actions=gbv (trigger var mK)
// w3a base: Arsp  levels: 4
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0, "4": 35.0}
// mana: {"1": 60, "2": 110, "3": 160, "4": 210}
// range: {"1": 500.0, "3": 500.0, "4": 500.0, "2": 500.0}
// area: {"2": 400.0, "4": 400.0, "3": 400.0, "1": 400.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// data[1] per level: {"2": 0, "3": 0, "4": 0, "1": 0}
// data[2] per level: {"3": 85.0, "4": 85.0, "1": 85.0, "2": 85.0}
// data[3] per level: {"1": 105.0, "2": 105.0, "3": 105.0, "4": 105.0}
// data[4] per level: {"2": 180.0, "3": 180.0, "4": 180.0, "1": 180.0}
// data[5] per level: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// slice tiers: core=['gXv', 'gIv', 'gNv', 'gbv'] depth1=['Ht', 'gOv', 'gRv', 'nu'] depth2=['xu']

// --- Ht (depth1, line 2303 in war3map.j) ---
function Ht takes player Dt,integer jt returns group
set et=CreateGroup()
set bj_groupEnumTypeId=jt
call GroupEnumUnitsOfPlayer(et,Dt,filterGetUnitsOfPlayerAndTypeId)
return et
endfunction

// --- xu (depth2, line 3043 in war3map.j) ---
function xu takes nothing returns nothing
local unit ou=bj_lastCreatedUnit
local real ru=bj_enumDestructableRadius
local real iu=bj_randomSubGroupChance
call it(ru)
if(iu<.0)then
call RemoveUnit(ou)
else
call KillUnit(ou)
call it(iu)
call RemoveUnit(ou)
endif
endfunction

// --- nu (depth1, line 3056 in war3map.j) ---
function nu takes unit Vu,real vu,real Eu returns nothing
local unit Xu=bj_lastCreatedUnit
local real eu=bj_enumDestructableRadius
local real Ou=bj_randomSubGroupChance
set bj_lastCreatedUnit=Vu
set bj_enumDestructableRadius=vu
set bj_randomSubGroupChance=Eu
call ExecuteFunc("xu")
set bj_lastCreatedUnit=Xu
set bj_enumDestructableRadius=eu
set bj_randomSubGroupChance=Ou
endfunction

// --- gXv (core, line 15848 in war3map.j) ---
function gXv takes nothing returns boolean
return(GetSpellAbilityId()=='A0NA')
endfunction

// --- gOv (depth1, line 15851 in war3map.j) ---
function gOv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- gRv (depth1, line 15855 in war3map.j) ---
function gRv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- gIv (core, line 15859 in war3map.j) ---
function gIv takes nothing returns nothing
set tE=GetTriggerUnit()
call CreateNUnitsAtLoc(1,'o026',GetOwningPlayer(GetTriggerUnit()),GetUnitLoc(GetTriggerUnit()),(90.+GetUnitFacing(GetTriggerUnit())))
call UnitApplyTimedLifeBJ(2.,'BTLF',bj_lastCreatedUnit)
call TriggerSleepAction(2)
call ForGroupBJ(Ht(GetOwningPlayer(tE),'o026'),function gOv)
call ForGroupBJ(Ht(GetOwningPlayer(tE),'e00F'),function gRv)
endfunction

// --- gNv (core, line 15867 in war3map.j) ---
function gNv takes nothing returns boolean
return(GetSpellAbilityId()=='A0NA')
endfunction

// --- gbv (core, line 15870 in war3map.j) ---
function gbv takes nothing returns nothing
local location gBv
local integer gcv
set gBv=GetUnitLoc(GetTriggerUnit())
set gcv=GetUnitAbilityLevelSwapped('A0NA',GetTriggerUnit())
call CreateNUnitsAtLoc(1,'hfoo',GetOwningPlayer(GetTriggerUnit()),gBv,bj_UNIT_FACING)
call nu(bj_lastCreatedUnit,5,1)
call RemoveLocation(gBv)
set gBv=GetSpellTargetLoc()
call ShowUnitHide(bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A112')
call SetUnitAbilityLevelSwapped('A112',bj_lastCreatedUnit,gcv)
call IssuePointOrderByIdLoc(bj_lastCreatedUnit,$D0271,gBv)
call RemoveLocation(gBv)
endfunction
