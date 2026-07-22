// rawcode: A0LL
// hero: godie-h01n (slot E)  championDoc: content/champions/godie-h01n.json
// nameZh: 月牙天衝
// abilityDoc: content/abilities/godie-h01n.e.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=Ljv actions=Lkv (trigger var mL)
// w3a base: ANcl  levels: 4
// cooldown: {"1": 55.0, "2": 55.0, "3": 55.0, "4": 55.0}
// mana: {"1": 150, "2": 200, "3": 250, "4": 300}
// range: {"3": 600.0, "2": 600.0, "4": 600.0, "1": 600.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 3, "3": 3, "2": 3, "4": 3}
// data[3] per level: {"1": 1, "2": 1, "3": 1, "4": 1}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[5] per level: {"1": 0, "3": 0, "2": 0, "4": 0}
// data[6] per level: {"1": "shockwave", "2": "shockwave", "3": "shockwave", "4": "shockwave"}
// slice tiers: core=['Ljv', 'Lkv'] depth1=['LJv'] depth2=[]

// --- Ljv (core, line 19467 in war3map.j) ---
function Ljv takes nothing returns boolean
return(GetSpellAbilityId()=='A0LL')
endfunction

// --- LJv (depth1, line 19470 in war3map.j) ---
function LJv takes nothing returns boolean
return(GetUnitTypeId(GetTriggerUnit())=='H01O')
endfunction

// --- Lkv (core, line 19473 in war3map.j) ---
function Lkv takes nothing returns nothing
set IV=GetTriggerUnit()
set NV=GetSpellTargetLoc()
set FV=GetUnitLoc(IV)
set cV=AngleBetweenPoints(FV,NV)
set DV=$3E8
if(LJv())then
set dV=((550.+I2R((GetUnitAbilityLevelSwapped('A0LL',IV)*$96)))+.0)
call CreateNUnitsAtLoc(1,'o01R',GetOwningPlayer(IV),GetUnitLoc(IV),GetUnitFacing(IV))
set bV=bj_lastCreatedUnit
call SetUnitPathing(bV,false)
else
set dV=((300.+I2R((GetUnitAbilityLevelSwapped('A0LL',IV)*$96)))+.0)
call CreateNUnitsAtLoc(1,'o01Q',GetOwningPlayer(IV),GetUnitLoc(IV),GetUnitFacing(IV))
set bV=bj_lastCreatedUnit
call SetUnitPathing(bV,false)
endif
call EnableTrigger(ML)
endfunction
