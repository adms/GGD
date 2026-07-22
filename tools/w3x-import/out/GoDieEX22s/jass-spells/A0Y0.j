// rawcode: A0Y0
// hero: godie-o02w (slot E)  championDoc: content/champions/godie-o02w.json
// nameZh: 吸星大法
// abilityDoc: content/abilities/godie-o02w.e.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=u8v actions=Uvv (trigger var Np)
// w3a base: ANcl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 140, "2": 210, "3": 280, "4": 350}
// range: {"5": 350.0, "1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0}
// data[1] per level: {"1": 1.100000023841858, "2": 1.100000023841858, "3": 1.100000023841858, "4": 1.100000023841858}
// data[2] per level: {"1": 1, "2": 1, "3": 1, "4": 1}
// data[3] per level: {"1": 25, "2": 25, "3": 25, "4": 25}
// data[4] per level: {"1": 1.0099999904632568, "2": 1.0099999904632568, "3": 1.0099999904632568, "4": 1.0099999904632568}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"2": "channel", "3": "channel", "4": "channel"}
// slice tiers: core=['u8v', 'Uvv'] depth1=['u9v'] depth2=[]

// --- u8v (core, line 23381 in war3map.j) ---
function u8v takes nothing returns boolean
return(GetSpellAbilityId()=='A0Y0')
endfunction

// --- u9v (depth1, line 23384 in war3map.j) ---
function u9v takes nothing returns boolean
return(OrderId2StringBJ(GetUnitCurrentOrder(Tb))=="channel")
endfunction

// --- Uvv (core, line 23387 in war3map.j) ---
function Uvv takes nothing returns nothing
set Tb=GetTriggerUnit()
set ub=GetSpellTargetUnit()
call TriggerSleepAction(.8)
if(u9v())then
call SetUnitManaBJ(ub,(GetUnitStateSwap(UNIT_STATE_MANA,ub)-(200.*I2R(GetUnitAbilityLevelSwapped('A0Y0',Tb)))))
call SetUnitManaBJ(Tb,(GetUnitStateSwap(UNIT_STATE_MANA,Tb)+(200.*I2R(GetUnitAbilityLevelSwapped('A0Y0',Tb)))))
call AddSpecialEffectTargetUnitBJ("overhead",Tb,"Abilities\\Weapons\\WingedSerpentMissile\\WingedSerpentMissile.mdl")
call DestroyEffect(bj_lastCreatedEffect)
set Ub=GetUnitLoc(Tb)
set wb=GetUnitLoc(ub)
call CreateNUnitsAtLocFacingLocBJ(1,'hfoo',GetOwningPlayer(Tb),Ub,wb)
call UnitAddAbility(bj_lastCreatedUnit,'A0XW')
call SetUnitAbilityLevelSwapped('A0XW',bj_lastCreatedUnit,GetUnitAbilityLevelSwapped('A0Y0',Tb))
call IssueTargetOrderById(bj_lastCreatedUnit,$D00DD,ub)
call KillUnit(bj_lastCreatedUnit)
call RemoveUnit(bj_lastCreatedUnit)
call AddSpecialEffectLocBJ(wb,"Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call RemoveLocation(Ub)
call RemoveLocation(wb)
endif
endfunction
