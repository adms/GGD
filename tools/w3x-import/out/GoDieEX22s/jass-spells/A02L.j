// rawcode: A02L
// hero: godie-obla (slot Q)  championDoc: content/champions/godie-obla.json
// nameZh: 放山雞
// abilityDoc: content/abilities/godie-obla.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=tTv actions=tuv (trigger var TM)
// w3a base: ANlm  levels: None
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 35, "2": 70, "4": 140, "3": 105}
// duration: {"2": 180.0, "3": 180.0, "4": 200.0, "1": 180.0}
// hero_duration: {"1": 180.0, "2": 180.0, "3": 180.0, "4": 200.0}
// data[1] per level: {"1": "n000", "2": "n000", "3": "n000", "4": "n000"}
// data[2] per level: {"2": 1.0, "3": 1.0, "1": 1.0, "4": 1.0}
// data[3] per level: {"1": 5, "2": 5, "3": 5, "4": 5}
// slice tiers: core=['tTv', 'tuv'] depth1=[] depth2=[]

// --- tTv (core, line 22600 in war3map.j) ---
function tTv takes nothing returns boolean
return(GetSpellAbilityId()=='A02L')
endfunction

// --- tuv (core, line 22603 in war3map.j) ---
function tuv takes nothing returns nothing
call PlaySoundOnUnitBJ(Fd,'d',GetTriggerUnit())
endfunction
