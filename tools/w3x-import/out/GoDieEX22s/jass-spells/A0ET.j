// rawcode: A0ET
// hero: godie-u00j (slot W)  championDoc: content/champions/godie-u00j.json
// nameZh: 八刀一閃
// abilityDoc: content/abilities/godie-u00j.w.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=zuv actions=zUv (trigger var qP)
// w3a base: ANcl  levels: None
// cooldown: {"1": 30.0, "2": 30.0, "3": 30.0, "4": 50.0}
// mana: {"1": 150, "2": 180, "3": 210, "4": 275}
// range: {"2": 850.0, "3": 850.0, "4": 9999.0, "1": 850.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 2, "2": 2, "3": 2, "4": 2}
// data[3] per level: {"1": 5, "2": 5, "3": 5, "4": 5}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"1": "coldarrows", "2": "coldarrows", "3": "coldarrows", "4": "coldarrows"}
// slice tiers: core=['zuv', 'zUv'] depth1=[] depth2=[]

// --- zuv (core, line 25101 in war3map.j) ---
function zuv takes nothing returns boolean
return(GetSpellAbilityId()=='A0ET')
endfunction

// --- zUv (core, line 25104 in war3map.j) ---
function zUv takes nothing returns nothing
call DisableTrigger(GetTriggeringTrigger())
set Ni=GetTriggerUnit()
set Ci=GetSpellTargetLoc()
set bi=GetUnitLoc(GetTriggerUnit())
set Bi=GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit())
set ci=1
set di=(DistanceBetweenPoints(Ci,bi)/ 50.)
call AddSpecialEffectLocBJ(bi,"Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call UnitAddAbility(Ni,'A05U')
call PlaySoundOnUnitBJ(Of,100.,GetTriggerUnit())
call TriggerSleepAction(.1)
call SetUnitPathing(Ni,false)
call EnableTrigger(QP)
set ZA=true
endfunction
