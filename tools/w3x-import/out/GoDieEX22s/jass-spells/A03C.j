// rawcode: A03C
// hero: godie-hvwd (slot Q)  championDoc: content/champions/godie-hvwd.json
// nameZh: 破魔之箭
// abilityDoc: content/abilities/godie-hvwd.q.json
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=helper-ref; called from jpv (events: EVENT_PLAYER_HERO_SKILL,EVENT_PLAYER_HERO_LEVEL) cond=None actions=jMv (trigger var None)
// handler: event=? cond=None actions=jqv (trigger var jl)
// w3a base: Afbk  levels: 4
// data[1] per level: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// data[2] per level: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// data[3] per level: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// data[4] per level: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// slice tiers: core=['jMv', 'jpv', 'jqv'] depth1=['jmv'] depth2=[]

// --- jmv (depth1, line 17596 in war3map.j) ---
function jmv takes nothing returns boolean
return(GetUnitAbilityLevelSwapped('A0CE',GetTriggerUnit())<=0)
endfunction

// --- jMv (core, line 17599 in war3map.j) ---
function jMv takes nothing returns boolean
return(GetUnitAbilityLevelSwapped('A03C',GetTriggerUnit())<=0)
endfunction

// --- jpv (core, line 17602 in war3map.j) ---
function jpv takes nothing returns nothing
if(jmv())then
call UnitAddAbility(GetTriggerUnit(),'A0CE')
endif
if(jMv())then
call UnitRemoveAbility(GetTriggerUnit(),'A0CE')
endif
endfunction

// --- jqv (core, line 17610 in war3map.j) ---
function jqv takes nothing returns nothing
local real jQv
set jQv=((GetEventDamage()*(.2+(.15*I2R(GetUnitAbilityLevelSwapped('A03C',GetEventDamageSource())))))-30.)
if(jQv<=.0)then
set jQv=(5.*I2R(GetUnitAbilityLevelSwapped('A03C',GetEventDamageSource())))
else
if(jQv>90.)then
set jQv=90.
endif
endif
call SetUnitManaBJ(GetTriggerUnit(),(GetUnitStateSwap(UNIT_STATE_MANA,GetTriggerUnit())-jQv))
endfunction
