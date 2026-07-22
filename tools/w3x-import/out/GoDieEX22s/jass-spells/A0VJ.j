// rawcode: A0VJ
// hero: godie-hapm (slot Q)  championDoc: content/champions/godie-hapm.json
// nameZh: 狂戰士之怒
// abilityDoc: content/abilities/godie-hapm.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=ohe actions=oHe (trigger var xQ)
// w3a base: ANbr  levels: None
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0, "4": 35.0, "5": 57.0}
// mana: {"2": 110, "3": 160, "5": 175, "4": 210}
// area: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 50.0, "5": 50.0}
// duration: {"1": 12.0, "2": 12.0, "3": 12.0, "4": 12.0}
// hero_duration: {"1": 12.0, "2": 12.0, "3": 12.0, "4": 12.0}
// data[1] per level: {"5": 200.0, "1": 40.0, "2": 80.0, "3": 120.0, "4": 160.0}
// data[2] per level: {"5": 5, "1": 4, "2": 8, "3": 12, "4": 16}
// data[3] per level: {"5": -60.0, "1": 10.0, "2": 10.0, "3": 10.0, "4": 10.0}
// data[4] per level: {"5": 0.009999999776482582}
// slice tiers: core=['ohe', 'oHe'] depth1=[] depth2=[]

// --- ohe (core, line 26777 in war3map.j) ---
function ohe takes nothing returns boolean
return(GetSpellAbilityId()=='A0VJ')
endfunction

// --- oHe (core, line 26780 in war3map.j) ---
function oHe takes nothing returns nothing
call SetUnitAbilityLevelSwapped('A0VK',GetTriggerUnit(),(GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit())+1))
call SetUnitVertexColorBJ(Sn,'d',30.,30.,0)
call EnableTrigger(oQ)
endfunction
