// rawcode: A0FS
// hero: godie-e00q (slot R)  championDoc: content/champions/godie-e00q.json
// nameZh: 魔力增幅
// abilityDoc: content/abilities/godie-e00q.r.json
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=helper-ref; called from hYv (events: EVENT_PLAYER_HERO_SKILL,EVENT_PLAYER_HERO_LEVEL) cond=None actions=hyv (trigger var None)
// handler: event=EVENT_PLAYER_HERO_SKILL,EVENT_PLAYER_HERO_LEVEL cond=None actions=hYv (trigger var nl)
// w3a base: Aamk  levels: 3
// slice tiers: core=['hyv', 'hYv'] depth1=[] depth2=[]

// --- hyv (core, line 16832 in war3map.j) ---
function hyv takes nothing returns boolean
return(GetUnitAbilityLevelSwapped('A0FS',GetTriggerUnit())==3)
endfunction

// --- hYv (core, line 16835 in war3map.j) ---
function hYv takes nothing returns nothing
call SetPlayerTechResearchedSwap('Rhpt',GetUnitAbilityLevelSwapped('A0FS',GetTriggerUnit()),GetOwningPlayer(GetTriggerUnit()))
if(hyv())then
call DisableTrigger(GetTriggeringTrigger())
endif
endfunction
