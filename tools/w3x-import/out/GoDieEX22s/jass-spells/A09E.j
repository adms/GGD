// rawcode: A09E
// hero: godie-o00x (slot E)  championDoc: content/champions/godie-o00x.json
// nameZh: 超級賽亞人
// abilityDoc: content/abilities/godie-o00x.e.json
// kind: active (spell-effect trigger)
// handler: event=inline-check; called from GRv (events: EVENT_PLAYER_UNIT_SPELL_EFFECT) cond=None actions=GOv (trigger var None)
// w3a base: AEIl  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"3": 320, "4": 400, "1": 160, "2": 240}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 8.0, "2": 12.0, "3": 16.0, "4": 20.0}
// data[1] per level: {"1": "Ogrh", "2": "Ogrh", "3": "Ogrh", "4": "Ogrh"}
// data[5] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// slice tiers: core=['GOv', 'GRv'] depth1=[] depth2=[]

// --- GOv (core, line 16209 in war3map.j) ---
function GOv takes nothing returns boolean
return(GetSpellAbilityId()=='A09E')and(GetUnitTypeId(GetTriggerUnit())=='Ogrh')
endfunction

// --- GRv (core, line 16212 in war3map.j) ---
function GRv takes nothing returns boolean
return(GOv())
endfunction
