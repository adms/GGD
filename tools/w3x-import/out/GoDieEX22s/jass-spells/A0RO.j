// rawcode: A0RO
// hero: godie-hvsh (slot Q)  championDoc: content/champions/godie-hvsh.json
// nameZh: 魔法鎖鏈
// abilityDoc: content/abilities/godie-hvsh.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=mQv actions=msv (trigger var zL)
// w3a base: ANcl  levels: 4
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 50, "2": 75, "3": 100, "4": 125}
// range: {"1": 1000.0, "2": 1000.0, "3": 1000.0, "4": 1000.0}
// data[1] per level: {"1": 0.4000000059604645, "2": 0.4000000059604645, "3": 0.4000000059604645, "4": 0.4000000059604645}
// data[2] per level: {"1": 3, "2": 3, "3": 3, "4": 3}
// data[3] per level: {"1": 5, "2": 5, "3": 5, "4": 5}
// data[6] per level: {"2": "channel", "3": "channel", "4": "channel"}
// slice tiers: core=['mQv', 'msv'] depth1=[] depth2=[]

// --- mQv (core, line 19778 in war3map.j) ---
function mQv takes nothing returns boolean
return(GetSpellAbilityId()=='A0RO')
endfunction

// --- msv (core, line 19781 in war3map.j) ---
function msv takes nothing returns nothing
local location mSv
set IR[0]=GetTriggerUnit()
set mSv=GetSpellTargetLoc()
set XR=GetUnitLoc(IR[0])
set OR=AngleBetweenPoints(XR,mSv)
call RemoveLocation(mSv)
call EnableTrigger(ZL)
endfunction
