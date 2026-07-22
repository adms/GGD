// rawcode: A040
// hero: godie-o02l (slot R)  championDoc: content/champions/godie-o02l.json
// nameZh: 瘋狂皮卡丘
// abilityDoc: content/abilities/godie-o02l.r.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=PZv actions=P_v (trigger var um)
// w3a base: AEIl  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"2": 180, "3": 270, "4": 360, "1": 90}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 6.0, "2": 12.0, "3": 18.0, "4": 24.0}
// data[1] per level: {"1": "Ofar", "2": "Ofar", "3": "Ofar", "4": "Ofar"}
// data[5] per level: {"1": 250.0, "2": 400.0, "4": 0.0, "3": 550.0}
// slice tiers: core=['PZv', 'P_v'] depth1=[] depth2=[]

// --- PZv (core, line 20958 in war3map.j) ---
function PZv takes nothing returns boolean
return(GetSpellAbilityId()=='A040')
endfunction

// --- P_v (core, line 20961 in war3map.j) ---
function P_v takes nothing returns nothing
set ZX=GetTriggerUnit()
call EnableTrigger(Um)
call TriggerSleepAction((I2R(GetUnitAbilityLevelSwapped('A040',GetTriggerUnit()))*6.))
call DisableTrigger(Um)
call SetUnitVertexColorBJ(ZX,'d','d','d',0)
endfunction
