// rawcode: A043
// hero: godie-nplh (slot E)  championDoc: content/champions/godie-nplh.json
// nameZh: 劍之精靈
// abilityDoc: content/abilities/godie-nplh.e.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=g6v actions=g7v (trigger var tK)
// w3a base: Arsg  levels: 3
// cooldown: {"1": 65.0, "2": 65.0, "3": 65.0, "4": 120.0}
// mana: {"1": 100, "3": 300, "2": 200, "4": 350}
// data[1] per level: {"1": "h004", "2": "h003", "3": "h005", "4": "h005"}
// slice tiers: core=['g6v', 'g7v'] depth1=[] depth2=[]

// --- g6v (core, line 16158 in war3map.j) ---
function g6v takes nothing returns boolean
return(GetSpellAbilityId()=='A043')
endfunction

// --- g7v (core, line 16161 in war3map.j) ---
function g7v takes nothing returns nothing
set Kb=null
endfunction
