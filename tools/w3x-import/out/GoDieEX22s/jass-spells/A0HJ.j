// rawcode: A0HJ
// hero: godie-u00k (slot E)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-u00k.json
// nameZh: 厄夜靈魂
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-u00k.json#abilities.E
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=zhv actions=zjv (trigger var mP)
// w3a base: AUdd  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"2": 320, "3": 480, "4": 640, "5": 850, "6": 1000, "1": 160}
// range: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0, "5": 600.0, "6": 600.0}
// area: {"2": 250.0, "3": 250.0, "4": 250.0, "5": 450.0, "6": 450.0, "1": 250.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 3.0, "5": 4.0, "6": 4.0}
// hero_duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 3.0, "5": 4.0, "6": 4.0}
// data[1] per level: {"2": 0.1599999964237213, "3": 0.23999999463558197, "4": 0.3199999928474426, "1": 0.07999999821186066}
// data[2] per level: {"1": 0.0}
// slice tiers: core=['zhv', 'zjv'] depth1=['zHv'] depth2=[]

// --- zhv (core, line 25015 in war3map.j) ---
function zhv takes nothing returns boolean
return(GetSpellAbilityId()=='A0HJ')
endfunction

// --- zHv (depth1, line 25018 in war3map.j) ---
function zHv takes nothing returns boolean
return(Lo==false)
endfunction

// --- zjv (core, line 25021 in war3map.j) ---
function zjv takes nothing returns nothing
set mo=GetTriggerUnit()
if(zHv())then
call UnitAddAbility(Mo,'A0HL')
endif
call PlaySoundOnUnitBJ(PD,'d',GetTriggerUnit())
call TriggerSleepAction(3.)
call UnitRemoveAbility(Mo,'A0HL')
endfunction
