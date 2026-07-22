// rawcode: A0A3
// hero: godie-ecen (slot R)  championDoc: content/champions/godie-ecen.json
// nameZh: 魔幻浮水印
// abilityDoc: content/abilities/godie-ecen.r.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_CAST cond=yxv actions=yov (trigger var iP)
// w3a base: Ainf  levels: 3
// cooldown: {"1": 10.0, "2": 10.0, "3": 10.0, "4": 0.5}
// mana: {"2": 225, "3": 300, "4": 35, "5": 35, "1": 150}
// range: {"2": 500.0, "3": 500.0, "4": 500.0}
// duration: {"2": 20.0, "3": 20.0, "4": 60.0, "1": 20.0}
// hero_duration: {"2": 20.0, "3": 20.0, "4": 60.0, "1": 20.0}
// data[1] per level: {"1": 0.0}
// data[2] per level: {"2": 6, "3": 9, "1": 3}
// data[3] per level: {"2": 500.0, "3": 500.0, "4": 500.0}
// slice tiers: core=['yxv', 'yov'] depth1=[] depth2=[]

// --- yxv (core, line 24235 in war3map.j) ---
function yxv takes nothing returns boolean
return(GetSpellAbilityId()=='A0A3')
endfunction

// --- yov (core, line 24238 in war3map.j) ---
function yov takes nothing returns nothing
set hv=GetTriggerUnit()
endfunction
