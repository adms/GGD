// rawcode: A0HW
// hero: godie-u00l (slot R)  championDoc: content/champions/godie-u00l.json
// nameZh: ChangeDNA
// abilityDoc: content/abilities/godie-u00l.r.json
// kind: active (spell-effect trigger)
// handler: event=inline-check; called from MFv (events: EVENT_PLAYER_UNIT_SPELL_EFFECT) cond=None actions=Mfv (trigger var None)
// w3a base: AEIl  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 75.0}
// mana: {"1": 80, "2": 160, "3": 240}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 8.0, "2": 16.0, "3": 24.0, "4": 28.0}
// data[1] per level: {"1": "Umal", "2": "Umal", "3": "Umal", "4": "E001"}
// data[5] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 600.0}
// slice tiers: core=['Mfv', 'MFv'] depth1=[] depth2=[]

// --- Mfv (core, line 20053 in war3map.j) ---
function Mfv takes nothing returns boolean
return(GetSpellAbilityId()=='A0HW')and(GetUnitTypeId(GetTriggerUnit())=='Umal')
endfunction

// --- MFv (core, line 20056 in war3map.j) ---
function MFv takes nothing returns boolean
return(Mfv())
endfunction
