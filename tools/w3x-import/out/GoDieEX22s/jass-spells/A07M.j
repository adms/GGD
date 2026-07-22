// rawcode: A07M
// hero: godie-ewrd (slot E)  championDoc: content/champions/godie-ewrd.json
// nameZh: 空破圓斬
// abilityDoc: content/abilities/godie-ewrd.e.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_CAST cond=duv actions=dUv (trigger var Tk)
// w3a base: ANfl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 95, "2": 130, "4": 200, "3": 165}
// data[1] per level: {"1": 375.0, "2": 575.0, "3": 775.0, "4": 975.0}
// data[2] per level: {"1": 5, "2": 5, "3": 5, "4": 5}
// data[3] per level: {"2": 300.0, "3": 300.0, "4": 300.0, "1": 300.0}
// slice tiers: core=['duv', 'dUv'] depth1=[] depth2=[]

// --- duv (core, line 14395 in war3map.j) ---
function duv takes nothing returns boolean
return(GetSpellAbilityId()=='A07M')
endfunction

// --- dUv (core, line 14398 in war3map.j) ---
function dUv takes nothing returns nothing
local location dwv=GetUnitLoc(GetSpellTargetUnit())
call TriggerSleepAction(.0)
call AddSpecialEffectTargetUnitBJ("chest",GetTriggerUnit(),"Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl")
call TriggerSleepAction(.5)
call AddSpecialEffectLocBJ(GetUnitLoc(GetTriggerUnit()),"Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl")
call AddSpecialEffectTargetUnitBJ("chest",GetTriggerUnit(),"Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl")
call SetUnitPositionLoc(GetTriggerUnit(),dwv)
call RemoveLocation(dwv)
call SetUnitAnimation(bj_lastCreatedUnit,"Attack Walk Stand Spin")
call AddSpecialEffectTargetUnitBJ("chest",GetTriggerUnit(),"Abilities\\Weapons\\FlyingMachine\\FlyingMachineImpact.mdl")
call AddSpecialEffectTargetUnitBJ("chest",GetTriggerUnit(),"Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl")
endfunction
