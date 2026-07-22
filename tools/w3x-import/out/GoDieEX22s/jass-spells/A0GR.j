// rawcode: A0GR
// hero: godie-e00s (slot E)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-e00s.json
// nameZh: 木束縛之術
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-e00s.json#abilities.E
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=Y1v actions=Y4v (trigger var HP)
// w3a base: AOvd  levels: 4
// cooldown: {"2": 60.0, "3": 60.0, "4": 60.0, "1": 60.0}
// mana: {"1": 100, "4": 250, "2": 150}
// area: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "4": 0.0, "3": 0.0}
// slice tiers: core=['Y1v', 'Y4v'] depth1=['gt', 'Ht', 'Y2v', 'Y3v'] depth2=[]

// --- gt (depth1, line 2287 in war3map.j) ---
function gt takes real At,location Ft returns group
set et=CreateGroup()
call GroupEnumUnitsInRangeOfLoc(et,Ft,At,ot)
return et
endfunction

// --- Ht (depth1, line 2303 in war3map.j) ---
function Ht takes player Dt,integer jt returns group
set et=CreateGroup()
set bj_groupEnumTypeId=jt
call GroupEnumUnitsOfPlayer(et,Dt,filterGetUnitsOfPlayerAndTypeId)
return et
endfunction

// --- Y1v (core, line 24833 in war3map.j) ---
function Y1v takes nothing returns boolean
return(GetSpellAbilityId()=='A0GR')
endfunction

// --- Y2v (depth1, line 24836 in war3map.j) ---
function Y2v takes nothing returns nothing
call SetUnitFacingToFaceUnitTimed(bj_lastCreatedUnit,GetEnumUnit(),0)
call IssueTargetOrderById(bj_lastCreatedUnit,$D00CB,GetEnumUnit())
endfunction

// --- Y3v (depth1, line 24840 in war3map.j) ---
function Y3v takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- Y4v (core, line 24844 in war3map.j) ---
function Y4v takes nothing returns nothing
set n=GetUnitLoc(GetTriggerUnit())
call CreateNUnitsAtLoc(1,'o00Y',GetOwningPlayer(GetTriggerUnit()),n,bj_UNIT_FACING)
set no=bj_lastCreatedUnit
call UnitApplyTimedLifeBJ(2.,'BTLF',bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A0GS')
call SetUnitAbilityLevelSwapped('A0GS',bj_lastCreatedUnit,GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit()))
set bj_wantDestroyGroup=true
call ForGroupBJ(gt(950.,n),function Y2v)
call RemoveLocation(n)
call TriggerSleepAction(5.)
call ForGroupBJ(Ht(GetOwningPlayer(GetTriggerUnit()),'o00Y'),function Y3v)
endfunction
