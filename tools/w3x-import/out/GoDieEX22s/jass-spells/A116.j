// rawcode: A116
// hero: godie-o02p (slot Q)  championDoc: content/champions/godie-o02p.json
// nameZh: 甩蔥歌
// abilityDoc: content/abilities/godie-o02p.q.json
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=TimerEventPeriodic cond=None actions=Vae (trigger var Ns)
// w3a base: AOcl  levels: 4
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 75, "2": 105, "3": 135, "4": 165}
// range: {"1": 550.0, "2": 550.0, "3": 550.0, "4": 550.0}
// area: {"1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0}
// data[1] per level: {"4": 425.0, "1": 200.0, "2": 275.0, "3": 350.0}
// data[2] per level: {"4": 6, "1": 6, "3": 6}
// data[3] per level: {"1": 0.10000000149011612, "2": 0.10000000149011612, "3": 0.10000000149011612, "4": 0.10000000149011612}
// slice tiers: core=['Vae'] depth1=['gt', 'Vie'] depth2=['nu', 'Voe', 'Vre']

// --- gt (depth1, line 2287 in war3map.j) ---
function gt takes real At,location Ft returns group
set et=CreateGroup()
call GroupEnumUnitsInRangeOfLoc(et,Ft,At,ot)
return et
endfunction

// --- nu (depth2, line 3056 in war3map.j) ---
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

// --- Voe (depth2, line 28488 in war3map.j) ---
function Voe takes nothing returns boolean
return(QR[(1+GetPlayerId(GetOwningPlayer(Hc)))])
endfunction

// --- Vre (depth2, line 28491 in war3map.j) ---
function Vre takes nothing returns boolean
return(IsUnitAlly(GetEnumUnit(),GetOwningPlayer(Hc)))and(GetEnumUnit()!=Hc)
endfunction

// --- Vie (depth1, line 28494 in war3map.j) ---
function Vie takes nothing returns nothing
if(Vre())then
call CreateNUnitsAtLoc(1,'hfoo',GetOwningPlayer(Hc),jc,bj_UNIT_FACING)
call nu(bj_lastCreatedUnit,2,1)
call ShowUnitHide(bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A11E')
call SetUnitAbilityLevelSwapped('A11E',bj_lastCreatedUnit,Jc)
call SetUnitFacingToFaceUnitTimed(bj_lastCreatedUnit,GetEnumUnit(),0)
call IssueTargetOrderById(bj_lastCreatedUnit,$D0215,GetEnumUnit())
else
if(Voe())then
call CreateNUnitsAtLoc(1,'hfoo',GetOwningPlayer(Hc),jc,bj_UNIT_FACING)
call nu(bj_lastCreatedUnit,2,1)
call ShowUnitHide(bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A11D')
call SetUnitAbilityLevelSwapped('A11D',bj_lastCreatedUnit,Jc)
call SetUnitFacingToFaceUnitTimed(bj_lastCreatedUnit,GetEnumUnit(),0)
call IssueTargetOrderById(bj_lastCreatedUnit,$D0097,GetEnumUnit())
endif
endif
endfunction

// --- Vae (core, line 28515 in war3map.j) ---
function Vae takes nothing returns nothing
set jc=GetUnitLoc(Hc)
set Jc=GetUnitAbilityLevelSwapped('A116',Hc)
set kc=GetUnitAbilityLevelSwapped('A118',Hc)
set bj_wantDestroyGroup=true
call ForGroupBJ(gt(375.,jc),function Vie)
call RemoveLocation(jc)
endfunction
