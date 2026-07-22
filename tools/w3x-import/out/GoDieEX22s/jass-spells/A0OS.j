// rawcode: A0OS
// hero: godie-u011 (slot E)  championDoc: content/champions/godie-u011.json
// nameZh: 打屁股風林火豬
// abilityDoc: content/abilities/godie-u011.e.json
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=EVENT_PLAYER_HERO_SKILL cond=xCe actions=xDe (trigger var Qq)
// handler: event=helper-ref; called from xDe (events: EVENT_PLAYER_HERO_SKILL) cond=None actions=xde (trigger var None)
// handler: event=helper-ref; called from xge (events: EVENT_PLAYER_UNIT_ATTACKED) cond=None actions=xFe (trigger var None)
// handler: event=helper-ref; called from xje (events: EVENT_PLAYER_UNIT_ATTACKED) cond=None actions=xHe (trigger var None)
// w3a base: ACac  levels: 4
// area: {"1": 0.0, "3": 150.0, "4": 150.0}
// data[1] per level: {"1": 0.0, "3": 0.25, "4": 0.25}
// data[2] per level: {"2": 1, "3": 1, "4": 1}
// data[3] per level: {"2": 1, "3": 1, "4": 1}
// slice tiers: core=['xCe', 'xDe', 'xde', 'xFe', 'xge', 'xHe', 'xje'] depth1=[] depth2=[]

// --- xCe (core, line 26287 in war3map.j) ---
function xCe takes nothing returns boolean
return(GetLearnedSkill()=='A0OS')
endfunction

// --- xde (core, line 26290 in war3map.j) ---
function xde takes nothing returns boolean
return(GetUnitAbilityLevelSwapped('A0OS',GetTriggerUnit())==1)
endfunction

// --- xDe (core, line 26293 in war3map.j) ---
function xDe takes nothing returns nothing
if(xde())then
call UnitAddAbility(GetTriggerUnit(),'A0OL')
endif
endfunction

// --- xFe (core, line 26298 in war3map.j) ---
function xFe takes nothing returns boolean
return(GetUnitTypeId(GetAttacker())=='U012')and(GetUnitAbilityLevelSwapped('A0OS',GetAttacker())>=2)and(GetRandomInt(1,'d')<=$F)
endfunction

// --- xge (core, line 26301 in war3map.j) ---
function xge takes nothing returns boolean
return(xFe())
endfunction

// --- xHe (core, line 26321 in war3map.j) ---
function xHe takes nothing returns boolean
return(GetUnitTypeId(GetAttacker())=='U012')and(GetUnitAbilityLevelSwapped('A0OS',GetAttacker())>=4)and(GetRandomInt(1,'d')<=7)
endfunction

// --- xje (core, line 26324 in war3map.j) ---
function xje takes nothing returns boolean
return(xHe())
endfunction
