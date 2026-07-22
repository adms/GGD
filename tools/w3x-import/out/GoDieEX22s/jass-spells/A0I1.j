// rawcode: A0I1
// hero: godie-opgh (slot E)  championDoc: content/champions/godie-opgh.json
// nameZh: 閃光龍牙
// abilityDoc: content/abilities/godie-opgh.e.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=Ssv actions=SSv (trigger var KM)
// w3a base: ANcl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 150, "2": 210, "3": 270, "4": 330}
// range: {"2": 800.0, "3": 800.0, "4": 800.0, "1": 800.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 1, "4": 1, "2": 1, "3": 1}
// data[3] per level: {"1": 5, "2": 5, "3": 5, "4": 5}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"1": "coldarrows", "2": "coldarrows", "3": "coldarrows", "4": "coldarrows"}
// slice tiers: core=['Ssv', 'SSv'] depth1=[] depth2=[]

// --- Ssv (core, line 22218 in war3map.j) ---
function Ssv takes nothing returns boolean
return(GetSpellAbilityId()=='A0I1')
endfunction

// --- SSv (core, line 22221 in war3map.j) ---
function SSv takes nothing returns nothing
call DisableTrigger(GetTriggeringTrigger())
set ji=GetTriggerUnit()
set Ji=GetSpellTargetUnit()
set ki=GetUnitLoc(Ji)
set Ki=GetUnitLoc(GetTriggerUnit())
set li=GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit())
set Li=1
set mi=(DistanceBetweenPoints(ki,Ki)/ 50.)
set Mi=false
call AddSpecialEffectLocBJ(Ki,"Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call UnitAddAbility(ji,'A0I5')
call SetUnitAnimation(ji,"attack slam")
call PlaySoundOnUnitBJ(kD,'d',GetTriggerUnit())
call TriggerSleepAction(.1)
call SetUnitPathing(ji,false)
call EnableTrigger(lM)
endfunction
