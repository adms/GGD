// rawcode: A0AP
// hero: godie-nbst (slot E)  championDoc: content/champions/godie-nbst.json
// nameZh: 變態絕技悶絕地獄車
// abilityDoc: content/abilities/godie-nbst.e.json
// kind: active (spell-effect trigger)
// handler: event=inline-check; called from bbv (events: EVENT_PLAYER_UNIT_SPELL_EFFECT) cond=None actions=bNv (trigger var None)
// w3a base: ANcl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 220, "2": 250, "3": 280, "4": 310}
// range: {"2": 9999.0, "3": 9999.0, "4": 9999.0, "1": 9999.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 2, "2": 2, "3": 2, "4": 2}
// data[3] per level: {"1": 5, "2": 5, "3": 5, "4": 5}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"1": "coldarrows", "2": "coldarrows", "3": "coldarrows", "4": "coldarrows"}
// slice tiers: core=['bNv', 'bbv'] depth1=['bAv'] depth2=[]

// --- bAv (depth1, line 12572 in war3map.j) ---
function bAv takes nothing returns boolean
return(GetSpellAbilityId()=='A0RQ')and(QR[(1+GetPlayerId(GetOwningPlayer(GetTriggerUnit())))])
endfunction

// --- bNv (core, line 12575 in war3map.j) ---
function bNv takes nothing returns boolean
return(bAv())or(GetSpellAbilityId()=='A0AP')
endfunction

// --- bbv (core, line 12578 in war3map.j) ---
function bbv takes nothing returns boolean
return(bNv())
endfunction
