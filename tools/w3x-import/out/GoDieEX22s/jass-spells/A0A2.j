// rawcode: A0A2
// hero: godie-ecen (slot Q)  championDoc: content/champions/godie-ecen.json
// nameZh: 威士忌攻擊
// abilityDoc: content/abilities/godie-ecen.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=Wyv actions=WYv (trigger var xP)
// w3a base: Aslo  levels: 3
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 75, "2": 105, "3": 135, "4": 165, "5": 25}
// range: {"1": 500.0, "2": 500.0, "3": 500.0, "4": 500.0}
// duration: {"1": 6.0, "2": 6.0, "3": 6.0, "4": 3.0}
// hero_duration: {"1": 6.0, "2": 6.0, "3": 6.0, "4": 3.0}
// data[1] per level: {"1": 0.25, "2": 0.30000001192092896, "3": 0.3499999940395355, "4": 0.4000000059604645}
// data[2] per level: {"1": 0.0}
// slice tiers: core=['Wyv', 'WYv'] depth1=[] depth2=[]

// --- Wyv (core, line 24157 in war3map.j) ---
function Wyv takes nothing returns boolean
return(GetSpellAbilityId()=='A0A2')
endfunction

// --- WYv (core, line 24160 in war3map.j) ---
function WYv takes nothing returns nothing
call UnitDamageTargetBJ(GetSpellAbilityUnit(),GetSpellTargetUnit(),(.0+(100.*I2R(GetUnitAbilityLevelSwapped('A0A2',GetSpellAbilityUnit())))),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MIND)
endfunction
