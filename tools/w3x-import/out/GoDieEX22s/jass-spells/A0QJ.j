// rawcode: A0QJ
// hero: godie-e015 (slot E)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-e015.json
// nameZh: 珍奶顏射
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-e015.json#abilities.E
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=aTe actions=aue (trigger var YQ)
// w3a base: AIxk  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 100, "2": 175, "3": 250, "4": 325}
// duration: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0}
// hero_duration: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0}
// data[1] per level: {"1": 0.07999999821186066, "2": 0.1599999964237213, "3": 0.23999999463558197, "4": 0.3199999928474426}
// data[2] per level: {"1": 0.30000001192092896, "2": 0.6000000238418579, "3": 0.9000000357627869, "4": 1.2000000476837158}
// data[3] per level: {"1": 0.20000000298023224, "2": 0.20000000298023224, "3": 0.20000000298023224, "4": 0.20000000298023224}
// slice tiers: core=['aTe', 'aue'] depth1=[] depth2=[]

// --- aTe (core, line 27966 in war3map.j) ---
function aTe takes nothing returns boolean
return(GetSpellAbilityId()=='A0QJ')
endfunction

// --- aue (core, line 27969 in war3map.j) ---
function aue takes nothing returns nothing
call TriggerSleepAction(.1)
call UnitAddAbility(Ib,'A0W2')
call TriggerSleepAction(14.)
call UnitRemoveAbility(Ib,'A0W2')
endfunction
