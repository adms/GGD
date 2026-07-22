// rawcode: A0D3
// hero: godie-emfr (slot Q)  championDoc: content/champions/godie-emfr.json
// nameZh: 風精召喚
// abilityDoc: content/abilities/godie-emfr.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=Jsv actions=JSv (trigger var sl)
// w3a base: ANcl  levels: 4
// cooldown: {"1": 40.0, "2": 40.0, "3": 40.0, "4": 40.0}
// mana: {"1": 75, "2": 125, "4": 225, "3": 175}
// range: {"3": 550.0, "2": 450.0, "4": 650.0, "1": 350.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 3, "3": 3, "2": 3, "4": 3}
// data[3] per level: {"1": 1, "2": 1, "3": 1, "4": 1}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[5] per level: {"1": 0, "3": 0, "2": 0, "4": 0}
// data[6] per level: {"1": "shockwave", "2": "shockwave", "3": "shockwave", "4": "shockwave"}
// slice tiers: core=['Jsv', 'JSv'] depth1=['nu'] depth2=['xu']

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

// --- Jsv (core, line 17956 in war3map.j) ---
function Jsv takes nothing returns boolean
return(GetSpellAbilityId()=='A0D3')
endfunction

// --- JSv (core, line 17959 in war3map.j) ---
function JSv takes nothing returns nothing
set ZN=GetUnitLoc(GetTriggerUnit())
set vb=GetUnitAbilityLevelSwapped('A0D3',GetTriggerUnit())
call CreateNUnitsAtLoc(1,'hfoo',GetOwningPlayer(GetTriggerUnit()),ZN,bj_UNIT_FACING)
call nu(bj_lastCreatedUnit,5,1)
call RemoveLocation(ZN)
set ZN=GetSpellTargetLoc()
call ShowUnitHide(bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A056')
call SetUnitAbilityLevelSwapped('A056',bj_lastCreatedUnit,vb)
call IssuePointOrderByIdLoc(bj_lastCreatedUnit,$D0271,ZN)
call RemoveLocation(ZN)
endfunction
