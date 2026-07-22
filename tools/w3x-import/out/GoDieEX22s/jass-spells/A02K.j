// rawcode: A02K
// hero: godie-e007 (slot W)  championDoc: content/champions/godie-e007.json
// nameZh: 仙氣．採藥
// abilityDoc: content/abilities/godie-e007.w.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=DWv actions=DYv (trigger var iK)
// w3a base: AIre  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 50, "2": 100, "3": 150, "4": 200}
// range: {"2": 100.0, "3": 100.0, "4": 100.0}
// slice tiers: core=['DWv', 'DYv'] depth1=['Ht', 'Dyv'] depth2=[]

// --- Ht (depth1, line 2303 in war3map.j) ---
function Ht takes player Dt,integer jt returns group
set et=CreateGroup()
set bj_groupEnumTypeId=jt
call GroupEnumUnitsOfPlayer(et,Dt,filterGetUnitsOfPlayerAndTypeId)
return et
endfunction

// --- DWv (core, line 14856 in war3map.j) ---
function DWv takes nothing returns boolean
return(GetSpellAbilityId()=='A02K')
endfunction

// --- Dyv (depth1, line 14859 in war3map.j) ---
function Dyv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- DYv (core, line 14863 in war3map.j) ---
function DYv takes nothing returns nothing
set YV=GetUnitLoc(GetTriggerUnit())
call CreateNUnitsAtLoc(1,'ogru',GetOwningPlayer(GetTriggerUnit()),YV,GetUnitFacing(GetTriggerUnit()))
call ShowUnitHide(bj_lastCreatedUnit)
call UnitApplyTimedLifeBJ(1.,'BTLF',bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A02H')
call IssueTargetOrderById(bj_lastCreatedUnit,$D008F,GetTriggerUnit())
call TriggerSleepAction(1.)
call ForGroupBJ(Ht(GetOwningPlayer(GetTriggerUnit()),'ogru'),function Dyv)
call RemoveLocation(YV)
endfunction
