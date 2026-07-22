// rawcode: A000
// hero: godie-hart (slot E)  championDoc: content/champions/godie-hart.json
// nameZh: 畫龍點睛
// abilityDoc: content/abilities/godie-hart.e.json
// kind: active (spell-effect trigger)
// handler: event=inline-check; called from Hzv (events: EVENT_PLAYER_UNIT_SPELL_EFFECT) cond=None actions=HYv (trigger var None)
// w3a base: ANab  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 120, "2": 180, "3": 240, "4": 300}
// range: {"1": 200.0, "2": 200.0, "3": 200.0, "4": 200.0}
// area: {"2": 350.0, "3": 350.0, "4": 350.0, "1": 350.0}
// duration: {"2": 5.0, "3": 5.0, "1": 5.0, "4": 5.0}
// hero_duration: {"1": 5.0, "2": 5.0, "3": 5.0, "4": 5.0}
// data[3] per level: {"4": 12, "2": 6, "3": 9}
// data[4] per level: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// data[5] per level: {"1": 1.0, "2": 1.0, "4": 1.0, "3": 1.0}
// slice tiers: core=['HYv', 'Hzv'] depth1=[] depth2=[]

// --- HYv (core, line 17164 in war3map.j) ---
function HYv takes nothing returns boolean
return(IsUnitAlly(GetSpellTargetUnit(),Player($C))!=true)and(GetSpellAbilityId()=='A000')
endfunction

// --- Hzv (core, line 17167 in war3map.j) ---
function Hzv takes nothing returns boolean
return(HYv())
endfunction
